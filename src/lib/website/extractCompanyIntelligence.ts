import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { MAX_COMBINED_TEXT_LENGTH } from "./extractContent";
import { validateCompanyIntelligence } from "./validateCompanyIntelligence";
import type { ExtractionOutcome, PageForExtraction } from "./companyIntelligenceTypes";

/**
 * Minimale vorm van de Anthropic-client die deze module nodig heeft
 * (zelfde opzet als `icp/scoreCompany.ts`) — losgekoppeld van het echte
 * SDK-type zodat tests een simpele mock kunnen injecteren.
 */
export interface IntelligenceExtractionClient {
  messages: {
    create: (params: Record<string, unknown>) => Promise<{
      content: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    }>;
  };
}

const MODEL = "claude-haiku-4-5-20251001";

let cachedClient: Anthropic | null = null;
function getDefaultClient(): IntelligenceExtractionClient {
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient as unknown as IntelligenceExtractionClient;
}

const TOOL_NAME = "extract_company_intelligence";

const EXTRACTION_TOOL = {
  name: TOOL_NAME,
  description:
    "Zet opgeschoonde websitetekst van een bedrijf om naar gestructureerde company intelligence, uitsluitend gebaseerd op wat expliciet op de website staat.",
  input_schema: {
    type: "object" as const,
    properties: {
      company_description: {
        type: ["string", "null"],
        description:
          "Korte, feitelijke omschrijving van het bedrijf, uitsluitend gebaseerd op de website. Null als de website dit niet duidelijk maakt.",
      },
      products_services: {
        type: "array",
        items: { type: "string" },
        description: "Concrete producten/diensten die expliciet op de website worden genoemd.",
      },
      industries_served: {
        type: "array",
        items: { type: "string" },
        description: "Sectoren/branches die het bedrijf expliciet noemt te bedienen.",
      },
      target_markets: {
        type: "array",
        items: { type: "string" },
        description: "Doelgroepen/doelmarkten die expliciet op de website worden genoemd.",
      },
      business_model: {
        type: ["string", "null"],
        description: "Bijvoorbeeld 'B2B', 'B2C' of 'groothandel' — alleen als dit duidelijk uit de website blijkt, anders null.",
      },
      operational_signals: {
        type: "array",
        items: { type: "string" },
        description:
          "Concrete operationele signalen waarvoor voldoende bewijs op de website staat. Voorbeelden: eigen productie, warehouse/distributie, meerdere vestigingen, internationale activiteiten, eigen machinepark, 24/7 operatie, installatie/service op locatie, grote fysieke operatie. Dit zijn voorbeelden, geen verplichte lijst.",
      },
      locations: {
        type: "array",
        items: { type: "string" },
        description: "Vestigingsplaatsen/locaties die expliciet op de website worden genoemd.",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "0.0-1.0: hoe zeker je zelf bent van deze extractie, gegeven hoeveel en hoe expliciet de informatie is.",
      },
      evidence: {
        type: "array",
        items: { type: "string" },
        description:
          "Korte verwijzingen die aangeven op welke pagina (gebruik het paginanummer/paginatype uit de tekst hieronder) elke belangrijke conclusie is gebaseerd.",
      },
    },
    required: [
      "company_description",
      "products_services",
      "industries_served",
      "target_markets",
      "business_model",
      "operational_signals",
      "locations",
      "confidence",
      "evidence",
    ],
    additionalProperties: false,
  },
};

/** Labelt elke pagina met nummer/type/URL en respecteert dezelfde tekstlimiet als de opschoonstap (kostenbeheersing). */
function buildLabeledPagesText(pages: PageForExtraction[], maxLength: number): string {
  const sections: string[] = [];
  let used = 0;

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]!;
    const header = `[Pagina ${i + 1} — ${page.pageType} — ${page.pageUrl}]`;
    const remaining = maxLength - used - header.length - 2;
    if (remaining <= 0) break;

    const body = page.cleanedText.length > remaining ? page.cleanedText.slice(0, remaining) : page.cleanedText;
    const section = `${header}\n${body}`;
    sections.push(section);
    used += section.length + 2;
    if (used >= maxLength) break;
  }

  return sections.join("\n\n");
}

