import { EMPTY_PREFILTER_CONFIG, type IcpPrefilterConfig } from "./types";

/** Ruwe, nog ongevalideerde invoer zoals die uit een HTML-formulier komt. */
export interface PrefilterFormInput {
  excludeInactief: boolean;
  excludeRechtsvormenCsv: string;
  excludeSbiCodePrefixesCsv: string;
  minAantalWerknemers: string;
  maxAantalWerknemers: string;
  allowedProvincies: string[];
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/** Zet formulierinvoer om naar een `IcpPrefilterConfig`. Bevat geen validatie — zie `validatePrefilterConfig`. */
export function buildPrefilterConfigFromInput(input: PrefilterFormInput): IcpPrefilterConfig {
  return {
    ...EMPTY_PREFILTER_CONFIG,
    excludeStatuses: input.excludeInactief ? ["inactief"] : [],
    excludeRechtsvormen: parseCsv(input.excludeRechtsvormenCsv),
    excludeSbiCodePrefixes: parseCsv(input.excludeSbiCodePrefixesCsv),
    minAantalWerknemers: parseOptionalInt(input.minAantalWerknemers),
    maxAantalWerknemers: parseOptionalInt(input.maxAantalWerknemers),
    allowedProvincies: input.allowedProvincies.length > 0 ? input.allowedProvincies : null,
  };
}

/** Geeft een foutmelding terug als de configuratie intern inconsistent is, anders `null`. */
export function validatePrefilterConfig(config: IcpPrefilterConfig): string | null {
  if (
    config.minAantalWerknemers !== null &&
    config.maxAantalWerknemers !== null &&
    config.minAantalWerknemers > config.maxAantalWerknemers
  ) {
    return "Het minimum aantal medewerkers mag niet hoger zijn dan het maximum.";
  }
  return null;
}
