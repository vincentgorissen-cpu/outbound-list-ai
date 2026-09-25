import { describe, expect, it } from "vitest";
import {
  getRegistrableDomain,
  isPrivateOrReservedIp,
  isSameRegistrableDomain,
  normalizeWebsiteUrl,
  resolveHostSafely,
} from "@/lib/website/urlSafety";

describe("normalizeWebsiteUrl", () => {
  it("voegt https:// toe wanneer geen protocol is opgegeven", () => {
    const url = normalizeWebsiteUrl("www.bedrijf.nl");
    expect(url?.toString()).toBe("https://www.bedrijf.nl/");
  });

  it("laat een expliciet http:// protocol ongemoeid", () => {
    const url = normalizeWebsiteUrl("http://bedrijf.nl");
    expect(url?.protocol).toBe("http:");
  });

  it("trimt omringende spaties", () => {
    const url = normalizeWebsiteUrl("  bedrijf.nl  ");
    expect(url?.hostname).toBe("bedrijf.nl");
  });

  it("geeft null terug voor lege of ontbrekende invoer", () => {
    expect(normalizeWebsiteUrl("")).toBeNull();
    expect(normalizeWebsiteUrl("   ")).toBeNull();
    expect(normalizeWebsiteUrl(null)).toBeNull();
    expect(normalizeWebsiteUrl(undefined)).toBeNull();
  });

  it("wijst niet-http(s)-protocollen af (file, javascript, ftp)", () => {
    expect(normalizeWebsiteUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeWebsiteUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsiteUrl("ftp://bedrijf.nl")).toBeNull();
  });

  it("geeft null terug voor een onherstelbaar ongeldige URL, zonder te gokken", () => {
    expect(normalizeWebsiteUrl("http://")).toBeNull();
    expect(normalizeWebsiteUrl("::::")).toBeNull();
  });
});

describe("isPrivateOrReservedIp", () => {
  it("blokkeert localhost (127.0.0.1) en loopback IPv6 (::1)", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::1")).toBe(true);
  });

  it("blokkeert private IPv4-ranges (10.x, 172.16-31.x, 192.168.x)", () => {
    expect(isPrivateOrReservedIp("10.0.0.5")).toBe(true);
    expect(isPrivateOrReservedIp("172.16.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("172.31.255.255")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
  });

  it("blokkeert link-local (169.254.x, incl. het cloud metadata-adres)", () => {
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
  });

  it("blokkeert IPv6 unique-local (fc00::/7) en link-local (fe80::/10)", () => {
    expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIp("fd12:3456::1")).toBe(true);
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
  });

  it("blokkeert IPv4-mapped IPv6-adressen die zelf privé zijn", () => {
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:10.0.0.5")).toBe(true);
  });

  it("staat gewone publieke adressen toe", () => {
    expect(isPrivateOrReservedIp("93.184.216.34")).toBe(false); // example.com
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });

  it("blokkeert onherkende/ongeldige adresformaten uit voorzorg", () => {
    expect(isPrivateOrReservedIp("niet-een-ip")).toBe(true);
  });
});

describe("resolveHostSafely", () => {
  it("geeft ok:true voor een hostname die alleen naar publieke adressen resolvet", async () => {
    const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
    const result = await resolveHostSafely("example.com", lookup);
    expect(result).toEqual({ ok: true });
  });

  it("blokkeert wanneer een van de geresolvede adressen privé is (DNS-rebinding-scenario)", async () => {
    const lookup = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
    const result = await resolveHostSafely("verdacht.voorbeeld", lookup);
    expect(result).toEqual({ ok: false, reason: "blocked" });
  });

  it("geeft dns_failed terug als de lookup een fout gooit", async () => {
    const lookup = async () => {
      throw new Error("ENOTFOUND");
    };
    const result = await resolveHostSafely("bestaat-niet.voorbeeld", lookup);
    expect(result).toEqual({ ok: false, reason: "dns_failed" });
  });

  it("geeft dns_failed terug als er geen adressen worden teruggegeven", async () => {
    const lookup = async () => [];
    const result = await resolveHostSafely("leeg.voorbeeld", lookup);
    expect(result).toEqual({ ok: false, reason: "dns_failed" });
  });
});

describe("getRegistrableDomain / isSameRegistrableDomain", () => {
  it("haalt het hoofddomein uit een subdomein", () => {
    expect(getRegistrableDomain("www.bedrijf.nl")).toBe("bedrijf.nl");
    expect(getRegistrableDomain("shop.sub.bedrijf.nl")).toBe("bedrijf.nl");
  });

  it("behandelt bekende meerdelige TLD's correct (co.uk)", () => {
    expect(getRegistrableDomain("www.bedrijf.co.uk")).toBe("bedrijf.co.uk");
  });

  it("herkent hetzelfde bedrijfsdomein ondanks verschillende subdomeinen", () => {
    expect(isSameRegistrableDomain("www.bedrijf.nl", "shop.bedrijf.nl")).toBe(true);
    expect(isSameRegistrableDomain("bedrijf.nl", "bedrijf.nl")).toBe(true);
  });

  it("herkent een ander bedrijfsdomein als verschillend", () => {
    expect(isSameRegistrableDomain("bedrijf.nl", "ander-bedrijf.nl")).toBe(false);
  });
});
