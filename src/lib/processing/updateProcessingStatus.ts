import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyProcessingStatus, Database } from "@/lib/types/database.types";

export interface UpdateProcessingStatusParams {
  importRowId: string;
  userId: string;
  status: CompanyProcessingStatus;
  errorMessage?: string | null;
}

const TERMINAL_STATUSES: CompanyProcessingStatus[] = ["completed", "review_required", "failed"];

/**
 * Werkt de verwerkingsstatus van één bedrijf bij. Gedeeld tussen de
 * batchverwerking en de KVK-review-actie (na een handmatige beslissing)
 * zodat beide paden dezelfde tabel op dezelfde manier bijwerken.
 */
export async function updateProcessingStatus(
  supabase: SupabaseClient<Database>,
  { importRowId, userId, status, errorMessage = null }: UpdateProcessingStatusParams,
): Promise<void> {
  const { error } = await supabase
    .from("company_processing")
    .update({
      status,
      error_message: errorMessage,
      ...(TERMINAL_STATUSES.includes(status) ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("import_row_id", importRowId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Kon verwerkingsstatus niet bijwerken: ${error.message}`);
  }
}
