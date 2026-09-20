import { describe, expect, it, vi } from "vitest";
import { storeKvkMatch } from "@/lib/kvk/storeMatch";
import type { KvkMatchResult } from "@/lib/kvk/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

const MATCH: KvkMatchResult = {
  status: "review_required",
  chosenKvkNummer: "68750110",
  confidence: 82,
  candidates: [
    {
      kvkNummer: "68750110",
      naam: "Test BV Donald",
      plaats: "Rommeldam",
      score: 82,
      scoreBreakdown: { bedrijfsnaam: 90, postcode: null, plaats: 0, website: null },
    },
  ],
  gecontroleerdOp: "2026-09-20T12:00:00.000Z",
};

function buildSupabaseMock(upsertResult: { error: { message: string } | null }) {
  const upsert = vi.fn().mockResolvedValue(upsertResult);
  const from = vi.fn().mockReturnValue({ upsert });
  const supabase = { from } as unknown as SupabaseClient<Database>;
  return { supabase, from, upsert };
}

describe("storeKvkMatch", () => {
  it("upsert naar kvk_matches met status, score, gekozen nummer en kandidaten", async () => {
    const { supabase, from, upsert } = buildSupabaseMock({ error: null });

    await storeKvkMatch(supabase, { importRowId: "row-1", userId: "user-1", match: MATCH });

    expect(from).toHaveBeenCalledWith("kvk_matches");
    const [payload, options] = upsert.mock.calls[0];
    expect(payload).toMatchObject({
      import_row_id: "row-1",
      user_id: "user-1",
      status: "review_required",
      chosen_kvk_nummer: "68750110",
      confidence: 82,
      gecontroleerd_op: "2026-09-20T12:00:00.000Z",
    });
    expect(payload.candidates).toEqual(MATCH.candidates);
    expect(options).toEqual({ onConflict: "import_row_id" });
  });

  it("slaat een no_reliable_match op met chosen_kvk_nummer/confidence null", async () => {
    const { upsert, supabase } = buildSupabaseMock({ error: null });

    await storeKvkMatch(supabase, {
      importRowId: "row-2",
      userId: "user-1",
      match: {
        status: "no_reliable_match",
        chosenKvkNummer: null,
        confidence: null,
        candidates: [],
        gecontroleerdOp: "2026-09-20T12:00:00.000Z",
      },
    });

    const [payload] = upsert.mock.calls[0];
    expect(payload.chosen_kvk_nummer).toBeNull();
    expect(payload.confidence).toBeNull();
  });

  it("gooit een duidelijke fout als Supabase een fout teruggeeft", async () => {
    const { supabase } = buildSupabaseMock({ error: { message: "kaboom" } });

    await expect(
      storeKvkMatch(supabase, { importRowId: "row-1", userId: "user-1", match: MATCH }),
    ).rejects.toThrow(/kaboom/);
  });
});
