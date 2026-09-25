import type { CompanyIntelligenceData } from "./companyIntelligenceTypes";

export type CompanyIntelligenceValidationResult =
  | { valid: true; value: CompanyIntelligenceData }
  | { valid: false; error: string };

const MAX_LIST_ITEMS = 20;
const MAX_ITEM_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_EVIDENCE_ITEMS = 20;
const MAX_EVIDENCE_LENGTH = 300;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** `undefined` betekent "geen geldig type"; `null`/lege string worden allebei tot `null` genormaliseerd. */
function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Knipt te lange of lege items eruit in plaats van de hele extractie af te keuren om één randgeval. */
function sanitizeList(value: string[], maxItems: number, maxLength: number): string[] {
  return value
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= maxLength)
    .slice(0, maxItems);
}

/**
 * Controleert of het door de AI teruggegeven object exact aan het
 * afgesproken schema voldoet. `tool_choice` op het model dwingt geen
 * harde garantie af — dit is de daadwerkelijke server-side validatie
 * voordat er ooit iets wordt opgeslagen. Bewust type-/bereik-strikt
 * (afkeuren bij een verkeerd type of een confidence buiten 0-1), maar
 * tolerant op kleine inhoudelijke rafeligheid (een net iets te lang
 * item wordt afgekapt/genegeerd in plaats van de hele extractie te laten
 * mislukken).
 */
export function validateCompanyIntelligence(input: unknown): CompanyIntelligenceValidationResult {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: "Antwoord is geen object." };
  }

  const candidate = input as Record<string, unknown>;
  const {
    company_description,
    products_services,
    industries_served,
    target_markets,
    business_model,
    operational_signals,
    locations,
    confidence,
    evidence,
  } = candidate;

  const companyDescription = normalizeNullableString(company_description);
  if (companyDescription === undefined) {
    return { valid: false, error: "company_description moet tekst of null zijn." };
  }
  if (companyDescription !== null && companyDescription.length > MAX_DESCRIPTION_LENGTH) {
    return { valid: false, error: `company_description mag niet langer zijn dan ${MAX_DESCRIPTION_LENGTH} tekens.` };
  }

  if (!isStringArray(products_services)) {
    return { valid: false, error: "products_services moet een lijst van tekst zijn." };
  }
  if (!isStringArray(industries_served)) {
    return { valid: false, error: "industries_served moet een lijst van tekst zijn." };
  }
  if (!isStringArray(target_markets)) {
    return { valid: false, error: "target_markets moet een lijst van tekst zijn." };
  }

  const businessModel = normalizeNullableString(business_model);
  if (businessModel === undefined) {
    return { valid: false, error: "business_model moet tekst of null zijn." };
  }
  if (businessModel !== null && businessModel.length > MAX_ITEM_LENGTH) {
    return { valid: false, error: `business_model mag niet langer zijn dan ${MAX_ITEM_LENGTH} tekens.` };
  }

  if (!isStringArray(operational_signals)) {
    return { valid: false, error: "operational_signals moet een lijst van tekst zijn." };
  }
  if (!isStringArray(locations)) {
    return { valid: false, error: "locations moet een lijst van tekst zijn." };
  }

  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return { valid: false, error: "confidence moet een getal zijn." };
  }
  if (confidence < 0 || confidence > 1) {
    return { valid: false, error: "confidence moet tussen 0.0 en 1.0 liggen." };
  }

  if (!isStringArray(evidence)) {
    return { valid: false, error: "evidence moet een lijst van tekst zijn." };
  }

  return {
    valid: true,
    value: {
      companyDescription,
      productsServices: sanitizeList(products_services, MAX_LIST_ITEMS, MAX_ITEM_LENGTH),
      industriesServed: sanitizeList(industries_served, MAX_LIST_ITEMS, MAX_ITEM_LENGTH),
      targetMarkets: sanitizeList(target_markets, MAX_LIST_ITEMS, MAX_ITEM_LENGTH),
      businessModel,
      operationalSignals: sanitizeList(operational_signals, MAX_LIST_ITEMS, MAX_ITEM_LENGTH),
      locations: sanitizeList(locations, MAX_LIST_ITEMS, MAX_ITEM_LENGTH),
      confidence,
      evidence: sanitizeList(evidence, MAX_EVIDENCE_ITEMS, MAX_EVIDENCE_LENGTH),
    },
  };
}
