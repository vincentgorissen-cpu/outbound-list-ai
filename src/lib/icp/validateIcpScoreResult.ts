import type { IcpClassification, IcpScoreResult } from "./types";

const VALID_CLASSIFICATIONS: readonly IcpClassification[] = [
  "high_fit",
  "medium_fit",
  "low_fit",
  "insufficient_data",
];

export type IcpValidationResult =
  | { valid: true; value: IcpScoreResult }
  | { valid: false; error: string };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Controleert of het door de AI teruggegeven object exact aan het
 * afgesproken schema voldoet. `tool_choice` op het model dwingt geen
 * harde garantie af — dit is de daadwerkelijke server-side validatie
 * voordat er ooit iets wordt opgeslagen.
 */
export function validateIcpScoreResult(input: unknown): IcpValidationResult {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: "Antwoord is geen object." };
  }

  const candidate = input as Record<string, unknown>;
  const { score, classification, reasons, concerns, confidence } = candidate;

  if (typeof score !== "number" || !Number.isInteger(score)) {
    return { valid: false, error: "score moet een geheel getal zijn." };
  }
  if (score < 0 || score > 100) {
    return { valid: false, error: "score moet tussen 0 en 100 liggen." };
  }

  if (
    typeof classification !== "string" ||
    !VALID_CLASSIFICATIONS.includes(classification as IcpClassification)
  ) {
    return {
      valid: false,
      error: "classification moet high_fit, medium_fit, low_fit of insufficient_data zijn.",
    };
  }

  if (!isStringArray(reasons)) {
    return { valid: false, error: "reasons moet een lijst van tekst zijn." };
  }

  if (!isStringArray(concerns)) {
    return { valid: false, error: "concerns moet een lijst van tekst zijn." };
  }

  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return { valid: false, error: "confidence moet een getal zijn." };
  }
  if (confidence < 0 || confidence > 1) {
    return { valid: false, error: "confidence moet tussen 0.0 en 1.0 liggen." };
  }

  const { missing_important_data, key_sales_signals } = candidate;

  if (!isStringArray(missing_important_data)) {
    return { valid: false, error: "missing_important_data moet een lijst van tekst zijn." };
  }

  if (!isStringArray(key_sales_signals)) {
    return { valid: false, error: "key_sales_signals moet een lijst van tekst zijn." };
  }

  return {
    valid: true,
    value: {
      score,
      classification: classification as IcpClassification,
      reasons,
      concerns,
      confidence,
      missingImportantData: missing_important_data,
      keySalesSignals: key_sales_signals,
    },
  };
}
