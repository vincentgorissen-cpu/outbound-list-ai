import "server-only";
import { fetchWithRetry } from "@/lib/http/fetchWithRetry";
import { isSameRegistrableDomain, resolveHostSafely, type DnsLookupFn } from "./urlSafety";
import { BOT_USER_AGENT_HEADER, type RobotsRules } from "./robots";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_RESPONSE_BYTES = 3 * 1024 * 1024; // 3 MB

const ALLOWED_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

export type FetchPageOutcome =
  | { status: "accessible"; finalUrl: string; html: string }
  | { status: "dns_failed" }
  | { status: "timeout" }
  | { status: "blocked"; reason: string }
  | { status: "robots_disallowed" }
  | { status: "http_error"; httpStatus: number }
  | { status: "unsupported_site"; reason: string }
  | { status: "failed"; message: string };

export interface FetchPageContext {
  /** Registreerbaar domein (bv. "bedrijf.nl") — elke hop (incl. redirects) moet hierbinnen blijven. */
  allowedDomain: string;
  /** Robots.txt-regels, één keer per website opgehaald en hergebruikt voor elke pagina. */
  robotsRules: RobotsRules;
}

export interface FetchPageDeps {
  fetchImpl?: typeof fetch;
  dnsLookup?: DnsLookupFn;
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
}

async function fetchOnceWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": BOT_USER_AGENT_HEADER,
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Leest de body tot aan `maxBytes`; geeft `null` terug als de limiet wordt overschreden (voorkomt het downloaden van hele grote/onverwachte bestanden). */
async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string | null> {
  const body = response.body;
  if (!body) {
    return await response.text();
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf-8");
}

/**
 * Haalt één pagina veilig op: valideert bij elke hop (ook na een
 * redirect) opnieuw het protocol, het domein en het IP-adres (tegen
 * SSRF/DNS-rebinding), respecteert robots.txt, gebruikt een timeout per
 * poging, beperkt de responsgrootte, accepteert alleen webpagina-achtige
 * content-types, en probeert het bij een pure netwerkfout één keer
 * opnieuw (via de gedeelde `fetchWithRetry`-helper — geen eigen
 * retry-logica). Gooit nooit door: elke uitkomst komt terug als een
 * getypeerd resultaat.
 */
export async function fetchPageSafely(
  targetUrl: URL,
  context: FetchPageContext,
  deps: FetchPageDeps = {},
): Promise<FetchPageOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = deps.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxResponseBytes = deps.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  let currentUrl = targetUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
      return { status: "blocked", reason: "Alleen http/https toegestaan." };
    }

    if (!isSameRegistrableDomain(currentUrl.hostname, context.allowedDomain)) {
      return { status: "blocked", reason: `Verlaat het bedrijfsdomein (${currentUrl.hostname}).` };
    }

    const resolution = await resolveHostSafely(currentUrl.hostname, deps.dnsLookup);
    if (!resolution.ok) {
      return resolution.reason === "dns_failed"
        ? { status: "dns_failed" }
        : { status: "blocked", reason: "Host resolveert naar een intern/privé-adres." };
    }

    if (!context.robotsRules.isAllowed(currentUrl.pathname)) {
      return { status: "robots_disallowed" };
    }

    let response: Response;
    try {
      response = await fetchWithRetry(() => fetchOnceWithTimeout(currentUrl.toString(), fetchImpl, timeoutMs), {
        maxRetries: 1,
        isRetryableStatus: () => false,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { status: "timeout" };
      }
      return { status: "failed", message: error instanceof Error ? error.message : "Onbekende netwerkfout." };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return { status: "http_error", httpStatus: response.status };
      }
      try {
        currentUrl = new URL(location, currentUrl);
      } catch {
        return { status: "failed", message: "Ongeldige redirect-locatie." };
      }
      continue;
    }

    if (!response.ok) {
      return { status: "http_error", httpStatus: response.status };
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.some((allowed) => contentType.includes(allowed))) {
      return { status: "unsupported_site", reason: `Onverwacht content-type: ${contentType || "onbekend"}.` };
    }

    const html = await readBodyWithLimit(response, maxResponseBytes);
    if (html === null) {
      return { status: "unsupported_site", reason: "Pagina overschrijdt de maximale groottelimiet." };
    }

    return { status: "accessible", finalUrl: currentUrl.toString(), html };
  }

  return { status: "failed", message: "Te veel redirects." };
}
