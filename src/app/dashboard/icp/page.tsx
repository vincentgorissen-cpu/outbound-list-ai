import { createClient } from "@/lib/supabase/server";
import { parsePrefilterConfig } from "@/lib/icp/prefilter/parseConfig";
import { IcpProfileForm } from "./IcpProfileForm";
import { IcpPrefilterForm } from "./IcpPrefilterForm";
import { IcpTestRunner } from "./IcpTestRunner";

const CLASSIFICATION_LABEL: Record<string, string> = {
  high_fit: "Goede match",
  medium_fit: "Matige match",
  low_fit: "Zwakke match",
  insufficient_data: "Te weinig data",
};

const STATUS_LABEL: Record<string, string> = {
  scored: "Gescoord",
  ai_processing_failed: "AI-verwerking mislukt",
  excluded_by_prefilter: "Uitgesloten door voorfilters",
};

export default async function IcpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("icp_profiles")
    .select("description, prefilter_config")
    .eq("user_id", user!.id)
    .maybeSingle();

  const prefilterConfig = parsePrefilterConfig(profile?.prefilter_config ?? null);

  const { data: scores } = await supabase
    .from("icp_scores")
    .select(
      "id, import_row_id, status, score, classification, reasons, concerns, error_message, prefilter_reason, scored_at",
    )
    .order("scored_at", { ascending: false })
    .limit(20);

  const importRowIds = (scores ?? []).map((s) => s.import_row_id);
  const { data: importRows } =
    importRowIds.length > 0
      ? await supabase.from("import_rows").select("id, bedrijfsnaam").in("id", importRowIds)
      : { data: [] as { id: string; bedrijfsnaam: string | null }[] };
  const bedrijfsnaamById = new Map((importRows ?? []).map((row) => [row.id, row.bedrijfsnaam]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">AI-fit scoring (ICP)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Beschrijf je ideale klantprofiel en laat AI beoordelen hoe goed geïmporteerde
          bedrijven daarbij passen.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <IcpProfileForm initialDescription={profile?.description ?? ""} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <IcpPrefilterForm initialConfig={prefilterConfig} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <IcpTestRunner />
      </div>

      {scores && scores.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-slate-900">Recente resultaten</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="p-2">Bedrijf</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Score</th>
                  <th className="p-2">Classificatie</th>
                  <th className="p-2">Redenen / opmerkingen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scores.map((row) => (
                  <tr key={row.id}>
                    <td className="p-2 text-slate-900">
                      {bedrijfsnaamById.get(row.import_row_id) ?? "onbekend"}
                    </td>
                    <td className="p-2 text-slate-600">{STATUS_LABEL[row.status] ?? row.status}</td>
                    <td className="p-2 text-slate-600">{row.score ?? "—"}</td>
                    <td className="p-2 text-slate-600">
                      {row.classification ? CLASSIFICATION_LABEL[row.classification] : "—"}
                    </td>
                    <td className="p-2 text-slate-600">
                      {row.status === "excluded_by_prefilter"
                        ? row.prefilter_reason
                        : row.status === "ai_processing_failed"
                          ? row.error_message
                          : (row.reasons as string[] | null)?.join("; ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
