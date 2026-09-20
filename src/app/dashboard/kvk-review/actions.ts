"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { enrichCompanyFromKvk } from "@/lib/kvk/enrichCompany";
import { storeKvkEnrichment } from "@/lib/kvk/storeEnrichment";
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
    revalidatePath("/dashboard/kvk-review");
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
    const enrichment = await enrichCompanyFromKvk(chosenKvkNummer);
    if (enrichment) {
      await storeKvkEnrichment(supabase, {
        importRowId: matchRow.import_row_id,
        userId: user.id,
        enrichment,
      });
    }
  } catch {
    revalidatePath("/dashboard/kvk-review");
    return {
      status: "success",
      message:
        "Keuze opgeslagen, maar het ophalen van de volledige KVK-gegevens is niet gelukt. Probeer het later opnieuw vanuit de verrijking.",
    };
  }

  revalidatePath("/dashboard/kvk-review");
  return { status: "success", message: "Match bevestigd en verrijkt met KVK-gegevens." };
}
