import { classifyCompany } from "@/lib/classification/classifyCompany";
import type {
  IcpScoreRow,
  ImportRecordRow,
  KvkEnrichmentRow,
  KvkMatchRow,
  WebsiteEnrichmentRow,
} from "@/lib/types/database.types";
import type { CompanyPipelineStatus, CompanyResultRow } from "./types";

type ImportRowForResults = Pick<ImportRecordRow, "id" | "bedrijfsnaam" | "plaats" | "website">;

function isReviewRequired(match: KvkMatchRow | undefined): boolean {
  if (!match) return false;
  const openStatus = match.status === "review_required" || match.status === "no_reliable_match";
  return openStatus && match.resolution === null;
}

/**
 * Een geslaagde AI-score telt altijd als "compleet", ongeacht of die tot
 * stand kwam via de (oudere) KVK-verrijking of via website-informatie —
 * anders zou een bedrijf dat via de website-pijplijn is gescoord blijven
 * hangen op "controle_nodig" door een oude, nooit-opgeloste KVK-match die
 * na het uitschakelen van KVK toch niet meer relevant is.
 */
function deriveStatus(
  enrichment: KvkEnrichmentRow | undefined,
  match: KvkMatchRow | undefined,
  icp: IcpScoreRow | undefined,
  reviewRequired: boolean,
  website: WebsiteEnrichmentRow | undefined,
): CompanyPipelineStatus {
  if (icp?.status === "scored") return "compleet";
  if (icp?.status === "ai_processing_failed") return "icp_mislukt";
  if (reviewRequired) return "controle_nodig";
  if (!enrichment && match?.resolution === "rejected") return "afgewezen";
  if (enrichment || website?.website_status === "accessible") return "verrijkt";
  return "nieuw";
}

function joinStringArray(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.filter((item): item is string => typeof item === "string").join(", ") || null;
}

function firstReason(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  return typeof first === "string" && first.trim() !== "" ? first : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Voegt import_rows, kvk_enrichments, kvk_matches, website_enrichments en
 * icp_scores samen tot één rij per bedrijf voor het resultatenoverzicht.
 * Roept `classifyCompany` aan (bestaande, ongewijzigde rule engine) maar
 * wijzigt niets aan de brontabellen — dit is een puur leesbare weergave.
 */
export function buildCompanyResultRows(
  importRows: ImportRowForResults[],
  enrichments: KvkEnrichmentRow[],
  matches: KvkMatchRow[],
  icpScores: IcpScoreRow[],
  websiteEnrichments: WebsiteEnrichmentRow[] = [],
): CompanyResultRow[] {
  const enrichmentByRow = new Map(enrichments.map((e) => [e.import_row_id, e]));
  const matchByRow = new Map(matches.map((m) => [m.import_row_id, m]));
  const icpByRow = new Map(icpScores.map((s) => [s.import_row_id, s]));
  const websiteByRow = new Map(websiteEnrichments.map((w) => [w.import_row_id, w]));

  return importRows.map((row) => {
    const enrichment = enrichmentByRow.get(row.id);
    const match = matchByRow.get(row.id);
    const icp = icpByRow.get(row.id);
    const website = websiteByRow.get(row.id);
    const reviewRequired = isReviewRequired(match);

    return {
      importRowId: row.id,
      origineleBedrijfsnaam: row.bedrijfsnaam,
      officieleNaam: enrichment?.officiele_naam ?? null,
      kvkNummer: enrichment?.kvk_nummer ?? null,
      rechtsvorm: enrichment?.rechtsvorm ?? null,
      plaats: enrichment?.vestigingsplaats ?? row.plaats ?? null,
      sbiActiviteit: joinStringArray(enrichment?.sbi_omschrijvingen),
      sbiCode: joinStringArray(enrichment?.sbi_codes),
      aantalMedewerkers: enrichment?.aantal_werkzame_personen ?? null,
      website: enrichment?.website ?? row.website ?? null,
      kvkMatchConfidence: match?.confidence ?? null,
      kvkStatus: enrichment?.status ?? null,
      bedrijfsclassificatie: classifyCompany({
        rechtsvorm: enrichment?.rechtsvorm ?? null,
        status: enrichment?.status ?? null,
      }),
      icpScore: icp?.score ?? null,
      icpClassification: icp?.classification ?? null,
      belangrijksteReden: firstReason(icp?.reasons),
      icpReasons: stringArray(icp?.reasons),
      icpConfidence: icp?.confidence ?? null,
      kvkOpgehaaldOp: enrichment?.opgehaald_op ?? null,
      websiteStatus: website?.website_status ?? null,
      websiteCheckedAt: website?.website_checked_at ?? null,
      pagesAnalyzed: Array.isArray(website?.cleaned_text_per_page) ? website.cleaned_text_per_page.length : 0,
      companyDescription: website?.company_description ?? null,
      productsServices: stringArray(website?.products_services),
      industriesServed: stringArray(website?.industries_served),
      targetMarkets: stringArray(website?.target_markets),
      businessModel: website?.business_model ?? null,
      operationalSignals: stringArray(website?.operational_signals),
      websiteLocations: stringArray(website?.company_locations),
      dataCompleteness: icp?.data_completeness ?? null,
      dataSources: stringArray(icp?.data_sources),
      missingImportantData: stringArray(icp?.missing_important_data),
      keySalesSignals: stringArray(icp?.key_sales_signals),
      status: deriveStatus(enrichment, match, icp, reviewRequired, website),
      reviewRequired,
    };
  });
}
