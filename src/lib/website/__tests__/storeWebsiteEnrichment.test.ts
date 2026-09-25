import { describe, expect, it, vi } from "vitest";
import {
  getExistingWebsiteEnrichment,
  shouldRefetchWebsite,
  storeWebsiteEnrichment,
} from "@/lib/website/storeWebsiteEnrichment";
import type { WebsiteIntelligenceResult } from "@/lib/website/websiteIntelligenceService";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WebsiteEnrichmentRow } from "@/lib/types/database.types";

function buildSupabaseMock(upsertResult: { error: { message: string } | null } = { error: null }) {
  const upsert = vi.fn().mockResolvedValue(upsertResult);
  const from = vi.fn().mockReturnValue({ upsert });
  const supabase = { from } as unknown as SupabaseClient<Database>;
  return { supabase, from, upsert };
}

function result(overrides: Partial<WebsiteIntelligenceResult> = {}): WebsiteIntelligenceResult {
  return {
    status: "accessible",
    normalizedUrl: "https://bedrijf.nl/",
    checkedAt: "2026-01-01T00:00:00.000Z",
    pages: [
      {
        pageUrl: "https://bedrijf.nl/",
        pageType: "homepage",
        cleanedText: "Wij maken machines.",
        characterCount: 20,
        extractedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        pageUrl: "https://bedrijf.nl/over-ons",
        pageType: "about",
        cleanedText: "Opgericht in 2001.",
        characterCount: 19,
        extractedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    combinedCleanedText: "Wij maken machines.\nOpgericht in 2001.",
    sourceConfidence: 0.67,
    errorMessage: null,
    ...overrides,
  };
}

describe("storeWebsiteEnrichment", () => {
  it("slaat de fetch-gerelateerde velden op, zonder de semantische AI-velden aan te raken", async () => {
    const { supabase, from, upsert } = buildSupabaseMock();

    await storeWebsiteEnrichment(supabase, { importRowId: "row-1", userId: "user-1", result: result() });

    expect(from).toHaveBeenCalledWith("website_enrichments");
    const [payload, options] = upsert.mock.calls[0];
    expect(payload).toMatchObject({
      import_row_id: "row-1",
      user_id: "user-1",
      website_url: "https://bedrijf.nl/",
      website_status: "accessible",
      cleaned_text_per_page: [
        {
          page_url: "https://bedrijf.nl/",
          page_type: "homepage",
          cleaned_text: "Wij maken machines.",
          character_count: 20,
          extracted_at: "2026-01-01T00:00:00.000Z",
        },
        {
          page_url: "https://bedrijf.nl/over-ons",
          page_type: "about",
          cleaned_text: "Opgericht in 2001.",
          character_count: 19,
          extracted_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      combined_cleaned_text: "Wij maken machines.\nOpgericht in 2001.",
      source_confidence: 0.67,
    });
    expect(payload).not.toHaveProperty("company_description");
    expect(payload).not.toHaveProperty("products_services");
    expect(options).toEqual({ onConflict: "import_row_id" });
  });

  it("slaat lege combinedCleanedText op als null in plaats van een lege string", async () => {
    const { upsert, supabase } = buildSupabaseMock();
    await storeWebsiteEnrichment(supabase, {
      importRowId: "row-1",
      userId: "user-1",
      result: result({ status: "no_url", normalizedUrl: null, combinedCleanedText: "", pages: [] }),
    });
    expect(upsert.mock.calls[0][0].combined_cleaned_text).toBeNull();
    expect(upsert.mock.calls[0][0].cleaned_text_per_page).toEqual([]);
  });

  it("gooit een duidelijke fout als Supabase een fout teruggeeft", async () => {
    const { supabase } = buildSupabaseMock({ error: { message: "kaboom" } });
    await expect(
      storeWebsiteEnrichment(supabase, { importRowId: "row-1", userId: "user-1", result: result() }),
    ).rejects.toThrow(/kaboom/);
  });
});

function buildSelectMock(data: WebsiteEnrichmentRow | null, error: { message: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq2 = vi.fn().mockReturnValue({ maybeSingle });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  const supabase = { from } as unknown as SupabaseClient<Database>;
  return { supabase };
}

describe("getExistingWebsiteEnrichment", () => {
  it("geeft de bestaande rij terug", async () => {
    const row = { id: "we-1" } as WebsiteEnrichmentRow;
    const { supabase } = buildSelectMock(row);
    const result = await getExistingWebsiteEnrichment(supabase, "row-1", "user-1");
    expect(result).toBe(row);
  });

  it("gooit een fout bij een Supabase-fout", async () => {
    const { supabase } = buildSelectMock(null, { message: "kaboom" });
    await expect(getExistingWebsiteEnrichment(supabase, "row-1", "user-1")).rejects.toThrow(/kaboom/);
  });
});

function makeRow(overrides: Partial<WebsiteEnrichmentRow>): WebsiteEnrichmentRow {
  return {
    id: "we-1",
    import_row_id: "row-1",
    user_id: "user-1",
    website_url: "https://bedrijf.nl/",
    website_status: "accessible",
    website_checked_at: new Date().toISOString(),
    error_message: null,
    cleaned_text_per_page: [],
    combined_cleaned_text: "tekst",
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

describe("shouldRefetchWebsite", () => {
  it("is true als er nog geen bestaande rij is", () => {
    expect(shouldRefetchWebsite(null)).toBe(true);
  });

  it("is true bij forceRefresh, ongeacht de rest", () => {
    expect(shouldRefetchWebsite(makeRow({}), { forceRefresh: true })).toBe(true);
  });

  it("is true als de rij nooit is gecontroleerd (nog steeds pending)", () => {
    expect(shouldRefetchWebsite(makeRow({ website_status: "pending", website_checked_at: null }))).toBe(true);
  });

  it("is false voor een recent gecontroleerde, verse rij", () => {
    expect(shouldRefetchWebsite(makeRow({ website_checked_at: new Date().toISOString() }))).toBe(false);
  });

  it("is true als de rij ouder is dan de versheidstermijn", () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldRefetchWebsite(makeRow({ website_checked_at: old }), { freshnessDays: 30 })).toBe(true);
  });

  it("respecteert een aangepaste versheidstermijn", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldRefetchWebsite(makeRow({ website_checked_at: fiveDaysAgo }), { freshnessDays: 1 })).toBe(true);
    expect(shouldRefetchWebsite(makeRow({ website_checked_at: fiveDaysAgo }), { freshnessDays: 10 })).toBe(false);
  });
});
