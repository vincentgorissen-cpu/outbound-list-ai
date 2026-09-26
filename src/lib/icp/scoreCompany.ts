import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { validateIcpScoreResult } from "./validateIcpScoreResult";
import type { CompanyForScoring, IcpScoreResult } from "./types";

/**
 * Minimale vorm van de Anthropic-client die deze module nodig heeft.
 * Losgekoppeld van het echte SDK-type zodat tests een simpele mock
 * kunnen injecteren zonder een volledig Message-object te bouwen.
 */
export interface IcpScoringClient {
  messages: {
    create: (params: Record<string, unknown>) => Promise<{
      content: Array<{ type: string; input?: Record<string, unknown> }>;
    }>;
  };
}

export class IcpScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IcpScoringError";
  }
}

const MODEL = "claude-haiku-4-5-20251001";

let cachedClient: Anthropic | null = null;
function getDefaultClient(): IcpScoringClient {
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient as unknown as IcpScoringClient;
}

const SCORE_TOOL = {
  name: "score_icp_fit",
  description: "Beoordeelt hoe goed een bedrijf past bij het ideale klantprofiel (ICP).",
  input_schema: {
    type: "object" as const,
    properties: {
      score: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description:
          "0-100: hoe goed dit bedrijf past bij het klantprofiel — puur de match, los van hoe zeker je daarvan bent.",
      },
      classification: {
        type: "string",
        enum: ["high_fit", "medium_fit", "low_fit", "insufficient_data"],
        description:
          "insufficient_data alleen wanneer er écht te weinig informatie is om verantwoord te beoordelen (niet zomaar bij twijfel — gebruik dan een lage confidence in plaats van insufficient_data).",
      },
      reasons: {
        type: "array",
        items: { type: "string" },
        description: "Concrete redenen die vóór een match pleiten, elk direct herleidbaar tot de meegegeven gegevens.",
      },
      concerns: {
        type: "array",
        items: { type: "string" },
        description: "Concrete twijfelpunten of redenen tegen een match. Lege lijst als die er niet zijn.",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "0.0-1.0: hoe zeker je bent van de score, gegeven hoeveel en hoe betrouwbaar de beschikbare gegevens zijn. Los van de score zelf: een score van 90 met weinig bewijs verdient een lage confidence, geen hoge.",
      },
      missing_important_data: {
        type: "array",
        items: { type: "string" },
        description:
          "Concreet benoemde informatie die voor dít klantprofiel relevant zou zijn maar ontbreekt (bv. 'aantal medewerkers onbekend' als het profiel een bedrijfsgrootte noemt). Lege lijst als er niets relevants ontbreekt.",
      },
      key_sales_signals: {
        type: "array",
        items: { type: "string" },
        description:
          "Concrete, voor sales bruikbare signalen uit de beschikbare gegevens (bv. 'eigen productie', 'internationale klanten', '87 medewerkers'). Alleen signalen die daadwerkelijk in de gegevens hieronder staan.",
      },
    },
    required: [
      "score",
      "classification",
      "reasons",
      "concerns",
      "confidence",
      "missing_important_data",
      "key_sales_signals",
    ],
    additionalProperties: false,
  },
};

/**
 * Zet de beschikbare bedrijfsgegevens om naar tekst voor de AI-prompt,
 * met bij elk gevuld datapunt expliciet de bron erbij (upload/KVK/
 * website) — zodat het model weet welke informatie hard is en welke
 * ontbreekt, in plaats van dat te moeten raden.
 */
