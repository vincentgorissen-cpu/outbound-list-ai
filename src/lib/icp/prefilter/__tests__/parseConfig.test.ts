import { describe, expect, it } from "vitest";
import { parsePrefilterConfig } from "@/lib/icp/prefilter/parseConfig";
import { EMPTY_PREFILTER_CONFIG } from "@/lib/icp/prefilter/types";

describe("parsePrefilterConfig", () => {
  it("geeft de lege configuratie terug voor null", () => {
    expect(parsePrefilterConfig(null)).toEqual(EMPTY_PREFILTER_CONFIG);
  });

  it("geeft de lege configuratie terug voor undefined", () => {
    expect(parsePrefilterConfig(undefined)).toEqual(EMPTY_PREFILTER_CONFIG);
  });

  it("geeft de lege configuratie terug voor een corrupte waarde (array, string, getal)", () => {
    expect(parsePrefilterConfig([] as never)).toEqual(EMPTY_PREFILTER_CONFIG);
    expect(parsePrefilterConfig("oeps" as never)).toEqual(EMPTY_PREFILTER_CONFIG);
    expect(parsePrefilterConfig(42 as never)).toEqual(EMPTY_PREFILTER_CONFIG);
  });

  it("parseert een volledig ingevulde, geldige configuratie", () => {
    const parsed = parsePrefilterConfig({
      excludeStatuses: ["inactief"],
      excludeRechtsvormen: ["Eenmanszaak"],
      excludeSbiCodePrefixes: ["56"],
      minAantalWerknemers: 10,
      maxAantalWerknemers: 500,
      allowedProvincies: ["Utrecht", "Noord-Holland"],
    });
    expect(parsed).toEqual({
      excludeStatuses: ["inactief"],
      excludeRechtsvormen: ["Eenmanszaak"],
      excludeSbiCodePrefixes: ["56"],
      minAantalWerknemers: 10,
      maxAantalWerknemers: 500,
      allowedProvincies: ["Utrecht", "Noord-Holland"],
    });
  });

  it("filtert onherkende statuswaarden eruit in plaats van te crashen", () => {
    const parsed = parsePrefilterConfig({ excludeStatuses: ["inactief", "onbestaand"] });
    expect(parsed.excludeStatuses).toEqual(["inactief"]);
  });

  it("valt terug op null/lege lijst voor ontbrekende velden", () => {
    expect(parsePrefilterConfig({})).toEqual(EMPTY_PREFILTER_CONFIG);
  });

  it("negeert een lege allowedProvincies-lijst (wordt null, net als geen beperking)", () => {
    const parsed = parsePrefilterConfig({ allowedProvincies: [] });
    expect(parsed.allowedProvincies).toBeNull();
  });
});
