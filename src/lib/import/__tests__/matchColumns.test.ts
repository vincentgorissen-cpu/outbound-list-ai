import { describe, expect, it } from "vitest";
import { matchColumnsDeterministically } from "@/lib/import/matchColumns";
import { TARGET_FIELDS } from "@/lib/import/targetFields";

describe("matchColumnsDeterministically", () => {
  it("herkent alle negen velden ondanks hoofdletters, spaties en koppeltekens", () => {
    const headers = [
      "Bedrijfsnaam",
      "KVK-Nummer",
      "Website",
      "Postcode",
      "Plaats",
      "Contactpersoon",
      "Functie",
      "Telefoonnummer",
      "E-mailadres",
    ];

    const { suggestions, unresolvedFields } =
      matchColumnsDeterministically(headers);

    expect(unresolvedFields).toEqual([]);
    expect(suggestions.map((s) => s.field)).toEqual([
      "bedrijfsnaam",
      "kvk_nummer",
      "website",
      "postcode",
      "plaats",
      "contactpersoon",
      "functie",
      "telefoon",
      "email",
    ]);
    expect(suggestions.every((s) => s.source === "deterministic")).toBe(true);
  });

  it("laat onherkende kolommen ongemapt in plaats van te gokken", () => {
    const { suggestions, unresolvedFields } = matchColumnsDeterministically([
      "Bedrijfsnaam",
      "Opmerkingen",
      "Referentie",
    ]);

    expect(suggestions[0].field).toBe("bedrijfsnaam");
    expect(suggestions[1]).toMatchObject({ field: null, source: "none" });
    expect(suggestions[2]).toMatchObject({ field: null, source: "none" });
    expect(unresolvedFields).not.toContain("bedrijfsnaam");
    expect(unresolvedFields).toContain("website");
  });

  it("koppelt een doelveld maximaal één keer bij dubbele kolomnamen", () => {
    const { suggestions, unresolvedFields } = matchColumnsDeterministically([
      "Bedrijfsnaam",
      "Bedrijfsnaam",
    ]);

    expect(suggestions[0].field).toBe("bedrijfsnaam");
    expect(suggestions[1].field).toBeNull();
    expect(unresolvedFields).not.toContain("bedrijfsnaam");
  });

  it("heeft geen synoniem dat naar twee verschillende velden verwijst", () => {
    const seen = new Map<string, string>();
    for (const field of TARGET_FIELDS) {
      for (const synonym of field.synonyms) {
        const key = synonym.toLowerCase();
        const existing = seen.get(key);
        expect(existing, `"${synonym}" staat bij zowel ${existing} als ${field.id}`).toBeUndefined();
        seen.set(key, field.id);
      }
    }
  });

  it("markeert alle velden als onopgelost bij een lege header-lijst", () => {
    const { unresolvedFields } = matchColumnsDeterministically([]);
    expect(unresolvedFields).toHaveLength(TARGET_FIELDS.length);
  });
});
