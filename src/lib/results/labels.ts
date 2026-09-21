import type { CompanyClassification } from "@/lib/classification/types";
import type { IcpClassification } from "@/lib/types/database.types";

/** Gedeelde Nederlandse labels voor het resultatenscherm en de export. */
export const BEDRIJFSCLASSIFICATIE_LABEL: Record<CompanyClassification, string> = {
  legal_entity: "Rechtspersoon",
  natural_person_business: "Eenmanszaak",
  partnership: "Samenwerkingsverband",
  inactive: "Inactief",
  unknown: "Onbekend",
};

export const ICP_LABEL: Record<IcpClassification, string> = {
  high_fit: "Goede match",
  medium_fit: "Matige match",
  low_fit: "Zwakke match",
};
