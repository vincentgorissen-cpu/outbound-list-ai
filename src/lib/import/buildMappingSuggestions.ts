import { matchColumnsDeterministically } from "./matchColumns";
import { suggestColumnMappingWithAI, type AiMatchClient } from "./aiColumnMatcher";
import type { DetectedColumn, MappingSuggestion, ParsedFile } from "./types";

const SAMPLE_ROWS_FOR_AI = 5;

/**
 * Combineert de deterministische herkenning met de AI-fallback tot één
 * lijst suggesties: eerst betrouwbare synoniemherkenning, en alleen
 * voor kolommen/velden die daarna nog open staan een AI-suggestie.
 */
export async function buildMappingSuggestions(
  parsed: ParsedFile,
  aiClient?: AiMatchClient,
): Promise<MappingSuggestion[]> {
  const { suggestions, unresolvedFields } = matchColumnsDeterministically(
    parsed.headers,
  );

  const unresolvedColumns: DetectedColumn[] = suggestions
    .filter((suggestion) => suggestion.field === null)
    .map((suggestion) => ({
      columnIndex: suggestion.columnIndex,
      header: suggestion.header,
      sampleValues: parsed.rows
        .slice(0, SAMPLE_ROWS_FOR_AI)
        .map((row) => row[suggestion.columnIndex] ?? ""),
    }));

  if (unresolvedColumns.length === 0 || unresolvedFields.length === 0) {
    return suggestions;
  }

  const aiMapping = await suggestColumnMappingWithAI(
    { unresolvedColumns, unresolvedFields },
    aiClient,
  );

  if (aiMapping.size === 0) return suggestions;

  return suggestions.map((suggestion) => {
    const aiField = aiMapping.get(suggestion.columnIndex);
    return aiField ? { ...suggestion, field: aiField, source: "ai" } : suggestion;
  });
}
