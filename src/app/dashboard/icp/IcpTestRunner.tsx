"use client";

import { useActionState } from "react";
import { runTestScoring, type RunTestScoringResult } from "./actions";
import { Button } from "@/components/ui/Button";

const initialState: RunTestScoringResult = { status: "idle" };

export function IcpTestRunner() {
  const [state, action, pending] = useActionState(runTestScoring, initialState);

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-slate-500">
        Scoort maximaal 10 nog niet gescoorde bedrijven die al met KVK-gegevens zijn
        verrijkt.
      </p>

      {state.status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p className="text-sm text-emerald-700">
          {state.scored} bedrijven gescoord
          {state.failed > 0 ? `, ${state.failed} mislukt (gemarkeerd om later opnieuw te proberen)` : ""}.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Bezig met scoren..." : "Test met maximaal 10 bedrijven"}
      </Button>
    </form>
  );
}
