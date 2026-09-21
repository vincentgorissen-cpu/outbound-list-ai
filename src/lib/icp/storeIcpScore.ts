import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/types/database.types";
import type { IcpScoreResult } from "./types";

export type IcpScoreOutcome =
  | ({ status: "scored" } & IcpScoreResult)
  | { status: "ai_processing_failed"; errorMessage: string }
  | { status: "excluded_by_prefilter"; reason: string };

export interface StoreIcpScoreParams {
  importRowId: string;
  userId: string;
  result: IcpScoreOutcome;
}

/**
 * Slaat het resultaat van één bedrijf op in `icp_scores`, los van
 * `import_rows` en `kvk_enrichments`. Bij een mislukte AI-call (of een
 * antwoord dat de schema-validatie niet doorstond) wordt hier
 * `ai_processing_failed` vastgelegd in plaats van dat de aanroeper
 * de rij overslaat — het bedrijfsrecord raakt zo nooit kwijt.
 *
 * `excluded_by_prefilter` legt vast dat een bedrijf al deterministisch
 * is uitgesloten (zie `lib/icp/prefilter`) vóórdat er een AI-aanroep
 * is gedaan — `prefilter_status`/`prefilter_reason` maken per bedrijf
 * navolgbaar waarom AI-scoring wel of niet is uitgevoerd.
 */
export async function storeIcpScore(
  supabase: SupabaseClient<Database>,
  { importRowId, userId, result }: StoreIcpScoreParams,
): Promise<void> {
  const now = new Date().toISOString();
  let payload: Database["public"]["Tables"]["icp_scores"]["Insert"];

  if (result.status === "scored") {
    payload = {
      import_row_id: importRowId,
      user_id: userId,
      status: "scored",
      score: result.score,
      classification: result.classification,
      reasons: result.reasons as unknown as Json,
      concerns: result.concerns as unknown as Json,
      confidence: result.confidence,
      error_message: null,
      prefilter_status: "passed",
      prefilter_reason: null,
      scored_at: now,
    };
  } else if (result.status === "ai_processing_failed") {
    payload = {
      import_row_id: importRowId,
      user_id: userId,
      status: "ai_processing_failed",
      score: null,
      classification: null,
      reasons: [] as unknown as Json,
      concerns: [] as unknown as Json,
      confidence: null,
      error_message: result.errorMessage,
      prefilter_status: "passed",
      prefilter_reason: null,
      scored_at: now,
    };
  } else {
    payload = {
      import_row_id: importRowId,
      user_id: userId,
      status: "excluded_by_prefilter",
      score: null,
      classification: null,
      reasons: [] as unknown as Json,
      concerns: [] as unknown as Json,
      confidence: null,
      error_message: null,
      prefilter_status: "excluded",
      prefilter_reason: result.reason,
      scored_at: now,
    };
  }

  const { error } = await supabase
    .from("icp_scores")
    .upsert(payload, { onConflict: "import_row_id" });

  if (error) {
    throw new Error(`Kon ICP-score niet opslaan: ${error.message}`);
  }
}
