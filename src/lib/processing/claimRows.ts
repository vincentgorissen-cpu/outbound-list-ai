import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyProcessingRow, CompanyProcessingStatus, Database } from "@/lib/types/database.types";

/**
 * Een 'processing'-rij die langer dan dit geleden is geclaimd (en dus
 * nooit een terminale status heeft gekregen) is vermoedelijk vastgelopen
 * doordat de vorige run halverwege is afgebroken (tabblad gesloten,
 * verbinding verloren). Zo'n rij mag opnieuw geclaimd worden — dat maakt
 * de batchactie veilig herstartbaar.
 */
const STALE_PROCESSING_MS = 2 * 60 * 1000;

/**
 * Zorgt dat elk import_rows-record van deze gebruiker een
 * `company_processing`-rij heeft (status 'pending' voor nieuwe rijen).
 * Idempotent en veilig om vóór elke chunk opnieuw aan te roepen.
 */
export async function ensureProcessingRowsExist(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data: importRows, error: importRowsError } = await supabase
    .from("import_rows")
    .select("id")
    .eq("user_id", userId);
  if (importRowsError) {
    throw new Error(`Kon importrijen niet ophalen: ${importRowsError.message}`);
  }

  const ids = (importRows ?? []).map((row) => row.id);
  if (ids.length === 0) return;

  const { data: existing, error: existingError } = await supabase
    .from("company_processing")
    .select("import_row_id")
    .eq("user_id", userId);
  if (existingError) {
    throw new Error(`Kon bestaande verwerkingsstatus niet ophalen: ${existingError.message}`);
  }

  const existingIds = new Set((existing ?? []).map((row) => row.import_row_id));
  const missing = ids.filter((id) => !existingIds.has(id));
  if (missing.length === 0) return;

  const { error: insertError } = await supabase.from("company_processing").insert(
    missing.map((importRowId) => ({
      import_row_id: importRowId,
      user_id: userId,
      status: "pending" as const,
    })),
  );

  // Een race met een gelijktijdige aanroep (bv. twee open tabbladen) kan
  // een unique-constraint-fout geven op import_row_id; onschadelijk, de
  // rij bestaat dan al met status 'pending'.
  if (insertError && insertError.code !== "23505") {
    throw new Error(`Kon verwerkingsstatus niet initialiseren: ${insertError.message}`);
  }
}

export interface ClaimNextBatchOptions {
  limit: number;
  /** true = alleen 'failed' (en vastgelopen 'processing') opnieuw proberen; pending blijft ongemoeid. */
  retryFailedOnly: boolean;
}

/**
 * Claimt de volgende batch te verwerken bedrijven door hun status naar
 * 'processing' te zetten, en geeft de geclaimde rijen terug. Bevat
 * altijd 'pending' (tenzij `retryFailedOnly`) en 'failed', plus
 * vastgelopen 'processing'-rijen ouder dan `STALE_PROCESSING_MS`.
 *
 * Dit is geen perfect atomaire claim (geen `SELECT ... FOR UPDATE SKIP
 * LOCKED`), maar voor een single-user tool is select-dan-update
 * voldoende: het voorkomt dat een volgende chunk-aanroep dezelfde,
 * inmiddels 'processing' rijen opnieuw oppakt.
 */
export async function claimNextBatch(
  supabase: SupabaseClient<Database>,
  userId: string,
  { limit, retryFailedOnly }: ClaimNextBatchOptions,
): Promise<CompanyProcessingRow[]> {
  const statuses: CompanyProcessingStatus[] = retryFailedOnly
    ? ["failed", "processing"]
    : ["pending", "failed", "processing"];
  const staleThresholdMs = Date.now() - STALE_PROCESSING_MS;

  const { data, error } = await supabase
    .from("company_processing")
    .select("*")
    .eq("user_id", userId)
    .in("status", statuses)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Kon volgende batch niet ophalen: ${error.message}`);
  }

  const claimable = (data ?? []).filter((row) => {
    if (row.status !== "processing") return true;
    return new Date(row.updated_at).getTime() < staleThresholdMs;
  });

  const candidates = claimable.slice(0, limit);
  if (candidates.length === 0) return [];

  const ids = candidates.map((row) => row.id);
  const { data: claimed, error: claimError } = await supabase
    .from("company_processing")
    .update({ status: "processing", last_attempted_at: new Date().toISOString() })
    .in("id", ids)
    .select("*");

  if (claimError) {
    throw new Error(`Kon batch niet claimen: ${claimError.message}`);
  }

  return claimed ?? [];
}
