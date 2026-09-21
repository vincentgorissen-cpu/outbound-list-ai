import type { KvkEnrichmentStatus } from "@/lib/types/database.types";

/**
 * Deterministische uitsluitingsregels, per gebruiker configureerbaar,
 * die vóór een AI-aanroep worden toegepast. Elk veld is bewust een
 * losstaand, op zichzelf staand criterium zodat er later criteria bij
 * kunnen zonder de bestaande te raken. Een leeg/null veld betekent
 * altijd: geen beperking op dat criterium (fail-open bij twijfel of
 * ontbrekende data — nooit een bedrijf gokkend uitsluiten).
 */
export interface IcpPrefilterConfig {
  /** Sluit bedrijven met deze KVK-status uit (bv. inactieve bedrijven). */
  excludeStatuses: KvkEnrichmentStatus[];
  /** Sluit bedrijven met (een van) deze rechtsvormen uit. Vrije tekst, exacte match, hoofdletterongevoelig. */
  excludeRechtsvormen: string[];
  /** Sluit bedrijven uit met minstens één SBI-code die met één van deze prefixes begint. */
  excludeSbiCodePrefixes: string[];
  /** Minimaal aantal werkzame personen; null = geen ondergrens. */
  minAantalWerknemers: number | null;
  /** Maximaal aantal werkzame personen; null = geen bovengrens. */
  maxAantalWerknemers: number | null;
  /** Alleen bedrijven in deze provincies komen in aanmerking; null/leeg = geen beperking. */
  allowedProvincies: string[] | null;
}

/** Veilige standaardconfiguratie: sluit niets uit. */
export const EMPTY_PREFILTER_CONFIG: IcpPrefilterConfig = {
  excludeStatuses: [],
  excludeRechtsvormen: [],
  excludeSbiCodePrefixes: [],
  minAantalWerknemers: null,
  maxAantalWerknemers: null,
  allowedProvincies: null,
};

/** Bedrijfsgegevens die nodig zijn om de voorfilters te evalueren. */
export interface PrefilterCompanyInput {
  status: KvkEnrichmentStatus | null;
  rechtsvorm: string | null;
  sbiCodes: string[];
  aantalWerkzamePersonen: number | null;
  plaats: string | null;
}

export type PrefilterResult = { excluded: false } | { excluded: true; reason: string };
