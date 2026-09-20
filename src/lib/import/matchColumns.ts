import { TARGET_FIELDS } from "./targetFields";
import { normalizeHeader } from "./normalizeHeader";
import type { MappingSuggestion, TargetFieldId } from "./types";

const SYNONYM_LOOKUP: ReadonlyMap<string, TargetFieldId> = (() => {
  const lookup = new Map<string, TargetFieldId>();
  for (const field of TARGET_FIELDS) {
    for (const synonym of field.synonyms) {
      lookup.set(normalizeHeader(synonym), field.id);
    }
  }
  return lookup;
})();

export interface DeterministicMatchResult {
  suggestions: MappingSuggestion[];
  /** Doelvelden waarvoor geen enkele kolom betrouwbaar herkend is. */
  unresolvedFields: TargetFieldId[];
}

/**
 * Matcht kolomkoppen exact (na normalisatie) tegen bekende synoniemen.
 * Dit is de "betrouwbare" herkenning: geen educated guesses, geen AI.
 * Een kolomkop die niet exact overeenkomt wordt niet gematcht, ook al
 * lijkt hij op een doelveld — dat is precies waarvoor de AI-fallback is.
 */
export function matchColumnsDeterministically(
  headers: string[],
): DeterministicMatchResult {
  const suggestions: MappingSuggestion[] = [];
  const claimedFields = new Set<TargetFieldId>();

  headers.forEach((header, columnIndex) => {
    const field = SYNONYM_LOOKUP.get(normalizeHeader(header));

    // Elk doelveld mag maar aan één kolom gekoppeld worden: bij een
    // dubbele match wint de eerste kolom, de rest blijft onherkend
    // zodat de gebruiker dit zelf kan oplossen.
    if (field && !claimedFields.has(field)) {
      claimedFields.add(field);
      suggestions.push({
        columnIndex,
        header,
        field,
        source: "deterministic",
      });
    } else {
      suggestions.push({
        columnIndex,
        header,
        field: null,
        source: "none",
      });
    }
  });

  const unresolvedFields = TARGET_FIELDS.map((field) => field.id).filter(
    (id) => !claimedFields.has(id),
  );

  return { suggestions, unresolvedFields };
}
