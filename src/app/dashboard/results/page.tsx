import { createClient } from "@/lib/supabase/server";
import { buildCompanyResultRows } from "@/lib/results/buildCompanyResults";
import { ResultsDashboard } from "./ResultsDashboard";

export default async function ResultsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: importRows } = await supabase
    .from("import_rows")
    .select("id, bedrijfsnaam, plaats, website")
    .eq("user_id", user!.id);

  const ids = (importRows ?? []).map((row) => row.id);

  const [{ data: enrichments }, { data: matches }, { data: icpScores }] =
    ids.length > 0
      ? await Promise.all([
          supabase.from("kvk_enrichments").select("*").in("import_row_id", ids),
          supabase.from("kvk_matches").select("*").in("import_row_id", ids),
          supabase.from("icp_scores").select("*").in("import_row_id", ids),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const rows = buildCompanyResultRows(
    importRows ?? [],
    enrichments ?? [],
    matches ?? [],
    icpScores ?? [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Resultaten</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overzicht van alle geïmporteerde bedrijven, hun KVK-gegevens en ICP-score.
        </p>
      </div>

      <ResultsDashboard rows={rows} />
    </div>
  );
}
