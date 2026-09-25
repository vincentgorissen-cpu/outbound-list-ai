import { describe, expect, it } from "vitest";
import { discoverCandidateLinks, prioritizeLinks } from "@/lib/website/extractLinks";

describe("discoverCandidateLinks", () => {
  it("herkent een 'over ons'-pagina op naam en op linktekst", () => {
    const html = `
      <a href="/over-ons">Over ons</a>
      <a href="/random-slug-123">Wie zijn wij</a>
    `;
    const links = discoverCandidateLinks(html, "https://bedrijf.nl/", "bedrijf.nl");
    expect(links).toContainEqual({ url: "https://bedrijf.nl/over-ons", category: "about" });
    expect(links).toContainEqual({ url: "https://bedrijf.nl/random-slug-123", category: "about" });
  });

  it("herkent producten/diensten- en sector-pagina's", () => {
    const html = `
      <a href="/diensten">Diensten</a>
      <a href="/sectoren">Sectoren</a>
      <a href="/locaties">Onze vestigingen</a>
    `;
    const links = discoverCandidateLinks(html, "https://bedrijf.nl/", "bedrijf.nl");
    expect(links.map((l) => l.category).sort()).toEqual(["industries", "locations", "products"].sort());
  });

  it("negeert externe links (ander domein)", () => {
    const html = `<a href="https://facebook.com/bedrijf">Volg ons</a><a href="/over-ons">Over ons</a>`;
    const links = discoverCandidateLinks(html, "https://bedrijf.nl/", "bedrijf.nl");
    expect(links.every((l) => l.url.includes("bedrijf.nl"))).toBe(true);
    expect(links.some((l) => l.url.includes("facebook"))).toBe(false);
  });

  it("staat subdomeinen van hetzelfde bedrijf toe", () => {
    const html = `<a href="https://shop.bedrijf.nl/over-ons">Over ons</a>`;
    const links = discoverCandidateLinks(html, "https://bedrijf.nl/", "bedrijf.nl");
    expect(links).toHaveLength(1);
  });

  it("negeert anker-, mailto-, tel- en javascript-links", () => {
    const html = `
      <a href="#top">Naar boven</a>
      <a href="mailto:info@bedrijf.nl">Mail ons</a>
      <a href="tel:+31612345678">Bel ons</a>
      <a href="javascript:void(0)">Klik</a>
    `;
    const links = discoverCandidateLinks(html, "https://bedrijf.nl/", "bedrijf.nl");
    expect(links).toHaveLength(0);
  });

  it("sluit blog, privacy, voorwaarden, vacatures, login en winkelmand uit", () => {
    const html = `
      <a href="/blog/artikel-1">Over ons blog</a>
      <a href="/privacyverklaring">Privacy</a>
      <a href="/algemene-voorwaarden">Voorwaarden</a>
      <a href="/vacatures/developer">Werken bij ons, over ons</a>
      <a href="/inloggen">Over ons inloggen</a>
      <a href="/winkelmand">Winkelmand producten</a>
    `;
    const links = discoverCandidateLinks(html, "https://bedrijf.nl/", "bedrijf.nl");
    expect(links).toHaveLength(0);
  });

  it("dedupliceert dezelfde link (ook met een ander hash-fragment)", () => {
    const html = `<a href="/over-ons">Over ons</a><a href="/over-ons#team">Ons team</a>`;
    const links = discoverCandidateLinks(html, "https://bedrijf.nl/", "bedrijf.nl");
    expect(links).toHaveLength(1);
  });

  it("negeert links zonder herkenbare categorie", () => {
    const html = `<a href="/willekeurige-pagina-xyz">Klik hier</a>`;
    const links = discoverCandidateLinks(html, "https://bedrijf.nl/", "bedrijf.nl");
    expect(links).toHaveLength(0);
  });

  it("blijft correct werken bij een pagina met zeer veel interne links", () => {
    const manyLinks = Array.from({ length: 500 }, (_, i) => `<a href="/product/${i}">Product ${i}</a>`).join("\n");
    const html = `${manyLinks}\n<a href="/over-ons">Over ons</a>`;
    const links = discoverCandidateLinks(html, "https://bedrijf.nl/", "bedrijf.nl");
    // De 500 productdetailpagina's matchen geen categorie-trefwoord en worden dus niet meegenomen.
    expect(links).toEqual([{ url: "https://bedrijf.nl/over-ons", category: "about" }]);
  });
});

describe("prioritizeLinks", () => {
  it("kiest maximaal één link per categorie, in prioriteitsvolgorde", () => {
    const links = [
      { url: "https://bedrijf.nl/locaties", category: "locations" as const },
      { url: "https://bedrijf.nl/sectoren", category: "industries" as const },
      { url: "https://bedrijf.nl/over-ons", category: "about" as const },
      { url: "https://bedrijf.nl/diensten", category: "products" as const },
    ];
    const prioritized = prioritizeLinks(links, 4);
    expect(prioritized.map((l) => l.category)).toEqual(["about", "products", "industries", "locations"]);
  });

  it("respecteert de maximale limiet", () => {
    const links = [
      { url: "https://bedrijf.nl/over-ons", category: "about" as const },
      { url: "https://bedrijf.nl/diensten", category: "products" as const },
    ];
    const prioritized = prioritizeLinks(links, 1);
    expect(prioritized).toEqual([{ url: "https://bedrijf.nl/over-ons", category: "about" }]);
  });
});
