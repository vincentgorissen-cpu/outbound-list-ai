import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WebsiteStatus } from "@/lib/types/database.types";
import { analyzeWebsite, type WebsiteIntelligenceDeps, type WebsiteIntelligenceResult } from "./websiteIntelligenceService";
import {
  getExistingWebsiteEnrichment,
  shouldRefetchWebsite,
  storeWebsiteEnrichment,
  type RefetchOptions,
} from "./storeWebsiteEnrichment";
import type { PageForExtraction } from "./companyIntelligenceTypes";

export interface EnrichAndStoreWebsiteParams {
  importRowId: string;
  userId: string;
  websiteUrl: string | null;
}

export interface EnrichAndStoreWebsiteDeps {
  analyzeWebsite?: typeof analyzeWebsite;
  getExistingWebsiteEnrichment?: typeof getExistingWebsiteEnrichment;
  storeWebsiteEnrichment?: typeof storeWebsiteEnrichment;
  websiteDeps?: WebsiteIntelligenceDeps;
  refetchOptions?: RefetchOptions;
}

export interface WebsiteEnrichmentForScoring {
  status: WebsiteStatus;
  combinedCleanedText: string | null;
  sourceConfidence: number;
  pages: PageForExtraction[];
}

/** Leest de opgeslagen `cleaned_text_per_page` (jsonb) defensief terug in de vorm die de AI-extractie verwacht. */
function mapStoredPages(value: unknown): PageForExtraction[] {
  if (!Array.isArray(value)) return [];
  const pages: PageForExtraction[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { page_url, page_type, cleaned_text } = item as Record<string, unknown>;
    if (typeof page_url === "string" && typeof page_type === "string" && typeof cleaned_text === "string") {
      pages.push({ pageUrl: page_url, pageType: page_type, cleanedText: cleaned_text });
    }
  }
  return pages;
}

/**
 * Haalt (indien nodig — zie `shouldRefetchWebsite`) website-informatie op
 * voor één bedrijf en slaat die op, of hergebruikt een verse eerdere
 * verrijking zonder opnieuw te fetchen.
 *
 * Alleen de externe website-aanroep zelf (`analyzeWebsite`) wordt
 * verondersteld onbetrouwbaar te zijn — een onverwachte fout daarin wordt
 * hier opgevangen en als websitestatus "failed" vastgelegd, zodat een
 * website die niet te bereiken is de rest van de verwerking van dit
 * bedrijf (met name de ICP-scoring op basis van upload-gegevens) nooit
 * blokkeert. Fouten bij het lezen/schrijven van de database worden bewust
 * NIET hier opgevangen: die zijn, net als bij de rest van de
 * verwerkingspijplijn, infrastructuurfouten die de aanroeper (via de
 * normale retry van mislukte rijen) opnieuw moet proberen.
 */
export async function enrichAndStoreWebsiteData(
  supabase: SupabaseClient<Database>,
  { importRowId, userId, websiteUrl }: EnrichAndStoreWebsiteParams,
  deps: EnrichAndStoreWebsiteDeps = {},
): Promise<WebsiteEnrichmentForScoring> {
  const doAnalyzeWebsite = deps.analyzeWebsite ?? analyzeWebsite;
  const doGetExisting = deps.getExistingWebsiteEnrichment ?? getExistingWebsiteEnrichment;
  const doStore = deps.storeWebsiteEnrichment ?? storeWebsiteEnrichment;

  const existing = await doGetExisting(supabase, importRowId, userId);

  if (!shouldRefetchWebsite(existing, deps.refetchOptions)) {
    return {
      status: existing!.website_status,
      combinedCleanedText: existing!.combined_cleaned_text,
      sourceConfidence: existing!.source_confidence ?? 0,
      pages: mapStoredPages(existing!.cleaned_text_per_page),
    };
  }

  let result: WebsiteIntelligenceResult;
  try {
    result = await doAnalyzeWebsite(websiteUrl, deps.websiteDeps);
  } catch (error) {
    result = {
      status: "failed",
      normalizedUrl: null,
      checkedAt: new Date().toISOString(),
      pages: [],
      combinedCleanedText: "",
      sourceConfidence: 0,
      errorMessage: error instanceof Error ? error.message : "Onbekende fout bij ophalen website.",
    };
  }

  await doStore(supabase, { importRowId, userId, result });

  return {
    status: result.status,
    combinedCleanedText: result.combinedCleanedText || null,
    sourceConfidence: result.sourceConfidence,
    pages: result.pages.map((page) => ({
      pageUrl: page.pageUrl,
      pageType: page.pageType,
      cleanedText: page.cleanedText,
    })),
  };
}
