/**
 * Vormen hieronder zijn geverifieerd tegen de echte KVK-testomgeving
 * (https://api.kvk.nl/test/api/v2/zoeken, testnummer 68750110), niet
 * uit documentatie overgenomen. Zie ook `client.ts`.
 */
export type KvkResultType = "rechtspersoon" | "hoofdvestiging" | "nevenvestiging";

export interface KvkBinnenlandsAdres {
  type: string;
  straatnaam?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
}

export interface KvkLink {
  rel: string;
  href: string;
}

export interface KvkSearchResultItem {
  kvkNummer: string;
  /** Alleen aanwezig bij een vestiging (hoofd- of nevenvestiging), niet bij "rechtspersoon". */
  vestigingsnummer?: string;
  naam: string;
  type: KvkResultType;
  adres?: { binnenlandsAdres: KvkBinnenlandsAdres };
  links: KvkLink[];
}

export interface KvkSearchResponse {
  pagina: number;
  resultatenPerPagina: number;
  totaal: number;
  /** URL naar de volgende pagina; alleen aanwezig als er meer resultaten zijn. */
  volgende?: string;
  resultaten: KvkSearchResultItem[];
  links: KvkLink[];
}

export interface KvkSearchParams {
  naam?: string;
  kvkNummer?: string;
  plaats?: string;
  straatnaam?: string;
  postcode?: string;
  huisnummer?: string;
  type?: KvkResultType;
  pagina?: number;
  resultatenPerPagina?: number;
}

/**
 * Vormen hieronder zijn deels empirisch geverifieerd (kvkNummer, naam,
 * statutaireNaam, handelsnamen, sbiActiviteiten, totaalWerkzamePersonen,
 * _embedded.eigenaar.rechtsvorm, _embedded.hoofdvestiging.adressen — via
 * testnummer 68750110) en deels overgenomen uit een onafhankelijke
 * open-source KVK-integratie omdat ons testbedrijf ze niet gebruikt
 * (websites, status-/uitschrijvingsvelden). Zie `findMatch.ts`/
 * `enrichCompany.ts` voor waar dit onderscheid gevolgen heeft.
 */
export interface KvkHandelsnaam {
  naam: string;
  volgorde: number;
}

export interface KvkSbiActiviteit {
  sbiCode: string;
  sbiOmschrijving: string;
  indHoofdactiviteit?: string;
}

export interface KvkMaterieleRegistratie {
  datumAanvang?: string;
  /** Alleen aanwezig wanneer de registratie beëindigd is. Niet live geverifieerd. */
  datumEinde?: string;
}

export interface KvkAdresDetail {
  type: string;
  straatnaam?: string;
  huisnummer?: number;
  huisnummerToevoeging?: string;
  postcode?: string;
  postbusnummer?: number;
  plaats?: string;
  land?: string;
  volledigAdres?: string;
}

export interface KvkEigenaar {
  rsin?: string;
  rechtsvorm?: string;
  uitgebreideRechtsvorm?: string;
  /** Niet live geverifieerd; overgenomen uit release notes/community-typing. */
  datumUitschrijvingHandelsregister?: string;
  links?: KvkLink[];
}

export interface KvkHoofdvestiging {
  vestigingsnummer: string;
  kvkNummer: string;
  eersteHandelsnaam?: string;
  indHoofdvestiging?: string;
  indCommercieleVestiging?: string;
  totaalWerkzamePersonen?: number;
  adressen?: KvkAdresDetail[];
  materieleRegistratie?: KvkMaterieleRegistratie;
  links?: KvkLink[];
}

export interface KvkBasisprofiel {
  kvkNummer: string;
  naam: string;
  statutaireNaam?: string;
  formeleRegistratiedatum?: string;
  materieleRegistratie?: KvkMaterieleRegistratie;
  totaalWerkzamePersonen?: number;
  handelsnamen?: KvkHandelsnaam[];
  sbiActiviteiten?: KvkSbiActiviteit[];
  _embedded?: {
    eigenaar?: KvkEigenaar;
    hoofdvestiging?: KvkHoofdvestiging;
  };
  links?: KvkLink[];
}

export interface KvkVestigingsprofiel {
  vestigingsnummer: string;
  kvkNummer: string;
  statutaireNaam?: string;
  eersteHandelsnaam?: string;
  totaalWerkzamePersonen?: number;
  handelsnamen?: KvkHandelsnaam[];
  adressen?: KvkAdresDetail[];
  /** Niet live geverifieerd (ons testbedrijf heeft geen website). */
  websites?: string[];
  sbiActiviteiten?: KvkSbiActiviteit[];
  materieleRegistratie?: KvkMaterieleRegistratie;
  links?: KvkLink[];
}

/** Afgeleide status; zie de kanttekening bij `deriveStatus` in enrichCompany.ts. */
export type KvkBedrijfsstatus = "actief" | "inactief";

/**
 * De genormaliseerde verrijkingsgegevens die we naast (nooit in plaats
 * van) de originele upload opslaan.
 */
export interface KvkEnrichment {
  kvkNummer: string;
  officieleNaam: string;
  handelsnamen: string[];
  rechtsvorm: string | null;
  status: KvkBedrijfsstatus;
  sbiCodes: string[];
  sbiOmschrijvingen: string[];
  aantalWerkzamePersonen: number | null;
  vestigingsplaats: string | null;
  website: string | null;
  /** ISO-tijdstip waarop deze gegevens bij de KVK zijn opgehaald. */
  opgehaaldOp: string;
}
