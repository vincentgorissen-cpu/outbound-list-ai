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

const DEFAULT_BASE_URL = "https://api.kvk.nl/api/v2/zoeken";

export const kvkEnv = {
  get apiKey() {
    return requireEnv("KVK_API_KEY");
  },
  /**
   * Standaard de productie-endpoint. Zet KVK_API_BASE_URL op
   * https://api.kvk.nl/test/api/v2/zoeken om tegen de KVK-testomgeving
   * te draaien (werkt met de door KVK gepubliceerde vaste test-key).
   */
  get baseUrl() {
    return process.env.KVK_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
  },
};
