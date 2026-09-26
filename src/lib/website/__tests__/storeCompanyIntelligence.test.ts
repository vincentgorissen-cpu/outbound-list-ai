import { describe, expect, it, vi } from "vitest";
import {
  mapRowToCompanyIntelligenceData,
  shouldExtractCompanyIntelligence,
  storeCompanyIntelligence,
} from "@/lib/website/storeCompanyIntelligence";
import type { ExtractionOutcome } from "@/lib/website/companyIntelligenceTypes";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WebsiteEnrichmentRow } from "@/lib/types/database.types";

function buildSupabaseMock(updateResult: { error: { message: string } | null } = { error: null }) {
  const eq2 = vi.fn().mockResolvedValue(updateResult);
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const update = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ update });
  const supabase = { from } as unknown as SupabaseClient<Database>;
  return { supabase, from, update, eq1, eq2 };
}

function extractedOutcome(): ExtractionOutcome {
  return {
    status: "extracted",
    data: {
      companyDescription: "Machinebouwer.",
      productsServices: ["Verpakkingsmachines"],
      industriesServed: ["Voeding"],
      targetMarkets: ["Nederland"],
      businessModel: "B2B",
      operationalSignals: ["eigen productie"],
      locations: ["Utrecht"],
      confidence: 0.75,
      evidence: ["Pagina 1 (homepage): noemt eigen productie"],
    },
  };
}

describe("storeCompanyIntelligence", () => {
  it("slaat alle semantische velden plus extraction_status/confidence/evidence op bij een geslaagde extractie", async () => {
    const { supabase, from, update } = buildSupabaseMock();

    await storeCompanyIntelligence(supabase, { importRowId: "row-1", userId: "user-1", outcome: extractedOutcome() });

    expect(from).toHaveBeenCalledWith("website_enrichments");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        extraction_status: "extracted",
        company_description: "Machinebouwer.",
        products_services: ["Verpakkingsmachines"],
        industries_served: ["Voeding"],
        target_markets: ["Nederland"],
        business_model: "B2B",
        operational_signals: ["eigen productie"],
        company_locations: ["Utrecht"],
        extraction_confidence: 0.75,
        evidence: ["Pagina 1 (homepage): noemt eigen productie"],
      }),
    );
  });

  it("werkt alleen extraction_status/extracted_at bij en laat semantische velden ongemoeid bij een mislukte extractie", async () => {
    const { supabase, update } = buildSupabaseMock();

    await storeCompanyIntelligence(supabase, {
      importRowId: "row-1",
      userId: "user-1",
      outcome: { status: "extraction_failed", errorMessage: "kapot" },
    });

    const payload = update.mock.calls[0][0];
    expect(payload).toEqual({ extraction_status: "extraction_failed", extracted_at: expect.any(String) });
    expect(payload).not.toHaveProperty("company_description");
  });

  it("gooit een duidelijke fout als Supabase een fout teruggeeft", async () => {
    const { supabase } = buildSupabaseMock({ error: { message: "kaboom" } });

    await expect(
      storeCompanyIntelligence(supabase, { importRowId: "row-1", userId: "user-1", outcome: extractedOutcome() }),
    ).rejects.toThrow(/kaboom/);
  });
});

function makeRow(overrides: Partial<WebsiteEnrichmentRow> = {}): WebsiteEnrichmentRow {
  return {
    id: "we-1",
    import_row_id: "row-1",
    user_id: "user-1",
    website_url: "https://acme.nl/",
    website_status: "accessible",
    website_checked_at: "2026-01-10T00:00:00.000Z",
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
    extraction_status: "not_attempted",
    extraction_confidence: null,
    evidence: [],
    extracted_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mapRowToCompanyIntelligenceData", () => {
  it("geeft null als er nooit een geslaagde extractie is geweest", () => {
    expect(mapRowToCompanyIntelligenceData(makeRow({ extraction_status: "not_attempted" }))).toBeNull();
    expect(mapRowToCompanyIntelligenceData(makeRow({ extraction_status: "extraction_failed" }))).toBeNull();
  });

  it("leest een geslaagde extractie terug in de juiste vorm", () => {
    const row = makeRow({
      extraction_status: "extracted",
      company_description: "Machinebouwer.",
      products_services: ["Verpakkingsmachines"],
      industries_served: ["Voeding"],
      target_markets: ["Nederland"],
      business_model: "B2B",
      operational_signals: ["eigen productie"],
      company_locations: ["Utrecht"],
      extraction_confidence: 0.75,
      evidence: ["Pagina 1 (homepage): noemt eigen productie"],
    });

    expect(mapRowToCompanyIntelligenceData(row)).toEqual({
      companyDescription: "Machinebouwer.",
      productsServices: ["Verpakkingsmachines"],
      industriesServed: ["Voeding"],
      targetMarkets: ["Nederland"],
      businessModel: "B2B",
      operationalSignals: ["eigen productie"],
      locations: ["Utrecht"],
      confidence: 0.75,
      evidence: ["Pagina 1 (homepage): noemt eigen productie"],
    });
  });

  it("negeert defensief misvormde jsonb-waarden en valt terug op lege lijsten", () => {
    const row = makeRow({
      extraction_status: "extracted",
      products_services: "geen lijst" as unknown as WebsiteEnrichmentRow["products_services"],
      company_locations: null,
      extraction_confidence: null,
    });

    const result = mapRowToCompanyIntelligenceData(row);
    expect(result?.productsServices).toEqual([]);
    expect(result?.locations).toEqual([]);
    expect(result?.confidence).toBe(0);
  });
});

describe("shouldExtractCompanyIntelligence", () => {
  it("is false zonder bestaande rij", () => {
    expect(shouldExtractCompanyIntelligence(null)).toBe(false);
  });

  it("is false als de website niet bereikbaar was — niets om te extraheren", () => {
    expect(shouldExtractCompanyIntelligence(makeRow({ website_status: "timeout" }))).toBe(false);
  });

  it("is true bij een eerste, nog niet geprobeerde extractie", () => {
    expect(shouldExtractCompanyIntelligence(makeRow({ extraction_status: "not_attempted" }))).toBe(true);
  });

  it("is true na een eerdere mislukte extractie (mag opnieuw)", () => {
    expect(shouldExtractCompanyIntelligence(makeRow({ extraction_status: "extraction_failed" }))).toBe(true);
  });

  it("is false voor een al geslaagde, nog actuele extractie", () => {
    expect(
      shouldExtractCompanyIntelligence(
        makeRow({
          extraction_status: "extracted",
          website_checked_at: "2026-01-10T00:00:00.000Z",
          extracted_at: "2026-01-10T00:05:00.000Z",
        }),
      ),
    ).toBe(false);
  });

  it("is true als de website ná de laatste extractie opnieuw is gefetcht (nieuwe tekst)", () => {
    expect(
      shouldExtractCompanyIntelligence(
        makeRow({
          extraction_status: "extracted",
          website_checked_at: "2026-02-01T00:00:00.000Z",
          extracted_at: "2026-01-10T00:05:00.000Z",
        }),
      ),
    ).toBe(true);
  });
});
