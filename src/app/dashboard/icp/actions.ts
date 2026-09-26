"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  buildPrefilterConfigFromInput,
  validatePrefilterConfig,
} from "@/lib/icp/prefilter/buildConfigFromInput";
import type { Json } from "@/lib/types/database.types";

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
