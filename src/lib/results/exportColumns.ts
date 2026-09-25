import { BEDRIJFSCLASSIFICATIE_LABEL, ICP_LABEL, WEBSITE_STATUS_LABEL } from "./labels";
import type { CompanyResultRow } from "./types";

function text(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatDutchDate(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "";
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

function formatConfidencePercentage(confidence: number | null): string {
  if (confidence === null || confidence === undefined) return "";
  return `${Math.round(confidence * 100)}%`;
}

export interface ExportColumn {
  header: string;
  getValue: (row: CompanyResultRow) => string;
}

/**
 * Kolommen voor de export, in de door de gebruiker gevraagde volgorde met
 * duidelijke, niet-technische Nederlandse kolomnamen. Verwijdert of
 * overschrijft nergens de originele uploadgegevens — dit leest alleen.
 */
export const EXPORT_COLUMNS: ExportColumn[] = [
  { header: "Originele bedrijfsnaam", getValue: (row) => text(row.origineleBedrijfsnaam) },
  { header: "Officiële KVK-bedrijfsnaam", getValue: (row) => text(row.officieleNaam) },
  { header: "KVK-nummer", getValue: (row) => text(row.kvkNummer) },
  { header: "Rechtsvorm", getValue: (row) => text(row.rechtsvorm) },
  { header: "SBI-code", getValue: (row) => text(row.sbiCode) },
  { header: "SBI-omschrijving", getValue: (row) => text(row.sbiActiviteit) },
  { header: "Aantal medewerkers", getValue: (row) => text(row.aantalMedewerkers) },
  { header: "Website", getValue: (row) => text(row.website) },
  { header: "Plaats", getValue: (row) => text(row.plaats) },
  {
    header: "Bedrijfsclassificatie",
    getValue: (row) => BEDRIJFSCLASSIFICATIE_LABEL[row.bedrijfsclassificatie],
  },
  { header: "KVK-matchbetrouwbaarheid", getValue: (row) => text(row.kvkMatchConfidence) },
  {
    header: "Websitestatus",
    getValue: (row) => (row.websiteStatus ? WEBSITE_STATUS_LABEL[row.websiteStatus] : ""),
  },
  { header: "ICP-score", getValue: (row) => text(row.icpScore) },
  {
    header: "ICP-classificatie",
    getValue: (row) => (row.icpClassification ? ICP_LABEL[row.icpClassification] : ""),
  },
  { header: "ICP-redenen", getValue: (row) => row.icpReasons.join("; ") },
  { header: "AI-betrouwbaarheid", getValue: (row) => formatConfidencePercentage(row.icpConfidence) },
  { header: "Laatste KVK-controle", getValue: (row) => formatDutchDate(row.kvkOpgehaaldOp) },
];
