import "server-only";
import * as cheerio from "cheerio";
import { scrubPersonalInformation } from "./piiScrubber";

/** Minimaal aantal tekens leesbare tekst om een pagina als bruikbaar te beschouwen. */
export const MIN_CONTENT_LENGTH = 100;

/** Begrenst hoeveel tekst per pagina wordt meegenomen (kostenbeheersing voor de latere AI-stap). */
const MAX_TEXT_LENGTH_PER_PAGE = 4000;

/** Begrenst de totale, gecombineerde en gededupliceerde tekst over alle pagina's van één website heen. */
export const MAX_COMBINED_TEXT_LENGTH = 12000;

/** Pure opmaak/technische elementen en UI-chrome — nooit bedrijfsinhoud. */
const IGNORED_TAGS = [
  "script",
  "style",
  "noscript",
  "nav",
  "footer",
  "header",
  "svg",
  "iframe",
  "form",
  "button",
  "aside",
  "template",
  "select",
  "input",
  "label",
  "video",
  "audio",
  "canvas",
];

/** Blokelementen krijgen een regeleinde achteraan, zodat aaneengesloten tags niet aan elkaar plakken en alinea's/koppen apart dedupliceerbaar blijven. */
const BLOCK_TAGS = "p,div,br,h1,h2,h3,h4,h5,h6,li,tr,section,article,ul,ol,table";

/** Class/id-trefwoorden van bekende cookie-/consent-widgets. */
const BOILERPLATE_ATTRIBUTE_KEYWORDS = [
  "cookie",
  "consent",
  "gdpr",
  "onetrust",
  "cc-window",
  "cc-banner",
  "privacy-notice",
  "privacy-banner",
];

/**
 * Koppen die een hele sectie laten verwijderen (kop + alles tot de
 * volgende kop van gelijk of hoger niveau): zowel team-/
 * medewerkersoverzichten (individuele profielen horen niet in deze
 * module thuis) als ingesloten cookie-/privacy-/voorwaardenteksten die
 * niet al door de link-uitsluiting bij het ophalen zijn afgevangen.
 */
const SECTION_HEADING_KEYWORDS = [
  "ons team",
  "onze mensen",
  "medewerkers",
  "meet the team",
  "our team",
  "our people",
  "de mensen achter",
  "team",
  "cookiebeleid",
  "cookie policy",
  "privacyverklaring",
  "privacy policy",
  "privacybeleid",
  "algemene voorwaarden",
  "terms and conditions",
  "terms of service",
  "disclaimer",
];

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

function headingLevel(tagName: string): number {
  const level = Number(tagName.replace(/[^0-9]/g, ""));
  return Number.isFinite(level) && level > 0 ? level : 6;
}

/** Verwijdert elementen waarvan class of id een bekend cookie-/consent-trefwoord bevat. */
function removeBoilerplateByAttributes($: cheerio.CheerioAPI): void {
  $("[class], [id]")
    .filter((_, element) => {
      const $element = $(element);
      const id = ($element.attr("id") ?? "").toLowerCase();
      const className = ($element.attr("class") ?? "").toLowerCase();
      return BOILERPLATE_ATTRIBUTE_KEYWORDS.some((keyword) => id.includes(keyword) || className.includes(keyword));
    })
    .remove();
}

/** Verwijdert hele secties (kop + gevolg) wanneer de kop een team-/privacy-/voorwaarden-trefwoord bevat. */
function removeSectionsByHeadingKeyword($: cheerio.CheerioAPI): void {
  $(HEADING_TAGS.join(",")).each((_, headingElement) => {
    const $heading = $(headingElement);
    const headingText = $heading.text().trim().toLowerCase();
    if (!headingText) return;
    if (!SECTION_HEADING_KEYWORDS.some((keyword) => headingText.includes(keyword))) return;

    const level = headingLevel(String($heading.prop("tagName") ?? ""));
    const toRemove = [$heading];
    let sibling = $heading.next();
    while (sibling.length > 0) {
      const siblingTag = String(sibling.prop("tagName") ?? "").toLowerCase();
      if (HEADING_TAGS.includes(siblingTag) && headingLevel(siblingTag) <= level) break;
      toRemove.push(sibling);
      sibling = sibling.next();
    }
    toRemove.forEach(($element) => $element.remove());
  });
}

