import { describe, expect, it, vi } from "vitest";
import { extractCompanyIntelligence, type IntelligenceExtractionClient } from "@/lib/website/extractCompanyIntelligence";
import type { PageForExtraction } from "@/lib/website/companyIntelligenceTypes";

function pages(overrides: Partial<PageForExtraction>[] = []): PageForExtraction[] {
  const defaults: PageForExtraction[] = [
    { pageUrl: "https://acme.nl/", pageType: "homepage", cleanedText: "Acme maakt verpakkingsmachines." },
    { pageUrl: "https://acme.nl/over-ons", pageType: "about", cleanedText: "Wij hebben een eigen fabriek in Utrecht." },
  ];
  return overrides.length > 0 ? (overrides as PageForExtraction[]) : defaults;
}

function validToolInput(overrides: Record<string, unknown> = {}) {
  return {
    company_description: "Machinebouwer.",
    products_services: ["Verpakkingsmachines"],
    industries_served: [],
    target_markets: [],
    business_model: null,
    operational_signals: ["eigen productie"],
    locations: ["Utrecht"],
    confidence: 0.7,
    evidence: ["Pagina 2 (about): noemt eigen fabriek"],
    ...overrides,
  };
}

function mockClient(createImpl: IntelligenceExtractionClient["messages"]["create"]): IntelligenceExtractionClient {
  return { messages: { create: createImpl } };
}

describe("extractCompanyIntelligence", () => {
  it("geeft extraction_failed terug zonder AI-aanroep als er geen pagina's zijn", async () => {
    const create = vi.fn();
    const result = await extractCompanyIntelligence([], mockClient(create));
    expect(result).toEqual({ status: "extraction_failed", errorMessage: expect.stringContaining("Geen websitetekst") });
    expect(create).not.toHaveBeenCalled();
  });

  it("geeft 'extracted' terug met de gevalideerde data bij een direct geldig antwoord", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", id: "toolu_1", input: validToolInput() }],
    });

    const result = await extractCompanyIntelligence(pages(), mockClient(create));

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("extracted");
    if (result.status === "extracted") {
      expect(result.data.companyDescription).toBe("Machinebouwer.");
      expect(result.data.operationalSignals).toEqual(["eigen productie"]);
      expect(result.data.evidence).toEqual(["Pagina 2 (about): noemt eigen fabriek"]);
    }
  });

  it("labelt de meegegeven pagina's met nummer/type/URL in de prompt", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", id: "toolu_1", input: validToolInput() }],
    });

    await extractCompanyIntelligence(pages(), mockClient(create));

    const params = create.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const prompt = params.messages[0]!.content;
    expect(prompt).toContain("[Pagina 1 — homepage — https://acme.nl/]");
    expect(prompt).toContain("[Pagina 2 — about — https://acme.nl/over-ons]");
    expect(prompt).toContain("Acme maakt verpakkingsmachines.");
  });

  it("dwingt het model om de extractietool te gebruiken", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", id: "toolu_1", input: validToolInput() }],
    });

    await extractCompanyIntelligence(pages(), mockClient(create));

    const params = create.mock.calls[0][0] as { tool_choice: { type: string; name: string } };
    expect(params.tool_choice).toEqual({ type: "tool", name: "extract_company_intelligence" });
  });

  it("doet precies één gecontroleerde reparatiepoging als het eerste antwoord ongeldig is, en gebruikt die als hij wél geldig is", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: "tool_use", id: "toolu_1", input: { confidence: "te hoog" } }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "tool_use", id: "toolu_2", input: validToolInput() }],
      });

    const result = await extractCompanyIntelligence(pages(), mockClient(create));

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("extracted");

    const secondCallParams = create.mock.calls[1][0] as { messages: unknown[] };
    expect(secondCallParams.messages).toHaveLength(3);
  });

  it("markeert extraction_failed als ook de reparatiepoging ongeldig is — nooit een derde poging", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: "tool_use", id: "toolu_1", input: { confidence: "te hoog" } }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "tool_use", id: "toolu_2", input: { confidence: "nog steeds fout" } }],
      });

    const result = await extractCompanyIntelligence(pages(), mockClient(create));

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("extraction_failed");
  });

  it("markeert extraction_failed als de AI-aanroep zelf een fout gooit", async () => {
    const create = vi.fn().mockRejectedValue(new Error("netwerkfout"));

    const result = await extractCompanyIntelligence(pages(), mockClient(create));

    expect(result).toEqual({ status: "extraction_failed", errorMessage: expect.stringContaining("netwerkfout") });
  });

  it("markeert extraction_failed als het model geen tool_use teruggeeft", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text" }] });

    const result = await extractCompanyIntelligence(pages(), mockClient(create));

    expect(result).toEqual({ status: "extraction_failed", errorMessage: expect.stringContaining("bruikbaar antwoord") });
  });

  it("markeert extraction_failed als de reparatiepoging zelf een fout gooit", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: "tool_use", id: "toolu_1", input: { confidence: "te hoog" } }],
      })
      .mockRejectedValueOnce(new Error("timeout bij reparatie"));

    const result = await extractCompanyIntelligence(pages(), mockClient(create));

    expect(result).toEqual({ status: "extraction_failed", errorMessage: expect.stringContaining("timeout bij reparatie") });
  });

  it("respecteert dezelfde maximale gecombineerde tekstlengte als de opschoonstap, ook per-pagina gelabeld", async () => {
    const longPages: PageForExtraction[] = Array.from({ length: 5 }, (_, i) => ({
      pageUrl: `https://acme.nl/pagina-${i}`,
      pageType: "products",
      cleanedText: "x".repeat(4000),
    }));
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", id: "toolu_1", input: validToolInput() }],
    });

    await extractCompanyIntelligence(longPages, mockClient(create));

    const params = create.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const prompt = params.messages[0]!.content;
    // 5 * 4000 = 20000 > MAX_COMBINED_TEXT_LENGTH (12000) — het gelabelde
    // paginablok mag dat budget niet fors overschrijden.
    expect(prompt.length).toBeLessThan(20000);
  });
});
