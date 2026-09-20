import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const ROADMAP = [
  {
    title: "AI-fit scoring",
    description: "Bedrijven laten scoren op basis van je ideale klantprofiel.",
  },
] as const;

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">
        Welkom{user?.email ? `, ${user.email}` : ""}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Begin met het importeren van een bedrijvenlijst. AI-scoring volgt in
        een volgende stap.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link
          href="/dashboard/import"
          className="rounded-lg border border-slate-300 bg-white p-4 transition-colors hover:border-slate-400"
        >
          <h2 className="text-sm font-medium text-slate-900">
            Bedrijvenlijst importeren
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            CSV of XLSX uploaden, kolommen koppelen en importeren.
          </p>
        </Link>

        <Link
          href="/dashboard/kvk-review"
          className="rounded-lg border border-slate-300 bg-white p-4 transition-colors hover:border-slate-400"
        >
          <h2 className="text-sm font-medium text-slate-900">
            KVK-matches controleren
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Bedrijven waarvoor geen automatisch bevestigde KVK-match is
            gevonden.
          </p>
        </Link>

        {ROADMAP.map((item) => (
          <div
            key={item.title}
            className="rounded-lg border border-dashed border-slate-300 bg-white p-4"
          >
            <h2 className="text-sm font-medium text-slate-900">
              {item.title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
