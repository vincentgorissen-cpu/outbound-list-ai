import "server-only";
import * as cheerio from "cheerio";

/** Minimaal aantal tekens leesbare tekst om een pagina als bruikbaar te beschouwen. */
export const MIN_CONTENT_LENGTH = 100;

/** Begrenst hoeveel tekst per pagina wordt meegenomen (kostenbeheersing voor de latere AI-stap). */
const MAX_TEXT_LENGTH_PER_PAGE = 4000;

const IGNORED_TAGS = ["script", "style", "noscript", "nav", "footer", "header", "svg", "iframe", "form"];

/** Blokelementen krijgen een spatie achteraan zodat aaneengesloten tags (bv. `<h1>...</h1><p>...</p>`) niet aan elkaar plakken in de platte tekst. */
const BLOCK_TAGS = "p,div,br,h1,h2,h3,h4,h5,h6,li,tr,section,article,ul,ol,table";

/**
 * Zet HTML om naar leesbare platte tekst: navigatie/scripts/opmaak eruit,
 * whitespace samengevoegd, en begrensd tot een redelijke lengte per
 * pagina. Dit is bewust een simpele, robuuste tekstextractie — geen
 * poging om lay-out of structuur te behouden, alleen om bruikbare
 * bedrijfstekst over te houden voor een latere AI-stap.
 */
export function extractReadableText(html: string): string {
  const $ = cheerio.load(html);
  $(IGNORED_TAGS.join(",")).remove();

  $(BLOCK_TAGS).each((_, element) => {
    $(element).append(" ");
  });

  const text = $.root().text().replace(/\s+/g, " ").trim();

  return text.length > MAX_TEXT_LENGTH_PER_PAGE ? text.slice(0, MAX_TEXT_LENGTH_PER_PAGE) : text;
}

/** Een JS-heavy site die vrijwel niets server-side rendert, levert te weinig tekst op om bruikbaar te zijn. */
export function hasSufficientContent(text: string): boolean {
  return text.length >= MIN_CONTENT_LENGTH;
}
