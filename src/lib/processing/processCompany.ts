import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchCompany } from "@/lib/kvk/matchCompany";
import { storeKvkMatch } from "@/lib/kvk/storeMatch";
import { enrichAndStoreKvkData } from "@/lib/kvk/enrichAndStore";
import { KvkApiError } from "@/lib/kvk/client";
import { classifyCompany } from "@/lib/classification/classifyCompany";
import { runIcpForCompany } from "@/lib/icp/runIcpForCompany";
import type { IcpPrefilterConfig } from "@/lib/icp/prefilter/types";
import type { Database } from "@/lib/types/database.types";

export interface ProcessCompanyImportRow {
  id: string;
  bedrijfsnaam: string | null;
  kvk_nummer: string | null;
  postcode: string | null;
  plaats: string | null;
  website: string | null;
}

export interface IcpProcessingContext {
  description: string;
  prefilterConfig: IcpPrefilterConfig;
}

export interface ProcessCompanyParams {
  importRow: ProcessCompanyImportRow;
  userId: string;
  /** `null` als de gebruiker nog geen ICP-profiel heeft ingesteld — stap 7 wordt dan overgeslagen. */
  icpContext: IcpProcessingContext | null;
}

export interface ProcessCompanyDeps {
  matchCompany?: typeof matchCompany;
  storeKvkMatch?: typeof storeKvkMatch;
  enrichAndStoreKvkData?: typeof enrichAndStoreKvkData;
  runIcpForCompany?: typeof runIcpForCompany;
}

export type ProcessCompanyOutcome =
  | { status: "completed" }
  | { status: "review_required" }
  | { status: "failed"; message: string };

function describeError(error: unknown): string {
  if (error instanceof KvkApiError) {
    return `KVK-fout (${error.status}): ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Onbekende fout.";
}

/**
 * Voert de volledige end-to-end verwerking uit voor één geïmporteerd
 * bedrijf: matchen (indien nodig), KVK-basisprofiel ophalen en opslaan,
 * classificeren en — indien toegestaan en relevant — AI ICP-scoren.
 *
 * Bouwt uitsluitend voort op bestaande, al geteste modules
 * (`matchCompany`, `enrichAndStoreKvkData`, `classifyCompany`,
 * `runIcpForCompany`); er zit hier geen nieuwe KVK- of AI-logica in,
 * alleen orkestratie. Gooit nooit door naar de aanroeper — een fout bij
 * dit ene bedrijf komt terug als `{ status: "failed", message }` zodat
 * de rest van een batch gewoon doorgaat.
 */
export async function processCompany(
  supabase: SupabaseClient<Database>,
  { importRow, userId, icpContext }: ProcessCompanyParams,
  deps: ProcessCompanyDeps = {},
): Promise<ProcessCompanyOutcome> {
  const doMatchCompany = deps.matchCompany ?? matchCompany;
  const doStoreKvkMatch = deps.storeKvkMatch ?? storeKvkMatch;
  const doEnrichAndStore = deps.enrichAndStoreKvkData ?? enrichAndStoreKvkData;
  const doRunIcpForCompany = deps.runIcpForCompany ?? runIcpForCompany;

  const bedrijfsnaam = importRow.bedrijfsnaam?.trim();
  if (!bedrijfsnaam) {
    return { status: "failed", message: "Geen bedrijfsnaam beschikbaar om te verwerken." };
  }

  let kvkNummer = importRow.kvk_nummer?.trim() || null;

  // Stap 2: matchen wanneer er nog geen (bekend) KVK-nummer is.
  if (!kvkNummer) {
    let matchResult;
    try {
      matchResult = await doMatchCompany({
        bedrijfsnaam,
        postcode: importRow.postcode,
        plaats: importRow.plaats,
        website: importRow.website,
      });
    } catch (error) {
      return { status: "failed", message: describeError(error) };
    }

    try {
      await doStoreKvkMatch(supabase, { importRowId: importRow.id, userId, match: matchResult });
    } catch (error) {
      return { status: "failed", message: describeError(error) };
    }

    // Stap 6: bij onvoldoende zekerheid is handmatige review nodig —
    // er is dan nog geen bruikbare identiteit om mee te verrijken of te
    // scoren, dus de verwerking van dit bedrijf stopt hier.
    if (matchResult.status !== "high_confidence") {
      return { status: "review_required" };
    }

    kvkNummer = matchResult.chosenKvkNummer;
  }

  if (!kvkNummer) {
    return { status: "failed", message: "Geen bruikbaar KVK-nummer gevonden om te verrijken." };
  }

  // Stap 3+4: basisprofiel ophalen en opslaan.
  let enrichment;
  try {
    enrichment = await doEnrichAndStore(supabase, { kvkNummer, importRowId: importRow.id, userId });
  } catch (error) {
    return { status: "failed", message: describeError(error) };
  }

  if (!enrichment) {
    return { status: "failed", message: `KVK-nummer "${kvkNummer}" niet gevonden in het Handelsregister.` };
  }

  // Stap 5: bestaande classificatie-rule-engine.
  const classification = classifyCompany({
    rechtsvorm: enrichment.rechtsvorm,
    status: enrichment.status,
  });

  // Stap 7: alleen AI-scoren wanneer dat is toegestaan (er is een
  // ICP-profiel) én relevant is (een inactief bedrijf is nooit een
  // geschikte outbound-lead, ongeacht de ingestelde voorfilters — dit
  // voorkomt evengoed onnodige AI-aanroepen). Een mislukte AI-aanroep
  // wordt door `runIcpForCompany` zelf afgehandeld (icp_scores blijft
  // los van deze status) en maakt de KVK-verwerking hier niet 'failed'.
  if (icpContext && classification !== "inactive") {
    await doRunIcpForCompany(supabase, {
      userId,
      icpProfileDescription: icpContext.description,
      prefilterConfig: icpContext.prefilterConfig,
      company: {
        importRowId: importRow.id,
        officieleNaam: enrichment.officieleNaam,
        rechtsvorm: enrichment.rechtsvorm,
        status: enrichment.status,
        sbiCodes: enrichment.sbiCodes,
        sbiOmschrijvingen: enrichment.sbiOmschrijvingen,
        aantalWerkzamePersonen: enrichment.aantalWerkzamePersonen,
        plaats: enrichment.vestigingsplaats,
        website: enrichment.website,
      },
    });
  }

  // Stap 8.
  return { status: "completed" };
}
