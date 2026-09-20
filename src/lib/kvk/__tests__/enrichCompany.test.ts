import { describe, expect, it, vi } from "vitest";
import { enrichCompanyFromKvk } from "@/lib/kvk/enrichCompany";
import type { KvkBasisprofiel, KvkVestigingsprofiel } from "@/lib/kvk/types";

const BASISPROFIEL_ACTIEF: KvkBasisprofiel = {
  kvkNummer: "68750110",
  naam: "Test BV Donald",
  statutaireNaam: "Test BV Donald",
  totaalWerkzamePersonen: 1,
  handelsnamen: [
    { naam: "Test BV Donald", volgorde: 0 },
    { naam: "Test BV Donald Nevenvestiging", volgorde: 1 },
  ],
  sbiActiviteiten: [
    { sbiCode: "01241", sbiOmschrijving: "Teelt van appels en peren", indHoofdactiviteit: "Ja" },
  ],
  _embedded: {
    eigenaar: { rechtsvorm: "Besloten vennootschap" },
    hoofdvestiging: {
      vestigingsnummer: "000037178598",
      kvkNummer: "68750110",
      totaalWerkzamePersonen: 1,
      adressen: [
        { type: "correspondentieadres", plaats: "Rommeldam" },
        { type: "bezoekadres", straatnaam: "Hizzaarderlaan", plaats: "Lollum" },
      ],
    },
  },
  links: [],
};

describe("enrichCompanyFromKvk", () => {
  it("zet alle gevraagde velden om, inclusief website uit het vestigingsprofiel", async () => {
    const getBasisprofiel = vi.fn().mockResolvedValue(BASISPROFIEL_ACTIEF);
    const getVestigingsprofiel = vi.fn().mockResolvedValue({
      websites: ["https://acme.nl"],
    } satisfies Partial<KvkVestigingsprofiel>);

    const result = await enrichCompanyFromKvk("68750110", {
      getBasisprofiel,
      getVestigingsprofiel,
    });

    expect(getBasisprofiel).toHaveBeenCalledWith("68750110");
    expect(getVestigingsprofiel).toHaveBeenCalledWith("000037178598");
    expect(result).toMatchObject({
      kvkNummer: "68750110",
      officieleNaam: "Test BV Donald",
      handelsnamen: ["Test BV Donald", "Test BV Donald Nevenvestiging"],
      rechtsvorm: "Besloten vennootschap",
      status: "actief",
      sbiCodes: ["01241"],
      sbiOmschrijvingen: ["Teelt van appels en peren"],
      aantalWerkzamePersonen: 1,
      vestigingsplaats: "Lollum",
      website: "https://acme.nl",
    });
    expect(typeof result?.opgehaaldOp).toBe("string");
  });

  it("geeft null terug als er geen basisprofiel bestaat voor dit kvk-nummer", async () => {
    const getBasisprofiel = vi.fn().mockResolvedValue(null);
    const getVestigingsprofiel = vi.fn();

    const result = await enrichCompanyFromKvk("00000000", {
      getBasisprofiel,
      getVestigingsprofiel,
    });

    expect(result).toBeNull();
    expect(getVestigingsprofiel).not.toHaveBeenCalled();
  });

  it("slaat het vestigingsprofiel over als er geen hoofdvestiging bekend is, en zet website op null", async () => {
    const getBasisprofiel = vi.fn().mockResolvedValue({
      ...BASISPROFIEL_ACTIEF,
      _embedded: { eigenaar: BASISPROFIEL_ACTIEF._embedded?.eigenaar },
    });
    const getVestigingsprofiel = vi.fn();

    const result = await enrichCompanyFromKvk("68750110", {
      getBasisprofiel,
      getVestigingsprofiel,
    });

    expect(getVestigingsprofiel).not.toHaveBeenCalled();
    expect(result?.website).toBeNull();
    expect(result?.vestigingsplaats).toBeNull();
  });

  it("zet website op null als het vestigingsprofiel geen websites heeft", async () => {
    const getBasisprofiel = vi.fn().mockResolvedValue(BASISPROFIEL_ACTIEF);
    const getVestigingsprofiel = vi.fn().mockResolvedValue({ websites: [] });

    const result = await enrichCompanyFromKvk("68750110", {
      getBasisprofiel,
      getVestigingsprofiel,
    });

    expect(result?.website).toBeNull();
  });

  it("leidt status 'inactief' af uit een einddatum in materieleRegistratie", async () => {
    const getBasisprofiel = vi.fn().mockResolvedValue({
      ...BASISPROFIEL_ACTIEF,
      materieleRegistratie: { datumAanvang: "20100101", datumEinde: "20200101" },
    });
    const getVestigingsprofiel = vi.fn().mockResolvedValue({ websites: [] });

    const result = await enrichCompanyFromKvk("68750110", {
      getBasisprofiel,
      getVestigingsprofiel,
    });

    expect(result?.status).toBe("inactief");
  });

  it("valt terug op de handelsnaam als er geen statutaire naam is", async () => {
    const getBasisprofiel = vi.fn().mockResolvedValue({
      ...BASISPROFIEL_ACTIEF,
      statutaireNaam: undefined,
    });
    const getVestigingsprofiel = vi.fn().mockResolvedValue({ websites: [] });

    const result = await enrichCompanyFromKvk("68750110", {
      getBasisprofiel,
      getVestigingsprofiel,
    });

    expect(result?.officieleNaam).toBe("Test BV Donald");
  });
});
