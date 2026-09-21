"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { IcpScoringError, scoreCompanyIcpFit } from "@/lib/icp/scoreCompany";
import { storeIcpScore } from "@/lib/icp/storeIcpScore";
import { evaluatePrefilter } from "@/lib/icp/prefilter/evaluatePrefilter";
import { parsePrefilterConfig } from "@/lib/icp/prefilter/parseConfig";
import {
  buildPrefilterConfigFromInput,
  validatePrefilterConfig,
} from "@/lib/icp/prefilter/buildConfigFromInput";
import type { IcpPrefilterConfig } from "@/lib/icp/prefilter/types";
import type { CompanyForScoring } from "@/lib/icp/types";
import type { Database, Json, KvkEnrichmentStatus } from "@/lib/types/database.types";

const AI_BATCH_LIMIT = 10;

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

export type SavePrefilterConfigResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

/**
 * Slaat de deterministische voorfilters op naast het bestaande
 * klantprofiel. Vereist dat er al een klantprofiel bestaat (de
 * voorfilters hebben geen zelfstandige betekenis zonder ICP-profiel).
 */
export async function saveIcpPrefilterConfig(
  _prevState: SavePrefilterConfigResult,
  formData: FormData,
): Promise<SavePrefilterConfigResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Je sessie is verlopen. Log opnieuw in." };
  }

  const config = buildPrefilterConfigFromInput({
    excludeInactief: formData.get("excludeInactief") === "on",
    excludeRechtsvormenCsv: String(formData.get("excludeRechtsvormenCsv") ?? ""),
    excludeSbiCodePrefixesCsv: String(formData.get("excludeSbiCodePrefixesCsv") ?? ""),
    minAantalWerknemers: String(formData.get("minAantalWerknemers") ?? ""),
    maxAantalWerknemers: String(formData.get("maxAantalWerknemers") ?? ""),
    allowedProvincies: formData.getAll("allowedProvincies").map(String),
  });

  const validationError = validatePrefilterConfig(config);
  if (validationError) {
    return { status: "error", message: validationError };
  }

  const { data, error } = await supabase
    .from("icp_profiles")
    .update({ prefilter_config: config as unknown as Json })
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return { status: "error", message: "Kon de voorfilters niet opslaan." };
  }
  if (!data || data.length === 0) {
    return { status: "error", message: "Stel eerst je ideale klantprofiel in voordat je voorfilters instelt." };
  }

  revalidatePath("/dashboard/icp");
  return { status: "success", message: "Voorfilters opgeslagen." };
}

interface EnrichmentCandidate {
  import_row_id: string;
  officiele_naam: string;
  rechtsvorm: string | null;
  status: KvkEnrichmentStatus | null;
  sbi_codes: Json;
  sbi_omschrijvingen: Json;
  aantal_werkzame_personen: number | null;
  vestigingsplaats: string | null;
  website: string | null;
}

async function loadProfileAndPrefilterConfig(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<
  | { error: string }
  | { description: string; config: IcpPrefilterConfig }
> {
  const { data: profile } = await supabase
    .from("icp_profiles")
    .select("description, prefilter_config")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile?.description) {
    return { error: "Stel eerst je ideale klantprofiel in." };
  }

  return { description: profile.description, config: parsePrefilterConfig(profile.prefilter_config) };
}

async function loadUnprocessedCandidates(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ error: string } | { candidates: EnrichmentCandidate[] }> {
  const { data: alreadyProcessed } = await supabase
    .from("icp_scores")
    .select("import_row_id")
    .eq("user_id", userId);
  const processedIds = new Set((alreadyProcessed ?? []).map((row) => row.import_row_id));

  const { data: enrichments, error } = await supabase
    .from("kvk_enrichments")
    .select(
      "import_row_id, officiele_naam, rechtsvorm, status, sbi_codes, sbi_omschrijvingen, aantal_werkzame_personen, vestigingsplaats, website",
    )
    .eq("user_id", userId);
  if (error) {
    return { error: "Kon verrijkte bedrijven niet ophalen." };
  }

  return { candidates: (enrichments ?? []).filter((row) => !processedIds.has(row.import_row_id)) };
}

function partitionByPrefilter(config: IcpPrefilterConfig, candidates: EnrichmentCandidate[]) {
  const excluded: { candidate: EnrichmentCandidate; reason: string }[] = [];
  const eligible: EnrichmentCandidate[] = [];

  for (const candidate of candidates) {
    const result = evaluatePrefilter(config, {
      status: candidate.status,
      rechtsvorm: candidate.rechtsvorm,
      sbiCodes: (candidate.sbi_codes as string[] | null) ?? [],
      aantalWerkzamePersonen: candidate.aantal_werkzame_personen,
      plaats: candidate.vestigingsplaats,
    });

    if (result.excluded) {
      excluded.push({ candidate, reason: result.reason });
    } else {
      eligible.push(candidate);
    }
  }

  return { excluded, eligible };
}