function normalizedLength(text: string): number {
  return text.replace(/\s+/g, " ").trim().length;
}

/** Verwijdert containers die voornamelijk uit links bestaan — repetitieve menu-items die niet al in een `<nav>` zaten. Whitespace (bv. HTML-inspringing tussen tags) wordt genormaliseerd vóór de vergelijking, zodat opmaak-witruimte de link-dichtheid niet kunstmatig verlaagt. */
function removeLinkHeavyContainers($: cheerio.CheerioAPI): void {
  $("ul, ol, div").each((_, element) => {
    const $element = $(element);
    const links = $element.find("a");
    if (links.length < 4) return;

    const linkTextLength = normalizedLength(links.text());
    const totalTextLength = normalizedLength($element.text());
    if (totalTextLength === 0) return;

    if (linkTextLength / totalTextLength > 0.7) {
      $element.remove();
    }
  });
}

/**
 * Zet HTML om naar opgeschoonde, voor bedrijfsanalyse relevante platte
 * tekst. Verwijdert navigatie, footer, scripts/opmaak, cookiemeldingen,
 * privacy-/voorwaardenteksten, team-/medewerkersoverzichten en
 * repetitieve menu-items. Behoudt koppen en gewone tekst, elk op een
 * eigen regel (voor latere deduplicatie over pagina's heen). Verwijdert
 * daarna persoonsgegevens (e-mail/telefoon/getitelde namen) en begrenst
 * tot een maximale lengte per pagina.
 */
export function extractCleanedText(html: string): string {
  const $ = cheerio.load(html);

  $(IGNORED_TAGS.join(",")).remove();
  removeBoilerplateByAttributes($);
  removeSectionsByHeadingKeyword($);
  removeLinkHeavyContainers($);

  $(BLOCK_TAGS).each((_, element) => {
    $(element).append("\n");
  });

  const lines = $.root()
    .text()
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);

  const deduped: string[] = [];
  let previousLine: string | null = null;
  for (const line of lines) {
    if (line === previousLine) continue;
    deduped.push(line);
    previousLine = line;
  }

  const cleaned = scrubPersonalInformation(deduped.join("\n"));
  return cleaned.length > MAX_TEXT_LENGTH_PER_PAGE ? cleaned.slice(0, MAX_TEXT_LENGTH_PER_PAGE) : cleaned;
}

/** Een JS-heavy site die vrijwel niets server-side rendert, levert te weinig tekst op om bruikbaar te zijn. */
export function hasSufficientContent(text: string): boolean {
  return text.length >= MIN_CONTENT_LENGTH;
}

export interface PageForCombining {
  cleanedText: string;
}

/**
 * Combineert de opgeschoonde tekst van meerdere pagina's van dezelfde
 * website tot één geheel, en dedupliceert daarbij regels die letterlijk
 * op meerdere pagina's terugkomen (bv. een herhaalde slogan of
 * disclaimer) — de eerste keer dat een regel voorkomt (in paginavolgorde,
 * homepage eerst) blijft staan. Begrensd tot `MAX_COMBINED_TEXT_LENGTH`
 * voor kostenbeheersing, ook als individuele pagina's elk al binnen hun
 * eigen limiet blijven.
 */
export function combineExtractedPages(pages: PageForCombining[]): string {
  const seen = new Set<string>();
  const uniqueLines: string[] = [];

  for (const page of pages) {
    for (const rawLine of page.cleanedText.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const normalized = line.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      uniqueLines.push(line);
    }
  }

  const combined = uniqueLines.join("\n");
  return combined.length > MAX_COMBINED_TEXT_LENGTH ? combined.slice(0, MAX_COMBINED_TEXT_LENGTH) : combined;
}
