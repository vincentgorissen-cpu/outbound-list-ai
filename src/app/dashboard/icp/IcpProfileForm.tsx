"use client";

import { useActionState } from "react";
import { saveIcpProfile, type SaveIcpProfileResult } from "./actions";
import { Button } from "@/components/ui/Button";

const initialState: SaveIcpProfileResult = { status: "idle" };

export function IcpProfileForm({ initialDescription }: { initialDescription: string }) {
  const [state, action, pending] = useActionState(saveIcpProfile, initialState);

  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-slate-700">
          Ideaal klantprofiel
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={initialDescription}
          placeholder="Bijv.: Wij verkopen industriële automatisering aan Nederlandse productiebedrijven met 50 tot 500 medewerkers. Machinebouw, foodproductie en logistiek zijn interessant. Horeca en retail niet."
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>

      {state.status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {state.message}
        </p>
      )}
      {state.status === "success" && <p className="text-sm text-emerald-700">{state.message}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Bezig..." : "Klantprofiel opslaan"}
      </Button>
    </form>
  );
}
