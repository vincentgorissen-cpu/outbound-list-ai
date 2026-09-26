export type IcpClassification = "high_fit" | "medium_fit" | "low_fit" | "insufficient_data";

/** Waar de gegevens van een bedrijf vandaan kwamen op het moment van scoren. */
export type IcpDataSource = "upload" | "website";

/** Het exacte antwoordschema dat het AI-model moet teruggeven. */
export interface IcpScoreResult {
  score: number;
  classification: IcpClassification;
  reasons: string[];
  concerns: string[];
  confidence: number;
  /** Concreet benoemde, voor dít ICP-profiel relevante ontbrekende informatie — nooit zelf ingevuld/gegokt. */
  missingImportantData: string[];
  /** Concrete, voor sales bruikbare signalen uit de beschikbare data (bv. "eigen productie", "internationale klanten"). */
  keySalesSignals: string[];
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
  /** Vrije-tekst bedrijfsomschrijving — fallback wanneer er geen gestructureerde website-extractie beschikbaar is (bv. extractie mislukt). */
  bedrijfsomschrijving?: string | null;
  /** Hieronder: gestructureerde website intelligence (zie `WebsiteIntelligenceService`/`extractCompanyIntelligence`), indien beschikbaar. */
  productsServices?: string[];
  industriesServed?: string[];
  targetMarkets?: string[];
  businessModel?: string | null;
  operationalSignals?: string[];
  websiteLocations?: string[];
}
