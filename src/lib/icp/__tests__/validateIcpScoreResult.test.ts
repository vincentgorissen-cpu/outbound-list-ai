import { describe, expect, it } from "vitest";
import { validateIcpScoreResult } from "@/lib/icp/validateIcpScoreResult";

const VALID = {
  score: 85,
  classification: "high_fit",
  reasons: ["Past qua sector", "Past qua bedrijfsgrootte"],
  concerns: ["Geen website bekend"],
  confidence: 0.8,
  missing_important_data: [],
  key_sales_signals: ["Eigen productie"],
};

describe("validateIcpScoreResult", () => {
  it("accepteert een volledig geldig object en zet snake_case om naar camelCase", () => {
    const result = validateIcpScoreResult(VALID);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value).toEqual({
        score: 85,
        classification: "high_fit",
        reasons: ["Past qua sector", "Past qua bedrijfsgrootte"],
        concerns: ["Geen website bekend"],
        confidence: 0.8,
        missingImportantData: [],
        keySalesSignals: ["Eigen productie"],
      });
    }
  });

  it("accepteert lege reasons/concerns-lijsten", () => {
    const result = validateIcpScoreResult({ ...VALID, reasons: [], concerns: [] });
    expect(result.valid).toBe(true);
  });

  it("accepteert de randwaarden 0 en 100 voor score, en 0.0/1.0 voor confidence", () => {
    expect(validateIcpScoreResult({ ...VALID, score: 0, confidence: 0 }).valid).toBe(true);
    expect(validateIcpScoreResult({ ...VALID, score: 100, confidence: 1 }).valid).toBe(true);
  });

  it("accepteert classification 'insufficient_data'", () => {
    expect(validateIcpScoreResult({ ...VALID, classification: "insufficient_data" }).valid).toBe(true);
  });

  it("wijst een niet-object af", () => {
    expect(validateIcpScoreResult(null).valid).toBe(false);
    expect(validateIcpScoreResult("een string").valid).toBe(false);
    expect(validateIcpScoreResult([1, 2, 3]).valid).toBe(false);
  });

  it("wijst een score buiten 0-100 af", () => {
    expect(validateIcpScoreResult({ ...VALID, score: -1 }).valid).toBe(false);
    expect(validateIcpScoreResult({ ...VALID, score: 101 }).valid).toBe(false);
  });

  it("wijst een niet-geheel getal als score af", () => {
    expect(validateIcpScoreResult({ ...VALID, score: 85.5 }).valid).toBe(false);
  });

  it("wijst een ongeldige classification af", () => {
    expect(validateIcpScoreResult({ ...VALID, classification: "super_fit" }).valid).toBe(false);
    expect(validateIcpScoreResult({ ...VALID, classification: "HIGH_FIT" }).valid).toBe(false);
  });

  it("wijst reasons/concerns af die geen lijst van strings zijn", () => {
    expect(validateIcpScoreResult({ ...VALID, reasons: "geen lijst" }).valid).toBe(false);
    expect(validateIcpScoreResult({ ...VALID, reasons: [1, 2, 3] }).valid).toBe(false);
    expect(validateIcpScoreResult({ ...VALID, concerns: null }).valid).toBe(false);
  });

  it("wijst missing_important_data/key_sales_signals af die geen lijst van strings zijn", () => {
    expect(validateIcpScoreResult({ ...VALID, missing_important_data: "geen lijst" }).valid).toBe(false);
    expect(validateIcpScoreResult({ ...VALID, key_sales_signals: [1, 2] }).valid).toBe(false);
  });

  it("wijst ontbrekende missing_important_data/key_sales_signals af", () => {
    const { missing_important_data: _m, ...withoutMissing } = VALID;
    expect(validateIcpScoreResult(withoutMissing).valid).toBe(false);
    const { key_sales_signals: _k, ...withoutSignals } = VALID;
    expect(validateIcpScoreResult(withoutSignals).valid).toBe(false);
  });

  it("wijst een confidence buiten 0.0-1.0 af", () => {
    expect(validateIcpScoreResult({ ...VALID, confidence: -0.1 }).valid).toBe(false);
    expect(validateIcpScoreResult({ ...VALID, confidence: 1.1 }).valid).toBe(false);
  });

  it("wijst ontbrekende velden af", () => {
    const { score: _score, ...withoutScore } = VALID;
    expect(validateIcpScoreResult(withoutScore).valid).toBe(false);
  });

  it("geeft een leesbare foutmelding mee bij een ongeldig object", () => {
    const result = validateIcpScoreResult({ ...VALID, score: 500 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/score/);
    }
  });
});
