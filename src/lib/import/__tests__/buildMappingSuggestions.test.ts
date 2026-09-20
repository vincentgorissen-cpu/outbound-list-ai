import { describe, expect, it, vi } from "vitest";
import { buildMappingSuggestions } from "@/lib/import/buildMappingSuggestions";
import type { AiMatchClient } from "@/lib/import/aiColumnMatcher";
import type { ParsedFile } from "@/lib/import/types";

describe("buildMappingSuggestions", () => {
  it("gebruikt alleen deterministische matches als alles herkend is", async () => {
    const create = vi.fn();
    const client: AiMatchClient = { messages: { create } };

    const parsed: ParsedFile = {
      headers: ["Bedrijfsnaam", "Website"],
      rows: [["Acme BV", "acme.nl"]],
    };

    const suggestions = await buildMappingSuggestions(parsed, client);

    expect(create).not.toHaveBeenCalled();
    expect(suggestions.every((s) => s.source === "deterministic")).toBe(true);
  });

  it("valt terug op AI voor kolommen die niet deterministisch herkend zijn", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", input: { col_1: "telefoon" } }],
    });
    const client: AiMatchClient = { messages: { create } };

    const parsed: ParsedFile = {
      headers: ["Bedrijfsnaam", "Nr."],
      rows: [["Acme BV", "0612345678"]],
    };

    const suggestions = await buildMappingSuggestions(parsed, client);

    expect(create).toHaveBeenCalledTimes(1);
    const nrColumn = suggestions.find((s) => s.header === "Nr.");
    expect(nrColumn).toMatchObject({ field: "telefoon", source: "ai" });
  });

  it("laat een kolom ongemapt als ook de AI niets voorstelt", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", input: { col_1: null } }],
    });
    const client: AiMatchClient = { messages: { create } };

    const parsed: ParsedFile = {
      headers: ["Bedrijfsnaam", "Opmerkingen"],
      rows: [["Acme BV", "geen"]],
    };

    const suggestions = await buildMappingSuggestions(parsed, client);
    const opmerkingen = suggestions.find((s) => s.header === "Opmerkingen");
    expect(opmerkingen).toMatchObject({ field: null, source: "none" });
  });

  it("roept de AI niet aan als alle doelvelden al gevuld zijn, ook met onbekende kolommen over", async () => {
    const create = vi.fn();
    const client: AiMatchClient = { messages: { create } };

    // Alle 9 velden dekken zodat unresolvedFields leeg is, plus 1 extra
    // onbekende kolom die simpelweg genegeerd mag worden.
    const parsed: ParsedFile = {
      headers: [
        "Bedrijfsnaam",
        "KVK-nummer",
        "Website",
        "Postcode",
        "Plaats",
        "Contactpersoon",
        "Functie",
        "Telefoonnummer",
        "E-mailadres",
        "Interne notitie",
      ],
      rows: [["Acme BV", "1", "a", "b", "c", "d", "e", "f", "g", "irrelevant"]],
    };

    await buildMappingSuggestions(parsed, client);
    expect(create).not.toHaveBeenCalled();
  });
});
