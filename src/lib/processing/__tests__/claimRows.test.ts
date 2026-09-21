import { describe, expect, it, vi } from "vitest";
import { claimNextBatch, ensureProcessingRowsExist } from "@/lib/processing/claimRows";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

/** Generieke chainable mock: elke methode geeft zichzelf terug, `await` levert `result` op. */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  return chain;
}

function ok<T>(data: T) {
  return { data, error: null };
}

describe("ensureProcessingRowsExist", () => {
  it("doet niets als er geen import_rows zijn", async () => {
    const from = vi.fn().mockReturnValueOnce(makeChain(ok([])));
    const supabase = { from } as unknown as SupabaseClient<Database>;

    await ensureProcessingRowsExist(supabase, "user-1");

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("import_rows");
  });

  it("doet niets als elke import_row al een processing-rij heeft", async () => {
    const importRowsChain = makeChain(ok([{ id: "row-1" }, { id: "row-2" }]));
    const existingChain = makeChain(ok([{ import_row_id: "row-1" }, { import_row_id: "row-2" }]));
    const from = vi.fn().mockReturnValueOnce(importRowsChain).mockReturnValueOnce(existingChain);
    const supabase = { from } as unknown as SupabaseClient<Database>;

    await ensureProcessingRowsExist(supabase, "user-1");

    expect(from).toHaveBeenCalledTimes(2);
  });

  it("voegt alleen ontbrekende processing-rijen toe, met status pending", async () => {
    const importRowsChain = makeChain(ok([{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }]));
    const existingChain = makeChain(ok([{ import_row_id: "row-1" }]));
    const insertChain = makeChain(ok(null));
    const from = vi
      .fn()
      .mockReturnValueOnce(importRowsChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(insertChain);
    const supabase = { from } as unknown as SupabaseClient<Database>;

    await ensureProcessingRowsExist(supabase, "user-1");

    expect(insertChain.insert).toHaveBeenCalledWith([
      { import_row_id: "row-2", user_id: "user-1", status: "pending" },
      { import_row_id: "row-3", user_id: "user-1", status: "pending" },
    ]);
  });

  it("negeert een unique-constraint-fout (race met een gelijktijdige aanroep)", async () => {
    const importRowsChain = makeChain(ok([{ id: "row-1" }]));
    const existingChain = makeChain(ok([]));
    const insertChain: Record<string, unknown> = {
      insert: vi.fn(() => Promise.resolve({ error: { code: "23505", message: "duplicate" } })),
    };
    const from = vi
      .fn()
      .mockReturnValueOnce(importRowsChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(insertChain);
    const supabase = { from } as unknown as SupabaseClient<Database>;

    await expect(ensureProcessingRowsExist(supabase, "user-1")).resolves.toBeUndefined();
  });

  it("gooit een fout bij een echte insertfout", async () => {
    const importRowsChain = makeChain(ok([{ id: "row-1" }]));
    const existingChain = makeChain(ok([]));
    const insertChain: Record<string, unknown> = {
      insert: vi.fn(() => Promise.resolve({ error: { code: "500", message: "kaboom" } })),
    };
    const from = vi
      .fn()
      .mockReturnValueOnce(importRowsChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(insertChain);
    const supabase = { from } as unknown as SupabaseClient<Database>;

    await expect(ensureProcessingRowsExist(supabase, "user-1")).rejects.toThrow(/kaboom/);
  });
});

describe("claimNextBatch", () => {
  it("claimt pending- en failed-rijen en zet ze op processing", async () => {
    const rows = [
      { id: "cp-1", status: "pending", updated_at: new Date().toISOString(), import_row_id: "row-1" },
      { id: "cp-2", status: "failed", updated_at: new Date().toISOString(), import_row_id: "row-2" },
    ];
    const selectChain = makeChain(ok(rows));
    const updateChain = makeChain(ok(rows.map((r) => ({ ...r, status: "processing" }))));
    const from = vi.fn().mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain);
    const supabase = { from } as unknown as SupabaseClient<Database>;

    const result = await claimNextBatch(supabase, "user-1", { limit: 5, retryFailedOnly: false });

    expect(selectChain.in).toHaveBeenCalledWith("status", ["pending", "failed", "processing"]);
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "processing" }),
    );
    expect(updateChain.in).toHaveBeenCalledWith("id", ["cp-1", "cp-2"]);
    expect(result).toHaveLength(2);
  });

  it("negeert pending-rijen wanneer retryFailedOnly is gezet", async () => {
    const selectChain = makeChain(ok([]));
    const from = vi.fn().mockReturnValueOnce(selectChain);
    const supabase = { from } as unknown as SupabaseClient<Database>;

    await claimNextBatch(supabase, "user-1", { limit: 5, retryFailedOnly: true });

    expect(selectChain.in).toHaveBeenCalledWith("status", ["failed", "processing"]);
  });

  it("laat een recent geclaimde processing-rij met rust (niet vastgelopen)", async () => {
    const rows = [
      { id: "cp-1", status: "processing", updated_at: new Date().toISOString(), import_row_id: "row-1" },
    ];
    const selectChain = makeChain(ok(rows));
    const from = vi.fn().mockReturnValueOnce(selectChain);
    const supabase = { from } as unknown as SupabaseClient<Database>;

    const result = await claimNextBatch(supabase, "user-1", { limit: 5, retryFailedOnly: false });

    expect(result).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("herclaimt een vastgelopen processing-rij (ouder dan de stale-drempel)", async () => {
    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const rows = [{ id: "cp-1", status: "processing", updated_at: staleTimestamp, import_row_id: "row-1" }];
    const selectChain = makeChain(ok(rows));
    const updateChain = makeChain(ok(rows));
    const from = vi.fn().mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain);
    const supabase = { from } as unknown as SupabaseClient<Database>;

    const result = await claimNextBatch(supabase, "user-1", { limit: 5, retryFailedOnly: false });

    expect(updateChain.in).toHaveBeenCalledWith("id", ["cp-1"]);
    expect(result).toHaveLength(1);
  });

  it("respecteert de limiet", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `cp-${i}`,
      status: "pending",
      updated_at: new Date().toISOString(),
      import_row_id: `row-${i}`,
    }));
    const selectChain = makeChain(ok(rows));
    const updateChain = makeChain(ok(rows.slice(0, 3)));
    const from = vi.fn().mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain);
    const supabase = { from } as unknown as SupabaseClient<Database>;

    await claimNextBatch(supabase, "user-1", { limit: 3, retryFailedOnly: false });

    expect(updateChain.in).toHaveBeenCalledWith("id", ["cp-0", "cp-1", "cp-2"]);
  });

  it("gooit een duidelijke fout als de select mislukt", async () => {
    const from = vi.fn().mockReturnValueOnce(makeChain({ data: null, error: { message: "kaboom" } }));
    const supabase = { from } as unknown as SupabaseClient<Database>;

    await expect(claimNextBatch(supabase, "user-1", { limit: 5, retryFailedOnly: false })).rejects.toThrow(
      /kaboom/,
    );
  });
});
