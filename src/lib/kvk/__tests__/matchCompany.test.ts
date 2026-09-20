import { describe, expect, it, vi } from "vitest";
import { matchCompany } from "@/lib/kvk/matchCompany";
import type { KvkSearchResponse, KvkSearchResultItem } from "@/lib/kvk/types";

function searchResponse(resultaten: KvkSearchResultItem[]): KvkSearchResponse {
  return { pagina: 1, resultatenPerPagina: 10, totaal: resultaten.length, resultaten, links: [] };
}

function hoofdvestiging(
  kvkNummer: string,
  naam: string,
  plaats: string,
  vestigingsnummer = `v-${kvkNummer}`,
): KvkSearchResultItem {
  return {
    kvkNummer,
    vestigingsnummer,
    naam,
    type: "hoofdvestiging",
    adres: { binnenlandsAdres: { type: "bezoekadres", plaats } },
    links: [],
  };
}

describe("matchCompany", () => {
  // 1. Exacte bedrijfsnaam + plaats
  it("geeft high_confidence bij exacte bedrijfsnaam- en plaatsmatch", async () => {
    const search = vi.fn().mockResolvedValue(
      searchResponse([hoofdvestiging("68750110", "Test BV Donald", "Lollum")]),
    );

    const result = await matchCompany(
      { bedrijfsnaam: "Test BV Donald", plaats: "Lollum" },
      { search },
    );

    expect(search).toHaveBeenCalledWith({ naam: "Test BV Donald", plaats: "Lollum" });
    expect(result.status).toBe("high_confidence");
    expect(result.chosenKvkNummer).toBe("68750110");
    expect(result.confidence).toBe(100);
    expect(result.candidates).toHaveLength(1);
  });

  // 2. Bedrijfsnaam met B.V.-verschil
  it("geeft high_confidence als alleen de B.V.-notatie verschilt", async () => {
    const search = vi.fn().mockResolvedValue(
      searchResponse([hoofdvestiging("11111111", "Acme B.V.", "Amsterdam")]),
    );

    const result = await matchCompany({ bedrijfsnaam: "Acme", plaats: "Amsterdam" }, { search });

    expect(result.status).toBe("high_confidence");
    expect(result.chosenKvkNummer).toBe("11111111");
    expect(result.confidence).toBe(100);
  });

  // 3. Bijna gelijke bedrijfsnamen (in combinatie met een niet-matchende
  // plaats belandt dit terecht in de review-band, niet automatisch hoog).
  it("geeft review_required bij een bijna gelijke naam met afwijkende plaats", async () => {
    const search = vi.fn().mockResolvedValue(
      searchResponse([hoofdvestiging("22222222", "Bakkerij Janssen", "Rotterdam")]),
    );

    const result = await matchCompany(
      { bedrijfsnaam: "Bakkerij Jansen", plaats: "Utrecht" },
      { search },
    );

    expect(result.confidence).toBeGreaterThanOrEqual(70);
    expect(result.confidence).toBeLessThan(90);
    expect(result.status).toBe("review_required");
    expect(result.chosenKvkNummer).toBe("22222222");
  });

  // 4. Meerdere bedrijven met dezelfde naam
  it("kiest bij gelijke namen de kandidaat met de matchende plaats, en toont de rest als alternatief", async () => {
    const search = vi.fn().mockResolvedValue(
      searchResponse([
        hoofdvestiging("333", "Jansen Consultancy", "Rotterdam"),
        hoofdvestiging("111", "Jansen Consultancy", "Utrecht"),
      ]),
    );

    const result = await matchCompany(
      { bedrijfsnaam: "Jansen Consultancy", plaats: "Utrecht" },
      { search },
    );

    expect(result.status).toBe("high_confidence");
    expect(result.chosenKvkNummer).toBe("111");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].kvkNummer).toBe("111");
    expect(result.candidates[1].kvkNummer).toBe("333");
    expect(result.candidates[1].score).toBeLessThan(result.candidates[0].score);
  });

  // 5. Geen resultaat
  it("geeft no_reliable_match zonder gekozen kvk-nummer als de zoekopdracht niets oplevert", async () => {
    const search = vi.fn().mockResolvedValue(searchResponse([]));

    const result = await matchCompany({ bedrijfsnaam: "Onbestaand Bedrijf XYZ" }, { search });

    expect(result.status).toBe("no_reliable_match");
    expect(result.chosenKvkNummer).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it("kiest nooit zomaar het eerste resultaat: een matchende naam maar met lage score door afwijkende naam wint niet automatisch van een betere match verderop", async () => {
    const search = vi.fn().mockResolvedValue(
      searchResponse([
        hoofdvestiging("999", "Compleet Ander Bedrijf", "Utrecht"),
        hoofdvestiging("111", "Jansen Consultancy", "Utrecht"),
      ]),
    );

    const result = await matchCompany(
      { bedrijfsnaam: "Jansen Consultancy", plaats: "Utrecht" },
      { search },
    );

    expect(result.chosenKvkNummer).toBe("111");
    expect(result.chosenKvkNummer).not.toBe("999");
  });

  it("dedupliceert meerdere resultaatrijen van hetzelfde kvk-nummer tot één kandidaat", async () => {
    const search = vi.fn().mockResolvedValue(
      searchResponse([
        { kvkNummer: "1", naam: "Acme", type: "rechtspersoon", links: [] },
        hoofdvestiging("1", "Acme", "Amsterdam"),
      ]),
    );

    const result = await matchCompany({ bedrijfsnaam: "Acme", plaats: "Amsterdam" }, { search });

    expect(result.candidates).toHaveLength(1);
  });

  it("haalt vestigingsprofielen op om postcode/website te kunnen vergelijken wanneer die zijn opgegeven", async () => {
    const search = vi.fn().mockResolvedValue(searchResponse([hoofdvestiging("1", "Acme", "Amsterdam")]));
    const getBasisprofiel = vi.fn();
    const getVestigingsprofiel = vi.fn().mockResolvedValue({
      adressen: [{ type: "bezoekadres", postcode: "1011AB", plaats: "Amsterdam" }],
      websites: ["https://acme.nl"],
    });

    const result = await matchCompany(
      { bedrijfsnaam: "Acme", plaats: "Amsterdam", postcode: "1011AB", website: "acme.nl" },
      { search, getBasisprofiel, getVestigingsprofiel },
    );

    expect(getVestigingsprofiel).toHaveBeenCalledWith("v-1");
    expect(result.candidates[0].scoreBreakdown.postcode).toBe(100);
    expect(result.candidates[0].scoreBreakdown.website).toBe(100);
  });

  it("haalt geen detailprofielen op als er geen postcode of website is opgegeven", async () => {
    const search = vi.fn().mockResolvedValue(searchResponse([hoofdvestiging("1", "Acme", "Amsterdam")]));
    const getVestigingsprofiel = vi.fn();

    await matchCompany({ bedrijfsnaam: "Acme", plaats: "Amsterdam" }, { search, getVestigingsprofiel });

    expect(getVestigingsprofiel).not.toHaveBeenCalled();
  });
});
