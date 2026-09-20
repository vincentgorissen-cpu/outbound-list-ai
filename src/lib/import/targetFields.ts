import type { TargetFieldDefinition, TargetFieldId } from "./types";

/**
 * Bekende kolomnamen per doelveld, gebruikt voor de deterministische
 * herkenning. Namen hoeven niet genormaliseerd te zijn (spaties,
 * hoofdletters, koppeltekens): dat gebeurt in `normalizeHeader`.
 */
export const TARGET_FIELDS: readonly TargetFieldDefinition[] = [
  {
    id: "bedrijfsnaam",
    label: "Bedrijfsnaam",
    description: "De naam van het bedrijf.",
    required: true,
    synonyms: [
      "bedrijfsnaam",
      "bedrijf",
      "bedrijfs naam",
      "naam bedrijf",
      "organisatie",
      "company",
      "company name",
      "companyname",
      "account name",
    ],
  },
  {
    id: "kvk_nummer",
    label: "KVK-nummer",
    description: "Het nummer waaronder het bedrijf bij de KVK staat.",
    required: false,
    synonyms: [
      "kvk",
      "kvk nummer",
      "kvknummer",
      "kvk-nummer",
      "chamber of commerce number",
      "coc number",
      "registration number",
    ],
  },
  {
    id: "website",
    label: "Website",
    description: "Het webadres van het bedrijf.",
    required: false,
    synonyms: ["website", "url", "site", "web", "domein", "domain", "webadres"],
  },
  {
    id: "postcode",
    label: "Postcode",
    description: "De postcode van het vestigingsadres.",
    required: false,
    synonyms: ["postcode", "zip", "zipcode", "zip code", "postal code"],
  },
  {
    id: "plaats",
    label: "Plaats",
    description: "De vestigingsplaats.",
    required: false,
    synonyms: ["plaats", "stad", "woonplaats", "city", "gemeente"],
  },
  {
    id: "contactpersoon",
    label: "Contactpersoon",
    description: "De naam van de contactpersoon bij het bedrijf.",
    required: false,
    synonyms: [
      "contactpersoon",
      "contact persoon",
      "contact",
      "naam contactpersoon",
      "contact name",
      "full name",
      "voornaam achternaam",
    ],
  },
  {
    id: "functie",
    label: "Functie",
    description: "De functietitel van de contactpersoon.",
    required: false,
    synonyms: [
      "functie",
      "titel",
      "job title",
      "jobtitle",
      "title",
      "role",
      "position",
    ],
  },
  {
    id: "telefoon",
    label: "Telefoon",
    description: "Het telefoonnummer van het bedrijf of de contactpersoon.",
    required: false,
    synonyms: [
      "telefoon",
      "telefoonnummer",
      "tel",
      "phone",
      "phone number",
      "mobiel",
      "mobile",
    ],
  },
  {
    id: "email",
    label: "E-mailadres",
    description: "Het e-mailadres van de contactpersoon.",
    required: false,
    synonyms: [
      "email",
      "e mail",
      "emailadres",
      "e mailadres",
      "mail",
      "email address",
      "e-mail",
    ],
  },
];

export function getTargetField(id: TargetFieldId): TargetFieldDefinition {
  const field = TARGET_FIELDS.find((candidate) => candidate.id === id);
  if (!field) {
    throw new Error(`Onbekend doelveld: ${id}`);
  }
  return field;
}
