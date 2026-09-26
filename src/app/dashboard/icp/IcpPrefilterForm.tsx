"use client";

import { useActionState } from "react";
import { saveIcpPrefilterConfig, type SavePrefilterConfigResult } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { NEDERLANDSE_PROVINCIES } from "@/lib/icp/prefilter/provincies";
import type { IcpPrefilterConfig } from "@/lib/icp/prefilter/types";

const initialState: SavePrefilterConfigResult = { status: "idle" };

/**
 * Configuratiescherm voor de deterministische voorfilters. Dit dekt nu
 * de vijf criteria uit de opdracht; nieuwe criteria kunnen later als
 * extra veld in `IcpPrefilterConfig` en dit formulier bij, zonder de
 * bestaande evaluatielogica te raken.
 */
export function IcpPrefilterForm({ initialConfig }: { initialConfig: IcpPrefilterConfig }) {
  const [state, action, pending] = useActionState(saveIcpPrefilterConfig, initialState);

  return (
    <form action={action} className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-slate-900">Voorfilters (vóór AI-scoring)</h3>
        <p className="mt-1 text-sm text-slate-500">
          Bedrijven die hier worden uitgesloten krijgen geen AI ICP-score — dit voorkomt onnodige
          AI-aanroepen. Een leeg veld betekent: geen beperking op dat criterium.
        </p>
      </div>

      <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
        De KVK-koppeling is uitgeschakeld (te kostbaar). De vier velden hieronder (status,
        rechtsvorm, SBI-code, aantal medewerkers) werken daarom momenteel niet — die gegevens komen
        alleen uit de KVK en zijn niet meer beschikbaar. Alleen &quot;Toegestane provincies&quot;
        (gebaseerd op de geïmporteerde plaats) is nu actief.
      </p>

      <label className="flex items-center gap-2 text-sm text-slate-400">
        <input
          type="checkbox"
          name="excludeInactief"
          defaultChecked={initialConfig.excludeStatuses.includes("inactief")}
        />
        Sluit inactieve bedrijven uit <span className="text-xs">(werkt niet zonder KVK)</span>
      </label>

      <div className="opacity-50">
        <Label htmlFor="excludeRechtsvormenCsv">Uit te sluiten rechtsvormen</Label>
        <Input
          id="excludeRechtsvormenCsv"
          name="excludeRechtsvormenCsv"
          defaultValue={initialConfig.excludeRechtsvormen.join(", ")}
          placeholder="Bijv.: Eenmanszaak, VOF"
        />
        <p className="mt-1 text-xs text-slate-400">Kommagescheiden, exacte naam zoals in de KVK-gegevens.</p>
      </div>

      <div className="opacity-50">
        <Label htmlFor="excludeSbiCodePrefixesCsv">Uit te sluiten SBI-codes</Label>
        <Input
          id="excludeSbiCodePrefixesCsv"
          name="excludeSbiCodePrefixesCsv"
          defaultValue={initialConfig.excludeSbiCodePrefixes.join(", ")}
          placeholder="Bijv.: 56, 47.11"
        />
        <p className="mt-1 text-xs text-slate-400">
          Kommagescheiden. Een SBI-code die met één van deze reeksen begint, wordt uitgesloten.
        </p>
      </div>

      <div className="grid gap-3 opacity-50 sm:grid-cols-2">
        <div>
          <Label htmlFor="minAantalWerknemers">Minimaal aantal medewerkers</Label>
          <Input
            id="minAantalWerknemers"
            name="minAantalWerknemers"
            type="number"
            min={0}
            defaultValue={initialConfig.minAantalWerknemers ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="maxAantalWerknemers">Maximaal aantal medewerkers</Label>
          <Input
            id="maxAantalWerknemers"
            name="maxAantalWerknemers"
            type="number"
            min={0}
            defaultValue={initialConfig.maxAantalWerknemers ?? ""}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="allowedProvincies">Toegestane provincies</Label>
        <select
          id="allowedProvincies"
          name="allowedProvincies"
          multiple
          size={6}
          defaultValue={initialConfig.allowedProvincies ?? []}
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          {NEDERLANDSE_PROVINCIES.map((provincie) => (
            <option key={provincie} value={provincie}>
              {provincie}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">
          Niets geselecteerd = alle provincies toegestaan. Ctrl/Cmd-klik om meerdere te selecteren.
        </p>
      </div>

      {state.status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {state.message}
        </p>
      )}
      {state.status === "success" && <p className="text-sm text-emerald-700">{state.message}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Bezig..." : "Voorfilters opslaan"}
      </Button>
    </form>
  );
}
