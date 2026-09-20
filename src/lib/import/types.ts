/** De negen velden die de importmodule automatisch probeert te herkennen. */
export type TargetFieldId =
  | "bedrijfsnaam"
  | "kvk_nummer"
  | "website"
  | "postcode"
  | "plaats"
  | "contactpersoon"
  | "functie"
  | "telefoon"
  | "email";

export interface TargetFieldDefinition {
  id: TargetFieldId;
  label: string;
  description: string;
  required: boolean;
  synonyms: string[];
}

export type MappingSource = "deterministic" | "ai" | "manual" | "none";

/** Eén kolom zoals aangetroffen in het geüploade bestand. */
export interface DetectedColumn {
  /** Positie van de kolom in het bestand (0-based). */
  columnIndex: number;
  /** Originele kolomkop zoals die in het bestand staat. */
  header: string;
  /** Enkele voorbeeldwaarden uit de eerste rijen, voor herkenning en preview. */
  sampleValues: string[];
}

/** Voorgestelde of definitieve koppeling van kolommen naar doelvelden. */
export type ColumnMapping = Partial<Record<TargetFieldId, number>>;

export interface MappingSuggestion {
  columnIndex: number;
  header: string;
  field: TargetFieldId | null;
  source: MappingSource;
}

export interface ParsedFile {
  headers: string[];
  /** Alle datarijen (zonder header), elke rij even lang als `headers`. */
  rows: string[][];
}

export type NormalizedRecord = Record<TargetFieldId, string | null>;
