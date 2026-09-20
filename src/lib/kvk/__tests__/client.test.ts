import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KvkApiError, searchKvk } from "@/lib/kvk/client";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.KVK_API_KEY = "test-key";
  process.env.KVK_API_BASE_URL = "https://api.kvk.nl/test/api/v2/zoeken";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function mockFetchOnce(response: { status: number; body: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("searchKvk", () => {
  it("stuurt de apikey-header en de zoekparameters mee", async () => {
    const fetchMock = mockFetchOnce({
      status: 200,
      body: { pagina: 1, resultatenPerPagina: 10, totaal: 0, resultaten: [], links: [] },
    });

    await searchKvk({ naam: "Acme", plaats: "Amsterdam" });

    const [urlArg, initArg] = fetchMock.mock.calls[0];
    expect(String(urlArg)).toContain("naam=Acme");
    expect(String(urlArg)).toContain("plaats=Amsterdam");
    expect(initArg.headers.apikey).toBe("test-key");
  });

  it("laat lege waarden weg uit de querystring", async () => {
    const fetchMock = mockFetchOnce({
      status: 200,
      body: { pagina: 1, resultatenPerPagina: 10, totaal: 0, resultaten: [], links: [] },
    });

    await searchKvk({ naam: "Acme", plaats: undefined, kvkNummer: "" });

    const [urlArg] = fetchMock.mock.calls[0];
    expect(String(urlArg)).not.toContain("plaats=");
    expect(String(urlArg)).not.toContain("kvkNummer=");
  });

  it("geeft totaal:0 en een lege lijst terug bij de KVK 'geen resultaten'-fout (IPD5200)", async () => {
    mockFetchOnce({
      status: 404,
      body: {
        fout: [
          {
            code: "IPD5200",
            omschrijving: "Er zijn geen gegevens gevonden die voldoen aan de opgegeven zoekparameters.",
          },
        ],
      },
    });

    const result = await searchKvk({ naam: "Onbestaand Bedrijf" });

    expect(result.totaal).toBe(0);
    expect(result.resultaten).toEqual([]);
  });

  it("gooit een KvkApiError voor een ongeldige parameter (IPD1999)", async () => {
    mockFetchOnce({
      status: 400,
      body: {
        fout: [{ code: "IPD1999", omschrijving: "De volgende opgegeven parameter(s) is(zijn) ongeldig: [straat]" }],
      },
    });

    await expect(searchKvk({ naam: "Acme" })).rejects.toMatchObject({
      status: 400,
      code: "IPD1999",
    });
  });

  it("gooit een KvkApiError bij een 401 (ontbrekende/foute API-key)", async () => {
    mockFetchOnce({ status: 401, body: null });

    await expect(searchKvk({ naam: "Acme" })).rejects.toBeInstanceOf(KvkApiError);
  });

  it("geeft de daadwerkelijke resultaten door bij een succesvolle response", async () => {
    mockFetchOnce({
      status: 200,
      body: {
        pagina: 1,
        resultatenPerPagina: 10,
        totaal: 1,
        resultaten: [{ kvkNummer: "68750110", naam: "Test BV Donald", type: "rechtspersoon", links: [] }],
        links: [],
      },
    });

    const result = await searchKvk({ kvkNummer: "68750110" });
    expect(result.totaal).toBe(1);
    expect(result.resultaten[0].naam).toBe("Test BV Donald");
  });
});
