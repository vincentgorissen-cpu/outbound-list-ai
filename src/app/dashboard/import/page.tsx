import { createClient } from "@/lib/supabase/server";
import { ImportPageClient } from "./ImportPageClient";

const STATUS_LABEL: Record<string, string> = {
  pending_mapping: "Wacht op kolomkoppeling",
  completed: "Geïmporteerd",
  failed: "Mislukt",
};

export default async function ImportPage() {
  const supabase = await createClient();
  const { data: imports } = await supabase
    .from("imports")
    .select("id, original_filename, status, row_count, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Bedrijvenlijst importeren
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload een CSV- of XLSX-bestand. We herkennen bekende kolommen
          automatisch; controleer de koppeling voordat je importeert.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <ImportPageClient />
      </div>

      {imports && imports.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-slate-900">
            Eerdere imports
          </h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="p-2">Bestand</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Rijen</th>
                  <th className="p-2">Datum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {imports.map((item) => (
                  <tr key={item.id}>
                    <td className="p-2 text-slate-900">
                      {item.original_filename}
                    </td>
                    <td className="p-2 text-slate-600">
                      {STATUS_LABEL[item.status] ?? item.status}
                    </td>
                    <td className="p-2 text-slate-600">{item.row_count}</td>
                    <td className="p-2 text-slate-600">
                      {new Date(item.created_at).toLocaleDateString("nl-NL")}
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
