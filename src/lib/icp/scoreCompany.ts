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
        description: "0-100: hoe goed dit bedrijf past bij het klantprofiel.",
      },
      classification: {
        type: "string",
        enum: ["high_fit", "medium_fit", "low_fit"],
      },
      reasons: {
        type: "array",
        items: { type: "string" },
        description: "Concrete redenen die vóór een match pleiten.",
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
        description: "0.0-1.0: hoe zeker het model is van deze beoordeling, gegeven de beschikbare gegevens.",
      },
    },
    required: ["score", "classification", "reasons", "concerns", "confidence"],
    additionalProperties: false,
  },
};

function buildCompanyDescription(company: CompanyForScoring): string {
  const lines = [
    `Bedrijfsnaam: ${company.bedrijfsnaam}`,
    `SBI-activiteiten: ${company.sbiOmschrijvingen.length > 0 ? company.sbiOmschrijvingen.join(", ") : "onbekend"}`,
    `Aantal medewerkers: ${company.aantalWerkzamePersonen ?? "onbekend"}`,
    `Plaats: ${company.plaats ?? "onbekend"}`,
    `Website: ${company.website ?? "onbekend"}`,
  ];
  if (company.bedrijfsomschrijving) {
    lines.push(`Bedrijfsomschrijving: ${company.bedrijfsomschrijving}`);
  }
  return lines.join("\n");
}

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
          content: `Ideaal klantprofiel (ICP), in de eigen woorden van de gebruiker:\n${icpProfile}\n\nBeoordeel onderstaand bedrijf op basis van dit profiel:\n${buildCompanyDescription(company)}`,
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
