import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/types/database.types";
import type { KvkMatchResult } from "./types";

export interface StoreKvkMatchParams {
  importRowId: string;
  userId: string;
  match: KvkMatchResult;
}

/**
 * Slaat een matchresultaat op in `kvk_matches`, los van `import_rows`
 * en `kvk_enrichments`. Bevat altijd de score en status, ook bij een
 * lage confidence — zo kan een lage score nooit stilzwijgend als
 * definitief bevestigd kvk-nummer worden aangezien.
 */
export async function storeKvkMatch(
  supabase: SupabaseClient<Database>,
  { importRowId, userId, match }: StoreKvkMatchParams,
): Promise<void> {
  const { error } = await supabase.from("kvk_matches").upsert(
    {
      import_row_id: importRowId,
      user_id: userId,
      status: match.status,
      chosen_kvk_nummer: match.chosenKvkNummer,
      confidence: match.confidence,
      // KvkMatchCandidate[] is qua vorm een geldige Json-waarde (alleen
      // primitieven/arrays/objecten), maar mist de index-signature die
      // Json vereist; expliciete cast in plaats van een losser type.
      candidates: match.candidates as unknown as Json,
      gecontroleerd_op: match.gecontroleerdOp,
    },
    { onConflict: "import_row_id" },
  );

  if (error) {
    throw new Error(`Kon KVK-match niet opslaan: ${error.message}`);
  }
}
