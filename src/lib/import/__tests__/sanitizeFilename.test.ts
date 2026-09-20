import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "@/lib/import/sanitizeFilename";

describe("sanitizeFilename", () => {
  it("laat veilige bestandsnamen ongewijzigd", () => {
    expect(sanitizeFilename("bedrijven-lijst_2024.csv")).toBe(
      "bedrijven-lijst_2024.csv",
    );
  });

  it("vervangt padseparators zodat er geen path traversal mogelijk is", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFilename("..\\..\\windows\\win.ini")).not.toContain("\\");
  });

  it("vervangt spaties en speciale tekens", () => {
    expect(sanitizeFilename("mijn bedrijven (definitief)!.xlsx")).toBe(
      "mijn_bedrijven__definitief__.xlsx",
    );
  });

  it("geeft een fallback naam terug voor een lege input", () => {
    expect(sanitizeFilename("")).toBe("bestand");
  });
});
