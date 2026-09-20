import { describe, expect, it } from "vitest";
import { extractDomain, normalizePlaats, normalizePostcode } from "@/lib/kvk/candidateComparison";

describe("normalizePostcode", () => {
  it("verwijdert spaties en zet om naar hoofdletters", () => {
    expect(normalizePostcode("1011 ab")).toBe("1011AB");
    expect(normalizePostcode("1011AB")).toBe("1011AB");
  });
});

describe("normalizePlaats", () => {
  it("negeert hoofdletters, accenten en spaties rondom", () => {
    expect(normalizePlaats(" Den Haag ")).toBe("den haag");
    expect(normalizePlaats("s-Gravenhage")).toBe(normalizePlaats("S-GRAVENHAGE"));
  });
});

describe("extractDomain", () => {
  it("haalt het kale domein uit volledige URL's", () => {
    expect(extractDomain("https://www.acme.nl/over-ons")).toBe("acme.nl");
    expect(extractDomain("http://acme.nl")).toBe("acme.nl");
  });

  it("werkt ook zonder protocol", () => {
    expect(extractDomain("acme.nl")).toBe("acme.nl");
    expect(extractDomain("www.acme.nl")).toBe("acme.nl");
  });

  it("geeft null terug bij een onbruikbare waarde", () => {
    expect(extractDomain("niet een url!! ??")).toBeNull();
  });
});
