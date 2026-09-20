import { TARGET_FIELDS } from "./targetFields";
import type { ColumnMapping, NormalizedRecord } from "./types";

function cleanValue(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** Past de (door de gebruiker bevestigde) kolommapping toe op één datarij. */
export function normalizeRow(
  row: string[],
  mapping: ColumnMapping,
): NormalizedRecord {
  const record = {} as NormalizedRecord;

  for (const field of TARGET_FIELDS) {
    const columnIndex = mapping[field.id];
    const value = columnIndex === undefined ? undefined : row[columnIndex];
    record[field.id] = cleanValue(value);
  }

  if (record.email) record.email = record.email.toLowerCase();
  if (record.website && !/^https?:\/\//i.test(record.website)) {
    record.website = `https://${record.website}`;
  }
  if (record.postcode) {
    record.postcode = record.postcode.toUpperCase().replace(/\s+/g, " ");
  }

  return record;
}

export function normalizeRows(
  rows: string[][],
  mapping: ColumnMapping,
): NormalizedRecord[] {
  return rows.map((row) => normalizeRow(row, mapping));
}
