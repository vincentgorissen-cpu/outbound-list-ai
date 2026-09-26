import { createClient } from "@/lib/supabase/server";
import { KvkReviewRow } from "./KvkReviewRow";
import type { KvkMatchCandidate } from "@/lib/kvk/types";

export default async function KvkReviewPage() {
  const supabase = await createClient();

  const { data: matches } = await supabase
    .from("kvk_matches")
    .select("id, import_row_id, status, chosen_kvk_nummer, confidence, candidates")
    .in("status", ["review_required", "no_reliable_match"])
    .is("resolution", null)
    .order("confidence", { ascending: false, nullsFirst: false });

  const importRowIds = (matches ?? []).map((match) => match.import_row_id);
  const { data: importRows } =
    importRowIds.length > 0
      ? await supabase
          .from("import_rows")
          .select("id, bedrijfsnaam, postcode, plaats")
          .in("id", importRowIds)
      : { data: [] as { id: string; bedrijfsnaam: string | null; postcode: string | null; plaats: string | null }[] };

  const importRowById = new Map((importRows ?? []).map((row) => [row.id, row]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">KVK-matches (archief)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Oude, nooit-opgeloste KVK-matches van vóór het uitschakelen van de KVK-koppeling. De
          verwerking gebruikt KVK niet meer, dus hier komen geen nieuwe bedrijven meer bij.
        </p>
      </div>

      {(!matches || matches.length === 0) && (
        <p className="text-sm text-slate-500">Niets om te controleren.</p>
      )}

      <div className="space-y-4">
        {(matches ?? []).map((match) => {
          const importRow = importRowById.get(match.import_row_id);
          return (
            <KvkReviewRow
              key={match.id}
              matchId={match.id}
              status={match.status}
              confidence={match.confidence}
              candidates={(match.candidates as KvkMatchCandidate[] | null) ?? []}
              chosenKvkNummer={match.chosen_kvk_nummer}
              original={{
                bedrijfsnaam: importRow?.bedrijfsnaam ?? null,
                postcode: importRow?.postcode ?? null,
                plaats: importRow?.plaats ?? null,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
