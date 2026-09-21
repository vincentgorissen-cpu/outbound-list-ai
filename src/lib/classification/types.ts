/**
 * Zuiver juridische/rechtsvorm-classificatie op basis van KVK-gegevens.
 * Dit zegt NIETS over of een bedrijf gebeld mag of kan worden (bijv.
 * bel-me-niet-register, opt-out, contactvoorkeuren) — dat is een aparte
 * afweging die hier bewust buiten beschouwing blijft.
 */
export type CompanyClassification =
  | "legal_entity"
  | "natural_person_business"
  | "partnership"
  | "inactive"
  | "unknown";

export interface ClassifyCompanyInput {
  /** Rechtsvorm zoals opgehaald bij de KVK (bijv. "Besloten vennootschap"). */
  rechtsvorm: string | null;
  /** Actief/inactief zoals afgeleid in enrichCompany.ts; ontbreekt = onbekend. */
  status?: "actief" | "inactief" | null;
}
