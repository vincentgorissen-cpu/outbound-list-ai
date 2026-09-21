import { resolveProvincie } from "./provincies";
import type { IcpPrefilterConfig, PrefilterCompanyInput, PrefilterResult } from "./types";

/**
 * Evalueert de deterministische voorfilters voor één bedrijf. Puur en
 * synchroon — geen AI, geen database, geen netwerk — zodat dit vóór
 * elke AI-aanroep goedkoop en betrouwbaar kan worden uitgevoerd.
 *
 * Elk criterium sluit alleen uit bij positieve, bekende evidentie: als
 * een gegeven ontbreekt (bv. onbekend aantal medewerkers of een
 * onherkende plaats), wordt dat criterium overgeslagen in plaats van
 * het bedrijf op een gok uit te sluiten.
 */
export function evaluatePrefilter(
  config: IcpPrefilterConfig,
  company: PrefilterCompanyInput,
): PrefilterResult {
  if (company.status !== null && config.excludeStatuses.includes(company.status)) {
    return { excluded: true, reason: `Status "${company.status}" is uitgesloten door de voorfilters.` };
  }

  if (company.rechtsvorm !== null && config.excludeRechtsvormen.length > 0) {
    const normalized = company.rechtsvorm.trim().toLowerCase();
    const isExcluded = config.excludeRechtsvormen.some(
      (rechtsvorm) => rechtsvorm.trim().toLowerCase() === normalized,
    );
    if (isExcluded) {
      return {
        excluded: true,
        reason: `Rechtsvorm "${company.rechtsvorm}" is uitgesloten door de voorfilters.`,
      };
    }
  }

  if (config.excludeSbiCodePrefixes.length > 0 && company.sbiCodes.length > 0) {
    const match = company.sbiCodes.find((code) =>
      config.excludeSbiCodePrefixes.some((prefix) => code.startsWith(prefix)),
    );
    if (match) {
      return {
        excluded: true,
        reason: `SBI-code "${match}" valt onder een door de voorfilters uitgesloten categorie.`,
      };
    }
  }

  if (config.minAantalWerknemers !== null && company.aantalWerkzamePersonen !== null) {
    if (company.aantalWerkzamePersonen < config.minAantalWerknemers) {
      return {
        excluded: true,
        reason: `Aantal medewerkers (${company.aantalWerkzamePersonen}) is lager dan het ingestelde minimum van ${config.minAantalWerknemers}.`,
      };
    }
  }

  if (config.maxAantalWerknemers !== null && company.aantalWerkzamePersonen !== null) {
    if (company.aantalWerkzamePersonen > config.maxAantalWerknemers) {
      return {
        excluded: true,
        reason: `Aantal medewerkers (${company.aantalWerkzamePersonen}) is hoger dan het ingestelde maximum van ${config.maxAantalWerknemers}.`,
      };
    }
  }

  if (config.allowedProvincies !== null && config.allowedProvincies.length > 0) {
    const provincie = resolveProvincie(company.plaats);
    if (provincie !== null && !config.allowedProvincies.includes(provincie)) {
      return {
        excluded: true,
        reason: `Vestigingsplaats "${company.plaats}" ligt in provincie "${provincie}", niet in de toegestane provincies.`,
      };
    }
  }

  return { excluded: false };
}
