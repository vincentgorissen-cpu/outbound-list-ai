import { describe, expect, it, vi } from "vitest";
import { processCompany, type ProcessCompanyImportRow } from "@/lib/processing/processCompany";
import { EMPTY_PREFILTER_CONFIG } from "@/lib/icp/prefilter/types";
import type { WebsiteEnrichmentForScoring } from "@/lib/website/enrichAndStoreWebsiteData";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

function importRow(overrides: Partial<ProcessCompanyImportRow> = {}): ProcessCompanyImportRow {
  return {
    id: "row-1",
    bedrijfsnaam: "Acme B.V.",
    kvk_nummer: null,
    postcode: "1234 AB",
    plaats: "Utrecht",
    website: "https://acme.nl",
    ...overrides,
  };
}

function websiteResult(overrides: Partial<WebsiteEnrichmentForScoring> = {}): WebsiteEnrichmentForScoring {
  return {
    status: "accessible",
    combinedCleanedText: "Wij maken machines.",
    sourceConfidence: 1,
    ...overrides,
  };
}

const fakeSupabase = {} as unknown as SupabaseClient<Database>;

const icpContext = { description: "Industriële automatisering", prefilterConfig: EMPTY_PREFILTER_CONFIG };

describe("processCompany", () => {
  it("faalt meteen zonder website-aanroepen als er geen bedrijfsnaam is", async () => {
    const enrichAndStoreWebsiteData = vi.fn();
    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow({ bedrijfsnaam: "  " }), userId: "user-1", icpContext },
      { enrichAndStoreWebsiteData },
    );
    expect(result).toEqual({ status: "failed", message: expect.stringContaining("bedrijfsnaam") });
    expect(enrichAndStoreWebsiteData).not.toHaveBeenCalled();
  });

  it("haalt website-informatie op en scoort daarna met AI", async () => {
    const enrichAndStoreWebsiteData = vi.fn().mockResolvedValue(websiteResult());
    const runIcpForCompany = vi.fn().mockResolvedValue({ outcome: "scored" });

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow(), userId: "user-1", icpContext },
      { enrichAndStoreWebsiteData, runIcpForCompany },
    );

    expect(enrichAndStoreWebsiteData).toHaveBeenCalledWith(fakeSupabase, {
      importRowId: "row-1",
      userId: "user-1",
      websiteUrl: "https://acme.nl",
    });
    expect(runIcpForCompany).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({
        userId: "user-1",
        icpProfileDescription: "Industriële automatisering",
        company: expect.objectContaining({
          importRowId: "row-1",
          officieleNaam: "Acme B.V.",
          plaats: "Utrecht",
          website: "https://acme.nl",
          bedrijfsomschrijving: "Wij maken machines.",
          status: null,
          rechtsvorm: null,
          sbiCodes: [],
          sbiOmschrijvingen: [],
          aantalWerkzamePersonen: null,
        }),
      }),
    );
    expect(result).toEqual({ status: "completed" });
  });

  it("scoort ook zonder website-URL, met bedrijfsomschrijving null", async () => {
    const enrichAndStoreWebsiteData = vi.fn().mockResolvedValue(websiteResult({ status: "no_url", combinedCleanedText: null, sourceConfidence: 0 }));
    const runIcpForCompany = vi.fn().mockResolvedValue({ outcome: "scored" });

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow({ website: null }), userId: "user-1", icpContext },
      { enrichAndStoreWebsiteData, runIcpForCompany },
    );

    expect(enrichAndStoreWebsiteData).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({ websiteUrl: null }),
    );
    expect(runIcpForCompany).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({
        company: expect.objectContaining({ bedrijfsomschrijving: null }),
      }),
    );
    expect(result).toEqual({ status: "completed" });
  });

  it("blijft 'completed' en scoort gewoon als de website niet bereikbaar is — een websitefout blokkeert nooit", async () => {
    const enrichAndStoreWebsiteData = vi.fn().mockResolvedValue(
      websiteResult({ status: "timeout", combinedCleanedText: null, sourceConfidence: 0 }),
    );
    const runIcpForCompany = vi.fn().mockResolvedValue({ outcome: "scored" });

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow(), userId: "user-1", icpContext },
      { enrichAndStoreWebsiteData, runIcpForCompany },
    );

    expect(runIcpForCompany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "completed" });
  });

  it("slaat ICP-scoring over als er nog geen ICP-profiel is ingesteld, maar haalt de website nog wel op", async () => {
    const enrichAndStoreWebsiteData = vi.fn().mockResolvedValue(websiteResult());
    const runIcpForCompany = vi.fn();

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow(), userId: "user-1", icpContext: null },
      { enrichAndStoreWebsiteData, runIcpForCompany },
    );

    expect(enrichAndStoreWebsiteData).toHaveBeenCalledTimes(1);
    expect(runIcpForCompany).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "completed" });
  });

  it("geeft failed terug (zonder te gooien) als de website-verrijking zelf een onverwachte fout gooit", async () => {
    const enrichAndStoreWebsiteData = vi.fn().mockRejectedValue(new Error("db down"));

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow(), userId: "user-1", icpContext },
      { enrichAndStoreWebsiteData },
    );

    expect(result).toEqual({ status: "failed", message: "db down" });
  });

  it("blijft 'completed' ook als de AI-aanroep binnen runIcpForCompany zelf mislukt", async () => {
    const enrichAndStoreWebsiteData = vi.fn().mockResolvedValue(websiteResult());
    const runIcpForCompany = vi.fn().mockResolvedValue({ outcome: "failed", message: "AI down" });

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow(), userId: "user-1", icpContext },
      { enrichAndStoreWebsiteData, runIcpForCompany },
    );

    expect(result).toEqual({ status: "completed" });
  });
});