export type PreviewIcpScoringResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      totalUnprocessed: number;
      excludedByPrefilter: number;
      eligibleForAi: number;
      willProcessNow: number;
      batchLimit: number;
    };

/**
 * Berekent, zónder iets te wijzigen of een AI-aanroep te doen, hoeveel
 * nog niet verwerkte bedrijven er zijn, hoeveel daarvan door de
 * voorfilters worden uitgesloten en hoeveel er dus daadwerkelijk naar
 * de AI zouden gaan — zodat de gebruiker dit ziet vóórdat er iets
 * wordt gestart.
 */
export async function previewIcpScoring(
  _prevState: PreviewIcpScoringResult,
  _formData: FormData,
): Promise<PreviewIcpScoringResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Je sessie is verlopen. Log opnieuw in." };
  }

  const profileResult = await loadProfileAndPrefilterConfig(supabase, user.id);
  if ("error" in profileResult) {
    return { status: "error", message: profileResult.error };
  }

  const candidatesResult = await loadUnprocessedCandidates(supabase, user.id);
  if ("error" in candidatesResult) {
    return { status: "error", message: candidatesResult.error };
  }

  const { excluded, eligible } = partitionByPrefilter(profileResult.config, candidatesResult.candidates);

  return {
    status: "success",
    totalUnprocessed: candidatesResult.candidates.length,
    excludedByPrefilter: excluded.length,
    eligibleForAi: eligible.length,
    willProcessNow: Math.min(eligible.length, AI_BATCH_LIMIT),
    batchLimit: AI_BATCH_LIMIT,
  };
}

export type RunIcpScoringResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; excluded: number; scored: number; failed: number };

/**
 * Verwerkt nog niet gescoorde, met KVK-gegevens verrijkte bedrijven:
 * bedrijven die de voorfilters niet doorstaan worden meteen (zonder
 * AI-aanroep) vastgelegd als `excluded_by_prefilter`; de rest komt in
 * aanmerking voor AI-scoring, tot maximaal `AI_BATCH_LIMIT` per run.
 * Vereist een expliciete bevestiging (`confirmed=true`) — dit endpoint
 * start nooit zelf een grote batch AI-aanroepen.
 */
export async function runIcpScoring(
  _prevState: RunIcpScoringResult,
  formData: FormData,
): Promise<RunIcpScoringResult> {
  const confirmed = formData.get("confirmed") === "true";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Je sessie is verlopen. Log opnieuw in." };
  }

  const profileResult = await loadProfileAndPrefilterConfig(supabase, user.id);
  if ("error" in profileResult) {
    return { status: "error", message: profileResult.error };
  }

  const candidatesResult = await loadUnprocessedCandidates(supabase, user.id);
  if ("error" in candidatesResult) {
    return { status: "error", message: candidatesResult.error };
  }

  if (candidatesResult.candidates.length === 0) {
    return {
      status: "error",
      message: "Geen nieuwe, met KVK-gegevens verrijkte bedrijven gevonden om te verwerken.",
    };
  }

  const { excluded, eligible } = partitionByPrefilter(profileResult.config, candidatesResult.candidates);

  // Alleen bevestiging vereisen als er ook daadwerkelijk AI-aanroepen
  // gedaan gaan worden — het (kosteloos) vastleggen van deterministische
  // uitsluitingen mag altijd doorgaan, ook zonder bevestiging.
  if (eligible.length > 0 && !confirmed) {
    return {
      status: "error",
      message: "Bevestig eerst hoeveel AI-aanroepen dit kost voordat je AI-scoring start.",
    };
  }

  for (const { candidate, reason } of excluded) {
    await storeIcpScore(supabase, {
      importRowId: candidate.import_row_id,
      userId: user.id,
      result: { status: "excluded_by_prefilter", reason },
    });
  }

  const toScore = eligible.slice(0, AI_BATCH_LIMIT);
  let scored = 0;
  let failed = 0;

  for (const candidate of toScore) {
    const company: CompanyForScoring = {
      bedrijfsnaam: candidate.officiele_naam,
      sbiOmschrijvingen: (candidate.sbi_omschrijvingen as string[] | null) ?? [],
      aantalWerkzamePersonen: candidate.aantal_werkzame_personen,
      plaats: candidate.vestigingsplaats,
      website: candidate.website,
    };

    try {
      const result = await scoreCompanyIcpFit(profileResult.description, company);
      await storeIcpScore(supabase, {
        importRowId: candidate.import_row_id,
        userId: user.id,
        result: { status: "scored", ...result },
      });
      scored += 1;
    } catch (error) {
      await storeIcpScore(supabase, {
        importRowId: candidate.import_row_id,
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
  return { status: "success", excluded: excluded.length, scored, failed };
}
