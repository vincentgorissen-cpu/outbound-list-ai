import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/types/database.types";
import type { IcpScoreResult } from "./types";

export type IcpScoreOutcome =
  | ({ status: "scored" } & IcpScoreResult)
  | { status: "ai_processing_failed"; errorMessage: string };

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
 */
export async function storeIcpScore(
  supabase: SupabaseClient<Database>,
  { importRowId, userId, result }: StoreIcpScoreParams,
): Promise<void> {
  const payload: Database["public"]["Tables"]["icp_scores"]["Insert"] =
    result.status === "scored"
      ? {
          import_row_id: importRowId,
          user_id: userId,
          status: "scored" as const,
          score: result.score,
          classification: result.classification,
          reasons: result.reasons as unknown as Json,
          concerns: result.concerns as unknown as Json,
          confidence: result.confidence,
          error_message: null,
          scored_at: new Date().toISOString(),
        }
      : {
          import_row_id: importRowId,
          user_id: userId,
          status: "ai_processing_failed" as const,
          score: null,
          classification: null,
          reasons: [] as unknown as Json,
          concerns: [] as unknown as Json,
          confidence: null,
          error_message: result.errorMessage,
          scored_at: new Date().toISOString(),
        };

  const { error } = await supabase
    .from("icp_scores")
    .upsert(payload, { onConflict: "import_row_id" });

  if (error) {
    throw new Error(`Kon ICP-score niet opslaan: ${error.message}`);
  }
}
