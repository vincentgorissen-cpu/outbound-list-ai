import { describe, expect, it } from "vitest";
import { EXPORT_COLUMNS } from "@/lib/results/exportColumns";
import type { CompanyResultRow } from "@/lib/results/types";

function row(overrides: Partial<CompanyResultRow> = {}): CompanyResultRow {
  return {
    importRowId: "1",
    origineleBedrijfsnaam: "Acme B.V.",
    officieleNaam: "Acme B.V.",
    kvkNummer: "68750110",
    rechtsvorm: "Besloten vennootschap",
    plaats: "Utrecht",
    sbiActiviteit: "Machinebouw",
    sbiCode: "2830",
    aantalMedewerkers: 42,
    website: "https://acme.nl",
    kvkMatchConfidence: 95,
    kvkStatus: "actief",
    bedrijfsclassificatie: "legal_entity",
    icpScore: 88,
    icpClassification: "high_fit",
    belangrijksteReden: "Past qua sector",
    icpReasons: ["Past qua sector", "Juiste omvang"],
    icpConfidence: 0.9,
    kvkOpgehaaldOp: "2026-03-05T10:00:00.000Z",
    websiteStatus: "accessible",
    websiteCheckedAt: "2026-03-05T10:00:00.000Z",
    pagesAnalyzed: 3,
    companyDescription: "Machinebouwer voor de voedingsmiddelenindustrie.",
    productsServices: ["Verpakkingsmachines"],
    industriesServed: ["Voeding"],
    targetMarkets: ["Nederland"],
    businessModel: "B2B",
    operationalSignals: ["eigen productie"],
    websiteLocations: ["Utrecht"],
    dataCompleteness: 0.75,
    dataSources: ["upload", "website"],
    missingImportantData: [],
    keySalesSignals: ["eigen productie"],
    status: "compleet",
    reviewRequired: false,
    ...overrides,
  };
}

function toRecord(companyRow: CompanyResultRow): Record<string, string> {
  const record: Record<string, string> = {};
  for (const column of EXPORT_COLUMNS) {
    record[column.header] = column.getValue(companyRow);
  }
  return record;
}

describe("EXPORT_COLUMNS", () => {
  it("bevat exact de 17 gevraagde kolommen in de juiste volgorde met duidelijke Nederlandse namen", () => {
    expect(EXPORT_COLUMNS.map((c) => c.header)).toEqual([
      "Originele bedrijfsnaam",
      "Officiële KVK-bedrijfsnaam",
      "KVK-nummer",
      "Rechtsvorm",
      "SBI-code",
      "SBI-omschrijving",
      "Aantal medewerkers",
      "Website",
      "Plaats",
      "Bedrijfsclassificatie",
      "KVK-matchbetrouwbaarheid",
      "Websitestatus",
      "ICP-score",
      "ICP-classificatie",
      "ICP-redenen",
      "AI-betrouwbaarheid",
      "Laatste KVK-controle",
    ]);
  });

  it("vult een volledig ingevulde rij correct in, inclusief afleidingen", () => {
    const record = toRecord(row());
    expect(record["Originele bedrijfsnaam"]).toBe("Acme B.V.");
    expect(record["Bedrijfsclassificatie"]).toBe("Rechtspersoon");
    expect(record["ICP-classificatie"]).toBe("Goede match");
    expect(record["ICP-redenen"]).toBe("Past qua sector; Juiste omvang");
    expect(record["AI-betrouwbaarheid"]).toBe("90%");
    expect(record["Laatste KVK-controle"]).toBe("05-03-2026");
    expect(record["Websitestatus"]).toBe("Bereikbaar");
  });

  it("geeft lege strings terug voor lege/ontbrekende velden, nooit 'null' of 'undefined'", () => {
    const record = toRecord(
      row({
        officieleNaam: null,
        kvkNummer: null,
        rechtsvorm: null,
        sbiActiviteit: null,
        sbiCode: null,
        aantalMedewerkers: null,
        website: null,
        kvkMatchConfidence: null,
        icpScore: null,
        icpClassification: null,
        icpReasons: [],
        icpConfidence: null,
        kvkOpgehaaldOp: null,
      }),
    );

    for (const value of Object.values(record)) {
      expect(value).not.toContain("null");
      expect(value).not.toContain("undefined");
    }
    expect(record["Website"]).toBe("");
    expect(record["ICP-redenen"]).toBe("");
    expect(record["AI-betrouwbaarheid"]).toBe("");
    expect(record["Laatste KVK-controle"]).toBe("");
  });

  it("bewaart Nederlandse tekens ongewijzigd", () => {
    const record = toRecord(
      row({
        origineleBedrijfsnaam: "Café Groothandel Müller-Öztürk B.V.",
        plaats: "'s-Gravenhage",
        sbiActiviteit: "Vervaardiging van kaas én zuivelproducten",
      }),
    );
    expect(record["Originele bedrijfsnaam"]).toBe("Café Groothandel Müller-Öztürk B.V.");
    expect(record["Plaats"]).toBe("'s-Gravenhage");
    expect(record["SBI-omschrijving"]).toBe("Vervaardiging van kaas én zuivelproducten");
  });

  it("geeft een lege string voor websitestatus als er nog geen controle is geweest", () => {
    expect(toRecord(row({ websiteStatus: null }))["Websitestatus"]).toBe("");
  });

  it("rondt de AI-betrouwbaarheid af naar een heel percentage", () => {
    expect(toRecord(row({ icpConfidence: 0.755 }))["AI-betrouwbaarheid"]).toBe("76%");
    expect(toRecord(row({ icpConfidence: 0 }))["AI-betrouwbaarheid"]).toBe("0%");
  });

  it("formatteert de laatste KVK-controle als dd-mm-jjjj", () => {
    expect(toRecord(row({ kvkOpgehaaldOp: "2026-12-31T12:00:00.000Z" }))["Laatste KVK-controle"]).toBe(
      "31-12-2026",
    );
  });
});
