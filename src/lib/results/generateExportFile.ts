import Papa from "papaparse";
import ExcelJS from "exceljs";
import { EXPORT_COLUMNS } from "./exportColumns";
import type { CompanyResultRow } from "./types";

function toValueRows(rows: CompanyResultRow[]): string[][] {
  return rows.map((row) => EXPORT_COLUMNS.map((column) => column.getValue(row)));
}

/**
 * Genereert een CSV-export met een UTF-8 BOM, zodat Excel Nederlandse
 * tekens (ë, ï, ö, …) correct weergeeft.
 */
export function generateCsvExport(rows: CompanyResultRow[]): string {
  const csv = Papa.unparse({
    fields: EXPORT_COLUMNS.map((column) => column.header),
    data: toValueRows(rows),
  });
  return `﻿${csv}`;
}

/** Genereert een XLSX-export met dezelfde kolommen en volgorde als de CSV-export. */
export async function generateXlsxExport(rows: CompanyResultRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Resultaten");

  worksheet.columns = EXPORT_COLUMNS.map((column) => ({ header: column.header, key: column.header }));
  for (const row of rows) {
    worksheet.addRow(EXPORT_COLUMNS.map((column) => column.getValue(row)));
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
