"use client";

import { useRef, useState } from "react";
import { processNextChunk, type ProcessingCounts } from "./actions";
import { Button } from "@/components/ui/Button";

export function ProcessingRunner({ initialCounts }: { initialCounts: ProcessingCounts }) {
  const [counts, setCounts] = useState(initialCounts);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const remaining = counts.pending + counts.processing;
  const verwerkt = counts.completed + counts.reviewRequired + counts.failed;
  const percentage = counts.total > 0 ? Math.round((verwerkt / counts.total) * 100) : 0;

  async function runLoop(retryFailedOnly: boolean) {
    setError(null);
    setIsRunning(true);
    cancelRef.current = false;
    try {
      let done = false;
      while (!done && !cancelRef.current) {
        const result = await processNextChunk(retryFailedOnly);
        if (result.status === "error") {
          setError(result.message);
          break;
        }
        setCounts(result.counts);
        done = result.done;
      }
    } catch {
      setError("Er ging iets mis tijdens het verwerken. Probeer het opnieuw.");
    } finally {
      setIsRunning(false);
    }
  }

  function handleStop() {
    cancelRef.current = true;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-900">
            {verwerkt} / {counts.total} verwerkt
          </span>
          <span className="text-slate-500">{percentage}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-slate-900 transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Nog te verwerken" value={remaining} />
        <SummaryTile label="Succesvol" value={counts.completed} accent="emerald" />
        <SummaryTile label="Review vereist" value={counts.reviewRequired} accent="amber" />
        <SummaryTile label="Mislukt" value={counts.failed} accent="red" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => runLoop(false)} disabled={isRunning || remaining === 0}>
          {isRunning ? "Bezig met verwerken..." : "Start verwerking"}
        </Button>

        {counts.failed > 0 && (
          <Button variant="secondary" onClick={() => runLoop(true)} disabled={isRunning}>
            {isRunning ? "Bezig..." : `Mislukte opnieuw proberen (${counts.failed})`}
          </Button>
        )}

        {isRunning && (
          <Button variant="ghost" onClick={handleStop}>
            Stoppen
          </Button>
        )}
      </div>

      {remaining === 0 && counts.total > 0 && !isRunning && (
        <p className="text-sm text-slate-500">
          Niets te verwerken — alle bedrijven zijn al aan de beurt geweest.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent = "slate",
}: {
  label: string;
  value: number;
  accent?: "slate" | "emerald" | "amber" | "red";
}) {
  const accentClass: Record<string, string> = {
    slate: "text-slate-900",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accentClass[accent]}`}>{value}</p>
    </div>
  );
}
