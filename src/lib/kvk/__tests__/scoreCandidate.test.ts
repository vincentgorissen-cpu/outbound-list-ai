import { describe, expect, it } from "vitest";
import { scoreCandidate } from "@/lib/kvk/scoreCandidate";

describe("scoreCandidate", () => {
  it("scoort 100 bij exacte naam + plaats", () => {
    const result = scoreCandidate(
      { bedrijfsnaam: "Test BV Donald", plaats: "Lollum" },
      { kvkNummer: "68750110", naam: "Test BV Donald", plaats: "Lollum" },
    );
    expect(result.score).toBe(100);
    expect(result.scoreBreakdown).toMatchObject({ bedrijfsnaam: 100, plaats: 100, postcode: null, website: null });
  });

  it("negeert postcode/plaats/website in de weging als ze niet vergelijkbaar zijn", () => {
    const result = scoreCandidate(
      { bedrijfsnaam: "Test BV Donald" },
      { kvkNummer: "68750110", naam: "Test BV Donald" },
    );
    expect(result.score).toBe(100);
    expect(result.scoreBreakdown.postcode).toBeNull();
    expect(result.scoreBreakdown.plaats).toBeNull();
  });

  it("straft een niet-matchende postcode af", () => {
    const result = scoreCandidate(
      { bedrijfsnaam: "Acme", postcode: "1011AB" },
      { kvkNummer: "1", naam: "Acme", postcode: "3011CD" },
    );
    expect(result.scoreBreakdown.postcode).toBe(0);
    expect(result.score).toBeLessThan(100);
  });

  it("beloont een matchend website-domein, ongeacht schrijfwijze", () => {
    const result = scoreCandidate(
      { bedrijfsnaam: "Acme", website: "www.acme.nl" },
      { kvkNummer: "1", naam: "Acme", websites: ["https://acme.nl/contact"] },
    );
    expect(result.scoreBreakdown.website).toBe(100);
    expect(result.score).toBe(100);
  });

  it("herverdeelt gewicht: bedrijfsnaam alleen weegt zwaarder dan gecombineerd met andere velden", () => {
    const naamAlleen = scoreCandidate(
      { bedrijfsnaam: "Bakkerij Jansen" },
      { kvkNummer: "1", naam: "Bakkerij Janssen" },
    );
    const metVerkeerdePlaats = scoreCandidate(
      { bedrijfsnaam: "Bakkerij Jansen", plaats: "Utrecht" },
      { kvkNummer: "1", naam: "Bakkerij Janssen", plaats: "Rotterdam" },
    );
    expect(metVerkeerdePlaats.score).toBeLessThan(naamAlleen.score);
  });
});
