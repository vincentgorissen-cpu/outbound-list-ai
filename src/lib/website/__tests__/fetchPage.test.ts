import { describe, expect, it, vi } from "vitest";
import { fetchPageSafely } from "@/lib/website/fetchPage";
import { allowAllRobots, parseRobotsTxt } from "@/lib/website/robots";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const privateLookup = async () => [{ address: "127.0.0.1", family: 4 }];

function htmlResponse(body: string, extraHeaders: Record<string, string> = {}) {
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
            return { done: false, value: new TextEncoder().encode(body) };
          },
          releaseLock: () => {},
          cancel: async () => {},
        };
      },
    },
    text: async () => body,
  } as unknown as Response;
}

function statusResponse(status: number, headers: Record<string, string> = {}) {
  const map = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null },
    body: null,
    text: async () => "",
  } as unknown as Response;
}

function baseContext() {
  return { allowedDomain: "bedrijf.nl", robotsRules: allowAllRobots() };
}

describe("fetchPageSafely", () => {
  it("geeft accessible terug voor een normale HTTPS-pagina", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("<html>hallo</html>"));
    const result = await fetchPageSafely(new URL("https://bedrijf.nl/"), baseContext(), {
      fetchImpl,
      dnsLookup: publicLookup,
    });
    expect(result).toEqual({ status: "accessible", finalUrl: "https://bedrijf.nl/", html: "<html>hallo</html>" });
  });

  it("volgt een redirect en valideert de nieuwe locatie opnieuw", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(301, { location: "https://www.bedrijf.nl/" }))
      .mockResolvedValueOnce(htmlResponse("<html>welkom</html>"));
    const result = await fetchPageSafely(new URL("https://bedrijf.nl/"), baseContext(), {
      fetchImpl,
      dnsLookup: publicLookup,
    });
    expect(result).toEqual({
      status: "accessible",
      finalUrl: "https://www.bedrijf.nl/",
      html: "<html>welkom</html>",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("blokkeert een redirect die het bedrijfsdomein verlaat", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(statusResponse(302, { location: "https://ander-domein.nl/" }));
    const result = await fetchPageSafely(new URL("https://bedrijf.nl/"), baseContext(), {
      fetchImpl,
      dnsLookup: publicLookup,
    });
    expect(result.status).toBe("blocked");
  });

  it("geeft http_error terug bij een 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(statusResponse(404));
    const result = await fetchPageSafely(new URL("https://bedrijf.nl/onbestaand"), baseContext(), {
      fetchImpl,
      dnsLookup: publicLookup,
    });
    expect(result).toEqual({ status: "http_error", httpStatus: 404 });
  });

  it("geeft http_error terug bij een 403 (site blokkeert bots)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(statusResponse(403));
    const result = await fetchPageSafely(new URL("https://bedrijf.nl/"), baseContext(), {
      fetchImpl,
      dnsLookup: publicLookup,
    });
    expect(result).toEqual({ status: "http_error", httpStatus: 403 });
  });

  it("geeft timeout terug wanneer de aanvraag wordt afgebroken", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    });
    const result = await fetchPageSafely(new URL("https://bedrijf.nl/"), baseContext(), {
      fetchImpl,
      dnsLookup: publicLookup,
      timeoutMs: 10,
    });
    expect(result).toEqual({ status: "timeout" });
  });

  it("geeft dns_failed terug voor een niet-bestaand domein", async () => {
    const fetchImpl = vi.fn();
    const dnsLookup = async () => {
      throw new Error("ENOTFOUND");
    };
    const result = await fetchPageSafely(new URL("https://bestaat-niet.voorbeeld/"), {
      allowedDomain: "bestaat-niet.voorbeeld",
      robotsRules: allowAllRobots(),
    }, { fetchImpl, dnsLookup });
    expect(result).toEqual({ status: "dns_failed" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blokkeert een host die naar een privé/intern adres resolvet (SSRF)", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchPageSafely(new URL("https://bedrijf.nl/"), baseContext(), {
      fetchImpl,
      dnsLookup: privateLookup,
    });
    expect(result.status).toBe("blocked");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("respecteert een robots.txt-blokkade zonder de pagina op te halen", async () => {
    const fetchImpl = vi.fn();
    const robotsRules = parseRobotsTxt("User-agent: *\nDisallow: /prive");
    const result = await fetchPageSafely(
      new URL("https://bedrijf.nl/prive"),
      { allowedDomain: "bedrijf.nl", robotsRules },
      { fetchImpl, dnsLookup: publicLookup },
    );
    expect(result).toEqual({ status: "robots_disallowed" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("wijst een niet-webpagina content-type af (unsupported_site)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/pdf" : null) },
      body: null,
      text: async () => "",
    });
    const result = await fetchPageSafely(new URL("https://bedrijf.nl/brochure.pdf"), baseContext(), {
      fetchImpl,
      dnsLookup: publicLookup,
    });
    expect(result.status).toBe("unsupported_site");
  });

  it("wijst een respons af die de maximale grootte overschrijdt", async () => {
    const bigChunk = new Uint8Array(10);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "text/html" : null) },
      body: {
        getReader: () => {
          let read = false;
          return {
            read: async () => {
              if (read) return { done: true, value: undefined };
              read = true;
              return { done: false, value: bigChunk };
            },
            releaseLock: () => {},
            cancel: async () => {},
          };
        },
      },
    });
    const result = await fetchPageSafely(new URL("https://bedrijf.nl/"), baseContext(), {
      fetchImpl,
      dnsLookup: publicLookup,
      maxResponseBytes: 5,
    });
    expect(result.status).toBe("unsupported_site");
  });

  it("geeft failed terug bij te veel redirects", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(statusResponse(302, { location: `${url}x` })),
    );
    const result = await fetchPageSafely(new URL("https://bedrijf.nl/"), baseContext(), {
      fetchImpl,
      dnsLookup: publicLookup,
      maxRedirects: 2,
    });
    expect(result).toEqual({ status: "failed", message: "Te veel redirects." });
  });

  it("probeert het na een netwerkfout één keer opnieuw en slaagt alsnog", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(htmlResponse("<html>ok</html>"));
    const result = await fetchPageSafely(new URL("https://bedrijf.nl/"), baseContext(), {
      fetchImpl,
      dnsLookup: publicLookup,
    });
    expect(result.status).toBe("accessible");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
