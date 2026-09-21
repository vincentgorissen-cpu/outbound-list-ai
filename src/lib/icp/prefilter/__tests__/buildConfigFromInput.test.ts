import { describe, expect, it } from "vitest";
import {
  buildPrefilterConfigFromInput,
  validatePrefilterConfig,
  type PrefilterFormInput,
} from "@/lib/icp/prefilter/buildConfigFromInput";
import { EMPTY_PREFILTER_CONFIG } from "@/lib/icp/prefilter/types";

function input(overrides: Partial<PrefilterFormInput> = {}): PrefilterFormInput {
  return {
    excludeInactief: false,
    excludeRechtsvormenCsv: "",
    excludeSbiCodePrefixesCsv: "",
    minAantalWerknemers: "",
    maxAantalWerknemers: "",
    allowedProvincies: [],
    ...overrides,
  };
}

describe("buildPrefilterConfigFromInput", () => {
  it("geeft de lege configuratie terug voor volledig lege invoer", () => {
    expect(buildPrefilterConfigFromInput(input())).toEqual(EMPTY_PREFILTER_CONFIG);
  });

  it("zet de inactief-checkbox om naar excludeStatuses", () => {
    expect(buildPrefilterConfigFromInput(input({ excludeInactief: true })).excludeStatuses).toEqual([
      "inactief",
    ]);
  });

  it("splitst kommagescheiden rechtsvormen en SBI-codeprefixes, en trimt spaties", () => {
    const config = buildPrefilterConfigFromInput(
      input({
        excludeRechtsvormenCsv: "Eenmanszaak,  VOF ,  ",
        excludeSbiCodePrefixesCsv: "56, 47",
      }),
    );
    expect(config.excludeRechtsvormen).toEqual(["Eenmanszaak", "VOF"]);
    expect(config.excludeSbiCodePrefixes).toEqual(["56", "47"]);
  });

  it("parseert min/max medewerkers als geheel getal", () => {
    const config = buildPrefilterConfigFromInput(
      input({ minAantalWerknemers: "10", maxAantalWerknemers: "500" }),
    );
    expect(config.minAantalWerknemers).toBe(10);
    expect(config.maxAantalWerknemers).toBe(500);
  });

  it("geeft null voor leeg of ongeldig min/max", () => {
    const config = buildPrefilterConfigFromInput(
      input({ minAantalWerknemers: "", maxAantalWerknemers: "abc" }),
    );
    expect(config.minAantalWerknemers).toBeNull();
    expect(config.maxAantalWerknemers).toBeNull();
  });

  it("zet een lege provincielijst om naar null", () => {
    expect(buildPrefilterConfigFromInput(input({ allowedProvincies: [] })).allowedProvincies).toBeNull();
  });

  it("bewaart een niet-lege provincielijst", () => {
    expect(
      buildPrefilterConfigFromInput(input({ allowedProvincies: ["Utrecht", "Limburg"] }))
        .allowedProvincies,
    ).toEqual(["Utrecht", "Limburg"]);
  });
});

describe("validatePrefilterConfig", () => {
  it("geeft null terug voor een consistente configuratie", () => {
    expect(
      validatePrefilterConfig(buildPrefilterConfigFromInput(input({ minAantalWerknemers: "10", maxAantalWerknemers: "500" }))),
    ).toBeNull();
  });

  it("geeft een foutmelding als het minimum hoger is dan het maximum", () => {
    const config = buildPrefilterConfigFromInput(
      input({ minAantalWerknemers: "500", maxAantalWerknemers: "10" }),
    );
    expect(validatePrefilterConfig(config)).toMatch(/minimum/i);
  });
});
