import { describe, expect, it, vi } from "vitest";
import { analyzeWebsite } from "@/lib/website/websiteIntelligenceService";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function htmlBody(text: string, extraHeaders: Record<string, string> = {}) {
  const headers = new Map(Object.entries({ "content-type": "text/html; charset=utf-8", ...extraHeaders }));
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    body: {
      getReader: () => {
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true, value: undefined };
            read = true;
            return { done: false, value: new TextEncoder().encode(text) };
          },
          releaseLock: () => {},
          cancel: async () => {},
        };
      },
    },
    text: async () => text,
  } as unknown as Response;
}

function statusOnly(status: number, headers: Record<string, string> = {}) {
  const map = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null },
    body: null,
    text: async () => "",
  } as unknown as Response;
}

const ROBOTS_ALLOW_ALL = { ok: true, status: 200, headers: { get: () => null }, body: null, text: async () => "" } as unknown as Response;

function buildHomepage(bodyContent: string) {
  return `<html><body>${bodyContent}</body></html>`;
}

/** Bouwt een fetch-mock die requests routeert op basis van het exacte URL-pad. */
function routedFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const handler = routes[url];
    if (!handler) {
      throw new Error(`Onverwachte fetch naar ${url} in test`);
    }
    return handler();
  });
}

const GOOD_CONTENT = "Wij zijn een machinebouwer gespecialiseerd in food-productielijnen. ".repeat(4);

