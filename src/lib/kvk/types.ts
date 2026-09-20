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
