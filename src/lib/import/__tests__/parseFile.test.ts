import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  EmptyFileError,
  UnsupportedFileTypeError,
  parseImportFile,
} from "@/lib/import/parseFile";

describe("parseImportFile - CSV", () => {
  it("parseert koppen en rijen, en trimt waarden", async () => {
    const csv = "Bedrijfsnaam,Plaats\nAcme BV , Amsterdam \nBeta BV,Rotterdam\n";
    const result = await parseImportFile(Buffer.from(csv, "utf-8"), "bedrijven.csv");

    expect(result.headers).toEqual(["Bedrijfsnaam", "Plaats"]);
    expect(result.rows).toEqual([
      ["Acme BV", "Amsterdam"],
      ["Beta BV", "Rotterdam"],
    ]);
  });

  it("negeert lege regels", async () => {
    const csv = "Bedrijfsnaam\nAcme BV\n\nBeta BV\n";
    const result = await parseImportFile(Buffer.from(csv, "utf-8"), "bedrijven.csv");
    expect(result.rows).toHaveLength(2);
  });

  it("gooit een EmptyFileError bij een leeg bestand", async () => {
    await expect(
      parseImportFile(Buffer.from("", "utf-8"), "leeg.csv"),
    ).rejects.toBeInstanceOf(EmptyFileError);
  });
});

describe("parseImportFile - XLSX", () => {
  async function buildXlsxBuffer(rows: string[][]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Bedrijven");
    for (const row of rows) sheet.addRow(row);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  it("parseert koppen en rijen uit een echt XLSX-bestand", async () => {
    const buffer = await buildXlsxBuffer([
      ["Bedrijfsnaam", "KVK-nummer"],
      ["Acme BV", "12345678"],
      ["Beta BV", "87654321"],
    ]);

    const result = await parseImportFile(buffer, "bedrijven.xlsx");

    expect(result.headers).toEqual(["Bedrijfsnaam", "KVK-nummer"]);
    expect(result.rows).toEqual([
      ["Acme BV", "12345678"],
      ["Beta BV", "87654321"],
    ]);
  });
});

describe("parseImportFile - bestandstype", () => {
  it("gooit een duidelijke fout bij een niet-ondersteund bestandstype", async () => {
    await expect(
      parseImportFile(Buffer.from("test"), "bedrijven.pdf"),
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });
});
