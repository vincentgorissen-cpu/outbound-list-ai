export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  delay?: (ms: number) => Promise<void>;
  isRetryableStatus?: (status: number) => boolean;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;

function defaultIsRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Voert `fetchOnce` uit met retries (exponentiële backoff) bij een
 * netwerkfout of een tijdelijke serverfout (429/5xx) — precies de
 * fouten die bij een grotere batch tegen de KVK API kunnen optreden.
 * Respecteert een `Retry-After`-header in seconden indien aanwezig.
 * Geeft na de laatste poging altijd het laatste resultaat (of gooit de
 * laatste netwerkfout) terug; de aanroeper blijft verantwoordelijk voor
 * het interpreteren van een definitief mislukte respons (bv. 400/401/404
 * zijn nooit retryable en komen altijd meteen terug).
 */
export async function fetchWithRetry(
  fetchOnce: () => Promise<Response>,
  options: RetryOptions = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const wait = options.delay ?? defaultDelay;
  const isRetryableStatus = options.isRetryableStatus ?? defaultIsRetryableStatus;

  let lastNetworkError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fetchOnce();
    } catch (error) {
      lastNetworkError = error;
      if (attempt === maxRetries) throw error;
      await wait(baseDelayMs * 2 ** attempt);
      continue;
    }

    if (attempt === maxRetries || !isRetryableStatus(response.status)) {
      return response;
    }

    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const delayMs = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1000
      : baseDelayMs * 2 ** attempt;
    await wait(delayMs);
  }

  // Onbereikbaar — de lus retourneert of gooit altijd vóór hier — maar
  // TypeScript kan dat niet afleiden uit de for-lus alleen.
  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error("KVK-aanroep mislukt na meerdere pogingen.");
}
