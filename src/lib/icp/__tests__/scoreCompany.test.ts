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

    expect(result).toEqual(VALID_RESULT);
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
  });
});
