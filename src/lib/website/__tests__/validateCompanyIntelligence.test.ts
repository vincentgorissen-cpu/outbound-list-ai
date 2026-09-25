import { describe, expect, it } from "vitest";
import { validateCompanyIntelligence } from "@/lib/website/validateCompanyIntelligence";

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    company_description: "Machinebouwer voor de voedingsmiddelenindustrie.",
    products_services: ["Verpakkingsmachines", "Onderhoud"],
    industries_served: ["Voedingsmiddelen"],
    target_markets: ["Nederland", "België"],
    business_model: "B2B",
    operational_signals: ["eigen productie", "meerdere vestigingen"],
    locations: ["Utrecht", "Eindhoven"],
    confidence: 0.8,
    evidence: ["Pagina 1 (homepage): noemt eigen productiehal", "Pagina 2 (over ons): twee vestigingen genoemd"],
    ...overrides,
  };
}

describe("validateCompanyIntelligence", () => {
  it("accepteert een volledig, correct ingevuld antwoord", () => {
    const result = validateCompanyIntelligence(validInput());
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.companyDescription).toBe("Machinebouwer voor de voedingsmiddelenindustrie.");
      expect(result.value.productsServices).toEqual(["Verpakkingsmachines", "Onderhoud"]);
      expect(result.value.confidence).toBe(0.8);
      expect(result.value.evidence).toHaveLength(2);
    }
  });

  it("normaliseert null en lege string allebei naar null voor company_description/business_model", () => {
    const nullResult = validateCompanyIntelligence(validInput({ company_description: null, business_model: null }));
    expect(nullResult.valid).toBe(true);
    if (nullResult.valid) {
      expect(nullResult.value.companyDescription).toBeNull();
      expect(nullResult.value.businessModel).toBeNull();
    }

    const emptyResult = validateCompanyIntelligence(validInput({ company_description: "   ", business_model: "" }));
    expect(emptyResult.valid).toBe(true);
    if (emptyResult.valid) {
      expect(emptyResult.value.companyDescription).toBeNull();
      expect(emptyResult.value.businessModel).toBeNull();
    }
  });

  it("accepteert lege lijsten wanneer de website geen bewijs geeft (nooit gokken)", () => {
    const result = validateCompanyIntelligence(
      validInput({
        products_services: [],
        industries_served: [],
        target_markets: [],
        operational_signals: [],
        locations: [],
        evidence: [],
        confidence: 0.1,
      }),
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.productsServices).toEqual([]);
      expect(result.value.operationalSignals).toEqual([]);
    }
  });

  it("wijst een niet-object antwoord af", () => {
    expect(validateCompanyIntelligence("niet een object")).toEqual({
      valid: false,
      error: expect.stringContaining("geen object"),
    });
    expect(validateCompanyIntelligence(null)).toEqual({ valid: false, error: expect.any(String) });
  });

  it("wijst een company_description af die geen tekst of null is", () => {
    const result = validateCompanyIntelligence(validInput({ company_description: 123 }));
    expect(result).toEqual({ valid: false, error: expect.stringContaining("company_description") });
  });

  it("wijst een te lange company_description af", () => {
    const result = validateCompanyIntelligence(validInput({ company_description: "x".repeat(2001) }));
    expect(result).toEqual({ valid: false, error: expect.stringContaining("2000") });
  });

  it("wijst producten/diensten af die geen lijst van tekst zijn", () => {
    expect(validateCompanyIntelligence(validInput({ products_services: "geen lijst" }))).toEqual({
      valid: false,
      error: expect.stringContaining("products_services"),
    });
    expect(validateCompanyIntelligence(validInput({ products_services: [1, 2] }))).toEqual({
      valid: false,
      error: expect.stringContaining("products_services"),
    });
  });

  it("wijst een ontbrekende of ongeldige confidence af", () => {
    expect(validateCompanyIntelligence(validInput({ confidence: "hoog" }))).toEqual({
      valid: false,
      error: expect.stringContaining("confidence"),
    });
    expect(validateCompanyIntelligence(validInput({ confidence: 1.5 }))).toEqual({
      valid: false,
      error: expect.stringContaining("confidence"),
    });
    expect(validateCompanyIntelligence(validInput({ confidence: -0.1 }))).toEqual({
      valid: false,
      error: expect.stringContaining("confidence"),
    });
  });

  it("wijst evidence af die geen lijst van tekst is", () => {
    expect(validateCompanyIntelligence(validInput({ evidence: [{ page: 1 }] }))).toEqual({
      valid: false,
      error: expect.stringContaining("evidence"),
    });
  });

  it("kapt te lange of lege losse items af in plaats van de hele extractie af te keuren", () => {
    const result = validateCompanyIntelligence(
      validInput({
        products_services: ["Geldig product", "  ", "x".repeat(201)],
      }),
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.productsServices).toEqual(["Geldig product"]);
    }
  });

  it("beperkt het aantal items per lijst", () => {
    const result = validateCompanyIntelligence(
      validInput({ products_services: Array.from({ length: 30 }, (_, i) => `Product ${i}`) }),
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.productsServices).toHaveLength(20);
    }
  });
});