function buildCompanyDescription(company: CompanyForScoring): string {
  const lines = [
    `Bedrijfsnaam: ${company.bedrijfsnaam} (bron: upload)`,
    `Plaats: ${company.plaats ? `${company.plaats} (bron: upload)` : "onbekend"}`,
    `Website: ${company.website ? `${company.website} (bron: upload)` : "onbekend"}`,
    `SBI-activiteiten: ${
      company.sbiOmschrijvingen.length > 0 ? `${company.sbiOmschrijvingen.join(", ")} (bron: KVK)` : "onbekend"
    }`,
    `Aantal medewerkers: ${
      company.aantalWerkzamePersonen !== null ? `${company.aantalWerkzamePersonen} (bron: KVK)` : "onbekend"
    }`,
  ];

  const websiteLines: string[] = [];
  if (company.bedrijfsomschrijving?.trim()) {
    websiteLines.push(`Bedrijfsomschrijving: ${company.bedrijfsomschrijving.trim()}`);
  }
  if (company.productsServices?.length) {
    websiteLines.push(`Producten/diensten: ${company.productsServices.join(", ")}`);
  }
  if (company.industriesServed?.length) {
    websiteLines.push(`Bediende sectoren/industrieën: ${company.industriesServed.join(", ")}`);
  }
  if (company.targetMarkets?.length) {
    websiteLines.push(`Doelmarkten: ${company.targetMarkets.join(", ")}`);
  }
  if (company.businessModel?.trim()) {
    websiteLines.push(`Business model: ${company.businessModel.trim()}`);
  }
  if (company.operationalSignals?.length) {
    websiteLines.push(`Operationele signalen: ${company.operationalSignals.join(", ")}`);
  }
  if (company.websiteLocations?.length) {
    websiteLines.push(`Locaties (website): ${company.websiteLocations.join(", ")}`);
  }

  if (websiteLines.length > 0) {
    lines.push("", "Website-analyse (bron: website):", ...websiteLines);
  } else {
    lines.push("", "Geen bruikbare website-informatie beschikbaar voor dit bedrijf.");
  }

  return lines.join("\n");
}

const SCORING_INSTRUCTIONS = `Beoordeel dit bedrijf uitsluitend op basis van de gegevens hieronder, elk met hun bron.
Regels:
- Verzin of gok nooit ontbrekende gegevens (bv. bedrijfsgrootte, omzet, rechtsvorm) — een veld dat "onbekend" is, blijft onbekend.
- 'score' is puur hoe goed het bedrijf past; 'confidence' is los daarvan hoe zeker je dat kunt zijn gegeven de beschikbare gegevens. Een hoge score met weinig bewijs krijgt een lage confidence.
- Gebruik classification "insufficient_data" alleen als er werkelijk te weinig informatie is om een verantwoorde inschatting te maken — niet bij twijfel (gebruik dan gewoon een lage confidence).`;

/**
 * Laat het model één bedrijf beoordelen tegen het (vrije-tekst) ideale
 * klantprofiel van de gebruiker. Gooit `IcpScoringError` zowel bij een
 * mislukte aanroep als bij een antwoord dat niet aan het schema
 * voldoet — de aanroeper beslist wat daarmee gebeurt (zie
 * `actions.ts`: nooit oneindig opnieuw proberen, bedrijfsrecord blijft
 * bestaan met status `ai_processing_failed`).
 */
export async function scoreCompanyIcpFit(
  icpProfile: string,
  company: CompanyForScoring,
  client: IcpScoringClient = getDefaultClient(),
): Promise<IcpScoreResult> {
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools: [SCORE_TOOL],
      tool_choice: { type: "tool", name: "score_icp_fit" },
      messages: [
        {
          role: "user",
          content: `${SCORING_INSTRUCTIONS}\n\nIdeaal klantprofiel (ICP), in de eigen woorden van de gebruiker:\n${icpProfile}\n\nBeoordeel onderstaand bedrijf op basis van dit profiel:\n${buildCompanyDescription(company)}`,
        },
      ],
    });
  } catch (error) {
    throw new IcpScoringError(
      `AI-aanroep mislukt: ${error instanceof Error ? error.message : "onbekende fout"}`,
    );
  }

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse?.input) {
    throw new IcpScoringError("AI gaf geen bruikbaar antwoord terug.");
  }

  const validated = validateIcpScoreResult(toolUse.input);
  if (!validated.valid) {
    throw new IcpScoringError(`AI-antwoord voldoet niet aan het schema: ${validated.error}`);
  }

  return validated.value;
}
