import { describe, expect, it } from "vitest";
import {
  combineExtractedPages,
  extractCleanedText,
  hasSufficientContent,
  MIN_CONTENT_LENGTH,
} from "@/lib/website/extractContent";

describe("extractCleanedText", () => {
  it("haalt leesbare tekst uit de body, koppen en paragrafen op eigen regels", () => {
    const html = "<html><body><h1>Welkom bij Acme</h1><p>Wij maken machines.</p></body></html>";
    expect(extractCleanedText(html)).toBe("Welkom bij Acme\nWij maken machines.");
  });

  it("verwijdert script-, style-, nav-, footer- en form-inhoud", () => {
    const html = `
      <html><body>
        <nav><a href="/a">Menu 1</a><a href="/b">Menu 2</a></nav>
        <script>console.log("moet weg")</script>
        <style>.foo { color: red; }</style>
        <form><input type="text"><button>Verzenden</button></form>
        <p>De echte inhoud.</p>
        <footer>Copyright 2026</footer>
      </body></html>
    `;
    expect(extractCleanedText(html)).toBe("De echte inhoud.");
  });

  it("verwijdert een cookiemelding op basis van class/id", () => {
    const html = `
      <html><body>
        <div id="onetrust-banner-sdk">Wij gebruiken cookies om uw ervaring te verbeteren. Accepteren?</div>
        <div class="cookie-consent-bar">Cookies accepteren</div>
        <p>Dit is de echte bedrijfsinhoud over onze diensten.</p>
      </body></html>
    `;
    const result = extractCleanedText(html);
    expect(result).not.toContain("cookies");
    expect(result).toContain("Dit is de echte bedrijfsinhoud");
  });

  it("verwijdert een ingesloten privacyverklaring-sectie op basis van de kop", () => {
    const html = `
      <html><body>
        <h1>Over ons bedrijf</h1>
        <p>Wij zijn actief in de machinebouw.</p>
        <h2>Privacyverklaring</h2>
        <p>Wij verwerken uw persoonsgegevens conform de AVG en bewaren deze maximaal 2 jaar.</p>
        <h2>Onze diensten</h2>
        <p>Wij bieden onderhoud en installatie.</p>
      </body></html>
    `;
    const result = extractCleanedText(html);
    expect(result).not.toContain("persoonsgegevens");
    expect(result).not.toContain("AVG");
    expect(result).toContain("machinebouw");
    expect(result).toContain("onderhoud en installatie");
  });

  it("verwijdert een team-/medewerkersoverzicht op basis van de kop (individuele profielen)", () => {
    const html = `
      <html><body>
        <h1>Over ons</h1>
        <p>Wij zijn een familiebedrijf in de logistiek.</p>
        <h2>Ons team</h2>
        <div>Jan Jansen - Directeur - 06-12345678</div>
        <div>Marie de Vries - Operations Manager - marie@bedrijf.nl</div>
        <h2>Onze sectoren</h2>
        <p>Wij zijn actief in transport en opslag.</p>
      </body></html>
    `;
    const result = extractCleanedText(html);
    expect(result).not.toContain("Jan Jansen");
    expect(result).not.toContain("Marie de Vries");
    expect(result).not.toContain("06-12345678");
    expect(result).toContain("familiebedrijf");
    expect(result).toContain("transport en opslag");
  });

  it("verwijdert een repetitieve link-lijst die niet in een <nav> zit", () => {
    const html = `
      <html><body>
        <div>
          <a href="/a">Producten</a>
          <a href="/b">Diensten</a>
          <a href="/c">Over ons</a>
          <a href="/d">Contact</a>
          <a href="/e">Blog</a>
        </div>
        <p>Dit is de daadwerkelijke inhoud van de pagina met voldoende beschrijvende tekst eromheen.</p>
      </body></html>
    `;
    const result = extractCleanedText(html);
    expect(result).not.toContain("Producten");
    expect(result).toContain("daadwerkelijke inhoud");
  });

  it("behoudt een productenoverzicht met echte beschrijvingen (geen link-lijst)", () => {
    const html = `
      <html><body>
        <div>
          <h3><a href="/machine-a">Machine A</a></h3>
          <p>Machine A is geschikt voor het verpakken van voedingsmiddelen op grote schaal.</p>
          <h3><a href="/machine-b">Machine B</a></h3>
          <p>Machine B automatiseert het sorteerproces in de foodindustrie.</p>
        </div>
      </body></html>
    `;
    const result = extractCleanedText(html);
    expect(result).toContain("verpakken van voedingsmiddelen");
    expect(result).toContain("sorteerproces in de foodindustrie");
  });

  it("verwijdert persoonsgegevens (e-mail/telefoon/getitelde naam) uit de overgebleven tekst", () => {
    const html = `
      <html><body>
        <p>Voor vragen kunt u contact opnemen met dhr. Piet Pietersen via 06-87654321 of piet@bedrijf.nl.</p>
        <p>Wij leveren machines aan de foodsector.</p>
      </body></html>
    `;
    const result = extractCleanedText(html);
    expect(result).not.toContain("Piet Pietersen");
    expect(result).not.toContain("06-87654321");
    expect(result).not.toContain("piet@bedrijf.nl");
    expect(result).toContain("foodsector");
  });

  it("geeft lege tekst terug voor een lege of vrijwel lege pagina (JS-heavy site)", () => {
    const html = `<html><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    expect(extractCleanedText(html)).toBe("");
  });

  it("begrenst zeer lange pagina's tot een maximale lengte", () => {
    const longText = "a".repeat(10000);
    const html = `<html><body><p>${longText}</p></body></html>`;
    const result = extractCleanedText(html);
    expect(result.length).toBeLessThan(10000);
    expect(result.length).toBeGreaterThan(0);
  });

  it("valt terug op de hele pagina als er geen <body> is", () => {
    const html = "<p>Losse tekst zonder html/body-tags.</p>";
    expect(extractCleanedText(html)).toBe("Losse tekst zonder html/body-tags.");
  });
});

describe("hasSufficientContent", () => {
  it("keurt tekst onder de drempel af", () => {
    expect(hasSufficientContent("te kort")).toBe(false);
    expect(hasSufficientContent("")).toBe(false);
  });

  it("keurt tekst op of boven de drempel goed", () => {
    expect(hasSufficientContent("x".repeat(MIN_CONTENT_LENGTH))).toBe(true);
    expect(hasSufficientContent("x".repeat(MIN_CONTENT_LENGTH + 50))).toBe(true);
  });
});

describe("combineExtractedPages", () => {
  it("voegt tekst van meerdere pagina's samen", () => {
    const result = combineExtractedPages([
      { cleanedText: "Wij maken machines." },
      { cleanedText: "Onze sectoren zijn food en logistiek." },
    ]);
    expect(result).toBe("Wij maken machines.\nOnze sectoren zijn food en logistiek.");
  });

  it("dedupliceert een regel die letterlijk op meerdere pagina's terugkomt, behoudt de eerste", () => {
    const result = combineExtractedPages([
      { cleanedText: "Slogan: de beste in de business.\nHomepage-specifieke tekst." },
      { cleanedText: "Slogan: de beste in de business.\nOver-ons-specifieke tekst." },
    ]);
    expect(result).toBe("Slogan: de beste in de business.\nHomepage-specifieke tekst.\nOver-ons-specifieke tekst.");
  });

  it("dedupliceert hoofdletterongevoelig", () => {
    const result = combineExtractedPages([
      { cleanedText: "Wij Maken Machines." },
      { cleanedText: "wij maken machines." },
    ]);
    expect(result).toBe("Wij Maken Machines.");
  });

  it("negeert lege regels", () => {
    const result = combineExtractedPages([{ cleanedText: "Tekst.\n\n  \nMeer tekst." }]);
    expect(result).toBe("Tekst.\nMeer tekst.");
  });

  it("begrenst de totale gecombineerde tekst", () => {
    const bigPage = { cleanedText: Array.from({ length: 2000 }, (_, i) => `Unieke regel nummer ${i}.`).join("\n") };
    const result = combineExtractedPages([bigPage]);
    expect(result.length).toBeLessThanOrEqual(12000);
  });
});
