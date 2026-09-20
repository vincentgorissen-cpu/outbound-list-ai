import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; registered?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const params = await searchParams;

  if (user) {
    redirect(params.redirectTo ?? "/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">
          Outbound List AI
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Log in om je bedrijvenlijsten te beheren.
        </p>
      </div>

      {params.registered && (
        <p className="mb-4 rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Account aangemaakt. Bevestig je e-mailadres en log daarna in.
        </p>
      )}

      <LoginForm redirectTo={params.redirectTo ?? "/dashboard"} />
    </main>
  );
}
