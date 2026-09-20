import { describe, expect, it } from "vitest";
import { companyNameSimilarity, normalizeCompanyName } from "@/lib/kvk/companyNameSimilarity";

describe("normalizeCompanyName", () => {
  it("verwijdert rechtsvorm-afkortingen, ongeacht punten", () => {
    expect(normalizeCompanyName("Acme B.V.")).toBe("acme");
    expect(normalizeCompanyName("Acme BV")).toBe("acme");
    expect(normalizeCompanyName("Acme N.V.")).toBe("acme");
  });

  it("laat onderscheidende woorden als Holding/Groep staan", () => {
    expect(normalizeCompanyName("Donald Duck Holding")).toBe("donald duck holding");
    expect(normalizeCompanyName("Donald Duck BV")).toBe("donald duck");
  });

  it("is ongevoelig voor hoofdletters, accenten en dubbele spaties", () => {
    expect(normalizeCompanyName("Café  Zürich")).toBe(normalizeCompanyName("cafe zurich"));
  });
});

describe("companyNameSimilarity", () => {
  it("geeft 100 voor identieke namen", () => {
    expect(companyNameSimilarity("Acme", "Acme")).toBe(100);
  });

  it("geeft 100 als alleen de rechtsvorm-notatie verschilt", () => {
    expect(companyNameSimilarity("Acme", "Acme B.V.")).toBe(100);
    expect(companyNameSimilarity("Test BV Donald", "Test B.V. Donald")).toBe(100);
  });

  it("geeft een hoge maar niet perfecte score bij een kleine typefout", () => {
    const score = companyNameSimilarity("Bakkerij Jansen", "Bakkerij Janssen");
    expect(score).toBeGreaterThanOrEqual(85);
    expect(score).toBeLessThan(100);
  });

  it("geeft een lage score voor volledig verschillende namen", () => {
    expect(companyNameSimilarity("Acme Consultancy", "Zonnepark Exploitatie")).toBeLessThan(40);
  });

  it("geeft 0 als een van beide namen leeg is", () => {
    expect(companyNameSimilarity("", "Acme")).toBe(0);
    expect(companyNameSimilarity("Acme", "")).toBe(0);
  });
});
