import { describe, expect, it, vi } from "vitest";
import { runIcpForCompany, type IcpCompanyCandidate } from "@/lib/icp/runIcpForCompany";
import { EMPTY_PREFILTER_CONFIG } from "@/lib/icp/prefilter/types";
import { IcpScoringError } from "@/lib/icp/scoreCompany";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

vi.mock("@/lib/icp/scoreCompany", async () => {
  const actual = await vi.importActual<typeof import("@/lib/icp/scoreCompany")>("@/lib/icp/scoreCompany");
  return { ...actual, scoreCompanyIcpFit: vi.fn() };
});

import { scoreCompanyIcpFit } from "@/lib/icp/scoreCompany";

function buildSupabaseMock() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ upsert });
  const supabase = { from } as unknown as SupabaseClient<Database>;
  return { supabase, from, upsert };
}

function company(overrides: Partial<IcpCompanyCandidate> = {}): IcpCompanyCandidate {
  return {
    importRowId: "row-1",
    officieleNaam: "Acme B.V.",
    rechtsvorm: "Besloten vennootschap",
    status: "actief",
    sbiCodes: ["2830"],
    sbiOmschrijvingen: ["Machinebouw"],
    aantalWerkzamePersonen: 50,
    plaats: "Utrecht",
    website: "https://acme.nl",
    ...overrides,
  };
}

describe("runIcpForCompany", () => {
  it("slaat een uitsluiting op en doet geen AI-aanroep wanneer de voorfilters het bedrijf uitsluiten", async () => {
    const { supabase, upsert } = buildSupabaseMock();

    const outcome = await runIcpForCompany(supabase, {
      userId: "user-1",
      icpProfileDescription: "Industriële automatisering",
      prefilterConfig: { ...EMPTY_PREFILTER_CONFIG, excludeStatuses: ["inactief"] },
      company: company({ status: "inactief" }),
    });

    expect(outcome).toEqual({ outcome: "excluded", reason: expect.stringContaining("inactief") });
    expect(scoreCompanyIcpFit).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({ status: "excluded_by_prefilter" });
  });

  it("scoort het bedrijf en slaat het resultaat op wanneer het de voorfilters doorstaat", async () => {
    const { supabase, upsert } = buildSupabaseMock();
    vi.mocked(scoreCompanyIcpFit).mockResolvedValue({
      score: 85,
      classification: "high_fit",
      reasons: ["Past qua sector"],
      concerns: [],
      confidence: 0.9,
    });

    const outcome = await runIcpForCompany(supabase, {
      userId: "user-1",
      icpProfileDescription: "Industriële automatisering",
      prefilterConfig: EMPTY_PREFILTER_CONFIG,
      company: company(),
    });

    expect(outcome).toEqual({ outcome: "scored" });
    expect(scoreCompanyIcpFit).toHaveBeenCalledWith(
      "Industriële automatisering",
      expect.objectContaining({ bedrijfsnaam: "Acme B.V." }),
    );
    expect(upsert.mock.calls[0][0]).toMatchObject({ status: "scored", score: 85 });
  });

  it("geeft de opgeschoonde websitetekst door als bedrijfsomschrijving aan de AI-scoring", async () => {
    const { supabase } = buildSupabaseMock();
    vi.mocked(scoreCompanyIcpFit).mockResolvedValue({
      score: 60,
      classification: "medium_fit",
      reasons: [],
      concerns: [],
      confidence: 0.5,
    });

    await runIcpForCompany(supabase, {
      userId: "user-1",
      icpProfileDescription: "Industriële automatisering",
      prefilterConfig: EMPTY_PREFILTER_CONFIG,
      company: company({ bedrijfsomschrijving: "Wij maken precisieonderdelen voor de machinebouw." }),
    });

    expect(scoreCompanyIcpFit).toHaveBeenCalledWith(
      "Industriële automatisering",
      expect.objectContaining({ bedrijfsomschrijving: "Wij maken precisieonderdelen voor de machinebouw." }),
    );
  });

  it("slaat ai_processing_failed op wanneer de AI-aanroep mislukt, zonder te gooien", async () => {
    const { supabase, upsert } = buildSupabaseMock();
    vi.mocked(scoreCompanyIcpFit).mockRejectedValue(new IcpScoringError("AI-aanroep mislukt: timeout"));

    const outcome = await runIcpForCompany(supabase, {
      userId: "user-1",
      icpProfileDescription: "Industriële automatisering",
      prefilterConfig: EMPTY_PREFILTER_CONFIG,
      company: company(),
    });

    expect(outcome).toEqual({ outcome: "failed", message: "AI-aanroep mislukt: timeout" });
    expect(upsert.mock.calls[0][0]).toMatchObject({
      status: "ai_processing_failed",
      error_message: "AI-aanroep mislukt: timeout",
    });
  });
});
