import { describe, expect, it, vi } from "vitest";
import { enrichAndStoreKvkData } from "@/lib/kvk/enrichAndStore";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import type { KvkBasisprofiel } from "@/lib/kvk/types";

function buildSupabaseMock() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ upsert });
  const supabase = { from } as unknown as SupabaseClient<Database>;
  return { supabase, from, upsert };
}

describe("enrichAndStoreKvkData", () => {
  it("haalt het basisprofiel op en slaat de verrijking op wanneer het bestaat", async () => {
    const { supabase, from, upsert } = buildSupabaseMock();
    const basisprofiel: KvkBasisprofiel = {
      kvkNummer: "68750110",
      naam: "Test BV Donald",
      totaalWerkzamePersonen: 10,
      _embedded: { eigenaar: { rechtsvorm: "Besloten vennootschap" } },
    };
    const getBasisprofiel = vi.fn().mockResolvedValue(basisprofiel);

    const result = await enrichAndStoreKvkData(
      supabase,
      { kvkNummer: "68750110", importRowId: "row-1", userId: "user-1" },
      { getBasisprofiel },
    );

    expect(result?.kvkNummer).toBe("68750110");
    expect(from).toHaveBeenCalledWith("kvk_enrichments");
    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload] = upsert.mock.calls[0];
    expect(payload).toMatchObject({ import_row_id: "row-1", user_id: "user-1", kvk_nummer: "68750110" });
  });

  it("geeft null terug en slaat niets op wanneer er geen basisprofiel bestaat", async () => {
    const { supabase, upsert } = buildSupabaseMock();
    const getBasisprofiel = vi.fn().mockResolvedValue(null);

    const result = await enrichAndStoreKvkData(
      supabase,
      { kvkNummer: "00000000", importRowId: "row-1", userId: "user-1" },
      { getBasisprofiel },
    );

    expect(result).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});
