import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import type { KvkEnrichment } from "./types";

export interface StoreKvkEnrichmentParams {
  importRowId: string;
  userId: string;
  enrichment: KvkEnrichment;
}

/**
 * Slaat verrijkingsgegevens op in `kvk_enrichments`, los van de
 * originele `import_rows`-rij (die blijft ongewijzigd). Upsert op
 * `import_row_id`: een her-controle vervangt de vorige verrijking van
 * hetzelfde bedrijf in plaats van een duplicaat toe te voegen.
 */
export async function storeKvkEnrichment(
  supabase: SupabaseClient<Database>,
  { importRowId, userId, enrichment }: StoreKvkEnrichmentParams,
): Promise<void> {
  const { error } = await supabase.from("kvk_enrichments").upsert(
    {
      import_row_id: importRowId,
      user_id: userId,
      kvk_nummer: enrichment.kvkNummer,
      officiele_naam: enrichment.officieleNaam,
      handelsnamen: enrichment.handelsnamen,
      rechtsvorm: enrichment.rechtsvorm,
      status: enrichment.status,
      sbi_codes: enrichment.sbiCodes,
      sbi_omschrijvingen: enrichment.sbiOmschrijvingen,
      aantal_werkzame_personen: enrichment.aantalWerkzamePersonen,
      vestigingsplaats: enrichment.vestigingsplaats,
      website: enrichment.website,
      opgehaald_op: enrichment.opgehaaldOp,
    },
    { onConflict: "import_row_id" },
  );

  if (error) {
    throw new Error(`Kon KVK-verrijking niet opslaan: ${error.message}`);
  }
}
