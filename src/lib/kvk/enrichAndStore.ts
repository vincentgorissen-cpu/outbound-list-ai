import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import {
  enrichCompanyFromKvk,
  type GetBasisprofielFn,
  type GetVestigingsprofielFn,
} from "./enrichCompany";
import { storeKvkEnrichment } from "./storeEnrichment";
import type { KvkEnrichment } from "./types";

export interface EnrichAndStoreParams {
  kvkNummer: string;
  importRowId: string;
  userId: string;
}

export interface EnrichAndStoreDeps {
  getBasisprofiel?: GetBasisprofielFn;
  getVestigingsprofiel?: GetVestigingsprofielFn;
}

/**
 * Haalt de KVK-gegevens op voor een bekend kvk-nummer en slaat ze meteen
 * op — de combinatie die zowel de KVK-review-actie (na een handmatige
 * bevestiging) als de verwerkingsworkflow nodig hebben. Geeft `null`
 * terug (zonder te schrijven) als er geen basisprofiel bestaat voor dit
 * nummer.
 */
export async function enrichAndStoreKvkData(
  supabase: SupabaseClient<Database>,
  { kvkNummer, importRowId, userId }: EnrichAndStoreParams,
  deps: EnrichAndStoreDeps = {},
): Promise<KvkEnrichment | null> {
  const enrichment = await enrichCompanyFromKvk(kvkNummer, deps);
  if (enrichment) {
    await storeKvkEnrichment(supabase, { importRowId, userId, enrichment });
  }
  return enrichment;
}
