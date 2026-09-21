import { describe, expect, it } from "vitest";
import { evaluatePrefilter } from "@/lib/icp/prefilter/evaluatePrefilter";
import { EMPTY_PREFILTER_CONFIG, type IcpPrefilterConfig, type PrefilterCompanyInput } from "@/lib/icp/prefilter/types";

function company(overrides: Partial<PrefilterCompanyInput> = {}): PrefilterCompanyInput {
  return {
    status: "actief",
    rechtsvorm: "Besloten vennootschap",
    sbiCodes: ["2830"],
    aantalWerkzamePersonen: 50,
    plaats: "Utrecht",
    ...overrides,
  };
}

function config(overrides: Partial<IcpPrefilterConfig> = {}): IcpPrefilterConfig {
  return { ...EMPTY_PREFILTER_CONFIG, ...overrides };
}

describe("evaluatePrefilter", () => {
  it("sluit niets uit bij een lege configuratie", () => {
    expect(evaluatePrefilter(EMPTY_PREFILTER_CONFIG, company())).toEqual({ excluded: false });
  });

  it("sluit een bedrijf uit op basis van status", () => {
    const result = evaluatePrefilter(
      config({ excludeStatuses: ["inactief"] }),
      company({ status: "inactief" }),
    );
    expect(result).toEqual({ excluded: true, reason: expect.stringContaining("inactief") });
  });

  it("sluit een actief bedrijf niet uit als alleen inactief is uitgesloten", () => {
    const result = evaluatePrefilter(config({ excludeStatuses: ["inactief"] }), company({ status: "actief" }));
    expect(result).toEqual({ excluded: false });
  });

  it("sluit een bedrijf uit op rechtsvorm, hoofdletterongevoelig", () => {
    const result = evaluatePrefilter(
      config({ excludeRechtsvormen: ["eenmanszaak"] }),
      company({ rechtsvorm: "Eenmanszaak" }),
    );
    expect(result.excluded).toBe(true);
  });

  it("sluit een bedrijf uit op een SBI-codeprefix", () => {
    const result = evaluatePrefilter(
      config({ excludeSbiCodePrefixes: ["56"] }),
      company({ sbiCodes: ["5610"] }),
    );
    expect(result).toEqual({ excluded: true, reason: expect.stringContaining("5610") });
  });

  it("sluit een bedrijf niet uit als geen enkele SBI-code met de prefix overeenkomt", () => {
    const result = evaluatePrefilter(
      config({ excludeSbiCodePrefixes: ["56"] }),
      company({ sbiCodes: ["2830", "4690"] }),
    );
    expect(result).toEqual({ excluded: false });
  });

  it("sluit een bedrijf uit onder het minimumaantal medewerkers", () => {
    const result = evaluatePrefilter(
      config({ minAantalWerknemers: 50 }),
      company({ aantalWerkzamePersonen: 10 }),
    );
    expect(result.excluded).toBe(true);
  });

  it("sluit een bedrijf uit boven het maximumaantal medewerkers", () => {
    const result = evaluatePrefilter(
      config({ maxAantalWerknemers: 100 }),
      company({ aantalWerkzamePersonen: 500 }),
    );
    expect(result.excluded).toBe(true);
  });

  it("sluit een bedrijf met precies het minimum of maximum niet uit (grenzen zijn inclusief)", () => {
    expect(
      evaluatePrefilter(config({ minAantalWerknemers: 50 }), company({ aantalWerkzamePersonen: 50 })),
    ).toEqual({ excluded: false });
    expect(
      evaluatePrefilter(config({ maxAantalWerknemers: 50 }), company({ aantalWerkzamePersonen: 50 })),
    ).toEqual({ excluded: false });
  });

  it("sluit niet uit op medewerkersaantal als dat onbekend is (fail-open)", () => {
    const result = evaluatePrefilter(
      config({ minAantalWerknemers: 10, maxAantalWerknemers: 100 }),
      company({ aantalWerkzamePersonen: null }),
    );
    expect(result).toEqual({ excluded: false });
  });

  it("sluit een bedrijf uit buiten de toegestane provincies", () => {
    const result = evaluatePrefilter(
      config({ allowedProvincies: ["Noord-Holland"] }),
      company({ plaats: "Rotterdam" }),
    );
    expect(result).toEqual({ excluded: true, reason: expect.stringContaining("Zuid-Holland") });
  });

  it("sluit een bedrijf niet uit als de plaats wél in de toegestane provincie ligt", () => {
    const result = evaluatePrefilter(
      config({ allowedProvincies: ["Noord-Holland"] }),
      company({ plaats: "Amsterdam" }),
    );
    expect(result).toEqual({ excluded: false });
  });

  it("sluit niet uit op provincie als de plaats onbekend/onherkend is (fail-open)", () => {
    const result = evaluatePrefilter(
      config({ allowedProvincies: ["Noord-Holland"] }),
      company({ plaats: "Een fictief gehucht" }),
    );
    expect(result).toEqual({ excluded: false });
  });

  it("evalueert criteria in volgorde en geeft de eerst gevonden uitsluitingsreden terug", () => {
    const result = evaluatePrefilter(
      config({ excludeStatuses: ["inactief"], minAantalWerknemers: 1000 }),
      company({ status: "inactief", aantalWerkzamePersonen: 1 }),
    );
    expect(result).toEqual({ excluded: true, reason: expect.stringContaining("Status") });
  });

  it("combineert meerdere actieve filters: alleen uitsluiten als minstens één criterium raakt", () => {
    const strictConfig = config({
      excludeStatuses: ["inactief"],
      excludeRechtsvormen: ["eenmanszaak"],
      minAantalWerknemers: 10,
      allowedProvincies: ["Utrecht"],
    });
    expect(evaluatePrefilter(strictConfig, company())).toEqual({ excluded: false });
  });
});
