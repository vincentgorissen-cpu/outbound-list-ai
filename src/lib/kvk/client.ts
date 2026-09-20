import "server-only";
import { kvkEnv } from "./env";
import type {
  KvkBasisprofiel,
  KvkSearchParams,
  KvkSearchResponse,
  KvkVestigingsprofiel,
} from "./types";

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

async function kvkGet(url: URL): Promise<Response> {
  return fetch(url, { headers: { apikey: kvkEnv.apiKey } });
}

/**
 * Doet een authenticated GET naar de KVK Zoeken API. Gooit `KvkApiError`
 * voor echte fouten; een zoekopdracht zonder resultaten levert een
 * response met `totaal: 0` op, geen fout.
 */
export async function searchKvk(params: KvkSearchParams): Promise<KvkSearchResponse> {
  const url = new URL(kvkEnv.zoekenUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await kvkGet(url);

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

/**
 * Haalt het basisprofiel op voor een KVK-nummer. Geeft `null` terug als
 * er voor dit nummer geen profiel bestaat (HTTP 404 — geverifieerd met
 * foutcode IPD0005 in de testomgeving); gooit `KvkApiError` voor andere
 * fouten (bijv. 401 bij een ongeldige key).
 */
export async function getBasisprofiel(kvkNummer: string): Promise<KvkBasisprofiel | null> {
  const url = new URL(`${kvkEnv.basisprofielenUrl}/${encodeURIComponent(kvkNummer)}`);
  const response = await kvkGet(url);

  if (response.ok) {
    return (await response.json()) as KvkBasisprofiel;
  }
  if (response.status === 404) {
    return null;
  }

  const body = await parseErrorBody(response);
  const firstError = body?.fout?.[0];
  throw new KvkApiError(
    firstError?.omschrijving ?? `KVK API gaf een onverwachte status (${response.status}).`,
    response.status,
    firstError?.code,
  );
}

/**
 * Haalt het vestigingsprofiel op voor een vestigingsnummer (o.a. voor
 * het website-veld, dat niet in het basisprofiel zit). Geeft `null`
 * terug als het vestigingsnummer niet bestaat (HTTP 404, foutcode
 * IPD0007 in de testomgeving).
 */
export async function getVestigingsprofiel(
  vestigingsnummer: string,
): Promise<KvkVestigingsprofiel | null> {
  const url = new URL(
    `${kvkEnv.vestigingsprofielenUrl}/${encodeURIComponent(vestigingsnummer)}`,
  );
  const response = await kvkGet(url);

  if (response.ok) {
    return (await response.json()) as KvkVestigingsprofiel;
  }
  if (response.status === 404) {
    return null;
  }

  const body = await parseErrorBody(response);
  const firstError = body?.fout?.[0];
  throw new KvkApiError(
    firstError?.omschrijving ?? `KVK API gaf een onverwachte status (${response.status}).`,
    response.status,
    firstError?.code,
  );
}
