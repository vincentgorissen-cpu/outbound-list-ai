import type { Json, KvkEnrichmentStatus } from "@/lib/types/database.types";
import { EMPTY_PREFILTER_CONFIG, type IcpPrefilterConfig } from "./types";

const KNOWN_STATUSES: readonly KvkEnrichmentStatus[] = ["actief", "inactief"];

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Parseert de ruwe JSON uit `icp_profiles.prefilter_config` defensief.
 * Een lege, ontbrekende of onherkenbare waarde levert altijd de veilige
 * lege configuratie op (niets wordt uitgesloten) — een corrupte of
 * verouderde configuratie mag nooit per ongeluk bedrijven uitsluiten.
 */
export function parsePrefilterConfig(raw: Json | null | undefined): IcpPrefilterConfig {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return EMPTY_PREFILTER_CONFIG;
  }

  const value = raw as Record<string, unknown>;

  const excludeStatuses = toStringArray(value.excludeStatuses).filter(
    (status): status is KvkEnrichmentStatus =>
      (KNOWN_STATUSES as string[]).includes(status),
  );

  const allowedProvinciesRaw = toStringArray(value.allowedProvincies);

  return {
    excludeStatuses,
    excludeRechtsvormen: toStringArray(value.excludeRechtsvormen),
    excludeSbiCodePrefixes: toStringArray(value.excludeSbiCodePrefixes),
    minAantalWerknemers: toOptionalNumber(value.minAantalWerknemers),
    maxAantalWerknemers: toOptionalNumber(value.maxAantalWerknemers),
    allowedProvincies: allowedProvinciesRaw.length > 0 ? allowedProvinciesRaw : null,
  };
}
