import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/Button";

export function DashboardNav({ email }: { email: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <span className="text-sm font-semibold text-slate-900">
          Outbound List AI
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">{email}</span>
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              Uitloggen
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
