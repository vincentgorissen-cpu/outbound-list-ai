import { describe, expect, it } from "vitest";
import { classifyMatchScore } from "@/lib/kvk/classifyMatchScore";

describe("classifyMatchScore", () => {
  it("classificeert 90 en hoger als high_confidence", () => {
    expect(classifyMatchScore(90)).toBe("high_confidence");
    expect(classifyMatchScore(100)).toBe("high_confidence");
  });

  it("classificeert 70 t/m 89 als review_required", () => {
    expect(classifyMatchScore(70)).toBe("review_required");
    expect(classifyMatchScore(89)).toBe("review_required");
  });

  it("classificeert onder de 70 als no_reliable_match", () => {
    expect(classifyMatchScore(69)).toBe("no_reliable_match");
    expect(classifyMatchScore(0)).toBe("no_reliable_match");
  });
});
