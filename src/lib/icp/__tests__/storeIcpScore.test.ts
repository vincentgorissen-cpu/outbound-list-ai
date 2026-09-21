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
  it("slaat een geslaagde score correct op", async () => {
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
      },
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
    });
    expect(payload.reasons).toEqual(["past qua sector"]);
    expect(options).toEqual({ onConflict: "import_row_id" });
  });

  it("slaat een mislukte AI-call op als ai_processing_failed, met null-velden en foutmelding", async () => {
    const { supabase, upsert } = buildSupabaseMock({ error: null });

    await storeIcpScore(supabase, {
      importRowId: "row-2",
      userId: "user-1",
      result: { status: "ai_processing_failed", errorMessage: "AI-aanroep mislukt: timeout" },
    });

    const [payload] = upsert.mock.calls[0];
    expect(payload).toMatchObject({
      status: "ai_processing_failed",
      score: null,
      classification: null,
      confidence: null,
      error_message: "AI-aanroep mislukt: timeout",
    });
  });

  it("gooit een duidelijke fout als Supabase een fout teruggeeft", async () => {
    const { supabase } = buildSupabaseMock({ error: { message: "kaboom" } });

    await expect(
      storeIcpScore(supabase, {
        importRowId: "row-1",
        userId: "user-1",
        result: { status: "ai_processing_failed", errorMessage: "x" },
      }),
    ).rejects.toThrow(/kaboom/);
  });
});
