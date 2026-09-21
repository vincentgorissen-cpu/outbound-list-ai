"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { IcpScoringError, scoreCompanyIcpFit } from "@/lib/icp/scoreCompany";
import { storeIcpScore } from "@/lib/icp/storeIcpScore";
import type { CompanyForScoring } from "@/lib/icp/types";

const TEST_BATCH_LIMIT = 10;

export type SaveIcpProfileResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

export async function saveIcpProfile(
  _prevState: SaveIcpProfileResult,
  formData: FormData,
): Promise<SaveIcpProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Je sessie is verlopen. Log opnieuw in." };
  }

  const description = String(formData.get("description") ?? "").trim();
  if (!description) {
    return { status: "error", message: "Beschrijf eerst je ideale klantprofiel." };
  }

  const { error } = await supabase
    .from("icp_profiles")
    .upsert({ user_id: user.id, description }, { onConflict: "user_id" });
  if (error) {
    return { status: "error", message: "Kon het klantprofiel niet opslaan." };
  }

  revalidatePath("/dashboard/icp");
  return { status: "success", message: "Klantprofiel opgeslagen." };
}

export type RunTestScoringResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; scored: number; failed: number };

/**
 * Testmodus: scoort maximaal 10 nog niet gescoorde, al met KVK-gegevens
 * verrijkte bedrijven. Elke poging is eenmalig — een mislukte AI-call
 * wordt vastgelegd als `ai_processing_failed` en er wordt binnen deze
 * aanroep niet opnieuw geprobeerd. Bedrijven zonder KVK-verrijking
 * worden overgeslagen (er is dan te weinig informatie om te scoren).
 */
export async function runTestScoring(
  _prevState: RunTestScoringResult,
  _formData: FormData,
): Promise<RunTestScoringResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Je sessie is verlopen. Log opnieuw in." };
  }

  const { data: profile } = await supabase
    .from("icp_profiles")
    .select("description")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.description) {
    return { status: "error", message: "Stel eerst je ideale klantprofiel in." };
  }

  const { data: alreadyScored } = await supabase
    .from("icp_scores")
    .select("import_row_id")
    .eq("user_id", user.id);
  const scoredIds = new Set((alreadyScored ?? []).map((row) => row.import_row_id));

  const { data: enrichments, error: enrichError } = await supabase
    .from("kvk_enrichments")
    .select("import_row_id, officiele_naam, sbi_omschrijvingen, aantal_werkzame_personen, vestigingsplaats, website")
    .eq("user_id", user.id);
  if (enrichError) {
    return { status: "error", message: "Kon verrijkte bedrijven niet ophalen." };
  }

  const candidates = (enrichments ?? [])
    .filter((row) => !scoredIds.has(row.import_row_id))
    .slice(0, TEST_BATCH_LIMIT);

  if (candidates.length === 0) {
    return {
      status: "error",
      message: "Geen nieuwe, met KVK-gegevens verrijkte bedrijven gevonden om te scoren.",
    };
  }

  let scored = 0;
  let failed = 0;

  for (const enrichment of candidates) {
    const company: CompanyForScoring = {
      bedrijfsnaam: enrichment.officiele_naam,
      sbiOmschrijvingen: (enrichment.sbi_omschrijvingen as string[] | null) ?? [],
      aantalWerkzamePersonen: enrichment.aantal_werkzame_personen,
      plaats: enrichment.vestigingsplaats,
      website: enrichment.website,
    };

    try {
      const result = await scoreCompanyIcpFit(profile.description, company);
      await storeIcpScore(supabase, {
        importRowId: enrichment.import_row_id,
        userId: user.id,
        result: { status: "scored", ...result },
      });
      scored += 1;
    } catch (error) {
      await storeIcpScore(supabase, {
        importRowId: enrichment.import_row_id,
        userId: user.id,
        result: {
          status: "ai_processing_failed",
          errorMessage: error instanceof IcpScoringError ? error.message : "Onbekende fout.",
        },
      });
      failed += 1;
    }
  }

  revalidatePath("/dashboard/icp");
  return { status: "success", scored, failed };
}
