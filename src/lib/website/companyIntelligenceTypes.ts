/** Eén pagina, in de vorm die de AI-extractie nodig heeft (los van hoe deze is opgeslagen). */
export interface PageForExtraction {
  pageUrl: string;
  pageType: string;
  cleanedText: string;
}

/**
 * Het gevalideerde resultaat van de AI-extractie — uitsluitend gebaseerd
 * op wat expliciet op de website staat. Een leeg/null veld betekent altijd
 * "niet duidelijk uit de website gebleken", nooit een gok.
 */
export interface CompanyIntelligenceData {
  companyDescription: string | null;
  productsServices: string[];
  industriesServed: string[];
  targetMarkets: string[];
  businessModel: string | null;
  operationalSignals: string[];
  locations: string[];
  /** 0.0-1.0: hoe zeker de AI zelf is van deze extractie. */
  confidence: number;
  /** Korte verwijzingen naar de pagina('s) waarop de conclusies zijn gebaseerd. */
  evidence: string[];
}

export type ExtractionOutcome =
  | { status: "extracted"; data: CompanyIntelligenceData }
  | { status: "extraction_failed"; errorMessage: string };
