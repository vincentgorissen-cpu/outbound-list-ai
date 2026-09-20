"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  confirmImportMapping,
  uploadImportFile,
  type ConfirmImportResult,
  type UploadImportResult,
} from "./actions";
import { TARGET_FIELDS } from "@/lib/import/targetFields";
import type { MappingSuggestion, TargetFieldId } from "@/lib/import/types";
import { Button } from "@/components/ui/Button";

const initialUploadState: UploadImportResult = { status: "idle" };
const initialConfirmState: ConfirmImportResult = { status: "idle" };

const SOURCE_LABEL: Record<MappingSuggestion["source"], string> = {
  deterministic: "Automatisch herkend",
  ai: "AI-suggestie",
  manual: "Handmatig",
  none: "Niet herkend",
};

const SOURCE_BADGE_CLASS: Record<MappingSuggestion["source"], string> = {
  deterministic: "bg-emerald-50 text-emerald-700",
  ai: "bg-violet-50 text-violet-700",
  manual: "bg-slate-100 text-slate-600",
  none: "bg-amber-50 text-amber-700",
};

export function ImportWizard({
  onImported,
  onReset,
}: {
  onImported: () => void;
  onReset: () => void;
}) {
  const [uploadState, uploadAction, uploadPending] = useActionState(
    uploadImportFile,
    initialUploadState,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmImportMapping,
    initialConfirmState,
  );

  const [mapping, setMapping] = useState<Record<number, TargetFieldId | "">>(
    {},
  );
  const [mappingInitializedFor, setMappingInitializedFor] = useState<
    string | null
  >(null);

  const notifiedRef = useRef(false);
  useEffect(() => {
    if (confirmState.status === "success" && !notifiedRef.current) {
      notifiedRef.current = true;
      onImported();
    }
  }, [confirmState, onImported]);

  if (uploadState.status !== "success") {
    return (
      <form action={uploadAction} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            CSV- of XLSX-bestand
          </label>
          <input
            type="file"
            name="file"
            accept=".csv,.xlsx"
            required
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
          />
        </div>

        {uploadState.status === "error" && (
          <p className="text-sm text-red-600" role="alert">
            {uploadState.message}
          </p>
        )}

        <Button type="submit" disabled={uploadPending}>
          {uploadPending ? "Bezig met inlezen..." : "Uploaden"}
        </Button>
      </form>
    );
  }

  // Eerste keer dat we een geslaagde upload zien: mapping initialiseren
  // vanuit de deterministische/AI-suggesties.
  if (mappingInitializedFor !== uploadState.importId) {
    const initial: Record<number, TargetFieldId | ""> = {};
    for (const suggestion of uploadState.suggestions) {
      initial[suggestion.columnIndex] = suggestion.field ?? "";
    }
    setMapping(initial);
    setMappingInitializedFor(uploadState.importId);
  }

  if (confirmState.status === "success") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-medium text-emerald-800">
          {confirmState.rowCount} bedrijven geïmporteerd.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={onReset}
        >
          Nieuwe lijst uploaden
        </Button>
      </div>
    );
  }

  function handleMappingChange(columnIndex: number, fieldId: TargetFieldId | "") {
    setMapping((prev) => {
      const next = { ...prev };
      if (fieldId) {
        for (const key of Object.keys(next)) {
          const idx = Number(key);
          if (idx !== columnIndex && next[idx] === fieldId) {
            next[idx] = "";
          }
        }
      }
      next[columnIndex] = fieldId;
      return next;
    });
  }

  const bedrijfsnaamGekoppeld = Object.values(mapping).includes("bedrijfsnaam");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-slate-900">
          Controleer de kolomkoppeling
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Voorbeeld van {uploadState.previewRows.length} van de{" "}
          {uploadState.rowCount} rijen, over {uploadState.headers.length}{" "}
          kolommen. Pas de koppeling per kolom aan waar nodig.
        </p>
      </div>

      <form action={confirmAction} className="space-y-4">
        <input type="hidden" name="importId" value={uploadState.importId} />

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {uploadState.headers.map((header, columnIndex) => {
                  const suggestion = uploadState.suggestions.find(
                    (s) => s.columnIndex === columnIndex,
                  );
                  const source = suggestion?.source ?? "none";
                  return (
                    <th key={columnIndex} className="p-2 text-left align-top">
                      <div className="mb-1 font-medium text-slate-900">
                        {header}
                      </div>
                      <span
                        className={`mb-2 inline-block rounded px-1.5 py-0.5 text-xs ${SOURCE_BADGE_CLASS[source]}`}
                      >
                        {SOURCE_LABEL[source]}
                      </span>
                      <select
                        name={`mapping_${columnIndex}`}
                        value={mapping[columnIndex] ?? ""}
                        onChange={(event) =>
                          handleMappingChange(
                            columnIndex,
                            event.target.value as TargetFieldId | "",
                          )
                        }
                        className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      >
                        <option value="">— Negeren —</option>
                        {TARGET_FIELDS.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.label}
                            {field.required ? " *" : ""}
                          </option>
                        ))}
                      </select>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {uploadState.previewRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="max-w-[220px] truncate p-2 text-slate-600"
                      title={cell}
                    >
                      {cell || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!bedrijfsnaamGekoppeld && (
          <p className="text-sm text-amber-700">
            Koppel de kolom Bedrijfsnaam (*) voordat je importeert.
          </p>
        )}

        {confirmState.status === "error" && (
          <p className="text-sm text-red-600" role="alert">
            {confirmState.message}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={confirmPending || !bedrijfsnaamGekoppeld}>
            {confirmPending ? "Bezig met importeren..." : "Bevestig en importeer"}
          </Button>
          <Button type="button" variant="ghost" onClick={onReset}>
            Annuleren
          </Button>
        </div>
      </form>
    </div>
  );
}