function buildExtractionPrompt(pagesText: string): string {
  return `Je krijgt hieronder de opgeschoonde tekst van pagina's van de officiële website van een bedrijf, elk gelabeld met een paginanummer, het paginatype en de URL.

Taak: zet deze tekst om naar gestructureerde "company intelligence" over dit bedrijf, uitsluitend gebaseerd op wat expliciet op deze pagina's staat.

Strikte regels:
- Verzin niets. Informatie die niet duidelijk uit de tekst blijkt, laat je leeg (lege tekst, lege lijst of null) in plaats van te gokken.
- Gok nooit het aantal medewerkers, de omzet, de rechtsvorm of de bedrijfsomvang, ook niet als de bedrijfsnaam of de toon van de tekst dat lijkt te suggereren.
- Trek geen conclusies puur op basis van de bedrijfsnaam; baseer alles uitsluitend op de paginatekst hieronder.
- Neem een operationeel signaal alleen op als er voldoende concreet bewijs voor is in de tekst.
- Geef in 'evidence' korte verwijzingen die aangeven op welke pagina (gebruik het paginanummer en paginatype, bijvoorbeeld "Pagina 1 (homepage)") elke belangrijke conclusie is gebaseerd.
- 'confidence' (0.0-1.0) geeft aan hoe zeker je zelf bent van deze extractie, gegeven hoeveel en hoe expliciet de informatie op de pagina's is.

Paginatekst:
${pagesText}`;
}

type ExtractionMessage = { role: "user" | "assistant"; content: unknown };

async function callExtractionModel(
  client: IntelligenceExtractionClient,
  messages: ExtractionMessage[],
): Promise<{ id?: string; input?: Record<string, unknown> } | undefined> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1536,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages,
  });
  return response.content.find((block) => block.type === "tool_use");
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "onbekende fout";
}

/**
 * Zet opgeschoonde websitepagina's om naar gestructureerde company
 * intelligence via Anthropic. Doet nooit meer dan één "gecontroleerde
 * reparatiepoging": als het eerste antwoord de strikte server-side
 * validatie niet doorstaat, krijgt het model één kans om zijn eigen
 * antwoord te corrigeren (met de exacte validatiefout erbij); faalt dat
 * ook, dan is het resultaat `extraction_failed` — er wordt nooit
 * eindeloos doorgeprobeerd.
 */
export async function extractCompanyIntelligence(
  pages: PageForExtraction[],
  client: IntelligenceExtractionClient = getDefaultClient(),
): Promise<ExtractionOutcome> {
  if (pages.length === 0) {
    return { status: "extraction_failed", errorMessage: "Geen websitetekst beschikbaar om te extraheren." };
  }

  const pagesText = buildLabeledPagesText(pages, MAX_COMBINED_TEXT_LENGTH);
  const messages: ExtractionMessage[] = [{ role: "user", content: buildExtractionPrompt(pagesText) }];

  let toolUse;
  try {
    toolUse = await callExtractionModel(client, messages);
  } catch (error) {
    return { status: "extraction_failed", errorMessage: `AI-aanroep mislukt: ${describeError(error)}` };
  }

  if (!toolUse?.input) {
    return { status: "extraction_failed", errorMessage: "AI gaf geen bruikbaar antwoord terug." };
  }

  let validated = validateCompanyIntelligence(toolUse.input);

  if (!validated.valid) {
    const invalidInput = toolUse.input;
    const toolUseId = toolUse.id ?? "toolu_extractie";
    messages.push({
      role: "assistant",
      content: [{ type: "tool_use", id: toolUseId, name: TOOL_NAME, input: invalidInput }],
    });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: `Ongeldig antwoord: ${validated.error}. Corrigeer dit en stuur het volledige, geldige antwoord opnieuw volgens het schema. Verzin geen nieuwe informatie die niet al in de paginatekst hierboven stond.`,
        },
      ],
    });

    let repaired;
    try {
      repaired = await callExtractionModel(client, messages);
    } catch (error) {
      return { status: "extraction_failed", errorMessage: `Reparatiepoging mislukt: ${describeError(error)}` };
    }

    validated = repaired?.input
      ? validateCompanyIntelligence(repaired.input)
      : { valid: false, error: "AI gaf geen bruikbaar antwoord bij de reparatiepoging." };
  }

  if (!validated.valid) {
    return { status: "extraction_failed", errorMessage: validated.error };
  }

  return { status: "extracted", data: validated.value };
}
