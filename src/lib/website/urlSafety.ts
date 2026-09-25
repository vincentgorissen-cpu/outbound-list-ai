import "server-only";
import { isIPv4, isIPv6 } from "node:net";
import { promises as dns } from "node:dns";

/**
 * Normaliseert gebruikersinvoer naar een geldige http(s)-URL: voegt
 * `https://` toe wanneer er nog geen protocol staat, en wijst alles af
 * dat geen http/https is (bv. `file://`, `ftp://`, `javascript:`).
 * Geeft `null` terug voor lege invoer of een onherstelbaar ongeldige URL —
 * er wordt nooit een domein geraden, alleen de gegeven invoer genormaliseerd.
 */
export function normalizeWebsiteUrl(input: string | null | undefined): URL | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed);
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (!url.hostname) {
    return null;
  }

  return url;
}

function ipv4ToLong(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
  );
}

/**
 * IPv4-reeksen die nooit vanaf onze server benaderd mogen worden:
 * loopback, private (RFC1918), link-local (dekt ook het cloud
 * metadata-adres 169.254.169.254), CGNAT en de overige IANA-gereserveerde
 * blokken. Pragmatische, niet 100% RFC-uitputtende lijst, gericht op de
 * realistische SSRF-risico's.
 */
const PRIVATE_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
  ["255.255.255.255", 32],
];

function isPrivateIpv4(ip: string): boolean {
  const long = ipv4ToLong(ip);
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (long & mask) === (ipv4ToLong(base) & mask);
  });
}

/** Pragmatische IPv6-check: loopback, unique-local (fc00::/7), link-local (fe80::/10), en IPv4-mapped adressen (herleid naar de IPv4-check hierboven). */
function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (/^f[cd][0-9a-f]{0,2}:/.test(normalized)) return true; // fc00::/7
  if (/^fe[89ab][0-9a-f]?:/.test(normalized)) return true; // fe80::/10

  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);

  return false;
}

/** Blokkeert localhost, private ranges en overige interne/gereserveerde adressen. Onbekend/onherkend formaat wordt voorzichtigheidshalve ook geblokkeerd. */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (isIPv4(ip)) return isPrivateIpv4(ip);
  if (isIPv6(ip)) return isPrivateIpv6(ip);
  return true;
}

export interface DnsLookupResult {
  address: string;
  family: number;
}

export type DnsLookupFn = (hostname: string) => Promise<DnsLookupResult[]>;

async function defaultDnsLookup(hostname: string): Promise<DnsLookupResult[]> {
  const result = await dns.lookup(hostname, { all: true });
  return result;
}

export type HostResolutionResult = { ok: true } | { ok: false; reason: "dns_failed" | "blocked" };

/**
 * Lost een hostname op en controleert **elk** teruggegeven adres tegen de
 * private/gereserveerde ranges — dit gebeurt vóór elke fetch (ook bij elke
 * redirect-hop opnieuw), zodat een domein dat naar een intern adres wijst
 * (of daar via DNS-rebinding naartoe zou kunnen wijzen) nooit daadwerkelijk
 * benaderd wordt.
 */
export async function resolveHostSafely(
  hostname: string,
  lookup: DnsLookupFn = defaultDnsLookup,
): Promise<HostResolutionResult> {
  let addresses: DnsLookupResult[];
  try {
    addresses = await lookup(hostname);
  } catch {
    return { ok: false, reason: "dns_failed" };
  }

  if (!addresses || addresses.length === 0) {
    return { ok: false, reason: "dns_failed" };
  }

  const hasBlockedAddress = addresses.some((a) => isPrivateOrReservedIp(a.address));
  if (hasBlockedAddress) {
    return { ok: false, reason: "blocked" };
  }

  return { ok: true };
}

/** Bekende meerdelige TLD's waarbij het "hoofddomein" drie labels nodig heeft (bv. bedrijf.co.uk, niet co.uk). Niet uitputtend — pragmatische dekking voor de meest voorkomende gevallen. */
const MULTI_PART_TLDS = new Set([
  "co.uk",
  "org.uk",
  "gov.uk",
  "ac.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "co.za",
  "co.jp",
  "com.br",
]);

/** Leidt een pragmatische "registreerbaar domein" af (bv. www.bedrijf.nl -> bedrijf.nl) voor de same-site-check bij redirects en interne links. */
export function getRegistrableDomain(hostname: string): string {
  const labels = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .split(".")
    .filter(Boolean);

  if (labels.length <= 2) return labels.join(".");

  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }
  return lastTwo;
}

/** True als beide hostnamen tot hetzelfde bedrijfsdomein behoren (incl. subdomeinen). */
export function isSameRegistrableDomain(hostnameA: string, hostnameB: string): boolean {
  return getRegistrableDomain(hostnameA) === getRegistrableDomain(hostnameB);
}
