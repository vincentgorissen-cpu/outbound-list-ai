import { describe, expect, it } from "vitest";
import { resolveProvincie } from "@/lib/icp/prefilter/provincies";

describe("resolveProvincie", () => {
  it("herkent grote steden, hoofdletterongevoelig", () => {
    expect(resolveProvincie("Amsterdam")).toBe("Noord-Holland");
    expect(resolveProvincie("rotterdam")).toBe("Zuid-Holland");
    expect(resolveProvincie("EINDHOVEN")).toBe("Noord-Brabant");
  });

  it("verdraagt omringende spaties", () => {
    expect(resolveProvincie("  Utrecht  ")).toBe("Utrecht");
  });

  it("geeft null voor een onbekende plaats", () => {
    expect(resolveProvincie("Een fictief gehucht")).toBeNull();
  });

  it("geeft null voor null", () => {
    expect(resolveProvincie(null)).toBeNull();
  });
});