describe("analyzeWebsite", () => {
  it("geeft no_url terug zonder enige netwerkaanroep als er geen URL is", async () => {
    const fetchImpl = vi.fn();
    const result = await analyzeWebsite(null, { fetchImpl });
    expect(result.status).toBe("no_url");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("verwerkt een correcte HTTPS-website en vindt een 'over ons'-pagina", async () => {
    const fetchImpl = routedFetch({
      "https://bedrijf.nl/robots.txt": () => ROBOTS_ALLOW_ALL,
      "https://bedrijf.nl/": () => htmlBody(buildHomepage(`<p>${GOOD_CONTENT}</p><a href="/over-ons">Over ons</a>`)),
      "https://bedrijf.nl/over-ons": () => htmlBody(buildHomepage(`<p>${GOOD_CONTENT} Opgericht in 2001.</p>`)),
    });

    const result = await analyzeWebsite("https://bedrijf.nl", { fetchImpl, dnsLookup: publicLookup });

    expect(result.status).toBe("accessible");
    expect(result.pages.map((p) => p.pageUrl)).toEqual(["https://bedrijf.nl/", "https://bedrijf.nl/over-ons"]);
    expect(result.pages.map((p) => p.pageType)).toEqual(["homepage", "about"]);
    expect(result.pages.every((p) => p.characterCount === p.cleanedText.length)).toBe(true);
    expect(result.pages.every((p) => p.extractedAt === result.checkedAt)).toBe(true);
    expect(result.combinedCleanedText).toContain("machinebouwer");
    expect(result.combinedCleanedText).toContain("Opgericht in 2001");
  });

  it("voegt https:// toe wanneer de invoer geen protocol heeft", async () => {
    const fetchImpl = routedFetch({
      "https://bedrijf.nl/robots.txt": () => ROBOTS_ALLOW_ALL,
      "https://bedrijf.nl/": () => htmlBody(buildHomepage(`<p>${GOOD_CONTENT}</p>`)),
    });

    const result = await analyzeWebsite("bedrijf.nl", { fetchImpl, dnsLookup: publicLookup });

    expect(result.status).toBe("accessible");
    expect(result.normalizedUrl).toBe("https://bedrijf.nl/");
  });

  it("volgt een redirect naar het uiteindelijke adres", async () => {
    const fetchImpl = routedFetch({
      "https://bedrijf.nl/robots.txt": () => ROBOTS_ALLOW_ALL,
      "https://bedrijf.nl/": () => statusOnly(301, { location: "https://www.bedrijf.nl/" }),
      "https://www.bedrijf.nl/": () => htmlBody(buildHomepage(`<p>${GOOD_CONTENT}</p>`)),
    });

    const result = await analyzeWebsite("https://bedrijf.nl", { fetchImpl, dnsLookup: publicLookup });

    expect(result.status).toBe("accessible");
    expect(result.pages.map((p) => p.pageUrl)).toEqual(["https://www.bedrijf.nl/"]);
  });

  it("geeft http_error terug bij een 404 op de homepage", async () => {
    const fetchImpl = routedFetch({
      "https://bedrijf.nl/robots.txt": () => ROBOTS_ALLOW_ALL,
      "https://bedrijf.nl/": () => statusOnly(404),
    });

    const result = await analyzeWebsite("https://bedrijf.nl", { fetchImpl, dnsLookup: publicLookup });

    expect(result.status).toBe("http_error");
    expect(result.errorMessage).toContain("404");
  });

  it("geeft http_error terug bij een 403 (site blokkeert bots)", async () => {
    const fetchImpl = routedFetch({
      "https://bedrijf.nl/robots.txt": () => ROBOTS_ALLOW_ALL,
      "https://bedrijf.nl/": () => statusOnly(403),
    });

    const result = await analyzeWebsite("https://bedrijf.nl", { fetchImpl, dnsLookup: publicLookup });

    expect(result.status).toBe("http_error");
    expect(result.errorMessage).toContain("403");
  });

  it("geeft timeout terug wanneer de homepage niet op tijd reageert", async () => {
    const fetchImpl = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return Promise.resolve(ROBOTS_ALLOW_ALL);
      const error = new Error("aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    });

    const result = await analyzeWebsite("https://bedrijf.nl", {
      fetchImpl,
      dnsLookup: publicLookup,
      timeoutMs: 10,
    });

    expect(result.status).toBe("timeout");
  });

  it("geeft dns_failed terug voor een niet-bestaand domein", async () => {
    const fetchImpl = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/robots.txt")) return Promise.resolve(ROBOTS_ALLOW_ALL);
      throw new Error("moet niet aangeroepen worden");
    });
    const dnsLookup = async () => {
      throw new Error("ENOTFOUND");
    };

    const result = await analyzeWebsite("https://bestaat-niet.voorbeeld", { fetchImpl, dnsLookup });

    expect(result.status).toBe("dns_failed");
  });

  it("respecteert een robots.txt-blokkade en haalt de homepage niet op", async () => {
    const homepageFetch = vi.fn();
    const fetchImpl = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return { ok: true, status: 200, headers: { get: () => null }, body: null, text: async () => "User-agent: *\nDisallow: /" };
      }
      return homepageFetch(url);
    });

    const result = await analyzeWebsite("https://bedrijf.nl", { fetchImpl, dnsLookup: publicLookup });

    expect(result.status).toBe("robots_disallowed");
    expect(homepageFetch).not.toHaveBeenCalled();
  });

  it("geeft insufficient_content terug voor een lege pagina", async () => {
    const fetchImpl = routedFetch({
      "https://bedrijf.nl/robots.txt": () => ROBOTS_ALLOW_ALL,
      "https://bedrijf.nl/": () => htmlBody(buildHomepage("")),
    });

    const result = await analyzeWebsite("https://bedrijf.nl", { fetchImpl, dnsLookup: publicLookup });

    expect(result.status).toBe("insufficient_content");
  });

  it("geeft insufficient_content terug voor een JavaScript-heavy site zonder server-side tekst", async () => {
    const fetchImpl = routedFetch({
      "https://bedrijf.nl/robots.txt": () => ROBOTS_ALLOW_ALL,
      "https://bedrijf.nl/": () =>
        htmlBody(`<html><body><div id="root"></div><script src="/bundle.js"></script></body></html>`),
    });

    const result = await analyzeWebsite("https://bedrijf.nl", { fetchImpl, dnsLookup: publicLookup });

    expect(result.status).toBe("insufficient_content");
    expect(result.pages.map((p) => p.pageUrl)).toEqual(["https://bedrijf.nl/"]);
  });

  it("haalt bij zeer veel interne links nooit meer dan het maximum aantal pagina's op", async () => {
    const manyLinks = Array.from({ length: 200 }, (_, i) => `<a href="/product/${i}">Product ${i}</a>`).join("");
    const homepageHtml = buildHomepage(
      `<p>${GOOD_CONTENT}</p>${manyLinks}<a href="/over-ons">Over ons</a><a href="/diensten">Diensten</a><a href="/sectoren">Sectoren</a><a href="/locaties">Locaties</a>`,
    );

    const fetchImpl = routedFetch({
      "https://bedrijf.nl/robots.txt": () => ROBOTS_ALLOW_ALL,
      "https://bedrijf.nl/": () => htmlBody(homepageHtml),
      "https://bedrijf.nl/over-ons": () => htmlBody(buildHomepage(`<p>${GOOD_CONTENT}</p>`)),
      "https://bedrijf.nl/diensten": () => htmlBody(buildHomepage(`<p>${GOOD_CONTENT}</p>`)),
      "https://bedrijf.nl/sectoren": () => htmlBody(buildHomepage(`<p>${GOOD_CONTENT}</p>`)),
      "https://bedrijf.nl/locaties": () => htmlBody(buildHomepage(`<p>${GOOD_CONTENT}</p>`)),
    });

    const result = await analyzeWebsite("https://bedrijf.nl", { fetchImpl, dnsLookup: publicLookup });

    expect(result.status).toBe("accessible");
    // Homepage + maximaal 4 andere pagina's = 5 in totaal, ondanks 200+ links op de homepage.
    expect(result.pages).toHaveLength(5);
    // robots.txt + homepage + 4 sub-pagina's = 6 fetch-aanroepen, nooit 200+.
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("laat een mislukte sub-pagina de rest van de website niet blokkeren", async () => {
    const fetchImpl = routedFetch({
      "https://bedrijf.nl/robots.txt": () => ROBOTS_ALLOW_ALL,
      "https://bedrijf.nl/": () =>
        htmlBody(buildHomepage(`<p>${GOOD_CONTENT}</p><a href="/over-ons">Over ons</a><a href="/diensten">Diensten</a>`)),
      "https://bedrijf.nl/over-ons": () => statusOnly(500),
      "https://bedrijf.nl/diensten": () => htmlBody(buildHomepage(`<p>${GOOD_CONTENT}</p>`)),
    });

    const result = await analyzeWebsite("https://bedrijf.nl", { fetchImpl, dnsLookup: publicLookup });

    expect(result.status).toBe("accessible");
    expect(result.pages.map((p) => p.pageUrl)).toEqual(["https://bedrijf.nl/", "https://bedrijf.nl/diensten"]);
  });

  it("dedupliceert een herhaalde slogan over pagina's heen en verwijdert persoonsgegevens", async () => {
    const slogan = "Dé specialist in machinebouw sinds 1990.";
    const fetchImpl = routedFetch({
      "https://bedrijf.nl/robots.txt": () => ROBOTS_ALLOW_ALL,
      "https://bedrijf.nl/": () =>
        htmlBody(
          buildHomepage(
            `<p>${slogan}</p><p>${GOOD_CONTENT}</p><a href="/over-ons">Over ons</a>`,
          ),
        ),
      "https://bedrijf.nl/over-ons": () =>
        htmlBody(
          buildHomepage(
            `<p>${slogan}</p><p>Neem contact op met dhr. Jan Jansen via 06-12345678 of jan@bedrijf.nl.</p>`,
          ),
        ),
    });

    const result = await analyzeWebsite("https://bedrijf.nl", { fetchImpl, dnsLookup: publicLookup });

    expect(result.status).toBe("accessible");
    const sloganOccurrences = result.combinedCleanedText.split(slogan).length - 1;
    expect(sloganOccurrences).toBe(1);
    expect(result.combinedCleanedText).not.toContain("Jan Jansen");
    expect(result.combinedCleanedText).not.toContain("06-12345678");
    expect(result.combinedCleanedText).not.toContain("jan@bedrijf.nl");
  });
});
