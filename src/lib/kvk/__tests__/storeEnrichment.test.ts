import { describe, expect, it, vi } from "vitest";
import { storeKvkEnrichment } from "@/lib/kvk/storeEnrichment";
import type { KvkEnrichment } from "@/lib/kvk/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

const ENRICHMENT: KvkEnrichment = {
  kvkNummer: "68750110",
  officieleNaam: "Test BV Donald",
  handelsnamen: ["Test BV Donald"],
  rechtsvorm: "Besloten vennootschap",
  status: "actief",
  sbiCodes: ["01241"],
  sbiOmschrijvingen: ["Teelt van appels en peren"],
  aantalWerkzamePersonen: 1,
  vestigingsplaats: "Lollum",
  website: "https://acme.nl",
  opgehaaldOp: "2026-09-20T12:00:00.000Z",
};

function buildSupabaseMock(upsertResult: { error: { message: string } | null }) {
  const upsert = vi.fn().mockResolvedValue(upsertResult);
  const from = vi.fn().mockReturnValue({ upsert });
  const supabase = { from } as unknown as SupabaseClient<Database>;
  return { supabase, from, upsert };
}

describe("storeKvkEnrichment", () => {
  it("upsert naar kvk_enrichments met de juiste veldnamen en onConflict-sleutel", async () => {
    const { supabase, from, upsert } = buildSupabaseMock({ error: null });

    await storeKvkEnrichment(supabase, {
      importRowId: "row-1",
      userId: "user-1",
      enrichment: ENRICHMENT,
    });

    expect(from).toHaveBeenCalledWith("kvk_enrichments");
    const [payload, options] = upsert.mock.calls[0];
    expect(payload).toMatchObject({
      import_row_id: "row-1",
      user_id: "user-1",
      kvk_nummer: "68750110",
      officiele_naam: "Test BV Donald",
      rechtsvorm: "Besloten vennootschap",
      status: "actief",
      vestigingsplaats: "Lollum",
      website: "https://acme.nl",
      opgehaald_op: "2026-09-20T12:00:00.000Z",
    });
    expect(options).toEqual({ onConflict: "import_row_id" });
  });

  it("gooit een duidelijke fout als Supabase een fout teruggeeft", async () => {
    const { supabase } = buildSupabaseMock({ error: { message: "kaboom" } });

    await expect(
      storeKvkEnrichment(supabase, { importRowId: "row-1", userId: "user-1", enrichment: ENRICHMENT }),
    ).rejects.toThrow(/kaboom/);
  });
});
