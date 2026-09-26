import { describe, expect, it, vi } from "vitest";
import { storeIcpScore } from "@/lib/icp/storeIcpScore";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

function buildSupabaseMock(upsertResult: { error: { message: string } | null }) {
  const upsert = vi.fn().mockResolvedValue(upsertResult);
  const from = vi.fn().mockReturnValue({ upsert });
  const supabase = { from } as unknown as SupabaseClient<Database>;
  return { supabase, from, upsert };
}

describe("storeIcpScore", () => {
  it("slaat een geslaagde score correct op, inclusief data_completeness/data_sources en de nieuwe AI-velden", async () => {
    const { supabase, from, upsert } = buildSupabaseMock({ error: null });

    await storeIcpScore(supabase, {
      importRowId: "row-1",
      userId: "user-1",
      result: {
        status: "scored",
        score: 85,
        classification: "high_fit",
        reasons: ["past qua sector"],
        concerns: [],
        confidence: 0.9,
        missingImportantData: ["omzet onbekend"],
        keySalesSignals: ["eigen productie"],
      },
      dataCompleteness: 0.75,
      dataSources: ["upload", "website"],
    });

    expect(from).toHaveBeenCalledWith("icp_scores");
    const [payload, options] = upsert.mock.calls[0];
    expect(payload).toMatchObject({
      import_row_id: "row-1",
      user_id: "user-1",
      status: "scored",
      score: 85,
      classification: "high_fit",
      confidence: 0.9,
      error_message: null,
      data_completeness: 0.75,
      data_sources: ["upload", "website"],
      missing_important_data: ["omzet onbekend"],
      key_sales_signals: ["eigen productie"],
    });
    expect(payload.reasons).toEqual(["past qua sector"]);
    expect(options).toEqual({ onConflict: "import_row_id" });
  });

  it("slaat een mislukte AI-call op als ai_processing_failed, met null-velden, foutmelding en toch data_completeness/data_sources", async () => {
    const { supabase, upsert } = buildSupabaseMock({ error: null });

    await storeIcpScore(supabase, {
      importRowId: "row-2",
      userId: "user-1",
      result: { status: "ai_processing_failed", errorMessage: "AI-aanroep mislukt: timeout" },
      dataCompleteness: 0.5,
      dataSources: ["upload"],
    });

    const [payload] = upsert.mock.calls[0];
    expect(payload).toMatchObject({
      status: "ai_processing_failed",
      score: null,
      classification: null,
      confidence: null,
      error_message: "AI-aanroep mislukt: timeout",
      data_completeness: 0.5,
      data_sources: ["upload"],
      missing_important_data: [],
      key_sales_signals: [],
    });
  });

  it("slaat een deterministische uitsluiting op als excluded_by_prefilter, met de reden, zonder AI-velden en toch data_completeness/data_sources", async () => {
    const { supabase, upsert } = buildSupabaseMock({ error: null });

    await storeIcpScore(supabase, {
      importRowId: "row-3",
      userId: "user-1",
      result: {
        status: "excluded_by_prefilter",
        reason: "Status \"inactief\" is uitgesloten door de voorfilters.",
      },
      dataCompleteness: 0.25,
      dataSources: ["upload"],
    });

    const [payload] = upsert.mock.calls[0];
    expect(payload).toMatchObject({
      status: "excluded_by_prefilter",
      score: null,
      classification: null,
      confidence: null,
      error_message: null,
      prefilter_status: "excluded",
      prefilter_reason: 'Status "inactief" is uitgesloten door de voorfilters.',
      data_completeness: 0.25,
      data_sources: ["upload"],
    });
  });

  it("markeert geslaagde en mislukte AI-aanroepen als 'passed' door de voorfilters", async () => {
    const { supabase, upsert } = buildSupabaseMock({ error: null });

    await storeIcpScore(supabase, {
      importRowId: "row-4",
      userId: "user-1",
      result: {
        status: "scored",
        score: 70,
        classification: "medium_fit",
        reasons: [],
        concerns: [],
        confidence: 0.5,
        missingImportantData: [],
        keySalesSignals: [],
      },
      dataCompleteness: 1,
      dataSources: ["upload", "website"],
    });
    expect(upsert.mock.calls[0][0]).toMatchObject({ prefilter_status: "passed", prefilter_reason: null });

    await storeIcpScore(supabase, {
      importRowId: "row-5",
      userId: "user-1",
      result: { status: "ai_processing_failed", errorMessage: "timeout" },
      dataCompleteness: 0,
      dataSources: ["upload"],
    });
    expect(upsert.mock.calls[1][0]).toMatchObject({ prefilter_status: "passed", prefilter_reason: null });
  });

  it("gooit een duidelijke fout als Supabase een fout teruggeeft", async () => {
    const { supabase } = buildSupabaseMock({ error: { message: "kaboom" } });

    await expect(
      storeIcpScore(supabase, {
        importRowId: "row-1",
        userId: "user-1",
        result: { status: "ai_processing_failed", errorMessage: "x" },
        dataCompleteness: 0,
        dataSources: ["upload"],
      }),
    ).rejects.toThrow(/kaboom/);
  });
});
