import { describe, expect, it } from "vitest";
import { isProtectedPath } from "@/lib/routes";

describe("isProtectedPath", () => {
  it("beschermt het dashboard en subroutes", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/instellingen")).toBe(true);
  });

  it("laat publieke routes met rust", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
  });

  it("matcht geen paden die toevallig met dezelfde tekst beginnen", () => {
    expect(isProtectedPath("/dashboard-info")).toBe(false);
  });
});
