import { companyNameSimilarity } from "./companyNameSimilarity";
import { extractDomain, normalizePlaats, normalizePostcode } from "./candidateComparison";
import type { KvkMatchCandidate, KvkMatchInput } from "./types";

export interface CandidateData {
  kvkNummer: string;
  naam: string;
  postcode?: string | null;
  plaats?: string | null;
  websites?: string[];
}

/**
 * Gewicht per dimensie als hij vergelijkbaar is. Bedrijfsnaam is altijd
 * vergelijkbaar (anders kun je niet zoeken); postcode/plaats/website
 * tellen alleen mee als beide kanten een waarde hebben, en de overige
 * gewichten worden dan proportioneel herverdeeld zodat het totaal 100 blijft.
 */
const WEIGHTS = {
  bedrijfsnaam: 45,
  postcode: 25,
  plaats: 15,
  website: 15,
} as const;

/** Vergelijkt één kandidaat met de invoer en geeft een score 0-100 + onderbouwing. */
export function scoreCandidate(input: KvkMatchInput, candidate: CandidateData): KvkMatchCandidate {
  const bedrijfsnaamScore = companyNameSimilarity(input.bedrijfsnaam, candidate.naam);

  let postcodeScore: number | null = null;
  if (input.postcode && candidate.postcode) {
    postcodeScore =
      normalizePostcode(input.postcode) === normalizePostcode(candidate.postcode) ? 100 : 0;
  }

  let plaatsScore: number | null = null;
  if (input.plaats && candidate.plaats) {
    plaatsScore = normalizePlaats(input.plaats) === normalizePlaats(candidate.plaats) ? 100 : 0;
  }

  let websiteScore: number | null = null;
  if (input.website && candidate.websites && candidate.websites.length > 0) {
    const inputDomain = extractDomain(input.website);
    const candidateDomains = candidate.websites
      .map(extractDomain)
      .filter((domain): domain is string => domain !== null);
    if (inputDomain && candidateDomains.length > 0) {
      websiteScore = candidateDomains.includes(inputDomain) ? 100 : 0;
    }
  }

  const parts: Array<{ score: number; weight: number }> = [
    { score: bedrijfsnaamScore, weight: WEIGHTS.bedrijfsnaam },
  ];
  if (postcodeScore !== null) parts.push({ score: postcodeScore, weight: WEIGHTS.postcode });
  if (plaatsScore !== null) parts.push({ score: plaatsScore, weight: WEIGHTS.plaats });
  if (websiteScore !== null) parts.push({ score: websiteScore, weight: WEIGHTS.website });

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const weightedScore =
    parts.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight;

  return {
    kvkNummer: candidate.kvkNummer,
    naam: candidate.naam,
    plaats: candidate.plaats ?? null,
    score: Math.round(weightedScore),
    scoreBreakdown: {
      bedrijfsnaam: bedrijfsnaamScore,
      postcode: postcodeScore,
      plaats: plaatsScore,
      website: websiteScore,
    },
  };
}
