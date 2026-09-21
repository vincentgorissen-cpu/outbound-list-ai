"use client";

import { useActionState, useState } from "react";
import {
  previewIcpScoring,
  runIcpScoring,
  type PreviewIcpScoringResult,
  type RunIcpScoringResult,
} from "./actions";
import { Button } from "@/components/ui/Button";

const previewInitialState: PreviewIcpScoringResult = { status: "idle" };
const runInitialState: RunIcpScoringResult = { status: "idle" };

/**
 * Verwerkt nog niet gescoorde bedrijven in twee stappen: eerst een
 * gratis, deterministische voorbeeldberekening (hoeveel bedrijven
 * worden uitgesloten door de voorfilters, hoeveel gaan er naar de AI),
 * pas daarna — na expliciete bevestiging — de daadwerkelijke run. Na
 * elke geslaagde run is een nieuwe voorbeeldberekening nodig voordat
 * er opnieuw gestart kan worden, zodat de getoonde aantallen nooit
 * verouderd zijn.
 */
export function IcpTestRunner() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewIcpScoring,
    previewInitialState,
  );
  const [runState, runAction, runPending] = useActionState(runIcpScoring, runInitialState);
  const [confirmed, setConfirmed] = useState(false);
  const [previewStale, setPreviewStale] = useState(true);

  // Afgeleide staleness-status, bijgewerkt tijdens het renderen zodra
  // `previewState`/`runState` wijzigen — bewust géén effect, om
  // cascaderende re-renders te vermijden (zie React's patroon voor het
  // "aanpassen van state bij een gewijzigde prop").
  const [lastSeenPreviewState, setLastSeenPreviewState] = useState(previewState);
  const [lastSeenRunState, setLastSeenRunState] = useState(runState);

  if (previewState !== lastSeenPreviewState) {
    setLastSeenPreviewState(previewState);
    if (previewState.status === "success") {
      setPreviewStale(false);
    }
  }

  if (runState !== lastSeenRunState) {
    setLastSeenRunState(runState);
    if (runState.status === "success") {
      setPreviewStale(true);
      setConfirmed(false);
    }
  }

  const showRunForm = previewState.status === "success" && !previewStale;
  const canRun = showRunForm && previewState.willProcessNow > 0 && confirmed;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">
          Bereken eerst hoeveel bedrijven door AI beoordeeld zullen worden. Bedrijven die door de
          voorfilters worden uitgesloten krijgen geen AI-aanroep.
        </p>
        <form action={previewAction} className="mt-2">
          <Button type="submit" variant="secondary" disabled={previewPending}>
            {previewPending ? "Bezig met berekenen..." : "Bereken hoeveel bedrijven beoordeeld worden"}
          </Button>
        </form>
      </div>

      {previewState.status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {previewState.message}
        </p>
      )}

      {previewState.status === "success" && (
        <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p>{previewState.totalUnprocessed} nog niet verwerkte, verrijkte bedrijven gevonden.</p>
          <p>{previewState.excludedByPrefilter} daarvan worden uitgesloten door de voorfilters (geen AI-aanroep).</p>
          <p>{previewState.eligibleForAi} bedrijven komen in aanmerking voor AI-scoring.</p>
          <p className="font-medium text-slate-900">
            Deze run verwerkt {previewState.willProcessNow}{" "}
            {previewState.willProcessNow === 1 ? "bedrijf" : "bedrijven"} — geschat{" "}
            {previewState.willProcessNow} AI-aanroep
            {previewState.willProcessNow === 1 ? "" : "en"} (max. {previewState.batchLimit} per run).
          </p>
          {previewStale && (
            <p className="text-xs text-amber-700">
              Bereken opnieuw voor actuele aantallen voordat je start.
            </p>
          )}
        </div>
      )}

      {showRunForm && (
        <form action={runAction} className="space-y-3">
          <input type="hidden" name="confirmed" value={confirmed ? "true" : "false"} />

          {previewState.status === "success" && previewState.willProcessNow > 0 && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Ik bevestig dat ik {previewState.willProcessNow} AI-aanroep
              {previewState.willProcessNow === 1 ? "" : "en"} wil starten.
            </label>
          )}

          {runState.status === "error" && (
            <p className="text-sm text-red-600" role="alert">
              {runState.message}
            </p>
          )}
          {runState.status === "success" && (
            <p className="text-sm text-emerald-700">
              {runState.excluded} uitgesloten door voorfilters, {runState.scored} gescoord
              {runState.failed > 0 ? `, ${runState.failed} mislukt (gemarkeerd om later opnieuw te proberen)` : ""}.
            </p>
          )}

          {previewState.status === "success" && previewState.willProcessNow > 0 && (
            <Button type="submit" disabled={!canRun || runPending}>
              {runPending ? "Bezig met scoren..." : `Start AI-scoring (${previewState.willProcessNow})`}
            </Button>
          )}

          {previewState.status === "success" &&
            previewState.willProcessNow === 0 &&
            previewState.excludedByPrefilter > 0 && (
              <Button type="submit" variant="secondary" disabled={runPending}>
                {runPending
                  ? "Bezig..."
                  : `Uitsluitingen vastleggen (${previewState.excludedByPrefilter}, geen AI-aanroepen)`}
              </Button>
            )}

          {previewState.status === "success" &&
            previewState.willProcessNow === 0 &&
            previewState.excludedByPrefilter === 0 && (
              <p className="text-sm text-slate-500">Niets te verwerken.</p>
            )}
        </form>
      )}
    </div>
  );
}
