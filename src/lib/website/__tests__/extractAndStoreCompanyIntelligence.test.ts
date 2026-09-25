import { describe, expect, it, vi } from "vitest";
import { extractAndStoreCompanyIntelligence } from "@/lib/website/extractAndStoreCompanyIntelligence";
import type { ExtractionOutcome, PageForExtraction } from "@/lib/website/companyIntelligenceTypes";
import type { WebsiteEnrichmentRow } from "@/lib/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

const fakeSupabase = {} as SupabaseClient<Database>;

function pages(): PageForExtraction[] {
  return [{ pageUrl: "https://acme.nl/", pageType: "homepage", cleanedText: "Wij maken machines." }];
}

function makeRow(overrides: Partial<WebsiteEnrichmentRow> = {}): WebsiteEnrichmentRow {
  return {
    id: "we-1",
    import_row_id: "row-1",
    user_id: "user-1",
    website_url: "https://acme.nl/",
    website_status: "accessible",
    website_checked_at: "2026-01-01T00:00:00.000Z",
    error_message: null,
    cleaned_text_per_page: [],
    combined_cleaned_text: "Wij maken machines.",
    company_description: null,
    products_services: [],
    industries_served: [],
    target_markets: [],
    business_model: null,
    operational_signals: [],
    company_locations: null,
    source_confidence: 1,
    extraction_status: "not_attempted",
    extraction_confidence: null,
    evidence: [],
    extracted_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function extractedOutcome(): ExtractionOutcome {
  return {
    status: "extracted",
    data: {
      companyDescription: "Machinebouwer.",
      productsServices: [],
      industriesServed: [],
      targetMarkets: [],
      businessModel: null,
      operationalSignals: [],
      locations: [],
      confidence: 0.6,
      evidence: [],
    },
  };
}

describe("extractAndStoreCompanyIntelligence", () => {
  it("slaat over zonder AI-aanroep als er geen bestaande website-rij is", async () => {
    const getExistingWebsiteEnrichment = vi.fn().mockResolvedValue(null);
    const extractCompanyIntelligence = vi.fn();
    const storeCompanyIntelligence = vi.fn();

    const result = await extractAndStoreCompanyIntelligence(
      fakeSupabase,
      { importRowId: "row-1", userId: "user-1", pages: pages() },
      { getExistingWebsiteEnrichment, extractCompanyIntelligence, storeCompanyIntelligence },
    );

    expect(result).toEqual({ outcome: "skipped" });
    expect(extractCompanyIntelligence).not.toHaveBeenCalled();
    expect(storeCompanyIntelligence).not.toHaveBeenCalled();
  });

  it("slaat over als de website niet bereikbaar was", async () => {
    const getExistingWebsiteEnrichment = vi.fn().mockResolvedValue(makeRow({ website_status: "timeout" }));
    const extractCompanyIntelligence = vi.fn();
    const storeCompanyIntelligence = vi.fn();

    const result = await extractAndStoreCompanyIntelligence(
      fakeSupabase,
      { importRowId: "row-1", userId: "user-1", pages: pages() },
      { getExistingWebsiteEnrichment, extractCompanyIntelligence, storeCompanyIntelligence },
    );

    expect(result).toEqual({ outcome: "skipped" });
    expect(extractCompanyIntelligence).not.toHaveBeenCalled();
  });

  it("slaat over als er geen pagina's zijn, ook al is de website bereikbaar", async () => {
    const getExistingWebsiteEnrichment = vi.fn().mockResolvedValue(makeRow());
    const extractCompanyIntelligence = vi.fn();

    const result = await extractAndStoreCompanyIntelligence(
      fakeSupabase,
      { importRowId: "row-1", userId: "user-1", pages: [] },
      { getExistingWebsiteEnrichment, extractCompanyIntelligence },
    );

    expect(result).toEqual({ outcome: "skipped" });
    expect(extractCompanyIntelligence).not.toHaveBeenCalled();
  });

  it("slaat een al geslaagde, nog actuele extractie over (kostenbeheersing)", async () => {
    const getExistingWebsiteEnrichment = vi.fn().mockResolvedValue(
      makeRow({ extraction_status: "extracted", extracted_at: "2026-01-01T00:05:00.000Z" }),
    );
    const extractCompanyIntelligence = vi.fn();

    const result = await extractAndStoreCompanyIntelligence(
      fakeSupabase,
      { importRowId: "row-1", userId: "user-1", pages: pages() },
      { getExistingWebsiteEnrichment, extractCompanyIntelligence },
    );

    expect(result).toEqual({ outcome: "skipped" });
    expect(extractCompanyIntelligence).not.toHaveBeenCalled();
  });

  it("extraheert en slaat op bij een eerste poging op een bereikbare website", async () => {
    const getExistingWebsiteEnrichment = vi.fn().mockResolvedValue(makeRow());
    const extractCompanyIntelligence = vi.fn().mockResolvedValue(extractedOutcome());
    const storeCompanyIntelligence = vi.fn().mockResolvedValue(undefined);

    const result = await extractAndStoreCompanyIntelligence(
      fakeSupabase,
      { importRowId: "row-1", userId: "user-1", pages: pages() },
      { getExistingWebsiteEnrichment, extractCompanyIntelligence, storeCompanyIntelligence },
    );

    expect(extractCompanyIntelligence).toHaveBeenCalledWith(pages());
    expect(storeCompanyIntelligence).toHaveBeenCalledWith(fakeSupabase, {
      importRowId: "row-1",
      userId: "user-1",
      outcome: extractedOutcome(),
    });
    expect(result).toEqual({ outcome: "extracted" });
  });

  it("geeft 'failed' met de foutmelding terug als de extractie mislukt, en slaat dat toch op", async () => {
    const getExistingWebsiteEnrichment = vi.fn().mockResolvedValue(makeRow());
    const failedOutcome: ExtractionOutcome = { status: "extraction_failed", errorMessage: "ongeldig antwoord" };
    const extractCompanyIntelligence = vi.fn().mockResolvedValue(failedOutcome);
    const storeCompanyIntelligence = vi.fn().mockResolvedValue(undefined);

    const result = await extractAndStoreCompanyIntelligence(
      fakeSupabase,
      { importRowId: "row-1", userId: "user-1", pages: pages() },
      { getExistingWebsiteEnrichment, extractCompanyIntelligence, storeCompanyIntelligence },
    );

    expect(storeCompanyIntelligence).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({ outcome: failedOutcome }),
    );
    expect(result).toEqual({ outcome: "failed", message: "ongeldig antwoord" });
  });
});
