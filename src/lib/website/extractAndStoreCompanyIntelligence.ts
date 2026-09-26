import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { extractCompanyIntelligence } from "./extractCompanyIntelligence";
import { getExistingWebsiteEnrichment } from "./storeWebsiteEnrichment";
import {
  mapRowToCompanyIntelligenceData,
  shouldExtractCompanyIntelligence,
  storeCompanyIntelligence,
} from "./storeCompanyIntelligence";
import type { CompanyIntelligenceData, PageForExtraction } from "./companyIntelligenceTypes";

export interface ExtractAndStoreCompanyIntelligenceParams {
  importRowId: string;
  userId: string;
  pages: PageForExtraction[];
}

export interface ExtractAndStoreCompanyIntelligenceDeps {
  extractCompanyIntelligence?: typeof extractCompanyIntelligence;
  getExistingWebsiteEnrichment?: typeof getExistingWebsiteEnrichment;
  storeCompanyIntelligence?: typeof storeCompanyIntelligence;
}

export type ExtractAndStoreOutcome =
  | { outcome: "skipped"; data: null }
  | { outcome: "reused"; data: CompanyIntelligenceData }
  | { outcome: "extracted"; data: CompanyIntelligenceData }
  | { outcome: "failed"; message: string; data: null };

/**
 * Orkestreert de AI-extractiestap: bepaalt (via
 * `shouldExtractCompanyIntelligence`) of extractie voor dit bedrijf zinvol
 * is, roept zo ja `extractCompanyIntelligence` aan en slaat het resultaat
 * op. Draait pas ná een geslaagde website-fetch (`enrichAndStoreWebsiteData`
 * moet de rij al hebben aangemaakt) en beïnvloedt de rest van de
 * verwerking nooit: een mislukte extractie levert `extraction_failed` op
 * in de database, maar blokkeert de ICP-scoring op basis van upload- en
 * ruwe websitegegevens niet.
 *
 * Geeft altijd de beste op dit moment beschikbare `data` terug — ook als
 * er dit keer niets nieuws is geëxtraheerd (`outcome: "reused"`, van een
 * eerdere geslaagde poging) — zodat de aanroeper (`processCompany.ts`)
 * die zonder extra databaseaanroep in de ICP-scoring kan meenemen.
 */
export async function extractAndStoreCompanyIntelligence(
  supabase: SupabaseClient<Database>,
  { importRowId, userId, pages }: ExtractAndStoreCompanyIntelligenceParams,
  deps: ExtractAndStoreCompanyIntelligenceDeps = {},
): Promise<ExtractAndStoreOutcome> {
  const doGetExisting = deps.getExistingWebsiteEnrichment ?? getExistingWebsiteEnrichment;
  const doExtract = deps.extractCompanyIntelligence ?? extractCompanyIntelligence;
  const doStore = deps.storeCompanyIntelligence ?? storeCompanyIntelligence;

  const existing = await doGetExisting(supabase, importRowId, userId);

  if (!shouldExtractCompanyIntelligence(existing)) {
    const reused = existing ? mapRowToCompanyIntelligenceData(existing) : null;
    return reused ? { outcome: "reused", data: reused } : { outcome: "skipped", data: null };
  }

  if (pages.length === 0) {
    return { outcome: "skipped", data: null };
  }

  const result = await doExtract(pages);
  await doStore(supabase, { importRowId, userId, outcome: result });

  return result.status === "extracted"
    ? { outcome: "extracted", data: result.data }
    : { outcome: "failed", message: result.errorMessage, data: null };
}
