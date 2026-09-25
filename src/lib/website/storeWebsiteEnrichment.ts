import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, WebsiteEnrichmentRow } from "@/lib/types/database.types";
import type { WebsiteIntelligenceResult } from "./websiteIntelligenceService";

/** Hoe lang een geslaagde of mislukte controle als "vers genoeg" geldt voordat een nieuwe poging zin heeft. */
const DEFAULT_FRESHNESS_DAYS = 30;

export interface StoreWebsiteEnrichmentParams {
  importRowId: string;
  userId: string;
  result: WebsiteIntelligenceResult;
}

/**
 * Slaat het resultaat van `analyzeWebsite` op in `website_enrichments`,
 * los van `kvk_enrichments` (onafhankelijke bron, zie architectuurplan).
 * Zet bewust alleen de fetch-gerelateerde kolommen — de semantische
 * velden (company_description, products_services, ...) blijven
 * ongemoeid zodat een latere AI-extractiestap die apart kan vullen
 * zonder dat een herhaalde website-fetch ze overschrijft.
 */
export async function storeWebsiteEnrichment(
  supabase: SupabaseClient<Database>,
  { importRowId, userId, result }: StoreWebsiteEnrichmentParams,
): Promise<void> {
  const { error } = await supabase.from("website_enrichments").upsert(
    {
      import_row_id: importRowId,
      user_id: userId,
      website_url: result.normalizedUrl,
      website_status: result.status,
      website_checked_at: result.checkedAt,
      error_message: result.errorMessage,
      extracted_page_urls: result.fetchedPageUrls as unknown as Json,
      raw_extracted_text: result.rawExtractedText || null,
      source_confidence: result.sourceConfidence,
    },
    { onConflict: "import_row_id" },
  );

  if (error) {
    throw new Error(`Kon website-verrijking niet opslaan: ${error.message}`);
  }
}

export async function getExistingWebsiteEnrichment(
  supabase: SupabaseClient<Database>,
  importRowId: string,
  userId: string,
): Promise<WebsiteEnrichmentRow | null> {
  const { data, error } = await supabase
    .from("website_enrichments")
    .select("*")
    .eq("import_row_id", importRowId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Kon bestaande website-verrijking niet ophalen: ${error.message}`);
  }
  return data;
}

export interface RefetchOptions {
  forceRefresh?: boolean;
  freshnessDays?: number;
}

/**
 * Bepaalt of een website opnieuw opgehaald moet worden: nooit eerder
 * geprobeerd, nog steeds op 'pending' blijven staan, ouder dan de
 * versheidstermijn, of expliciet geforceerd. Voorkomt dat dezelfde
 * website onnodig herhaaldelijk wordt bezocht.
 */
export function shouldRefetchWebsite(
  existing: WebsiteEnrichmentRow | null,
  options: RefetchOptions = {},
): boolean {
  if (options.forceRefresh) return true;
  if (!existing) return true;
  if (!existing.website_checked_at) return true;
  if (existing.website_status === "pending") return true;

  const freshnessDays = options.freshnessDays ?? DEFAULT_FRESHNESS_DAYS;
  const ageMs = Date.now() - new Date(existing.website_checked_at).getTime();
  const freshnessMs = freshnessDays * 24 * 60 * 60 * 1000;
  return ageMs > freshnessMs;
}
