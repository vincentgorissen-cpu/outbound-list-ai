import { describe, expect, it } from "vitest";
import { normalizeRows } from "@/lib/import/normalizeRecord";
import type { ColumnMapping } from "@/lib/import/types";

describe("normalizeRows", () => {
  const mapping: ColumnMapping = {
    bedrijfsnaam: 0,
    website: 1,
    postcode: 2,
    email: 3,
  };

  it("mapt kolommen naar velden op basis van de bevestigde mapping", () => {
    const [record] = normalizeRows(
      [["Acme BV", "acme.nl", "1234 ab", "Info@Acme.NL"]],
      mapping,
    );

    expect(record.bedrijfsnaam).toBe("Acme BV");
    expect(record.website).toBe("https://acme.nl");
    expect(record.postcode).toBe("1234 AB");
    expect(record.email).toBe("info@acme.nl");
  });

  it("laat niet-gemapte velden op null staan", () => {
    const [record] = normalizeRows([["Acme BV", "", "", ""]], mapping);
    expect(record.kvk_nummer).toBeNull();
    expect(record.contactpersoon).toBeNull();
  });

  it("zet lege of alleen-spaties-waarden om naar null", () => {
    const [record] = normalizeRows([["Acme BV", "   ", "", ""]], mapping);
    expect(record.website).toBeNull();
  });

  it("laat een al-volledige website-url ongewijzigd", () => {
    const [record] = normalizeRows(
      [["Acme BV", "http://acme.nl", "", ""]],
      mapping,
    );
    expect(record.website).toBe("http://acme.nl");
  });
});
