import "server-only";
import { mapWithConcurrencyLimit } from "@/lib/processing/concurrency";
import type { WebsiteStatus } from "@/lib/types/database.types";
import { fetchPageSafely, type FetchPageOutcome } from "./fetchPage";
import { discoverCandidateLinks, prioritizeLinks } from "./extractLinks";
import { extractReadableText, hasSufficientContent } from "./extractContent";
import { fetchRobotsTxt } from "./robots";
import { getRegistrableDomain, normalizeWebsiteUrl, type DnsLookupFn } from "./urlSafety";

/** Homepage + maximaal 4 andere pagina's = 5 in totaal per website. */
const MAX_PAGES_PER_WEBSITE = 5;
/** Beperkte gelijktijdigheid ván de sub-pagina's van één website (naast de al bestaande limiet op het aantal gelijktijdige bedrijven in de batch). */
const SUB_PAGE_CONCURRENCY = 2;

export interface WebsiteIntelligenceResult {
  status: WebsiteStatus;
  normalizedUrl: string | null;
  checkedAt: string;
  fetchedPageUrls: string[];
  rawExtractedText: string;
  /** 0.0-1.0: ruwe indicatie van hoe compleet deze verrijking is (aantal geslaagde pagina's), niet de AI's eigen oordeel. */
  sourceConfidence: number;
  errorMessage: string | null;
}

export interface WebsiteIntelligenceDeps {
  fetchImpl?: typeof fetch;
  dnsLookup?: DnsLookupFn;
  timeoutMs?: number;
  maxPages?: number;
}

function emptyResult(
  status: WebsiteStatus,
  normalizedUrl: string | null,
  checkedAt: string,
  errorMessage: string | null = null,
): WebsiteIntelligenceResult {
  return { status, normalizedUrl, checkedAt, fetchedPageUrls: [], rawExtractedText: "", sourceConfidence: 0, errorMessage };
}

type NonAccessibleOutcome = Exclude<FetchPageOutcome, { status: "accessible" }>;

function describeOutcome(outcome: NonAccessibleOutcome): string | null {
  switch (outcome.status) {
    case "http_error":
      return `Website gaf HTTP-status ${outcome.httpStatus} terug.`;
    case "blocked":
      return outcome.reason;
    case "unsupported_site":
      return outcome.reason;
    case "failed":
      return outcome.message;
    case "dns_failed":
      return "Domein kon niet worden opgelost (bestaat mogelijk niet (meer)).";
    case "timeout":
      return "Website reageerde niet binnen de tijdslimiet.";
    case "robots_disallowed":
      return "robots.txt van deze website verbiedt geautomatiseerd bezoek.";
  }
}

/**
 * WebsiteIntelligenceService: haalt op een veilige manier openbare
 * bedrijfsinformatie op van de website van een bedrijf (indien bekend).
 *
 * Volgorde: homepage ophalen (met alle SSRF-/robots-/timeout-/
 * groottebeveiliging uit `fetchPage.ts`) → interne links zoeken naar
 * "over ons"/"diensten"/"sectoren"/"locaties"-achtige pagina's → tot
 * maximaal 5 pagina's in totaal ophalen → platte tekst extraheren en
 * samenvoegen. Een falende sub-pagina stopt de rest niet; alleen als de
 * homepage zelf niet toegankelijk is, of de totale opgehaalde tekst te
 * dun is, resulteert dit in een niet-succesvolle status.
 *
 * Doet zelf geen AI-aanroep en vult geen semantische velden
 * (company_description, products_services, ...) — dat is een latere,
 * aparte stap die de hier verzamelde ruwe tekst als invoer gebruikt.
 */
export async function analyzeWebsite(
  websiteUrlInput: string | null | undefined,
  deps: WebsiteIntelligenceDeps = {},
): Promise<WebsiteIntelligenceResult> {
  const checkedAt = new Date().toISOString();
  const maxPages = deps.maxPages ?? MAX_PAGES_PER_WEBSITE;

  if (!websiteUrlInput || !websiteUrlInput.trim()) {
    return emptyResult("no_url", null, checkedAt);
  }

  const url = normalizeWebsiteUrl(websiteUrlInput);
  if (!url) {
    return emptyResult("failed", null, checkedAt, "Ongeldige website-URL, kon niet worden verwerkt.");
  }

  const allowedDomain = getRegistrableDomain(url.hostname);
  const robotsRules = await fetchRobotsTxt(url.origin, {
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs,
  });
  const pageContext = { allowedDomain, robotsRules };
  const pageDeps = { fetchImpl: deps.fetchImpl, dnsLookup: deps.dnsLookup, timeoutMs: deps.timeoutMs };

  const homepageOutcome = await fetchPageSafely(url, pageContext, pageDeps);

  if (homepageOutcome.status !== "accessible") {
    return emptyResult(homepageOutcome.status, url.toString(), checkedAt, describeOutcome(homepageOutcome));
  }

  const fetchedPages: { url: string; text: string }[] = [
    { url: homepageOutcome.finalUrl, text: extractReadableText(homepageOutcome.html) },
  ];

  const candidateLinks = prioritizeLinks(
    discoverCandidateLinks(homepageOutcome.html, homepageOutcome.finalUrl, allowedDomain),
    Math.max(0, maxPages - 1),
  );

  if (candidateLinks.length > 0) {
    const subPageResults = await mapWithConcurrencyLimit(candidateLinks, SUB_PAGE_CONCURRENCY, async (link) => {
      let targetUrl: URL;
      try {
        targetUrl = new URL(link.url);
      } catch {
        return null;
      }
      const outcome = await fetchPageSafely(targetUrl, pageContext, pageDeps);
      // Een mislukte sub-pagina (welke reden dan ook) wordt overgeslagen —
      // alleen de homepage-fout hierboven is fataal voor de hele website.
      return outcome.status === "accessible" ? { url: outcome.finalUrl, text: extractReadableText(outcome.html) } : null;
    });

    for (const page of subPageResults) {
      if (page) fetchedPages.push(page);
    }
  }

  const rawExtractedText = fetchedPages
    .map((page) => page.text)
    .filter((text) => text.length > 0)
    .join("\n\n");

  if (!hasSufficientContent(rawExtractedText)) {
    return {
      status: "insufficient_content",
      normalizedUrl: url.toString(),
      checkedAt,
      fetchedPageUrls: fetchedPages.map((page) => page.url),
      rawExtractedText,
      sourceConfidence: 0,
      errorMessage: "Te weinig tekstuele inhoud gevonden (mogelijk een sterk JavaScript-afhankelijke website).",
    };
  }

  return {
    status: "accessible",
    normalizedUrl: url.toString(),
    checkedAt,
    fetchedPageUrls: fetchedPages.map((page) => page.url),
    rawExtractedText,
    sourceConfidence: Math.min(1, fetchedPages.length / 3),
    errorMessage: null,
  };
}
