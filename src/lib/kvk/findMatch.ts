import "server-only";
import { searchKvk } from "./client";
import type { KvkSearchParams, KvkSearchResponse, KvkSearchResultItem } from "./types";

export interface CompanyToMatch {
  bedrijfsnaam: string | null;
  kvkNummer?: string | null;
  plaats?: string | null;
}

export type KvkMatchStatus =
  /** Eén kandidaat met voldoende zekerheid gevonden. */
  | "matched"
  /** Meerdere kandidaten, geen eenduidige keuze mogelijk zonder verdere logica (bijv. AI). */
  | "multiple_candidates"
  /** Zoekopdracht uitgevoerd, niets gevonden bij de KVK. */
  | "not_found"
  /** Te weinig gegevens (geen bedrijfsnaam) om te kunnen zoeken. */
  | "skipped";

export interface KvkMatchResult {
  status: KvkMatchStatus;
  match: KvkSearchResultItem | null;
  candidates: KvkSearchResultItem[];
}

export type SearchKvkFn = (params: KvkSearchParams) => Promise<KvkSearchResponse>;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Zoekt het meest waarschijnlijke KVK-record voor één geïmporteerd
 * bedrijf, met een strikt deterministische strategie (geen AI):
 *
 * 1. Is er al een kvk_nummer bekend? Dan is dat de bron van waarheid:
 *    rechtstreeks opzoeken en de hoofdvestiging teruggeven.
 * 2. Anders zoeken op bedrijfsnaam (+ plaats, indien bekend).
 *    - Precies één exacte naammatch -> gematcht.
 *    - Precies één resultaat, ook al is de naam niet exact gelijk
 *      (bijv. andere schrijfwijze) -> gematcht.
 *    - Meerdere resultaten zonder eenduidige exacte match -> aan de
 *      gebruiker (of een latere AI-stap) om te kiezen.
 */
export async function findKvkMatch(
  company: CompanyToMatch,
  search: SearchKvkFn = searchKvk,
): Promise<KvkMatchResult> {
  if (company.kvkNummer) {
    const response = await search({ kvkNummer: company.kvkNummer });
    if (response.totaal === 0) {
      return { status: "not_found", match: null, candidates: [] };
    }
    const hoofdvestiging =
      response.resultaten.find((r) => r.type === "hoofdvestiging") ??
      response.resultaten[0];
    return { status: "matched", match: hoofdvestiging, candidates: response.resultaten };
  }

  if (!company.bedrijfsnaam) {
    return { status: "skipped", match: null, candidates: [] };
  }

  const response = await search({
    naam: company.bedrijfsnaam,
    plaats: company.plaats ?? undefined,
  });

  if (response.totaal === 0) {
    return { status: "not_found", match: null, candidates: [] };
  }

  const exactMatches = response.resultaten.filter(
    (r) => normalizeName(r.naam) === normalizeName(company.bedrijfsnaam as string),
  );

  if (exactMatches.length === 1) {
    return { status: "matched", match: exactMatches[0], candidates: response.resultaten };
  }

  if (response.resultaten.length === 1) {
    return { status: "matched", match: response.resultaten[0], candidates: response.resultaten };
  }

  return { status: "multiple_candidates", match: null, candidates: response.resultaten };
}
