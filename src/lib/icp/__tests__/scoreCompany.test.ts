import { describe, expect, it, vi } from "vitest";
import { IcpScoringError, scoreCompanyIcpFit } from "@/lib/icp/scoreCompany";
import type { IcpScoringClient } from "@/lib/icp/scoreCompany";
import type { CompanyForScoring } from "@/lib/icp/types";

const ICP_PROFILE =
  "Wij verkopen industriële automatisering aan Nederlandse productiebedrijven met 50 tot 500 medewerkers.";

const COMPANY: CompanyForScoring = {
  bedrijfsnaam: "Acme Machinebouw BV",
  sbiOmschrijvingen: ["Machinebouw"],
  aantalWerkzamePersonen: 120,
  plaats: "Eindhoven",
  website: "https://acme.nl",
};

const VALID_RESULT = {
  score: 90,
  classification: "high_fit",
  reasons: ["Machinebouw past bij de doelgroep", "Bedrijfsgrootte binnen de range"],
  concerns: [],
  confidence: 0.85,
  missing_important_data: [],
  key_sales_signals: ["120 medewerkers"],
};

describe("scoreCompanyIcpFit", () => {
  it("stuurt alleen de toegestane bedrijfsgegevens mee, geen contactgegevens", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "tool_use", input: VALID_RESULT }] });
    const client: IcpScoringClient = { messages: { create } };

    await scoreCompanyIcpFit(ICP_PROFILE, COMPANY, client);

    const call = create.mock.calls[0][0];
    expect(call.tool_choice).toEqual({ type: "tool", name: "score_icp_fit" });
    const promptText = call.messages[0].content;
    expect(promptText).toContain("Acme Machinebouw BV");
    expect(promptText).toContain("Machinebouw");
    expect(promptText).toContain("120");
    expect(promptText).toContain("Eindhoven");
    expect(promptText).toContain("acme.nl");
    expect(promptText).toContain(ICP_PROFILE);
  });

  it("geeft het gevalideerde resultaat terug bij een geldig antwoord", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "tool_use", input: VALID_RESULT }] });
    const client: IcpScoringClient = { messages: { create } };

    const result = await scoreCompanyIcpFit(ICP_PROFILE, COMPANY, client);

    expect(result).toEqual({
      score: 90,
      classification: "high_fit",
      reasons: ["Machinebouw past bij de doelgroep", "Bedrijfsgrootte binnen de range"],
      concerns: [],
      confidence: 0.85,
      missingImportantData: [],
      keySalesSignals: ["120 medewerkers"],
    });
  });

  it("gooit IcpScoringError als de AI-aanroep zelf faalt", async () => {
    const create = vi.fn().mockRejectedValue(new Error("network down"));
    const client: IcpScoringClient = { messages: { create } };

    await expect(scoreCompanyIcpFit(ICP_PROFILE, COMPANY, client)).rejects.toBeInstanceOf(
      IcpScoringError,
    );
  });

  it("gooit IcpScoringError als er geen tool_use in het antwoord zit", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text" }] });
    const client: IcpScoringClient = { messages: { create } };

    await expect(scoreCompanyIcpFit(ICP_PROFILE, COMPANY, client)).rejects.toBeInstanceOf(
      IcpScoringError,
    );
  });

  it("gooit IcpScoringError als het antwoord niet aan het schema voldoet", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", input: { ...VALID_RESULT, score: 500 } }],
    });
    const client: IcpScoringClient = { messages: { create } };

    await expect(scoreCompanyIcpFit(ICP_PROFILE, COMPANY, client)).rejects.toThrow(/schema/);
  });

  it("vermeldt 'onbekend' voor ontbrekende bedrijfsgegevens in plaats van te crashen", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "tool_use", input: VALID_RESULT }] });
    const client: IcpScoringClient = { messages: { create } };

    await scoreCompanyIcpFit(
      ICP_PROFILE,
      { bedrijfsnaam: "Onbekend BV", sbiOmschrijvingen: [], aantalWerkzamePersonen: null, plaats: null, website: null },
      client,
    );

    const promptText = create.mock.calls[0][0].messages[0].content;
    expect(promptText).toContain("onbekend");
    expect(promptText).toContain("Geen bruikbare website-informatie beschikbaar");
  });

  it("labelt elk gevuld datapunt met zijn bron", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "tool_use", input: VALID_RESULT }] });
    const client: IcpScoringClient = { messages: { create } };

    await scoreCompanyIcpFit(ICP_PROFILE, COMPANY, client);

    const promptText = create.mock.calls[0][0].messages[0].content;
    expect(promptText).toContain("Eindhoven (bron: upload)");
    expect(promptText).toContain("Machinebouw (bron: KVK)");
    expect(promptText).toContain("120 (bron: KVK)");
  });

  it("neemt de gestructureerde website-intelligence op als apart, gelabeld blok", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "tool_use", input: VALID_RESULT }] });
    const client: IcpScoringClient = { messages: { create } };

    await scoreCompanyIcpFit(
      ICP_PROFILE,
      {
        ...COMPANY,
        productsServices: ["Verpakkingsmachines"],
        industriesServed: ["Voeding"],
        operationalSignals: ["eigen productie"],
      },
      client,
    );

    const promptText = create.mock.calls[0][0].messages[0].content;
    expect(promptText).toContain("Website-analyse (bron: website):");
    expect(promptText).toContain("Producten/diensten: Verpakkingsmachines");
    expect(promptText).toContain("Operationele signalen: eigen productie");
  });

  it("stuurt expliciete instructies mee: nooit gokken, score los van confidence, insufficient_data alleen bij echt te weinig data", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "tool_use", input: VALID_RESULT }] });
    const client: IcpScoringClient = { messages: { create } };

    await scoreCompanyIcpFit(ICP_PROFILE, COMPANY, client);

    const promptText = create.mock.calls[0][0].messages[0].content;
    expect(promptText).toContain("Verzin of gok nooit");
    expect(promptText).toContain("insufficient_data");
  });

  it("accepteert classification 'insufficient_data'", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: { ...VALID_RESULT, classification: "insufficient_data", score: 0, confidence: 0.1 },
        },
      ],
    });
    const client: IcpScoringClient = { messages: { create } };

    const result = await scoreCompanyIcpFit(ICP_PROFILE, COMPANY, client);
    expect(result.classification).toBe("insufficient_data");
  });
});
