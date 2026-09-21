import { describe, expect, it, vi } from "vitest";
import { processCompany, type ProcessCompanyImportRow } from "@/lib/processing/processCompany";
import { KvkApiError } from "@/lib/kvk/client";
import { EMPTY_PREFILTER_CONFIG } from "@/lib/icp/prefilter/types";
import type { KvkEnrichment, KvkMatchResult } from "@/lib/kvk/types";
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

function enrichment(overrides: Partial<KvkEnrichment> = {}): KvkEnrichment {
  return {
    kvkNummer: "68750110",
    officieleNaam: "Acme B.V.",
    handelsnamen: [],
    rechtsvorm: "Besloten vennootschap",
    status: "actief",
    sbiCodes: ["2830"],
    sbiOmschrijvingen: ["Machinebouw"],
    aantalWerkzamePersonen: 50,
    vestigingsplaats: "Utrecht",
    website: "https://acme.nl",
    opgehaaldOp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function highConfidenceMatch(overrides: Partial<KvkMatchResult> = {}): KvkMatchResult {
  return {
    status: "high_confidence",
    chosenKvkNummer: "68750110",
    confidence: 95,
    candidates: [],
    gecontroleerdOp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const fakeSupabase = {} as unknown as SupabaseClient<Database>;

const icpContext = { description: "Industriële automatisering", prefilterConfig: EMPTY_PREFILTER_CONFIG };

describe("processCompany", () => {
  it("faalt meteen zonder KVK-aanroepen als er geen bedrijfsnaam is", async () => {
    const matchCompany = vi.fn();
    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow({ bedrijfsnaam: "  " }), userId: "user-1", icpContext },
      { matchCompany },
    );
    expect(result).toEqual({ status: "failed", message: expect.stringContaining("bedrijfsnaam") });
    expect(matchCompany).not.toHaveBeenCalled();
  });

  it("slaat matching over wanneer er al een kvk-nummer bekend is, en verrijkt/classificeert/scoort", async () => {
    const matchCompany = vi.fn();
    const storeKvkMatch = vi.fn();
    const enrichAndStoreKvkData = vi.fn().mockResolvedValue(enrichment());
    const runIcpForCompany = vi.fn().mockResolvedValue({ outcome: "scored" });

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow({ kvk_nummer: "68750110" }), userId: "user-1", icpContext },
      { matchCompany, storeKvkMatch, enrichAndStoreKvkData, runIcpForCompany },
    );

    expect(matchCompany).not.toHaveBeenCalled();
    expect(storeKvkMatch).not.toHaveBeenCalled();
    expect(enrichAndStoreKvkData).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({ kvkNummer: "68750110", importRowId: "row-1", userId: "user-1" }),
    );
    expect(runIcpForCompany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "completed" });
  });

  it("matcht, slaat de match op en verrijkt met het gekozen nummer bij een high_confidence match", async () => {
    const match = highConfidenceMatch();
    const matchCompany = vi.fn().mockResolvedValue(match);
    const storeKvkMatch = vi.fn().mockResolvedValue(undefined);
    const enrichAndStoreKvkData = vi.fn().mockResolvedValue(enrichment());
    const runIcpForCompany = vi.fn().mockResolvedValue({ outcome: "scored" });

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow(), userId: "user-1", icpContext },
      { matchCompany, storeKvkMatch, enrichAndStoreKvkData, runIcpForCompany },
    );

    expect(matchCompany).toHaveBeenCalledWith({
      bedrijfsnaam: "Acme B.V.",
      postcode: "1234 AB",
      plaats: "Utrecht",
      website: "https://acme.nl",
    });
    expect(storeKvkMatch).toHaveBeenCalledWith(fakeSupabase, {
      importRowId: "row-1",
      userId: "user-1",
      match,
    });
    expect(enrichAndStoreKvkData).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({ kvkNummer: "68750110" }),
    );
    expect(result).toEqual({ status: "completed" });
  });

  it("geeft review_required terug (zonder verrijking/scoring) bij een review_required-match", async () => {
    const matchCompany = vi.fn().mockResolvedValue(highConfidenceMatch({ status: "review_required" }));
    const storeKvkMatch = vi.fn().mockResolvedValue(undefined);
    const enrichAndStoreKvkData = vi.fn();
    const runIcpForCompany = vi.fn();

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow(), userId: "user-1", icpContext },
      { matchCompany, storeKvkMatch, enrichAndStoreKvkData, runIcpForCompany },
    );

    expect(result).toEqual({ status: "review_required" });
    expect(enrichAndStoreKvkData).not.toHaveBeenCalled();
    expect(runIcpForCompany).not.toHaveBeenCalled();
  });

  it("geeft review_required terug bij no_reliable_match", async () => {
    const matchCompany = vi.fn().mockResolvedValue(
      highConfidenceMatch({ status: "no_reliable_match", chosenKvkNummer: null, confidence: null }),
    );
    const storeKvkMatch = vi.fn().mockResolvedValue(undefined);

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow(), userId: "user-1", icpContext },
      { matchCompany, storeKvkMatch },
    );

    expect(result).toEqual({ status: "review_required" });
  });

  it("geeft failed terug (zonder te gooien) als matchCompany een fout gooit", async () => {
    const matchCompany = vi.fn().mockRejectedValue(new KvkApiError("Rate limit", 429));

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow(), userId: "user-1", icpContext },
      { matchCompany },
    );

    expect(result).toEqual({ status: "failed", message: expect.stringContaining("429") });
  });

  it("geeft failed terug als het opslaan van de match mislukt", async () => {
    const matchCompany = vi.fn().mockResolvedValue(highConfidenceMatch());
    const storeKvkMatch = vi.fn().mockRejectedValue(new Error("db down"));

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow(), userId: "user-1", icpContext },
      { matchCompany, storeKvkMatch },
    );

    expect(result).toEqual({ status: "failed", message: "db down" });
  });

  it("geeft failed terug als het basisprofiel niet bestaat voor het (bekende) kvk-nummer", async () => {
    const enrichAndStoreKvkData = vi.fn().mockResolvedValue(null);

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow({ kvk_nummer: "00000000" }), userId: "user-1", icpContext },
      { enrichAndStoreKvkData },
    );

    expect(result).toEqual({ status: "failed", message: expect.stringContaining("00000000") });
  });

  it("geeft failed terug (zonder te gooien) als de verrijking een fout gooit", async () => {
    const enrichAndStoreKvkData = vi.fn().mockRejectedValue(new KvkApiError("Server error", 503));

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow({ kvk_nummer: "68750110" }), userId: "user-1", icpContext },
      { enrichAndStoreKvkData },
    );

    expect(result).toEqual({ status: "failed", message: expect.stringContaining("503") });
  });

  it("slaat ICP-scoring over voor een inactief bedrijf, ook als er een ICP-profiel is", async () => {
    const enrichAndStoreKvkData = vi.fn().mockResolvedValue(enrichment({ status: "inactief" }));
    const runIcpForCompany = vi.fn();

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow({ kvk_nummer: "68750110" }), userId: "user-1", icpContext },
      { enrichAndStoreKvkData, runIcpForCompany },
    );

    expect(result).toEqual({ status: "completed" });
    expect(runIcpForCompany).not.toHaveBeenCalled();
  });

  it("slaat ICP-scoring over als er nog geen ICP-profiel is ingesteld", async () => {
    const enrichAndStoreKvkData = vi.fn().mockResolvedValue(enrichment());
    const runIcpForCompany = vi.fn();

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow({ kvk_nummer: "68750110" }), userId: "user-1", icpContext: null },
      { enrichAndStoreKvkData, runIcpForCompany },
    );

    expect(result).toEqual({ status: "completed" });
    expect(runIcpForCompany).not.toHaveBeenCalled();
  });

  it("blijft 'completed' ook als de AI-aanroep binnen runIcpForCompany zelf mislukt", async () => {
    const enrichAndStoreKvkData = vi.fn().mockResolvedValue(enrichment());
    const runIcpForCompany = vi.fn().mockResolvedValue({ outcome: "failed", message: "AI down" });

    const result = await processCompany(
      fakeSupabase,
      { importRow: importRow({ kvk_nummer: "68750110" }), userId: "user-1", icpContext },
      { enrichAndStoreKvkData, runIcpForCompany },
    );

    expect(result).toEqual({ status: "completed" });
  });
});
