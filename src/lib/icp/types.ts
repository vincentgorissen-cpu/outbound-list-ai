export type IcpClassification = "high_fit" | "medium_fit" | "low_fit";

/** Het exacte antwoordschema dat het AI-model moet teruggeven. */
export interface IcpScoreResult {
  score: number;
  classification: IcpClassification;
  reasons: string[];
  concerns: string[];
  confidence: number;
}

/**
 * Alleen de bedrijfsgegevens die daadwerkelijk naar het AI-model gaan —
 * bewust geen contactpersoon, telefoon, e-mail of kvk-nummer.
 */
export interface CompanyForScoring {
  bedrijfsnaam: string;
  sbiOmschrijvingen: string[];
  aantalWerkzamePersonen: number | null;
  plaats: string | null;
  website: string | null;
  /** Nog geen databron voor beschikbaar; blijft voorlopig altijd leeg. */
  bedrijfsomschrijving?: string | null;
}
