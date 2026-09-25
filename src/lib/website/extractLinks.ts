import "server-only";
import * as cheerio from "cheerio";
import { isSameRegistrableDomain } from "./urlSafety";

export type PageCategory = "about" | "products" | "industries" | "locations";

export interface CategorizedLink {
  url: string;
  category: PageCategory;
}

/** Volgorde waarin categorieën de voorkeur krijgen wanneer we een beperkt aantal pagina's mogen kiezen. */
export const CATEGORY_PRIORITY: PageCategory[] = ["about", "products", "industries", "locations"];

const CATEGORY_KEYWORDS: Record<PageCategory, string[]> = {
  about: [
    "over-ons",
    "over ons",
    "about-us",
    "about us",
    "about",
    "wie-zijn-wij",
    "wie zijn wij",
    "ons-verhaal",
    "ons verhaal",
    "bedrijf",
    "company",
  ],
  products: [
    "producten",
    "diensten",
    "services",
    "solutions",
    "oplossingen",
    "wat-we-doen",
    "wat we doen",
    "portfolio",
    "products",
  ],
  industries: [
    "sectoren",
    "branches",
    "industries",
    "markets",
    "toepassingen",
    "sector",
    "industrieen",
    "industrieën",
    "doelgroepen",
  ],
  locations: ["locaties", "vestigingen", "locations", "our-locations"],
};

/**
 * Bewust NIET meecrawlen: blogs/nieuws (te veel, weinig bedrijfsinfo),
 * juridische pagina's, vacatures (tenzij later expliciet geactiveerd),
 * login-/winkelomgevingen, en algemene productcatalogi (die zouden tot
 * honderden pagina's kunnen leiden — we nemen hooguit één
 * producten/diensten-overzichtspagina mee via de category-match hierboven).
 */
const EXCLUDE_PATTERNS = [
  "/blog",
  "/nieuws",
  "/news",
  "/actueel",
  "/press",
  "/pers",
  "privacy",
  "cookie",
  "voorwaarden",
  "terms",
  "disclaimer",
  "vacature",
  "vacatures",
  "/jobs",
  "/career",
  "werken-bij",
  "login",
  "inloggen",
  "/account",
  "sign-in",
  "signin",
  "/cart",
  "winkelmand",
  "checkout",
  "/basket",
];

function isExcluded(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return EXCLUDE_PATTERNS.some((pattern) => lower.includes(pattern));
}

function matchCategory(pathname: string, linkText: string): PageCategory | null {
  const haystack = `${pathname} ${linkText}`.toLowerCase();
  for (const category of CATEGORY_PRIORITY) {
    if (CATEGORY_KEYWORDS[category].some((keyword) => haystack.includes(keyword))) {
      return category;
    }
  }
  return null;
}

/**
 * Zoekt interne links op een pagina (bv. de homepage) die waarschijnlijk
 * meer over het bedrijf vertellen. Blijft uitsluitend binnen hetzelfde
 * bedrijfsdomein, negeert anker-/mailto-/tel-/javascript-links, en slaat
 * bekende irrelevante paden over (zie `EXCLUDE_PATTERNS`).
 */
export function discoverCandidateLinks(html: string, pageUrl: string, allowedDomain: string): CategorizedLink[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const results: CategorizedLink[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    if (/^(#|mailto:|tel:|javascript:)/i.test(href.trim())) return;

    let absolute: URL;
    try {
      absolute = new URL(href, pageUrl);
    } catch {
      return;
    }

    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") return;
    if (!isSameRegistrableDomain(absolute.hostname, allowedDomain)) return;
    if (isExcluded(absolute.pathname)) return;

    absolute.hash = "";
    const normalized = absolute.toString();
    if (seen.has(normalized)) return;

    const linkText = $(element).text().trim();
    const category = matchCategory(absolute.pathname, linkText);
    if (!category) return;

    seen.add(normalized);
    results.push({ url: normalized, category });
  });

  return results;
}

/** Kiest maximaal `maxCount` links, hoogstens één per categorie, in prioriteitsvolgorde. */
export function prioritizeLinks(links: CategorizedLink[], maxCount: number): CategorizedLink[] {
  const selected: CategorizedLink[] = [];
  for (const category of CATEGORY_PRIORITY) {
    if (selected.length >= maxCount) break;
    const match = links.find((link) => link.category === category);
    if (match) selected.push(match);
  }
  return selected.slice(0, maxCount);
}
