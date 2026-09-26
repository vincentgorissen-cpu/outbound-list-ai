import type { CompanyClassification } from "@/lib/classification/types";
import type { IcpClassification, KvkEnrichmentStatus, WebsiteStatus } from "@/lib/types/database.types";

/**
 * Samengevatte pijplijnstatus per bedrijf, afgeleid uit de aanwezige
 * (of ontbrekende) KVK-verrijking, KVK-match en ICP-score. Puur een
 * leesbaar label voor het overzicht — verandert niets aan de
 * onderliggende tabellen.
 */
export type CompanyPipelineStatus =
  | "nieuw"
  | "controle_nodig"
  | "afgewezen"
  | "icp_mislukt"
  | "verrijkt"
  | "compleet";

/** Eén rij in het resultatenoverzicht: alle brontabellen samengevoegd per bedrijf. */
export interface CompanyResultRow {
  importRowId: string;
  origineleBedrijfsnaam: string | null;
  officieleNaam: string | null;
  kvkNummer: string | null;
  rechtsvorm: string | null;
  /** Vestigingsplaats uit de KVK-verrijking; anders de oorspronkelijk geïmporteerde plaats. */
  plaats: string | null;
  sbiActiviteit: string | null;
  /** Ruwe SBI-code(s), los van de leesbare omschrijving. */
  sbiCode: string | null;
  aantalMedewerkers: number | null;
  /** Website uit de KVK-verrijking; anders de oorspronkelijk geïmporteerde website. */
  website: string | null;
  /** Confidence van de KVK-match (0-100); null als het kvk-nummer direct was aangeleverd (geen matching nodig). */
  kvkMatchConfidence: number | null;
  kvkStatus: KvkEnrichmentStatus | null;
  bedrijfsclassificatie: CompanyClassification;
  icpScore: number | null;
  icpClassification: IcpClassification | null;
  /** Eerste item uit de door de AI teruggegeven redenen; leeg als er nog geen score is. */
  belangrijksteReden: string | null;
  /** Alle door de AI teruggegeven redenen (volledige lijst, voor export). */
  icpReasons: string[];
  /** Betrouwbaarheid die de AI zelf aan de ICP-score toekent (0.0-1.0). */
  icpConfidence: number | null;
  /** Tijdstip waarop de KVK-gegevens voor het laatst zijn opgehaald. */
  kvkOpgehaaldOp: string | null;
  /** Resultaat van de laatste websitecontrole (`WebsiteIntelligenceService`); null als er nog geen poging is gedaan. */
  websiteStatus: WebsiteStatus | null;
  /** Tijdstip van de laatste websitecontrole; null als er nog geen poging is gedaan. */
  websiteCheckedAt: string | null;
  /** Aantal pagina's dat daadwerkelijk is opgehaald en opgeschoond bij de laatste websitecontrole. */
  pagesAnalyzed: number;
  /** Korte, door AI geëxtraheerde bedrijfsomschrijving op basis van de website — null zonder (geslaagde) extractie. */
  companyDescription: string | null;
  productsServices: string[];
  industriesServed: string[];
  targetMarkets: string[];
  businessModel: string | null;
  operationalSignals: string[];
  /** Vestigingsplaatsen/locaties zoals genoemd op de website (los van de upload-/KVK-`plaats`). */
  websiteLocations: string[];
  /** 0.0-1.0: hoeveel van de voor ICP-scoring relevante datapunten daadwerkelijk bekend waren (zie `computeDataCompleteness`). Null zonder score. */
  dataCompleteness: number | null;
  /** Welke databronnen daadwerkelijk zijn gebruikt bij het scoren van dit bedrijf. */
  dataSources: string[];
  /** Voor dit ICP-profiel relevante, maar ontbrekende informatie — door de AI benoemd, nooit zelf ingevuld. */
  missingImportantData: string[];
  /** Concrete, voor sales bruikbare signalen uit de beschikbare data. */
  keySalesSignals: string[];
  status: CompanyPipelineStatus;
  /** True zolang een review_required/no_reliable_match-match nog niet is opgelost. */
  reviewRequired: boolean;
}
