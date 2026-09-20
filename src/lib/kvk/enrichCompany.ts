import "server-only";
import { getBasisprofiel, getVestigingsprofiel } from "./client";
import type { KvkBasisprofiel, KvkBedrijfsstatus, KvkEnrichment } from "./types";

export type GetBasisprofielFn = typeof getBasisprofiel;
export type GetVestigingsprofielFn = typeof getVestigingsprofiel;

/**
 * Leidt actief/inactief af uit eventuele einddatum-velden. Er is geen
 * expliciet actief/inactief-vlag in het basisprofiel gevonden; deze
 * velden zijn overgenomen uit een onafhankelijke KVK-integratie en NIET
 * bevestigd tegen een echt inactief testbedrijf (de testomgeving heeft
 * er geen bekend voorbeeld van). Ontbreken van een einddatum vatten we
 * op als actief, aangezien het basisprofiel-endpoint standaard actuele
 * registraties teruggeeft.
 */
function deriveStatus(basisprofiel: KvkBasisprofiel): KvkBedrijfsstatus {
  const mogelijkeEinddatums = [
    basisprofiel.materieleRegistratie?.datumEinde,
    basisprofiel._embedded?.hoofdvestiging?.materieleRegistratie?.datumEinde,
    basisprofiel._embedded?.eigenaar?.datumUitschrijvingHandelsregister,
  ];
  return mogelijkeEinddatums.some((datum) => !!datum) ? "inactief" : "actief";
}

function findBezoekadresPlaats(basisprofiel: KvkBasisprofiel): string | null {
  const adressen = basisprofiel._embedded?.hoofdvestiging?.adressen ?? [];
  const bezoekadres = adressen.find((a) => a.type === "bezoekadres") ?? adressen[0];
  return bezoekadres?.plaats ?? null;
}

/**
 * Haalt alle in de opdracht gevraagde velden op voor één bedrijf, aan
 * de hand van een al bekend KVK-nummer. Doet twee aanroepen: het
 * basisprofiel (naam, rechtsvorm, SBI, werkzame personen) en, als er
 * een hoofdvestiging bekend is, het vestigingsprofiel (voor website —
 * dat veld zit niet in het basisprofiel).
 *
 * Geeft `null` terug als er geen basisprofiel bestaat voor dit nummer.
 */
export async function enrichCompanyFromKvk(
  kvkNummer: string,
  deps: { getBasisprofiel?: GetBasisprofielFn; getVestigingsprofiel?: GetVestigingsprofielFn } = {},
): Promise<KvkEnrichment | null> {
  const fetchBasisprofiel = deps.getBasisprofiel ?? getBasisprofiel;
  const fetchVestigingsprofiel = deps.getVestigingsprofiel ?? getVestigingsprofiel;

  const basisprofiel = await fetchBasisprofiel(kvkNummer);
  if (!basisprofiel) {
    return null;
  }

  const hoofdvestiging = basisprofiel._embedded?.hoofdvestiging;
  let website: string | null = null;
  if (hoofdvestiging?.vestigingsnummer) {
    const vestigingsprofiel = await fetchVestigingsprofiel(hoofdvestiging.vestigingsnummer);
    website = vestigingsprofiel?.websites?.[0] ?? null;
  }

  return {
    kvkNummer: basisprofiel.kvkNummer,
    officieleNaam: basisprofiel.statutaireNaam ?? basisprofiel.naam,
    handelsnamen: (basisprofiel.handelsnamen ?? []).map((h) => h.naam),
    rechtsvorm: basisprofiel._embedded?.eigenaar?.rechtsvorm ?? null,
    status: deriveStatus(basisprofiel),
    sbiCodes: (basisprofiel.sbiActiviteiten ?? []).map((s) => s.sbiCode),
    sbiOmschrijvingen: (basisprofiel.sbiActiviteiten ?? []).map((s) => s.sbiOmschrijving),
    aantalWerkzamePersonen: basisprofiel.totaalWerkzamePersonen ?? null,
    vestigingsplaats: findBezoekadresPlaats(basisprofiel),
    website,
    opgehaaldOp: new Date().toISOString(),
  };
}
