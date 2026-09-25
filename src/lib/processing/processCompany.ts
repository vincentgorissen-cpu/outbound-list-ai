import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichAndStoreWebsiteData } from "@/lib/website/enrichAndStoreWebsiteData";
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
  /** `null` als de gebruiker nog geen ICP-profiel heeft ingesteld — ICP-scoring wordt dan overgeslagen. */
  icpContext: IcpProcessingContext | null;
}

export interface ProcessCompanyDeps {
  enrichAndStoreWebsiteData?: typeof enrichAndStoreWebsiteData;
  runIcpForCompany?: typeof runIcpForCompany;
}

export type ProcessCompanyOutcome = { status: "completed" } | { status: "failed"; message: string };

/**
 * Voert de volledige end-to-end verwerking uit voor één geïmporteerd
 * bedrijf: website-informatie ophalen (indien een URL bekend is —
 * `WebsiteIntelligenceService`, met hergebruik van een verse eerdere
 * verrijking) en — indien een ICP-profiel is ingesteld — AI ICP-scoren op
 * basis van de upload-gegevens plus (indien beschikbaar) de opgeschoonde
 * websitetekst.
 *
 * KVK wordt bewust niet meer gebruikt als databron (te kostbaar voor dit
 * gebruik) — dit bouwt uitsluitend voort op de eigen upload-gegevens en
 * `WebsiteIntelligenceService`. Een ontbrekende of niet-bereikbare
 * website blokkeert de verwerking nooit: de AI scoort dan op basis van
 * de upload-gegevens alleen (met een navenant lagere eigen `confidence`
 * in het antwoord). Gooit nooit door — een fout bij dit ene bedrijf komt
 * terug als `{ status: "failed", message }` zodat de rest van een batch
 * gewoon doorgaat.
 */
export async function processCompany(
  supabase: SupabaseClient<Database>,
  { importRow, userId, icpContext }: ProcessCompanyParams,
  deps: ProcessCompanyDeps = {},
): Promise<ProcessCompanyOutcome> {
  const doEnrichAndStoreWebsite = deps.enrichAndStoreWebsiteData ?? enrichAndStoreWebsiteData;
  const doRunIcpForCompany = deps.runIcpForCompany ?? runIcpForCompany;

  const bedrijfsnaam = importRow.bedrijfsnaam?.trim();
  if (!bedrijfsnaam) {
    return { status: "failed", message: "Geen bedrijfsnaam beschikbaar om te verwerken." };
  }

  let website;
  try {
    website = await doEnrichAndStoreWebsite(supabase, {
      importRowId: importRow.id,
      userId,
      websiteUrl: importRow.website,
    });
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "Onbekende fout bij website-verrijking.",
    };
  }

  if (icpContext) {
    await doRunIcpForCompany(supabase, {
      userId,
      icpProfileDescription: icpContext.description,
      prefilterConfig: icpContext.prefilterConfig,
      company: {
        importRowId: importRow.id,
        officieleNaam: bedrijfsnaam,
        status: null,
        rechtsvorm: null,
        sbiCodes: [],
        sbiOmschrijvingen: [],
        aantalWerkzamePersonen: null,
        plaats: importRow.plaats,
        website: importRow.website,
        bedrijfsomschrijving: website.combinedCleanedText,
      },
    });
  }

  return { status: "completed" };
}
