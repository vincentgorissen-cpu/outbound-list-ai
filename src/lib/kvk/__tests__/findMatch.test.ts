import { describe, expect, it, vi } from "vitest";
import { findKvkMatch } from "@/lib/kvk/findMatch";
import type { KvkSearchResponse, KvkSearchResultItem } from "@/lib/kvk/types";

function emptyResponse(): KvkSearchResponse {
  return { pagina: 1, resultatenPerPagina: 10, totaal: 0, resultaten: [], links: [] };
}

function withResults(resultaten: KvkSearchResultItem[]): KvkSearchResponse {
  return { pagina: 1, resultatenPerPagina: 10, totaal: resultaten.length, resultaten, links: [] };
}

const HOOFDVESTIGING: KvkSearchResultItem = {
  kvkNummer: "68750110",
  vestigingsnummer: "000037178598",
  naam: "Test BV Donald",
  type: "hoofdvestiging",
  links: [],
};

const RECHTSPERSOON: KvkSearchResultItem = {
  kvkNummer: "68750110",
  naam: "Test BV Donald",
  type: "rechtspersoon",
  links: [],
};

describe("findKvkMatch", () => {
  it("slaat de zoekopdracht over zonder bedrijfsnaam en zonder kvk-nummer", async () => {
    const search = vi.fn();
    const result = await findKvkMatch({ bedrijfsnaam: null }, search);
    expect(result.status).toBe("skipped");
    expect(search).not.toHaveBeenCalled();
  });

  it("zoekt direct op kvk-nummer als dat al bekend is, en negeert bedrijfsnaam", async () => {
    const search = vi.fn().mockResolvedValue(withResults([RECHTSPERSOON, HOOFDVESTIGING]));

    const result = await findKvkMatch(
      { bedrijfsnaam: "Andere Naam", kvkNummer: "68750110" },
      search,
    );

    expect(search).toHaveBeenCalledWith({ kvkNummer: "68750110" });
    expect(result.status).toBe("matched");
    expect(result.match?.type).toBe("hoofdvestiging");
  });

  it("geeft not_found terug als het opgegeven kvk-nummer niet bestaat", async () => {
    const search = vi.fn().mockResolvedValue(emptyResponse());
    const result = await findKvkMatch({ bedrijfsnaam: "X", kvkNummer: "00000000" }, search);
    expect(result.status).toBe("not_found");
  });

  it("matcht op exacte naam wanneer er precies één exacte match tussen meerdere resultaten zit", async () => {
    const ANDER_BEDRIJF: KvkSearchResultItem = {
      kvkNummer: "11111111",
      naam: "Test BV Donald Nevenvestiging",
      type: "nevenvestiging",
      links: [],
    };
    const search = vi.fn().mockResolvedValue(withResults([ANDER_BEDRIJF, HOOFDVESTIGING]));

    const result = await findKvkMatch({ bedrijfsnaam: "Test BV Donald" }, search);

    expect(search).toHaveBeenCalledWith({ naam: "Test BV Donald", plaats: undefined });
    expect(result.status).toBe("matched");
    expect(result.match?.kvkNummer).toBe("68750110");
    expect(result.match?.naam).toBe("Test BV Donald");
  });

  it("matcht op het enige resultaat, ook als de naam niet 100% identiek is", async () => {
    const search = vi.fn().mockResolvedValue(withResults([HOOFDVESTIGING]));
    const result = await findKvkMatch({ bedrijfsnaam: "Test B.V. Donald" }, search);
    expect(result.status).toBe("matched");
    expect(result.match?.kvkNummer).toBe("68750110");
  });

  it("geeft multiple_candidates terug bij meerdere resultaten zonder eenduidige exacte match", async () => {
    const A: KvkSearchResultItem = { kvkNummer: "1", naam: "Donald Duck BV", type: "rechtspersoon", links: [] };
    const B: KvkSearchResultItem = { kvkNummer: "2", naam: "Donald Duck Holding", type: "rechtspersoon", links: [] };
    const search = vi.fn().mockResolvedValue(withResults([A, B]));

    const result = await findKvkMatch({ bedrijfsnaam: "Donald" }, search);

    expect(result.status).toBe("multiple_candidates");
    expect(result.match).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  it("geeft not_found terug als de naamzoekopdracht niets oplevert", async () => {
    const search = vi.fn().mockResolvedValue(emptyResponse());
    const result = await findKvkMatch({ bedrijfsnaam: "Onbestaand Bedrijf XYZ" }, search);
    expect(result.status).toBe("not_found");
  });

  it("geeft plaats mee aan de zoekopdracht wanneer die bekend is", async () => {
    const search = vi.fn().mockResolvedValue(withResults([HOOFDVESTIGING]));
    await findKvkMatch({ bedrijfsnaam: "Test BV Donald", plaats: "Lollum" }, search);
    expect(search).toHaveBeenCalledWith({ naam: "Test BV Donald", plaats: "Lollum" });
  });

  it("matcht naam ongeacht hoofdletters en spaties eromheen", async () => {
    const search = vi.fn().mockResolvedValue(
      withResults([HOOFDVESTIGING, { ...RECHTSPERSOON, kvkNummer: "999", naam: "Iets Anders" }]),
    );
    const result = await findKvkMatch({ bedrijfsnaam: "  test bv donald  " }, search);
    expect(result.status).toBe("matched");
    expect(result.match?.kvkNummer).toBe("68750110");
  });
});
