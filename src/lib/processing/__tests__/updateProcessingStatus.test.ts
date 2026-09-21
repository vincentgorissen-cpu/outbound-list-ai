import { describe, expect, it, vi } from "vitest";
import { updateProcessingStatus } from "@/lib/processing/updateProcessingStatus";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

function buildSupabaseMock() {
  const eq2 = vi.fn().mockResolvedValue({ error: null });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const update = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ update });
  const supabase = { from } as unknown as SupabaseClient<Database>;
  return { supabase, from, update, eq1, eq2 };
}

describe("updateProcessingStatus", () => {
  it("zet completed_at bij een terminale status (completed)", async () => {
    const { supabase, update, eq1, eq2 } = buildSupabaseMock();

    await updateProcessingStatus(supabase, { importRowId: "row-1", userId: "user-1", status: "completed" });

    const [payload] = update.mock.calls[0];
    expect(payload.status).toBe("completed");
    expect(payload.error_message).toBeNull();
    expect(typeof payload.completed_at).toBe("string");
    expect(eq1).toHaveBeenCalledWith("import_row_id", "row-1");
    expect(eq2).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("zet completed_at bij review_required en bij failed", async () => {
    const { supabase, update } = buildSupabaseMock();

    await updateProcessingStatus(supabase, { importRowId: "row-1", userId: "user-1", status: "review_required" });
    expect(update.mock.calls[0][0].completed_at).toBeDefined();

    await updateProcessingStatus(supabase, {
      importRowId: "row-1",
      userId: "user-1",
      status: "failed",
      errorMessage: "KVK-fout",
    });
    expect(update.mock.calls[1][0]).toMatchObject({ status: "failed", error_message: "KVK-fout" });
    expect(update.mock.calls[1][0].completed_at).toBeDefined();
  });

  it("zet geen completed_at bij een niet-terminale status (pending/processing)", async () => {
    const { supabase, update } = buildSupabaseMock();

    await updateProcessingStatus(supabase, { importRowId: "row-1", userId: "user-1", status: "processing" });

    expect(update.mock.calls[0][0]).not.toHaveProperty("completed_at");
  });

  it("gooit een duidelijke fout als Supabase een fout teruggeeft", async () => {
    const { supabase, eq2 } = buildSupabaseMock();
    eq2.mockResolvedValue({ error: { message: "kaboom" } });

    await expect(
      updateProcessingStatus(supabase, { importRowId: "row-1", userId: "user-1", status: "completed" }),
    ).rejects.toThrow(/kaboom/);
  });
});
