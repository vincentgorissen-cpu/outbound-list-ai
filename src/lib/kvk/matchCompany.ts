import "server-only";
import { getBasisprofiel, getVestigingsprofiel, searchKvk } from "./client";
import { classifyMatchScore } from "./classifyMatchScore";
import { scoreCandidate } from "./scoreCandidate";
import type { KvkMatchCandidate, KvkMatchInput, KvkMatchResult, KvkSearchResultItem } from "./types";

const MAX_CANDIDATES_CONSIDERED = 10;
const MAX_DETAIL_LOOKUPS = 5;

export interface MatchCompanyDeps {
  search?: typeof searchKvk;
  getBasisprofiel?: typeof getBasisprofiel;
  getVestigingsprofiel?: typeof getVestigingsprofiel;
}

const TYPE_PRIORITY: Record<string, number> = {
  hoofdvestiging: 0,
  nevenvestiging: 1,
  rechtspersoon: 2,
};

/**
 * De Zoeken API geeft per bedrijf soms meerdere rijen terug (rechtspersoon
 * + hoofd-/nevenvestiging(en)) met hetzelfde kvkNummer. Voor matching is
 * dat één kandidaat; we houden per kvkNummer de rij met de meeste
 * bruikbare info (adres) aan.
 */
function dedupeByKvkNummer(items: KvkSearchResultItem[]): KvkSearchResultItem[] {
  const byKvkNummer = new Map<string, KvkSearchResultItem>();
  for (const item of items) {
    const existing = byKvkNummer.get(item.kvkNummer);
    if (!existing || (TYPE_PRIORITY[item.type] ?? 99) < (TYPE_PRIORITY[existing.type] ?? 99)) {
      byKvkNummer.set(item.kvkNummer, item);
    }
  }
  return Array.from(byKvkNummer.values());
}

/**
 * Zoekt en scoort kandidaten voor een bedrijf zonder bekend KVK-nummer.
 *
 * Stap 1: zoeken via de Zoeken API op naam (+ plaats, indien bekend).
 * Stap 2: kandidaten scoren op bedrijfsnaam + plaats (al aanwezig in de
 * zoekresultaten van vestigingen). Postcode en website staan niet in de
 * zoekresultaten, dus alleen wanneer de invoer die gegevens heeft halen
 * we voor de meest kansrijke kandidaten (max. 5) het vestigingsprofiel
 * op om die twee velden alsnog te kunnen vergelijken.
 *
 * Kiest NOOIT automatisch het eerste resultaat: alle kandidaten worden
 * gescoord en pas de hoogst scorende wordt als `chosenKvkNummer`
 * teruggegeven, samen met de score en status zodat een lage score nooit
 * als definitief behandeld kan worden door de aanroeper.
 */
export async function matchCompany(
  input: KvkMatchInput,
  deps: MatchCompanyDeps = {},
): Promise<KvkMatchResult> {
  const search = deps.search ?? searchKvk;
  const fetchBasisprofiel = deps.getBasisprofiel ?? getBasisprofiel;
  const fetchVestigingsprofiel = deps.getVestigingsprofiel ?? getVestigingsprofiel;

  const response = await search({
    naam: input.bedrijfsnaam,
    plaats: input.plaats ?? undefined,
  });

  const candidates = dedupeByKvkNummer(response.resultaten).slice(0, MAX_CANDIDATES_CONSIDERED);
  const gecontroleerdOp = new Date().toISOString();

  if (candidates.length === 0) {
    return {
      status: "no_reliable_match",
      chosenKvkNummer: null,
      confidence: null,
      candidates: [],
      gecontroleerdOp,
    };
  }

  const preliminaryScores = candidates.map((candidate) =>
    scoreCandidate(input, {
      kvkNummer: candidate.kvkNummer,
      naam: candidate.naam,
      plaats: candidate.adres?.binnenlandsAdres.plaats ?? null,
    }),
  );

  const needsDetail = Boolean(input.postcode || input.website);
  const finalScores = needsDetail
    ? await scoreWithDetails(input, candidates, preliminaryScores, fetchBasisprofiel, fetchVestigingsprofiel)
    : preliminaryScores;

  const sorted = [...finalScores].sort((a, b) => b.score - a.score);
  const top = sorted[0];

  return {
    status: classifyMatchScore(top.score),
    chosenKvkNummer: top.kvkNummer,
    confidence: top.score,
    candidates: sorted,
    gecontroleerdOp,
  };
}

async function scoreWithDetails(
  input: KvkMatchInput,
  candidates: KvkSearchResultItem[],
  preliminaryScores: KvkMatchCandidate[],
  fetchBasisprofiel: typeof getBasisprofiel,
  fetchVestigingsprofiel: typeof getVestigingsprofiel,
): Promise<KvkMatchCandidate[]> {
  const scoreByKvkNummer = new Map(preliminaryScores.map((s) => [s.kvkNummer, s.score]));
  const priorityOrder = [...candidates].sort(
    (a, b) => (scoreByKvkNummer.get(b.kvkNummer) ?? 0) - (scoreByKvkNummer.get(a.kvkNummer) ?? 0),
  );
  const toLookUp = priorityOrder.slice(0, MAX_DETAIL_LOOKUPS);

  const details = new Map<string, { postcode: string | null; plaats: string | null; websites: string[] }>();

  for (const candidate of toLookUp) {
    let vestigingsnummer = candidate.vestigingsnummer;
    let plaatsFallback = candidate.adres?.binnenlandsAdres.plaats ?? null;

    if (!vestigingsnummer) {
      const basisprofiel = await fetchBasisprofiel(candidate.kvkNummer);
      const hoofdvestiging = basisprofiel?._embedded?.hoofdvestiging;
      vestigingsnummer = hoofdvestiging?.vestigingsnummer;
      const bezoekadres = hoofdvestiging?.adressen?.find((a) => a.type === "bezoekadres");
      plaatsFallback = plaatsFallback ?? bezoekadres?.plaats ?? null;
    }

    if (!vestigingsnummer) continue;

    const vestigingsprofiel = await fetchVestigingsprofiel(vestigingsnummer);
    const bezoekadres = vestigingsprofiel?.adressen?.find((a) => a.type === "bezoekadres");
    details.set(candidate.kvkNummer, {
      postcode: bezoekadres?.postcode ?? null,
      plaats: plaatsFallback ?? bezoekadres?.plaats ?? null,
      websites: vestigingsprofiel?.websites ?? [],
    });
  }

  return candidates.map((candidate) => {
    const detail = details.get(candidate.kvkNummer);
    return scoreCandidate(input, {
      kvkNummer: candidate.kvkNummer,
      naam: candidate.naam,
      postcode: detail?.postcode ?? null,
      plaats: detail?.plaats ?? candidate.adres?.binnenlandsAdres.plaats ?? null,
      websites: detail?.websites ?? [],
    });
  });
}
