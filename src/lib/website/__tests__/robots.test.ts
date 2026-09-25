import { describe, expect, it, vi } from "vitest";
import { fetchRobotsTxt, parseRobotsTxt } from "@/lib/website/robots";

describe("parseRobotsTxt", () => {
  it("staat alles toe als er geen regels zijn", () => {
    const rules = parseRobotsTxt("");
    expect(rules.isAllowed("/geheim")).toBe(true);
  });

  it("blokkeert een pad dat expliciet is uitgesloten voor *", () => {
    const rules = parseRobotsTxt(["User-agent: *", "Disallow: /admin"].join("\n"));
    expect(rules.isAllowed("/admin")).toBe(false);
    expect(rules.isAllowed("/admin/instellingen")).toBe(false);
    expect(rules.isAllowed("/over-ons")).toBe(true);
  });

  it("een lege Disallow-regel betekent alles toegestaan", () => {
    const rules = parseRobotsTxt(["User-agent: *", "Disallow:"].join("\n"));
    expect(rules.isAllowed("/wat-dan-ook")).toBe(true);
  });

  it("negeert commentaarregels", () => {
    const rules = parseRobotsTxt(["# commentaar", "User-agent: *", "Disallow: /admin # ook commentaar"].join("\n"));
    expect(rules.isAllowed("/admin")).toBe(false);
  });

  it("de langste matchende regel wint (Allow overschrijft een breder Disallow)", () => {
    const rules = parseRobotsTxt(["User-agent: *", "Disallow: /", "Allow: /over-ons"].join("\n"));
    expect(rules.isAllowed("/over-ons")).toBe(true);
    expect(rules.isAllowed("/geheim")).toBe(false);
  });

  it("ondersteunt wildcards (*) in patronen", () => {
    const rules = parseRobotsTxt(["User-agent: *", "Disallow: /*.pdf"].join("\n"));
    expect(rules.isAllowed("/brochure.pdf")).toBe(false);
    expect(rules.isAllowed("/over-ons")).toBe(true);
  });

  it("geeft prioriteit aan een groep die specifiek onze bot noemt boven de *-groep", () => {
    const rules = parseRobotsTxt(
      ["User-agent: *", "Disallow: /over-ons", "", "User-agent: OutboundListAI-WebsiteIntelligence", "Disallow:"].join(
        "\n",
      ),
    );
    expect(rules.isAllowed("/over-ons")).toBe(true);
  });

  it("valt terug op de *-groep als er geen specifieke groep is", () => {
    const rules = parseRobotsTxt(["User-agent: EenAndereBot", "Disallow: /alles", "", "User-agent: *", "Disallow: /admin"].join("\n"));
    expect(rules.isAllowed("/alles")).toBe(true);
    expect(rules.isAllowed("/admin")).toBe(false);
  });
});

describe("fetchRobotsTxt", () => {
  it("staat alles toe als robots.txt niet bestaat (404)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const rules = await fetchRobotsTxt("https://bedrijf.nl", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(rules.isAllowed("/wat-dan-ook")).toBe(true);
  });

  it("staat alles toe als het ophalen van robots.txt een netwerkfout geeft", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network error"));
    const rules = await fetchRobotsTxt("https://bedrijf.nl", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(rules.isAllowed("/wat-dan-ook")).toBe(true);
  });

  it("respecteert een succesvol opgehaald robots.txt met een disallow-regel", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "User-agent: *\nDisallow: /prive",
    });
    const rules = await fetchRobotsTxt("https://bedrijf.nl", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(rules.isAllowed("/prive")).toBe(false);
    expect(rules.isAllowed("/over-ons")).toBe(true);
  });

  it("haalt robots.txt op vanaf de root van het origin", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    await fetchRobotsTxt("https://bedrijf.nl/ergens/anders", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [calledUrl] = fetchImpl.mock.calls[0];
    expect(String(calledUrl)).toBe("https://bedrijf.nl/robots.txt");
  });
});
