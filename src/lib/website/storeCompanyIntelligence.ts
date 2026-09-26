import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, WebsiteEnrichmentRow } from "@/lib/types/database.types";
import type { CompanyIntelligenceData, ExtractionOutcome } from "./companyIntelligenceTypes";

export interface StoreCompanyIntelligenceParams {
  importRowId: string;
  userId: string;
  outcome: ExtractionOutcome;
}

/**
 * Slaat het resultaat van `extractCompanyIntelligence` op in de al
 * bestaande semantische kolommen van `website_enrichments` (die de
 * fetch-stap bewust ongemoeid liet). Werkt altijd bij (nooit invoegen) —
 * de rij moet al bestaan doordat de website eerst is opgehaald.
 *
 * Bij een mislukte extractie worden alleen `extraction_status` en
 * `extracted_at` bijgewerkt; eventuele eerder succesvol opgeslagen
 * semantische velden (van een vorige, wél geslaagde poging) blijven
 * intact in plaats van te worden overschreven met lege waarden.
 */
export async function storeCompanyIntelligence(
  supabase: SupabaseClient<Database>,
  { importRowId, userId, outcome }: StoreCompanyIntelligenceParams,
): Promise<void> {
  const patch =
    outcome.status === "extracted"
      ? {
          extraction_status: "extracted" as const,
          extracted_at: new Date().toISOString(),
          company_description: outcome.data.companyDescription,
          products_services: outcome.data.productsServices as unknown as Json,
          industries_served: outcome.data.industriesServed as unknown as Json,
          target_markets: outcome.data.targetMarkets as unknown as Json,
          business_model: outcome.data.businessModel,
          operational_signals: outcome.data.operationalSignals as unknown as Json,
          company_locations: outcome.data.locations as unknown as Json,
          extraction_confidence: outcome.data.confidence,
          evidence: outcome.data.evidence as unknown as Json,
        }
      : {
          extraction_status: "extraction_failed" as const,
          extracted_at: new Date().toISOString(),
        };

  const { error } = await supabase
    .from("website_enrichments")
    .update(patch)
    .eq("import_row_id", importRowId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Kon company intelligence niet opslaan: ${error.message}`);
  }
}

function toStringArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Leest een eerder succesvol opgeslagen extractie terug in de vorm die de
 * rest van de applicatie gebruikt (bv. om te hergebruiken voor
 * ICP-scoring zonder opnieuw te hoeven extraheren). Geeft `null` als er
 * nooit een geslaagde extractie is geweest.
 */
export function mapRowToCompanyIntelligenceData(row: WebsiteEnrichmentRow): CompanyIntelligenceData | null {
  if (row.extraction_status !== "extracted") return null;

  return {
    companyDescription: row.company_description,
    productsServices: toStringArray(row.products_services),
    industriesServed: toStringArray(row.industries_served),
    targetMarkets: toStringArray(row.target_markets),
    businessModel: row.business_model,
    operationalSignals: toStringArray(row.operational_signals),
    locations: toStringArray(row.company_locations),
    confidence: row.extraction_confidence ?? 0,
    evidence: toStringArray(row.evidence),
  };
}

/**
 * Bepaalt of de AI-extractiestap moet draaien: nooit zonder bereikbare
 * website, altijd bij een eerste poging of een eerdere mislukking, en
 * opnieuw als de website sindsdien is ververst (nieuwe tekst) — maar niet
 * telkens opnieuw bovenop een al geslaagde, nog actuele extractie
 * (kostenbeheersing: elke AI-aanroep hier kost geld).
 */
export function shouldExtractCompanyIntelligence(existing: WebsiteEnrichmentRow | null): boolean {
  if (!existing) return false;
  if (existing.website_status !== "accessible") return false;
  if (existing.extraction_status !== "extracted") return true;
  if (!existing.extracted_at || !existing.website_checked_at) return true;
  return new Date(existing.website_checked_at).getTime() > new Date(existing.extracted_at).getTime();
}
