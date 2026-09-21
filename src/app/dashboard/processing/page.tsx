import { createClient } from "@/lib/supabase/server";
import { ensureProcessingRowsExist } from "@/lib/processing/claimRows";
import { countByStatus } from "@/lib/processing/countByStatus";
import { ProcessingRunner } from "./ProcessingRunner";

export default async function ProcessingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await ensureProcessingRowsExist(supabase, user!.id);

  const { data } = await supabase.from("company_processing").select("status").eq("user_id", user!.id);
  const initialCounts = countByStatus(data ?? []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Verwerking</h1>
        <p className="mt-1 text-sm text-slate-500">
          Zoekt en verrijkt geïmporteerde bedrijven met KVK-gegevens, classificeert ze en scoort ze
          (indien een klantprofiel is ingesteld) met AI. Draait in kleine stapjes, zodat je de
          voortgang live ziet en een onderbroken run altijd hervat kan worden.
        </p>
      </div>

      <ProcessingRunner initialCounts={initialCounts} />
    </div>
  );
}
