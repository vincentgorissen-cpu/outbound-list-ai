"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { enrichAndStoreKvkData } from "@/lib/kvk/enrichAndStore";
import { updateProcessingStatus } from "@/lib/processing/updateProcessingStatus";
import type { KvkMatchCandidate } from "@/lib/kvk/types";

export type ResolveMatchResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

/**
 * Verwerkt de beslissing van de gebruiker op één KVK-match:
 * - decision "confirm": het gekozen kvk-nummer (voorgesteld of een
 *   andere kandidaat uit de lijst) wordt vastgelegd als resolutie, en
 *   we halen meteen de volledige KVK-gegevens op (basisprofiel) om
 *   kvk_enrichments te vullen — precies zoals bij een al bekend
 *   kvk-nummer. `import_rows` (de originele upload) blijft ongewijzigd.
 * - decision "reject": vastgelegd dat geen enkele kandidaat klopt, geen
 *   verrijking.
 *
 * In beide gevallen verdwijnt de rij uit het review-scherm doordat de
 * query daar alleen niet-opgeloste matches toont.
 */
export async function resolveKvkMatch(
  _prevState: ResolveMatchResult,
  formData: FormData,
): Promise<ResolveMatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Je sessie is verlopen. Log opnieuw in." };
  }

  const matchId = String(formData.get("matchId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!matchId || (decision !== "confirm" && decision !== "reject")) {
    return { status: "error", message: "Ongeldige aanvraag." };
  }

  const { data: matchRow, error: fetchError } = await supabase
    .from("kvk_matches")
    .select("id, import_row_id, candidates")
    .eq("id", matchId)
    .single();
  if (fetchError || !matchRow) {
    return { status: "error", message: "Match niet gevonden." };
  }

  if (decision === "reject") {
    const { error } = await supabase
      .from("kvk_matches")
      .update({
        resolution: "rejected",
        resolved_kvk_nummer: null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", matchId);
    if (error) {
      return { status: "error", message: "Kon keuze niet opslaan." };
    }
    await updateProcessingStatus(supabase, {
      importRowId: matchRow.import_row_id,
      userId: user.id,
      status: "completed",
    });
    revalidatePath("/dashboard/kvk-review");
    revalidatePath("/dashboard/processing");
    return { status: "success", message: "Gemarkeerd: geen kandidaat klopt." };
  }

  const chosenKvkNummer = String(formData.get("kvkNummer") ?? "");
  const candidates = (matchRow.candidates as KvkMatchCandidate[] | null) ?? [];
  const isValidCandidate = candidates.some((c) => c.kvkNummer === chosenKvkNummer);
  if (!chosenKvkNummer || !isValidCandidate) {
    return { status: "error", message: "Kies een van de getoonde kandidaten." };
  }

  const { error: updateError } = await supabase
    .from("kvk_matches")
    .update({
      resolution: "confirmed",
      resolved_kvk_nummer: chosenKvkNummer,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", matchId);
  if (updateError) {
    return { status: "error", message: "Kon keuze niet opslaan." };
  }

  try {
    const enrichment = await enrichAndStoreKvkData(supabase, {
      kvkNummer: chosenKvkNummer,
      importRowId: matchRow.import_row_id,
      userId: user.id,
    });

    await updateProcessingStatus(supabase, {
      importRowId: matchRow.import_row_id,
      userId: user.id,
      status: enrichment ? "completed" : "failed",
      errorMessage: enrichment
        ? null
        : `KVK-nummer "${chosenKvkNummer}" niet gevonden in het Handelsregister.`,
    });
  } catch (error) {
    await updateProcessingStatus(supabase, {
      importRowId: matchRow.import_row_id,
      userId: user.id,
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "Onbekende fout bij het ophalen van KVK-gegevens.",
    }).catch(() => {});

    revalidatePath("/dashboard/kvk-review");
    revalidatePath("/dashboard/processing");
    return {
      status: "success",
      message:
        "Keuze opgeslagen, maar het ophalen van de volledige KVK-gegevens is niet gelukt. Probeer het later opnieuw vanuit de verrijking.",
    };
  }

  revalidatePath("/dashboard/kvk-review");
  revalidatePath("/dashboard/processing");
  return { status: "success", message: "Match bevestigd en verrijkt met KVK-gegevens." };
}
