import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { IcpScoringError, scoreCompanyIcpFit } from "./scoreCompany";
import { storeIcpScore } from "./storeIcpScore";
import { computeDataCompleteness, computeDataSources } from "./dataCompleteness";
import { evaluatePrefilter } from "./prefilter/evaluatePrefilter";
import type { IcpPrefilterConfig, PrefilterCompanyInput } from "./prefilter/types";
import type { CompanyForScoring } from "./types";

export interface IcpCompanyCandidate extends PrefilterCompanyInput {
  importRowId: string;
  officieleNaam: string;
  sbiOmschrijvingen: string[];
  website: string | null;
  /** Vrije-tekst fallback wanneer er geen gestructureerde website-extractie beschikbaar is. */
  bedrijfsomschrijving?: string | null;
  /** Gestructureerde website intelligence (zie `extractCompanyIntelligence`), indien beschikbaar. */
  productsServices?: string[];
  industriesServed?: string[];
  targetMarkets?: string[];
  businessModel?: string | null;
  operationalSignals?: string[];
  websiteLocations?: string[];
}

export interface RunIcpForCompanyParams {
  userId: string;
  icpProfileDescription: string;
  prefilterConfig: IcpPrefilterConfig;
  company: IcpCompanyCandidate;
}

export type IcpForCompanyOutcome =
  | { outcome: "excluded"; reason: string }
  | { outcome: "scored" }
  | { outcome: "failed"; message: string };

/**
 * Past de voorfilters toe op één bedrijf en scoort het — indien
 * toegestaan — met AI, en slaat in beide gevallen het resultaat op.
 *
 * Dit is de enige plek die deze logica bevat: zowel de losstaande
 * ICP-testrunner (`dashboard/icp/actions.ts`) als de end-to-end
 * verwerkingsworkflow (`lib/processing/processCompany.ts`) roepen deze
 * functie aan, zodat er geen twee implementaties uit de pas kunnen
 * gaan lopen.
 *
 * `data_completeness`/`data_sources` worden hier deterministisch berekend
 * (nooit door de AI) uit de meegegeven velden, en in alle drie de
 * uitkomsten (gescoord, uitgesloten door voorfilter, AI-fout) opgeslagen
 * — zo blijft altijd navolgbaar hoe compleet de data voor dit bedrijf was,
 * ongeacht of er daadwerkelijk gescoord kon worden.
 */
export async function runIcpForCompany(
  supabase: SupabaseClient<Database>,
  { userId, icpProfileDescription, prefilterConfig, company }: RunIcpForCompanyParams,
): Promise<IcpForCompanyOutcome> {
  const forScoring: CompanyForScoring = {
    bedrijfsnaam: company.officieleNaam,
    sbiOmschrijvingen: company.sbiOmschrijvingen,
    aantalWerkzamePersonen: company.aantalWerkzamePersonen,
    plaats: company.plaats,
    website: company.website,
    bedrijfsomschrijving: company.bedrijfsomschrijving,
    productsServices: company.productsServices,
    industriesServed: company.industriesServed,
    targetMarkets: company.targetMarkets,
    businessModel: company.businessModel,
    operationalSignals: company.operationalSignals,
    websiteLocations: company.websiteLocations,
  };
  const dataCompleteness = computeDataCompleteness(forScoring);
  const dataSources = computeDataSources(forScoring);

  const prefilterResult = evaluatePrefilter(prefilterConfig, {
    status: company.status,
    rechtsvorm: company.rechtsvorm,
    sbiCodes: company.sbiCodes,
    aantalWerkzamePersonen: company.aantalWerkzamePersonen,
    plaats: company.plaats,
  });

  if (prefilterResult.excluded) {
    await storeIcpScore(supabase, {
      importRowId: company.importRowId,
      userId,
      result: { status: "excluded_by_prefilter", reason: prefilterResult.reason },
      dataCompleteness,
      dataSources,
    });
    return { outcome: "excluded", reason: prefilterResult.reason };
  }

  try {
    const result = await scoreCompanyIcpFit(icpProfileDescription, forScoring);
    await storeIcpScore(supabase, {
      importRowId: company.importRowId,
      userId,
      result: { status: "scored", ...result },
      dataCompleteness,
      dataSources,
    });
    return { outcome: "scored" };
  } catch (error) {
    const message = error instanceof IcpScoringError ? error.message : "Onbekende fout.";
    await storeIcpScore(supabase, {
      importRowId: company.importRowId,
      userId,
      result: { status: "ai_processing_failed", errorMessage: message },
      dataCompleteness,
      dataSources,
    });
    return { outcome: "failed", message };
  }
}
