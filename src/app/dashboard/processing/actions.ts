"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensureProcessingRowsExist, claimNextBatch } from "@/lib/processing/claimRows";
import { mapWithConcurrencyLimit } from "@/lib/processing/concurrency";
import {
  processCompany,
  type IcpProcessingContext,
  type ProcessCompanyImportRow,
} from "@/lib/processing/processCompany";
import { updateProcessingStatus } from "@/lib/processing/updateProcessingStatus";
import { countByStatus, type ProcessingCounts } from "@/lib/processing/countByStatus";
import { parsePrefilterConfig } from "@/lib/icp/prefilter/parseConfig";
import type { CompanyProcessingRow, Database } from "@/lib/types/database.types";

/** Aantal bedrijven per chunk — klein genoeg om nooit tegen een timeout van de Server Action aan te lopen. */
const CHUNK_SIZE = 5;
/** Maximaal aantal gelijktijdige bedrijven binnen één chunk, om websites en de AI-API niet te overbelasten. */
const CONCURRENCY_LIMIT = 3;

export type { ProcessingCounts };

async function fetchCounts(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ counts: ProcessingCounts } | { error: string }> {
  const { data, error } = await supabase.from("company_processing").select("status").eq("user_id", userId);
  if (error) {
    return { error: "Kon verwerkingsstatus niet ophalen." };
  }
  return { counts: countByStatus(data ?? []) };
}

export type ProcessingStatusResult =
  | { status: "error"; message: string }
  | { status: "success"; counts: ProcessingCounts };

/**
 * Zorgt dat elk geïmporteerd bedrijf een verwerkingsstatus heeft (nieuwe
 * rijen worden 'pending') en geeft de huidige aantallen terug. Doet
 * verder niets — puur voor het tonen van de startsituatie.
 */
export async function getProcessingStatus(): Promise<ProcessingStatusResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Je sessie is verlopen. Log opnieuw in." };
  }

  await ensureProcessingRowsExist(supabase, user.id);

  const result = await fetchCounts(supabase, user.id);
  if ("error" in result) {
    return { status: "error", message: result.error };
  }
  return { status: "success", counts: result.counts };
}

async function processAndStoreOneRow(
  supabase: SupabaseClient<Database>,
  processingRow: CompanyProcessingRow,
  importRow: ProcessCompanyImportRow | undefined,
  userId: string,
  icpContext: IcpProcessingContext | null,
): Promise<void> {
  if (!importRow) {
    await updateProcessingStatus(supabase, {
      importRowId: processingRow.import_row_id,
      userId,
      status: "failed",
      errorMessage: "Bijbehorende importrij niet gevonden.",
    });
    return;
  }

  try {
    const outcome = await processCompany(supabase, { importRow, userId, icpContext });
    if (outcome.status === "failed") {
      await updateProcessingStatus(supabase, {
        importRowId: importRow.id,
        userId,
        status: "failed",
        errorMessage: outcome.message,
      });
    } else {
      await updateProcessingStatus(supabase, { importRowId: importRow.id, userId, status: outcome.status });
    }
  } catch (error) {
    // Vangnet: processCompany zelf geeft nooit door, maar mocht er toch
    // iets onverwachts gebeuren dan mag dat de rest van de batch niet
    // stoppen — deze ene rij wordt gewoon 'failed'.
    await updateProcessingStatus(supabase, {
      importRowId: importRow.id,
      userId,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Onbekende fout.",
    });
  }
}

export type ProcessBatchResult =
  | { status: "error"; message: string }
  | { status: "success"; processedInChunk: number; done: boolean; counts: ProcessingCounts };

/**
 * Verwerkt één beperkte batch (chunk) bedrijven en geeft de bijgewerkte
 * aantallen terug plus `done` (niets meer te doen voor dit type run).
 * De client roept dit herhaaldelijk aan zodat de voortgang levend te
 * zien is, één mislukte rij de rest niet blokkeert, en de actie na een
 * onderbreking gewoon opnieuw gestart kan worden (al verwerkte
 * bedrijven worden nooit dubbel gedaan).
 */
export async function processNextChunk(retryFailedOnly: boolean): Promise<ProcessBatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Je sessie is verlopen. Log opnieuw in." };
  }

  await ensureProcessingRowsExist(supabase, user.id);

  const claimed = await claimNextBatch(supabase, user.id, { limit: CHUNK_SIZE, retryFailedOnly });

  if (claimed.length > 0) {
    const importRowIds = claimed.map((row) => row.import_row_id);
    const { data: importRows } = await supabase
      .from("import_rows")
      .select("id, bedrijfsnaam, kvk_nummer, postcode, plaats, website")
      .in("id", importRowIds);
    const importRowById = new Map((importRows ?? []).map((row) => [row.id, row]));

    const { data: profile } = await supabase
      .from("icp_profiles")
      .select("description, prefilter_config")
      .eq("user_id", user.id)
      .maybeSingle();
    const icpContext = profile?.description
      ? { description: profile.description, prefilterConfig: parsePrefilterConfig(profile.prefilter_config) }
      : null;

    await mapWithConcurrencyLimit(claimed, CONCURRENCY_LIMIT, (processingRow) =>
      processAndStoreOneRow(
        supabase,
        processingRow,
        importRowById.get(processingRow.import_row_id),
        user.id,
        icpContext,
      ),
    );

    revalidatePath("/dashboard/processing");
    revalidatePath("/dashboard/results");
    revalidatePath("/dashboard/kvk-review");
  }

  const result = await fetchCounts(supabase, user.id);
  if ("error" in result) {
    return { status: "error", message: result.error };
  }

  const done = retryFailedOnly
    ? result.counts.failed === 0
    : result.counts.pending === 0 && result.counts.processing === 0;

  return { status: "success", processedInChunk: claimed.length, done, counts: result.counts };
}
