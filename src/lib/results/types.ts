import type { CompanyClassification } from "@/lib/classification/types";
import type { IcpClassification, KvkEnrichmentStatus } from "@/lib/types/database.types";

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
  aantalMedewerkers: number | null;
  /** Confidence van de KVK-match (0-100); null als het kvk-nummer direct was aangeleverd (geen matching nodig). */
  kvkMatchConfidence: number | null;
  kvkStatus: KvkEnrichmentStatus | null;
  bedrijfsclassificatie: CompanyClassification;
  icpScore: number | null;
  icpClassification: IcpClassification | null;
  /** Eerste item uit de door de AI teruggegeven redenen; leeg als er nog geen score is. */
  belangrijksteReden: string | null;
  status: CompanyPipelineStatus;
  /** True zolang een review_required/no_reliable_match-match nog niet is opgelost. */
  reviewRequired: boolean;
}
