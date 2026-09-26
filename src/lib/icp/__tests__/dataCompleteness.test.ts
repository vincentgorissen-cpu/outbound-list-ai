import { describe, expect, it } from "vitest";
import { computeDataCompleteness, computeDataSources } from "@/lib/icp/dataCompleteness";
import type { CompanyForScoring } from "@/lib/icp/types";

function company(overrides: Partial<CompanyForScoring> = {}): CompanyForScoring {
  return {
    bedrijfsnaam: "Acme B.V.",
    sbiOmschrijvingen: [],
    aantalWerkzamePersonen: null,
    plaats: null,
    website: null,
    ...overrides,
  };
}

describe("computeDataCompleteness", () => {
  it("is 0 als er helemaal niets bekend is behalve de naam", () => {
    expect(computeDataCompleteness(company())).toBe(0);
  });

  it("is 1 als alle vier factoren aanwezig zijn", () => {
    expect(
      computeDataCompleteness(
        company({
          plaats: "Utrecht",
          aantalWerkzamePersonen: 50,
          sbiOmschrijvingen: ["Machinebouw"],
          bedrijfsomschrijving: "Wij maken machines.",
        }),
      ),
    ).toBe(1);
  });

  it("telt website-inhoud als 1 factor, ongeacht via welk gestructureerd veld", () => {
    expect(computeDataCompleteness(company({ productsServices: ["Verpakkingsmachines"] }))).toBe(0.25);
    expect(computeDataCompleteness(company({ industriesServed: ["Voeding"] }))).toBe(0.25);
    expect(computeDataCompleteness(company({ operationalSignals: ["eigen productie"] }))).toBe(0.25);
    expect(computeDataCompleteness(company({ businessModel: "B2B" }))).toBe(0.25);
    expect(computeDataCompleteness(company({ websiteLocations: ["Utrecht"] }))).toBe(0.25);
  });

  it("negeert lege strings/lege lijsten als 'geen website-inhoud'", () => {
    expect(
      computeDataCompleteness(
        company({ bedrijfsomschrijving: "   ", productsServices: [], businessModel: "" }),
      ),
    ).toBe(0);
  });

  it("telt plaats en aantal medewerkers onafhankelijk van elkaar", () => {
    expect(computeDataCompleteness(company({ plaats: "Utrecht" }))).toBe(0.25);
    expect(computeDataCompleteness(company({ aantalWerkzamePersonen: 10 }))).toBe(0.25);
  });
});

describe("computeDataSources", () => {
  it("bevat altijd 'upload'", () => {
    expect(computeDataSources(company())).toEqual(["upload"]);
  });

  it("voegt 'website' toe zodra er website-inhoud is", () => {
    expect(computeDataSources(company({ bedrijfsomschrijving: "Wij maken machines." }))).toEqual([
      "upload",
      "website",
    ]);
  });

  it("voegt geen 'website' toe voor lege/witruimte-only tekst", () => {
    expect(computeDataSources(company({ bedrijfsomschrijving: "   " }))).toEqual(["upload"]);
  });
});
