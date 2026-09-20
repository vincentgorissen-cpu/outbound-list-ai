import { describe, expect, it, vi } from "vitest";
import { parseImportFile } from "@/lib/import/parseFile";
import { buildMappingSuggestions } from "@/lib/import/buildMappingSuggestions";
import { normalizeRows } from "@/lib/import/normalizeRecord";
import type { AiMatchClient } from "@/lib/import/aiColumnMatcher";
import type { ColumnMapping, TargetFieldId } from "@/lib/import/types";

describe("volledige importpijplijn: parsen -> matchen -> normaliseren", () => {
  it("verwerkt een CSV met bekende en onbekende kolomnamen tot nette records", async () => {
    const csv = [
      "Bedrijfsnaam,KVK,Nr.,Website,Opmerkingen",
      "Acme BV,12345678,0612345678,acme.nl,belangrijke klant",
      "Beta BV,87654321,0698765432,beta.nl,",
    ].join("\n");

    const parsed = await parseImportFile(Buffer.from(csv, "utf-8"), "bedrijven.csv");

    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", input: { col_2: "telefoon" } }],
    });
    const aiClient: AiMatchClient = { messages: { create } };

    const suggestions = await buildMappingSuggestions(parsed, aiClient);

    // Bedrijfsnaam, KVK en Website zijn deterministisch herkend; "Nr."
    // is via de AI-fallback aan telefoon gekoppeld; "Opmerkingen" blijft
    // terecht ongemapt.
    const byHeader = Object.fromEntries(
      suggestions.map((s) => [s.header, s]),
    );
    expect(byHeader["Bedrijfsnaam"]).toMatchObject({
      field: "bedrijfsnaam",
      source: "deterministic",
    });
    expect(byHeader["KVK"]).toMatchObject({
      field: "kvk_nummer",
      source: "deterministic",
    });
    expect(byHeader["Nr."]).toMatchObject({ field: "telefoon", source: "ai" });
    expect(byHeader["Opmerkingen"]).toMatchObject({
      field: null,
      source: "none",
    });

    const mapping: ColumnMapping = {};
    for (const suggestion of suggestions) {
      if (suggestion.field) {
        mapping[suggestion.field as TargetFieldId] = suggestion.columnIndex;
      }
    }

    const records = normalizeRows(parsed.rows, mapping);

    expect(records[0]).toMatchObject({
      bedrijfsnaam: "Acme BV",
      kvk_nummer: "12345678",
      website: "https://acme.nl",
      telefoon: "0612345678",
      plaats: null,
    });
    expect(records[1].telefoon).toBe("0698765432");
  });
});
