"use client";

import { useActionState } from "react";
import { resolveKvkMatch, type ResolveMatchResult } from "./actions";
import { Button } from "@/components/ui/Button";
import type { KvkMatchCandidate, KvkMatchStatus } from "@/lib/kvk/types";

const initialState: ResolveMatchResult = { status: "idle" };

const STATUS_LABEL: Record<KvkMatchStatus, string> = {
  high_confidence: "Hoge zekerheid",
  review_required: "Controle nodig",
  no_reliable_match: "Geen betrouwbare match",
};

export function KvkReviewRow({
  matchId,
  status,
  confidence,
  candidates,
  chosenKvkNummer,
  original,
}: {
  matchId: string;
  status: KvkMatchStatus;
  confidence: number | null;
  candidates: KvkMatchCandidate[];
  chosenKvkNummer: string | null;
  original: {
    bedrijfsnaam: string | null;
    postcode: string | null;
    plaats: string | null;
  };
}) {
  const [state, action, pending] = useActionState(resolveKvkMatch, initialState);

  const origineel = [original.postcode, original.plaats].filter(Boolean).join(" ") || "onbekend";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-slate-900">
            {original.bedrijfsnaam ?? "(geen bedrijfsnaam)"}
          </h2>
          <p className="text-sm text-slate-500">Origineel uit upload: {origineel}</p>
        </div>
        <span className="whitespace-nowrap rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
          {STATUS_LABEL[status]}
          {confidence !== null ? ` — score ${confidence}` : ""}
        </span>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="matchId" value={matchId} />

        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">Geen enkele kandidaat gevonden bij de KVK.</p>
        ) : (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Voorgestelde KVK-match</legend>
            {candidates.map((candidate) => (
              <label key={candidate.kvkNummer} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="kvkNummer"
                  value={candidate.kvkNummer}
                  defaultChecked={candidate.kvkNummer === chosenKvkNummer}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-slate-900">{candidate.naam}</span>
                  {candidate.kvkNummer === chosenKvkNummer && (
                    <span className="ml-1 text-xs text-slate-500">(voorgesteld)</span>
                  )}
                  <br />
                  Vestigingsplaats: {candidate.plaats ?? "onbekend"} · KVK-nummer:{" "}
                  {candidate.kvkNummer} · confidence: {candidate.score}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {state.status === "error" && (
          <p className="text-sm text-red-600" role="alert">
            {state.message}
          </p>
        )}
        {state.status === "success" && <p className="text-sm text-emerald-700">{state.message}</p>}

        <div className="flex flex-wrap items-center gap-3">
          {candidates.length > 0 && (
            <Button type="submit" name="decision" value="confirm" disabled title="Uitgeschakeld: dit zou een betaalde KVK-aanroep doen, en de KVK-koppeling is uitgeschakeld.">
              Bevestig gekozen kandidaat
            </Button>
          )}
          <Button type="submit" name="decision" value="reject" variant="secondary" disabled={pending}>
            Geen van deze klopt
          </Button>
        </div>
        {candidates.length > 0 && (
          <p className="text-xs text-slate-400">
            Bevestigen is uitgeschakeld: dit zou een KVK-aanroep doen, en de KVK-koppeling staat
            uit. Je kunt deze rij wel afwijzen om hem uit de lijst te verwijderen.
          </p>
        )}
      </form>
    </div>
  );
}
