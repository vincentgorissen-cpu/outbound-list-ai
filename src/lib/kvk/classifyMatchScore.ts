import type { KvkMatchStatus } from "./types";

/**
 * 90-100 = high confidence, 70-89 = review required, <70 = no reliable
 * match. Geverifieerd via de vijf scenario's in matchCompany.test.ts.
 */
export function classifyMatchScore(score: number): KvkMatchStatus {
  if (score >= 90) return "high_confidence";
  if (score >= 70) return "review_required";
  return "no_reliable_match";
}
