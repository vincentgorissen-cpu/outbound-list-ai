import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/types/database.types";
import type { IcpDataSource, IcpScoreResult } from "./types";

export type IcpScoreOutcome =
  | ({ status: "scored" } & IcpScoreResult)
  | { status: "ai_processing_failed"; errorMessage: string }
  | { status: "excluded_by_prefilter"; reason: string };

export interface StoreIcpScoreParams {
  importRowId: string;
  userId: string;
  result: IcpScoreOutcome;
  /** Deterministisch berekend (nooit door de AI) — zie `computeDataCompleteness`. */
  dataCompleteness: number;
  /** Deterministisch berekend (nooit door de AI) — zie `computeDataSources`. */
  dataSources: IcpDataSource[];
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
 *
 * `data_completeness`/`data_sources` worden in alle drie de gevallen
 * opgeslagen (ook bij een mislukte of overgeslagen scoring) — dat zijn
 * eigenschappen van de invoer, niet van het scoringsresultaat.
 */
export async function storeIcpScore(
  supabase: SupabaseClient<Database>,
  { importRowId, userId, result, dataCompleteness, dataSources }: StoreIcpScoreParams,
): Promise<void> {
  const now = new Date().toISOString();
  const shared = {
    import_row_id: importRowId,
    user_id: userId,
    data_completeness: dataCompleteness,
    data_sources: dataSources as unknown as Json,
    scored_at: now,
  };
  let payload: Database["public"]["Tables"]["icp_scores"]["Insert"];

  if (result.status === "scored") {
    payload = {
      ...shared,
      status: "scored",
      score: result.score,
      classification: result.classification,
      reasons: result.reasons as unknown as Json,
      concerns: result.concerns as unknown as Json,
      confidence: result.confidence,
      missing_important_data: result.missingImportantData as unknown as Json,
      key_sales_signals: result.keySalesSignals as unknown as Json,
      error_message: null,
      prefilter_status: "passed",
      prefilter_reason: null,
    };
  } else if (result.status === "ai_processing_failed") {
    payload = {
      ...shared,
      status: "ai_processing_failed",
      score: null,
      classification: null,
      reasons: [] as unknown as Json,
      concerns: [] as unknown as Json,
      confidence: null,
      missing_important_data: [] as unknown as Json,
      key_sales_signals: [] as unknown as Json,
      error_message: result.errorMessage,
      prefilter_status: "passed",
      prefilter_reason: null,
    };
  } else {
    payload = {
      ...shared,
      status: "excluded_by_prefilter",
      score: null,
      classification: null,
      reasons: [] as unknown as Json,
      concerns: [] as unknown as Json,
      confidence: null,
      missing_important_data: [] as unknown as Json,
      key_sales_signals: [] as unknown as Json,
      error_message: null,
      prefilter_status: "excluded",
      prefilter_reason: result.reason,
    };
  }

  const { error } = await supabase
    .from("icp_scores")
    .upsert(payload, { onConflict: "import_row_id" });

  if (error) {
    throw new Error(`Kon ICP-score niet opslaan: ${error.message}`);
  }
}
