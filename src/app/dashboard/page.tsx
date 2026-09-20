import { createClient } from "@/lib/supabase/server";

const ROADMAP = [
  {
    title: "Bedrijvenlijst uploaden",
    description: "CSV of XLSX uploaden met bedrijfsnamen.",
  },
  {
    title: "Verrijken via KVK",
    description: "Bedrijven controleren en aanvullen met KVK-gegevens.",
  },
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
        Dit is de technische basis. De onderdelen hieronder volgen in een
        volgende stap.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
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
