import type { CompanyClassification } from "@/lib/classification/types";
import type { IcpClassification, WebsiteStatus } from "@/lib/types/database.types";

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
  insufficient_data: "Te weinig data",
};

export const WEBSITE_STATUS_LABEL: Record<WebsiteStatus, string> = {
  pending: "Nog niet gecontroleerd",
  accessible: "Bereikbaar",
  no_url: "Geen website bekend",
  dns_failed: "Domein niet gevonden",
  timeout: "Geen reactie (timeout)",
  blocked: "Geblokkeerd",
  robots_disallowed: "Verboden door robots.txt",
  http_error: "HTTP-foutmelding",
  insufficient_content: "Te weinig inhoud",
  unsupported_site: "Niet-ondersteunde website",
  failed: "Mislukt",
};
