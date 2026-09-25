import { describe, expect, it, vi } from "vitest";
import { enrichAndStoreWebsiteData } from "@/lib/website/enrichAndStoreWebsiteData";
import type { WebsiteIntelligenceResult } from "@/lib/website/websiteIntelligenceService";
import type { WebsiteEnrichmentRow } from "@/lib/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

function makeRow(overrides: Partial<WebsiteEnrichmentRow> = {}): WebsiteEnrichmentRow {
  return {
    id: "we-1",
    import_row_id: "row-1",
    user_id: "user-1",
    website_url: "https://bedrijf.nl/",
    website_status: "accessible",
    website_checked_at: new Date().toISOString(),
    error_message: null,
    cleaned_text_per_page: [],
    combined_cleaned_text: "bestaande tekst",
    company_description: null,
    products_services: [],
    industries_served: [],
    target_markets: [],
    business_model: null,
    operational_signals: [],
    company_locations: null,
    source_confidence: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function analyzeResult(overrides: Partial<WebsiteIntelligenceResult> = {}): WebsiteIntelligenceResult {
  return {
    status: "accessible",
    normalizedUrl: "https://bedrijf.nl/",
    checkedAt: "2026-01-01T00:00:00.000Z",
    pages: [],
    combinedCleanedText: "Wij maken machines.",
    sourceConfidence: 0.5,
    errorMessage: null,
    ...overrides,
  };
}

const fakeSupabase = {} as SupabaseClient<Database>;

describe("enrichAndStoreWebsiteData", () => {
  it("hergebruikt een verse bestaande verrijking zonder opnieuw te fetchen", async () => {
    const existing = makeRow();
    const getExistingWebsiteEnrichment = vi.fn().mockResolvedValue(existing);
    const analyzeWebsite = vi.fn();
    const storeWebsiteEnrichment = vi.fn();

    const result = await enrichAndStoreWebsiteData(
      fakeSupabase,
      { importRowId: "row-1", userId: "user-1", websiteUrl: "https://bedrijf.nl" },
      { getExistingWebsiteEnrichment, analyzeWebsite, storeWebsiteEnrichment },
    );

    expect(analyzeWebsite).not.toHaveBeenCalled();
    expect(storeWebsiteEnrichment).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "accessible",
      combinedCleanedText: "bestaande tekst",
      sourceConfidence: 1,
    });
  });

  it("haalt opnieuw op en slaat op wanneer er nog geen (verse) verrijking bestaat", async () => {
    const getExistingWebsiteEnrichment = vi.fn().mockResolvedValue(null);
    const analyzeWebsite = vi.fn().mockResolvedValue(analyzeResult());
    const storeWebsiteEnrichment = vi.fn().mockResolvedValue(undefined);

    const result = await enrichAndStoreWebsiteData(
      fakeSupabase,
      { importRowId: "row-1", userId: "user-1", websiteUrl: "https://bedrijf.nl" },
      { getExistingWebsiteEnrichment, analyzeWebsite, storeWebsiteEnrichment },
    );

    expect(analyzeWebsite).toHaveBeenCalledWith("https://bedrijf.nl", undefined);
    expect(storeWebsiteEnrichment).toHaveBeenCalledWith(fakeSupabase, {
      importRowId: "row-1",
      userId: "user-1",
      result: analyzeResult(),
    });
    expect(result).toEqual({
      status: "accessible",
      combinedCleanedText: "Wij maken machines.",
      sourceConfidence: 0.5,
    });
  });

  it("zet een lege combinedCleanedText om naar null", async () => {
    const getExistingWebsiteEnrichment = vi.fn().mockResolvedValue(null);
    const analyzeWebsite = vi.fn().mockResolvedValue(analyzeResult({ status: "no_url", combinedCleanedText: "" }));
    const storeWebsiteEnrichment = vi.fn().mockResolvedValue(undefined);

    const result = await enrichAndStoreWebsiteData(
      fakeSupabase,
      { importRowId: "row-1", userId: "user-1", websiteUrl: null },
      { getExistingWebsiteEnrichment, analyzeWebsite, storeWebsiteEnrichment },
    );

    expect(result.combinedCleanedText).toBeNull();
  });

  it("vangt een onverwachte fout in analyzeWebsite op als websitestatus 'failed', in plaats van door te gooien", async () => {
    const getExistingWebsiteEnrichment = vi.fn().mockResolvedValue(null);
    const analyzeWebsite = vi.fn().mockRejectedValue(new Error("netwerk kapot"));
    const storeWebsiteEnrichment = vi.fn().mockResolvedValue(undefined);

    const result = await enrichAndStoreWebsiteData(
      fakeSupabase,
      { importRowId: "row-1", userId: "user-1", websiteUrl: "https://bedrijf.nl" },
      { getExistingWebsiteEnrichment, analyzeWebsite, storeWebsiteEnrichment },
    );

    expect(result.status).toBe("failed");
    expect(result.combinedCleanedText).toBeNull();
    expect(storeWebsiteEnrichment).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({ result: expect.objectContaining({ status: "failed" }) }),
    );
  });

  it("laat een databasefout bij het ophalen van de bestaande verrijking wél doorgooien", async () => {
    const getExistingWebsiteEnrichment = vi.fn().mockRejectedValue(new Error("db kapot"));

    await expect(
      enrichAndStoreWebsiteData(
        fakeSupabase,
        { importRowId: "row-1", userId: "user-1", websiteUrl: "https://bedrijf.nl" },
        { getExistingWebsiteEnrichment },
      ),
    ).rejects.toThrow(/db kapot/);
  });

  it("laat een databasefout bij het opslaan wél doorgooien", async () => {
    const getExistingWebsiteEnrichment = vi.fn().mockResolvedValue(null);
    const analyzeWebsite = vi.fn().mockResolvedValue(analyzeResult());
    const storeWebsiteEnrichment = vi.fn().mockRejectedValue(new Error("opslaan mislukt"));

    await expect(
      enrichAndStoreWebsiteData(
        fakeSupabase,
        { importRowId: "row-1", userId: "user-1", websiteUrl: "https://bedrijf.nl" },
        { getExistingWebsiteEnrichment, analyzeWebsite, storeWebsiteEnrichment },
      ),
    ).rejects.toThrow(/opslaan mislukt/);
  });
});
