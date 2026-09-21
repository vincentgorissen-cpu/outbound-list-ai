import { describe, expect, it } from "vitest";
import { buildCompanyResultRows } from "@/lib/results/buildCompanyResults";
import type { IcpScoreRow, KvkEnrichmentRow, KvkMatchRow } from "@/lib/types/database.types";

function importRow(id: string, bedrijfsnaam: string, plaats: string | null = null) {
  return { id, bedrijfsnaam, plaats };
}

function enrichment(overrides: Partial<KvkEnrichmentRow> & { import_row_id: string }): KvkEnrichmentRow {
  return {
    id: `enr-${overrides.import_row_id}`,
    user_id: "user-1",
    kvk_nummer: "68750110",
    officiele_naam: "Test BV",
    handelsnamen: [],
    rechtsvorm: "Besloten vennootschap",
    status: "actief",
    sbi_codes: [],
    sbi_omschrijvingen: [],
    aantal_werkzame_personen: null,
    vestigingsplaats: null,
    website: null,
    opgehaald_op: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function match(overrides: Partial<KvkMatchRow> & { import_row_id: string }): KvkMatchRow {
  return {
    id: `match-${overrides.import_row_id}`,
    user_id: "user-1",
    status: "review_required",
    chosen_kvk_nummer: "68750110",
    confidence: 80,
    candidates: [],
    gecontroleerd_op: "2026-01-01T00:00:00.000Z",
    resolution: null,
    resolved_kvk_nummer: null,
    resolved_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function icpScore(overrides: Partial<IcpScoreRow> & { import_row_id: string }): IcpScoreRow {
  return {
    id: `icp-${overrides.import_row_id}`,
    user_id: "user-1",
    status: "scored",
    score: 85,
    classification: "high_fit",
    reasons: ["Past qua sector"],
    concerns: [],
    confidence: 0.9,
    error_message: null,
    scored_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildCompanyResultRows", () => {
  it("markeert een bedrijf zonder enrichment/match/icp als 'nieuw'", () => {
    const [row] = buildCompanyResultRows([importRow("1", "Acme")], [], [], []);
    expect(row.status).toBe("nieuw");
    expect(row.officieleNaam).toBeNull();
    expect(row.bedrijfsclassificatie).toBe("unknown");
    expect(row.reviewRequired).toBe(false);
  });

  it("markeert een verrijkt bedrijf zonder ICP-score als 'verrijkt'", () => {
    const [row] = buildCompanyResultRows(
      [importRow("1", "Acme")],
      [enrichment({ import_row_id: "1" })],
      [],
      [],
    );
    expect(row.status).toBe("verrijkt");
    expect(row.officieleNaam).toBe("Test BV");
    expect(row.bedrijfsclassificatie).toBe("legal_entity");
  });

  it("markeert een verrijkt en gescoord bedrijf als 'compleet'", () => {
    const [row] = buildCompanyResultRows(
      [importRow("1", "Acme")],
      [enrichment({ import_row_id: "1" })],
      [],
      [icpScore({ import_row_id: "1" })],
    );
    expect(row.status).toBe("compleet");
    expect(row.icpScore).toBe(85);
    expect(row.icpClassification).toBe("high_fit");
    expect(row.belangrijksteReden).toBe("Past qua sector");
  });

  it("markeert een onopgeloste review_required-match als 'controle_nodig'", () => {
    const [row] = buildCompanyResultRows(
      [importRow("1", "Acme")],
      [],
      [match({ import_row_id: "1", status: "review_required", resolution: null })],
      [],
    );
    expect(row.status).toBe("controle_nodig");
    expect(row.reviewRequired).toBe(true);
    expect(row.kvkMatchConfidence).toBe(80);
  });

  it("markeert een onopgeloste no_reliable_match ook als 'controle_nodig'", () => {
    const [row] = buildCompanyResultRows(
      [importRow("1", "Acme")],
      [],
      [match({ import_row_id: "1", status: "no_reliable_match", resolution: null, confidence: 20 })],
      [],
    );
    expect(row.status).toBe("controle_nodig");
    expect(row.reviewRequired).toBe(true);
  });

  it("is geen 'controle_nodig' meer zodra de match is bevestigd of afgewezen", () => {
    const [bevestigd] = buildCompanyResultRows(
      [importRow("1", "Acme")],
      [enrichment({ import_row_id: "1" })],
      [match({ import_row_id: "1", status: "review_required", resolution: "confirmed" })],
      [],
    );
    expect(bevestigd.reviewRequired).toBe(false);
    expect(bevestigd.status).toBe("verrijkt");

    const [afgewezen] = buildCompanyResultRows(
      [importRow("2", "Beta")],
      [],
      [match({ import_row_id: "2", status: "review_required", resolution: "rejected" })],
      [],
    );
    expect(afgewezen.reviewRequired).toBe(false);
    expect(afgewezen.status).toBe("afgewezen");
  });

  it("markeert een mislukte AI-scoring als 'icp_mislukt', met voorrang op andere statussen", () => {
    const [row] = buildCompanyResultRows(
      [importRow("1", "Acme")],
      [enrichment({ import_row_id: "1" })],
      [],
      [icpScore({ import_row_id: "1", status: "ai_processing_failed", score: null, classification: null, reasons: [] })],
    );
    expect(row.status).toBe("icp_mislukt");
    expect(row.icpScore).toBeNull();
  });

  it("valt terug op de oorspronkelijke plaats als er nog geen KVK-verrijking is", () => {
    const [row] = buildCompanyResultRows([importRow("1", "Acme", "Utrecht")], [], [], []);
    expect(row.plaats).toBe("Utrecht");
  });

  it("geeft voorrang aan de geverifieerde vestigingsplaats boven de oorspronkelijke plaats", () => {
    const [row] = buildCompanyResultRows(
      [importRow("1", "Acme", "Utrecht (opgegeven)")],
      [enrichment({ import_row_id: "1", vestigingsplaats: "Utrecht" })],
      [],
      [],
    );
    expect(row.plaats).toBe("Utrecht");
  });

  it("voegt meerdere SBI-omschrijvingen samen tot één leesbare tekst", () => {
    const [row] = buildCompanyResultRows(
      [importRow("1", "Acme")],
      [enrichment({ import_row_id: "1", sbi_omschrijvingen: ["Machinebouw", "Groothandel in machines"] })],
      [],
      [],
    );
    expect(row.sbiActiviteit).toBe("Machinebouw, Groothandel in machines");
  });

  it("geeft null voor kvkMatchConfidence als het kvk-nummer direct was aangeleverd (geen matchrij)", () => {
    const [row] = buildCompanyResultRows(
      [importRow("1", "Acme")],
      [enrichment({ import_row_id: "1" })],
      [],
      [],
    );
    expect(row.kvkMatchConfidence).toBeNull();
  });

  it("leidt een inactieve classificatie af, ook als de rechtsvorm een BV is", () => {
    const [row] = buildCompanyResultRows(
      [importRow("1", "Acme")],
      [enrichment({ import_row_id: "1", rechtsvorm: "Besloten vennootschap", status: "inactief" })],
      [],
      [],
    );
    expect(row.bedrijfsclassificatie).toBe("inactive");
    expect(row.kvkStatus).toBe("inactief");
  });

  it("verwerkt meerdere bedrijven onafhankelijk van elkaar in dezelfde aanroep", () => {
    const rows = buildCompanyResultRows(
      [importRow("1", "Acme"), importRow("2", "Beta")],
      [enrichment({ import_row_id: "1" })],
      [],
      [icpScore({ import_row_id: "1" })],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("compleet");
    expect(rows[1].status).toBe("nieuw");
  });
});
