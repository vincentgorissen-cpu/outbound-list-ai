import Papa from "papaparse";
import ExcelJS from "exceljs";
import type { ParsedFile } from "./types";

export class UnsupportedFileTypeError extends Error {
  constructor(filename: string) {
    super(
      `Bestandstype van "${filename}" wordt niet ondersteund. Gebruik CSV of XLSX.`,
    );
    this.name = "UnsupportedFileTypeError";
  }
}

export class EmptyFileError extends Error {
  constructor() {
    super("Het bestand bevat geen gegevens.");
    this.name = "EmptyFileError";
  }
}

function detectKind(filename: string): "csv" | "xlsx" {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "csv") return "csv";
  if (extension === "xlsx") return "xlsx";
  throw new UnsupportedFileTypeError(filename);
}

function toParsedFile(rawRows: string[][]): ParsedFile {
  const [headerRow, ...dataRows] = rawRows.filter((row) =>
    row.some((cell) => cell.trim() !== ""),
  );

  if (!headerRow) {
    throw new EmptyFileError();
  }

  const columnCount = headerRow.length;
  const rows = dataRows.map((row) => {
    const padded = row.slice(0, columnCount);
    while (padded.length < columnCount) padded.push("");
    return padded.map((cell) => cell.trim());
  });

  return { headers: headerRow.map((cell) => cell.trim()), rows };
}

function parseCsv(buffer: Buffer): ParsedFile {
  const text = buffer.toString("utf-8");
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  });
  const rows = result.data.map((row) => row.map((cell) => String(cell ?? "")));
  return toParsedFile(rows);
}

async function parseXlsx(buffer: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new EmptyFileError();
  }

  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as ExcelJS.CellValue[];
    // row.values is 1-indexed met een lege eerste entry.
    const cells = values.slice(1).map((value) => cellValueToString(value));
    rows.push(cells);
  });

  return toParsedFile(rows);
}

function cellValueToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellValueToString(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    return "";
  }
  return String(value);
}

/**
 * Parseert een geüpload CSV- of XLSX-bestand naar kolomkoppen + rijen.
 * Bepaalt het bestandstype op de extensie, niet op het MIME-type van de
 * browser (die is niet altijd betrouwbaar).
 */
export async function parseImportFile(
  buffer: Buffer,
  filename: string,
): Promise<ParsedFile> {
  const kind = detectKind(filename);
  return kind === "csv" ? parseCsv(buffer) : parseXlsx(buffer);
}
