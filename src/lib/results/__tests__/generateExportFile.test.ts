import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { generateCsvExport, generateXlsxExport } from "@/lib/results/generateExportFile";
import { EXPORT_COLUMNS } from "@/lib/results/exportColumns";
import type { CompanyResultRow } from "@/lib/results/types";

function makeRow(index: number, overrides: Partial<CompanyResultRow> = {}): CompanyResultRow {
  return {
    importRowId: String(index),
    origineleBedrijfsnaam: `Bedrijf ${index} B.V.`,
    officieleNaam: `Bedrijf ${index} B.V.`,
    kvkNummer: `1000000${index}`,
    rechtsvorm: "Besloten vennootschap",
    plaats: "Utrecht",
    sbiActiviteit: "Machinebouw",
    sbiCode: "2830",
    aantalMedewerkers: 10 + index,
    website: `https://bedrijf${index}.nl`,
    kvkMatchConfidence: 90,
    kvkStatus: "actief",
    bedrijfsclassificatie: "legal_entity",
    icpScore: 70,
    icpClassification: "medium_fit",
    belangrijksteReden: "Past qua sector",
    icpReasons: ["Past qua sector"],
    icpConfidence: 0.8,
    kvkOpgehaaldOp: "2026-03-05T10:00:00.000Z",
    websiteStatus: "accessible",
    status: "compleet",
    reviewRequired: false,
    ...overrides,
  };
}

function emptyRow(index: number): CompanyResultRow {
  return {
    importRowId: String(index),
    origineleBedrijfsnaam: `Bedrijf ${index}`,
    officieleNaam: null,
    kvkNummer: null,
    rechtsvorm: null,
    plaats: null,
    sbiActiviteit: null,
    sbiCode: null,
    aantalMedewerkers: null,
    website: null,
    kvkMatchConfidence: null,
    kvkStatus: null,
    bedrijfsclassificatie: "unknown",
    icpScore: null,
    icpClassification: null,
    belangrijksteReden: null,
    icpReasons: [],
    icpConfidence: null,
    kvkOpgehaaldOp: null,
    websiteStatus: null,
    status: "nieuw",
    reviewRequired: false,
  };
}

const HEADERS = EXPORT_COLUMNS.map((c) => c.header);

describe("generateCsvExport", () => {
  it("bevat een UTF-8 BOM zodat Excel Nederlandse tekens correct toont", () => {
    const csv = generateCsvExport([makeRow(1)]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("genereert een geldig CSV-bestand voor 10 records met de juiste kolomkoppen", () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeRow(i));
    const csv = generateCsvExport(rows);
    const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), {
      header: true,
      skipEmptyLines: true,
    });
    expect(parsed.data).toHaveLength(10);
    expect(Object.keys(parsed.data[0])).toEqual(HEADERS);
    expect(parsed.data[0]["Originele bedrijfsnaam"]).toBe("Bedrijf 0 B.V.");
  });

  it("verwerkt 1.000 records zonder gegevensverlies", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => makeRow(i));
    const csv = generateCsvExport(rows);
    const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), {
      header: true,
      skipEmptyLines: true,
    });
    expect(parsed.data).toHaveLength(1000);
    expect(parsed.data[999]["Originele bedrijfsnaam"]).toBe("Bedrijf 999 B.V.");
    expect(parsed.data[999]["KVK-nummer"]).toBe("1000000999");
  });

  it("geeft lege velden weer als lege cel, niet als 'null'", () => {
    const csv = generateCsvExport([emptyRow(1)]);
    const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), {
      header: true,
      skipEmptyLines: true,
    });
    expect(parsed.data[0]["Website"]).toBe("");
    expect(parsed.data[0]["ICP-score"]).toBe("");
    expect(csv).not.toContain("null");
  });

  it("bewaart Nederlandse tekens correct na parsen (round-trip)", () => {
    const row = makeRow(1, {
      origineleBedrijfsnaam: "Café Groothandel Müller-Öztürk B.V.",
      plaats: "'s-Gravenhage",
      sbiActiviteit: "Vervaardiging van kaas én zuivelproducten",
    });
    const csv = generateCsvExport([row]);
    const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), {
      header: true,
      skipEmptyLines: true,
    });
    expect(parsed.data[0]["Originele bedrijfsnaam"]).toBe("Café Groothandel Müller-Öztürk B.V.");
    expect(parsed.data[0]["Plaats"]).toBe("'s-Gravenhage");
    expect(parsed.data[0]["SBI-omschrijving"]).toBe("Vervaardiging van kaas én zuivelproducten");
  });
});

async function readXlsxRows(buffer: Buffer): Promise<{ headers: string[]; rows: string[][] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0]!;
  const allRows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    allRows.push(values.slice(1).map((v) => (v === null || v === undefined ? "" : String(v))));
  });
  const [headers, ...rows] = allRows;
  return { headers: headers ?? [], rows };
}

describe("generateXlsxExport", () => {
  it("genereert een geldig XLSX-bestand voor 10 records met de juiste kolomkoppen", async () => {
    const rowsIn = Array.from({ length: 10 }, (_, i) => makeRow(i));
    const buffer = await generateXlsxExport(rowsIn);
    const { headers, rows } = await readXlsxRows(buffer);
    expect(headers).toEqual(HEADERS);
    expect(rows).toHaveLength(10);
  });

  it("verwerkt 1.000 records zonder gegevensverlies", async () => {
    const rowsIn = Array.from({ length: 1000 }, (_, i) => makeRow(i));
    const buffer = await generateXlsxExport(rowsIn);
    const { rows } = await readXlsxRows(buffer);
    expect(rows).toHaveLength(1000);
    expect(rows[999][0]).toBe("Bedrijf 999 B.V.");
  });

  it("geeft lege velden weer als lege cel", async () => {
    const buffer = await generateXlsxExport([emptyRow(1)]);
    const { headers, rows } = await readXlsxRows(buffer);
    const websiteIndex = headers.indexOf("Website");
    expect(rows[0][websiteIndex]).toBe("");
  });

  it("bewaart Nederlandse tekens correct in het Excel-bestand", async () => {
    const row = makeRow(1, {
      origineleBedrijfsnaam: "Café Groothandel Müller-Öztürk B.V.",
      plaats: "'s-Gravenhage",
    });
    const buffer = await generateXlsxExport([row]);
    const { headers, rows } = await readXlsxRows(buffer);
    const naamIndex = headers.indexOf("Originele bedrijfsnaam");
    const plaatsIndex = headers.indexOf("Plaats");
    expect(rows[0][naamIndex]).toBe("Café Groothandel Müller-Öztürk B.V.");
    expect(rows[0][plaatsIndex]).toBe("'s-Gravenhage");
  });
});
