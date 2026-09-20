import "server-only";

/**
 * `server-only` laat de build falen zodra dit bestand (dus ook de
 * KVK-API-key) ooit in een client-bundel terecht zou komen.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Ontbrekende environment variable "${name}". Kopieer .env.example naar .env.local en vul de waarde in.`,
    );
  }
  return value;
}

const KVK_HOST = "https://api.kvk.nl";

/**
 * KVK gebruikt exact dezelfde paden voor test en productie, met alleen
 * een "/test" segment ertussen (geverifieerd: .../api/v2/zoeken vs.
 * .../test/api/v2/zoeken). Daarom volstaat één omgevingsvariabele.
 */
function apiRoot(): string {
  const isTest = (process.env.KVK_API_ENVIRONMENT ?? "production").trim().toLowerCase() === "test";
  return isTest ? `${KVK_HOST}/test/api` : `${KVK_HOST}/api`;
}

export const kvkEnv = {
  get apiKey() {
    return requireEnv("KVK_API_KEY");
  },
  get zoekenUrl() {
    return `${apiRoot()}/v2/zoeken`;
  },
  get basisprofielenUrl() {
    return `${apiRoot()}/v1/basisprofielen`;
  },
  get vestigingsprofielenUrl() {
    return `${apiRoot()}/v1/vestigingsprofielen`;
  },
};
