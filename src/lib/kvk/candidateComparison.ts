export function normalizePostcode(postcode: string): string {
  return postcode.toUpperCase().replace(/\s+/g, "");
}

export function normalizePlaats(plaats: string): string {
  return plaats
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Haalt het kale domein (zonder protocol/www/pad) uit een URL of domeinnaam. */
export function extractDomain(url: string): string | null {
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const host = new URL(withProtocol).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}
