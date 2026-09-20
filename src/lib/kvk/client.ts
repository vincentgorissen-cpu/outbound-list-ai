import "server-only";
import { kvkEnv } from "./env";
import type { KvkSearchParams, KvkSearchResponse } from "./types";

export class KvkApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "KvkApiError";
  }
}

interface KvkErrorBody {
  fout?: Array<{ code: string; omschrijving: string }>;
}

/**
 * Foutcode die de KVK-testomgeving teruggeeft wanneer een zoekopdracht
 * geen enkel resultaat oplevert. Komt terug als HTTP 404, niet als een
 * lege lijst met status 200 — geverifieerd tegen de echte testomgeving.
 */
const NO_RESULTS_CODE = "IPD5200";

async function parseErrorBody(response: Response): Promise<KvkErrorBody | null> {
  try {
    return (await response.json()) as KvkErrorBody;
  } catch {
    return null;
  }
}

/**
 * Doet een authenticated GET naar de KVK Zoeken API. Gooit `KvkApiError`
 * voor echte fouten; een zoekopdracht zonder resultaten levert een
 * response met `totaal: 0` op, geen fout.
 */
export async function searchKvk(params: KvkSearchParams): Promise<KvkSearchResponse> {
  const url = new URL(kvkEnv.baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: { apikey: kvkEnv.apiKey },
  });

  if (response.ok) {
    return (await response.json()) as KvkSearchResponse;
  }

  const body = await parseErrorBody(response);
  const firstError = body?.fout?.[0];

  if (response.status === 404 && firstError?.code === NO_RESULTS_CODE) {
    return {
      pagina: params.pagina ?? 1,
      resultatenPerPagina: params.resultatenPerPagina ?? 10,
      totaal: 0,
      resultaten: [],
      links: [],
    };
  }

  throw new KvkApiError(
    firstError?.omschrijving ?? `KVK API gaf een onverwachte status (${response.status}).`,
    response.status,
    firstError?.code,
  );
}
