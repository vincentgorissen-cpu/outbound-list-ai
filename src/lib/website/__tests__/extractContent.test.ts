import { describe, expect, it } from "vitest";
import { extractReadableText, hasSufficientContent, MIN_CONTENT_LENGTH } from "@/lib/website/extractContent";

describe("extractReadableText", () => {
  it("haalt leesbare tekst uit de body", () => {
    const html = "<html><body><h1>Welkom bij Acme</h1><p>Wij maken machines.</p></body></html>";
    expect(extractReadableText(html)).toBe("Welkom bij Acme Wij maken machines.");
  });

  it("verwijdert script-, style-, nav- en footer-inhoud", () => {
    const html = `
      <html><body>
        <nav>Menu-item 1 Menu-item 2</nav>
        <script>console.log("moet weg")</script>
        <style>.foo { color: red; }</style>
        <p>De echte inhoud.</p>
        <footer>Copyright 2026</footer>
      </body></html>
    `;
    expect(extractReadableText(html)).toBe("De echte inhoud.");
  });

  it("voegt whitespace en witregels samen tot enkele spaties", () => {
    const html = "<html><body>\n\n  Regel   1  \n\n  Regel 2  \n</body></html>";
    expect(extractReadableText(html)).toBe("Regel 1 Regel 2");
  });

  it("geeft lege tekst terug voor een lege of vrijwel lege pagina (JS-heavy site)", () => {
    const html = `<html><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    expect(extractReadableText(html)).toBe("");
  });

  it("begrenst zeer lange pagina's tot een maximale lengte", () => {
    const longText = "a".repeat(10000);
    const html = `<html><body>${longText}</body></html>`;
    const result = extractReadableText(html);
    expect(result.length).toBeLessThan(10000);
    expect(result.length).toBeGreaterThan(0);
  });

  it("valt terug op de hele pagina als er geen <body> is", () => {
    const html = "<p>Losse tekst zonder html/body-tags.</p>";
    expect(extractReadableText(html)).toBe("Losse tekst zonder html/body-tags.");
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
