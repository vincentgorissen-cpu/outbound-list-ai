import type { ClassifyCompanyInput, CompanyClassification } from "./types";

/**
 * De zes rechtspersonen uit Boek 2 BW: hebben eigen rechtspersoonlijkheid,
 * los van de oprichter(s).
 */
const LEGAL_ENTITY_KEYWORDS = [
  "besloten vennootschap",
  "naamloze vennootschap",
  "stichting",
  "vereniging",
  "cooperatie",
  "onderlinge waarborgmaatschappij",
];

/** De ondernemer zelf is de onderneming; geen aparte rechtsvorm. */
const NATURAL_PERSON_BUSINESS_KEYWORDS = ["eenmanszaak"];

/** Samenwerkingsvormen zonder eigen rechtspersoonlijkheid. */
const PARTNERSHIP_KEYWORDS = [
  "vennootschap onder firma",
  "maatschap",
  "commanditaire vennootschap",
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function matchesAny(normalizedValue: string, keywords: string[]): boolean {
  return keywords.some((keyword) => normalizedValue.includes(keyword));
}

/**
 * Classificeert een bedrijf op basis van rechtsvorm + status. Puur
 * deterministisch (geen AI/LLM): een vaste lijst trefwoorden per
 * categorie, met status "inactief" als sterkste signaal — een
 * opgeheven B.V. is voor deze classificatie "inactive", niet
 * "legal_entity", ongeacht de rechtsvorm.
 *
 * Dit is uitsluitend een juridische/rechtsvorm-classificatie. Het zegt
 * niets over of een bedrijf gebeld mag of kan worden.
 */
export function classifyCompany(input: ClassifyCompanyInput): CompanyClassification {
  if (input.status === "inactief") {
    return "inactive";
  }

  if (!input.rechtsvorm || input.rechtsvorm.trim() === "") {
    return "unknown";
  }

  const normalized = normalize(input.rechtsvorm);

  if (matchesAny(normalized, NATURAL_PERSON_BUSINESS_KEYWORDS)) {
    return "natural_person_business";
  }
  // Vóór partnership gecontroleerd: "onderlinge waarborgmaatschappij"
  // bevat toevallig de substring "maatschap", dus legal_entity moet
  // eerst de kans krijgen op zijn eigen, specifiekere trefwoorden.
  if (matchesAny(normalized, LEGAL_ENTITY_KEYWORDS)) {
    return "legal_entity";
  }
  if (matchesAny(normalized, PARTNERSHIP_KEYWORDS)) {
    return "partnership";
  }

  return "unknown";
}
