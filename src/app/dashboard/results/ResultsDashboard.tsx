"use client";

import { useMemo, useState } from "react";
import type { CompanyClassification } from "@/lib/classification/types";
import type { IcpClassification, KvkEnrichmentStatus } from "@/lib/types/database.types";
import type { CompanyPipelineStatus, CompanyResultRow } from "@/lib/results/types";
import { BEDRIJFSCLASSIFICATIE_LABEL, ICP_LABEL } from "@/lib/results/labels";

const STATUS_LABEL: Record<CompanyPipelineStatus, string> = {
  nieuw: "Nieuw",
  controle_nodig: "Controle nodig",
  afgewezen: "Afgewezen",
  icp_mislukt: "ICP-score mislukt",
  verrijkt: "Verrijkt",
  compleet: "Compleet",
};

const STATUS_BADGE_CLASS: Record<CompanyPipelineStatus, string> = {
  nieuw: "bg-slate-100 text-slate-600",
  controle_nodig: "bg-amber-50 text-amber-700",
  afgewezen: "bg-slate-100 text-slate-500",
  icp_mislukt: "bg-red-50 text-red-700",
  verrijkt: "bg-blue-50 text-blue-700",
  compleet: "bg-emerald-50 text-emerald-700",
};

type SortValue =
  | "icpScore-desc"
  | "icpScore-asc"
  | "medewerkers-desc"
  | "medewerkers-asc"
  | "naam-asc"
  | "naam-desc";

interface Filters {
  icpClassification: "all" | IcpClassification;
  rechtsvorm: "all" | string;
  bedrijfsclassificatie: "all" | CompanyClassification;
  kvkStatus: "all" | KvkEnrichmentStatus;
  plaats: "all" | string;
  minMedewerkers: string;
  maxMedewerkers: string;
  minIcpScore: string;
  reviewRequiredOnly: boolean;
}

const INITIAL_FILTERS: Filters = {
  icpClassification: "all",
  rechtsvorm: "all",
  bedrijfsclassificatie: "all",
  kvkStatus: "all",
  plaats: "all",
  minMedewerkers: "",
  maxMedewerkers: "",
  minIcpScore: "",
  reviewRequiredOnly: false,
};

function formatValue(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

type ExportFormat = "csv" | "xlsx";
type ExportScope = "all" | "filtered" | "selected";

export function ResultsDashboard({ rows }: { rows: CompanyResultRow[] }) {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [sort, setSort] = useState<SortValue>("icpScore-desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const rechtsvormOpties = useMemo(() => {
    const values = new Set(rows.map((row) => row.rechtsvorm).filter((v): v is string => v !== null));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const plaatsOpties = useMemo(() => {
    const values = new Set(rows.map((row) => row.plaats).filter((v): v is string => v !== null));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // Samenvatting geeft altijd het totaalbeeld, ongeacht actieve filters.
  const summary = useMemo(
    () => ({
      totaal: rows.length,
      succesvolleMatches: rows.filter((row) => row.officieleNaam !== null).length,
      controleNodig: rows.filter((row) => row.reviewRequired).length,
      highFit: rows.filter((row) => row.icpClassification === "high_fit").length,
      mediumFit: rows.filter((row) => row.icpClassification === "medium_fit").length,
      lowFit: rows.filter((row) => row.icpClassification === "low_fit").length,
      inactief: rows.filter((row) => row.kvkStatus === "inactief").length,
    }),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const min = filters.minMedewerkers ? Number(filters.minMedewerkers) : null;
    const max = filters.maxMedewerkers ? Number(filters.maxMedewerkers) : null;
    const minScore = filters.minIcpScore ? Number(filters.minIcpScore) : null;

    return rows.filter((row) => {
      if (filters.icpClassification !== "all" && row.icpClassification !== filters.icpClassification) {
        return false;
      }
      if (filters.rechtsvorm !== "all" && row.rechtsvorm !== filters.rechtsvorm) return false;
      if (
        filters.bedrijfsclassificatie !== "all" &&
        row.bedrijfsclassificatie !== filters.bedrijfsclassificatie
      ) {
        return false;
      }
      if (filters.kvkStatus !== "all" && row.kvkStatus !== filters.kvkStatus) return false;
      if (filters.plaats !== "all" && row.plaats !== filters.plaats) return false;
      if (filters.reviewRequiredOnly && !row.reviewRequired) return false;
      if (min !== null && (row.aantalMedewerkers === null || row.aantalMedewerkers < min)) return false;
      if (max !== null && (row.aantalMedewerkers === null || row.aantalMedewerkers > max)) return false;
      if (minScore !== null && (row.icpScore === null || row.icpScore < minScore)) return false;
      return true;
    });
  }, [rows, filters]);

  const sortedRows = useMemo(() => {
    const [field, direction] = sort.split("-") as [
      "icpScore" | "medewerkers" | "naam",
      "asc" | "desc",
    ];
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      // Ontbrekende waarden tellen als laagst (zinken naar onder bij aflopend sorteren).
      let comparison: number;
      if (field === "icpScore") {
        comparison = (a.icpScore ?? -1) - (b.icpScore ?? -1);
      } else if (field === "medewerkers") {
        comparison = (a.aantalMedewerkers ?? -1) - (b.aantalMedewerkers ?? -1);
      } else {
        comparison = (a.origineleBedrijfsnaam ?? "").localeCompare(b.origineleBedrijfsnaam ?? "");
      }
      return direction === "asc" ? comparison : -comparison;
    });
    return copy;
  }, [filteredRows, sort]);

  const allVisibleSelected =
    sortedRows.length > 0 && sortedRows.every((row) => selectedIds.has(row.importRowId));

  function toggleRow(importRowId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(importRowId)) next.delete(importRowId);
      else next.add(importRowId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        const next = new Set(current);
        for (const row of sortedRows) next.delete(row.importRowId);
        return next;
      }
      const next = new Set(current);
      for (const row of sortedRows) next.add(row.importRowId);
      return next;
    });
  }

  async function handleExport(scope: ExportScope) {
    const importRowIds =
      scope === "all"
        ? rows.map((row) => row.importRowId)
        : scope === "filtered"
          ? sortedRows.map((row) => row.importRowId)
          : sortedRows
              .filter((row) => selectedIds.has(row.importRowId))
              .map((row) => row.importRowId);

    if (importRowIds.length === 0) {
      setExportError("Geen bedrijven om te exporteren.");
      return;
    }

    setExportError(null);
    setIsExporting(true);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importRowIds, format: exportFormat }),
      });

      if (!response.ok) {
        throw new Error("Export mislukt.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filenameMatch = response.headers
        .get("Content-Disposition")
        ?.match(/filename="(.+)"/);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameMatch?.[1] ?? `resultaten.${exportFormat}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Export mislukt. Probeer het opnieuw.");
    } finally {
      setIsExporting(false);
    }
  }

  const selectClass = "rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <SummaryTile label="Geïmporteerd" value={summary.totaal} />
        <SummaryTile label="KVK-matches" value={summary.succesvolleMatches} />
        <SummaryTile label="Controle nodig" value={summary.controleNodig} accent="amber" />
        <SummaryTile label="High fit" value={summary.highFit} accent="emerald" />
        <SummaryTile label="Medium fit" value={summary.mediumFit} accent="blue" />
        <SummaryTile label="Low fit" value={summary.lowFit} accent="slate" />
        <SummaryTile label="Inactief" value={summary.inactief} accent="red" />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <FilterField label="ICP-classificatie">
          <select
            className={selectClass}
            value={filters.icpClassification}
            onChange={(e) =>
              setFilters((f) => ({ ...f, icpClassification: e.target.value as Filters["icpClassification"] }))
            }
          >
            <option value="all">Alle</option>
            <option value="high_fit">Goede match</option>
            <option value="medium_fit">Matige match</option>
            <option value="low_fit">Zwakke match</option>
          </select>
        </FilterField>

        <FilterField label="Rechtsvorm">
          <select
            className={selectClass}
            value={filters.rechtsvorm}
            onChange={(e) => setFilters((f) => ({ ...f, rechtsvorm: e.target.value }))}
          >
            <option value="all">Alle</option>
            {rechtsvormOpties.map((optie) => (
              <option key={optie} value={optie}>
                {optie}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Bedrijfsclassificatie">
          <select
            className={selectClass}
            value={filters.bedrijfsclassificatie}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                bedrijfsclassificatie: e.target.value as Filters["bedrijfsclassificatie"],
              }))
            }
          >
            <option value="all">Alle</option>
            {(Object.keys(BEDRIJFSCLASSIFICATIE_LABEL) as CompanyClassification[]).map((key) => (
              <option key={key} value={key}>
                {BEDRIJFSCLASSIFICATIE_LABEL[key]}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Status KVK">
          <select
            className={selectClass}
            value={filters.kvkStatus}
            onChange={(e) => setFilters((f) => ({ ...f, kvkStatus: e.target.value as Filters["kvkStatus"] }))}
          >
            <option value="all">Alle</option>
            <option value="actief">Actief</option>
            <option value="inactief">Inactief</option>
          </select>
        </FilterField>

        <FilterField label="Plaats">
          <select
            className={selectClass}
            value={filters.plaats}
            onChange={(e) => setFilters((f) => ({ ...f, plaats: e.target.value }))}
          >
            <option value="all">Alle</option>
            {plaatsOpties.map((optie) => (
              <option key={optie} value={optie}>
                {optie}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Min. medewerkers">
          <input
            type="number"
            min={0}
            className={`${selectClass} w-28`}
            value={filters.minMedewerkers}
            onChange={(e) => setFilters((f) => ({ ...f, minMedewerkers: e.target.value }))}
          />
        </FilterField>

        <FilterField label="Max. medewerkers">
          <input
            type="number"
            min={0}
            className={`${selectClass} w-28`}
            value={filters.maxMedewerkers}
            onChange={(e) => setFilters((f) => ({ ...f, maxMedewerkers: e.target.value }))}
          />
        </FilterField>

        <FilterField label="Min. ICP-score">
          <input
            type="number"
            min={0}
            max={100}
            className={`${selectClass} w-24`}
            value={filters.minIcpScore}
            onChange={(e) => setFilters((f) => ({ ...f, minIcpScore: e.target.value }))}
          />
        </FilterField>

        <FilterField label="">
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-700">
            <input
              type="checkbox"
              checked={filters.reviewRequiredOnly}
              onChange={(e) => setFilters((f) => ({ ...f, reviewRequiredOnly: e.target.checked }))}
            />
            Alleen controle nodig
          </label>
        </FilterField>

        <FilterField label="Sorteer op">
          <select
            className={selectClass}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortValue)}
          >
            <option value="icpScore-desc">ICP-score (hoog → laag)</option>
            <option value="icpScore-asc">ICP-score (laag → hoog)</option>
            <option value="medewerkers-desc">Medewerkers (hoog → laag)</option>
            <option value="medewerkers-asc">Medewerkers (laag → hoog)</option>
            <option value="naam-asc">Bedrijfsnaam (A → Z)</option>
            <option value="naam-desc">Bedrijfsnaam (Z → A)</option>
          </select>
        </FilterField>

        <button
          type="button"
          onClick={() => setFilters(INITIAL_FILTERS)}
          className="text-sm text-slate-500 underline hover:text-slate-700"
        >
          Filters wissen
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {sortedRows.length} van {rows.length} bedrijven
          {selectedIds.size > 0 && ` · ${selectedIds.size} geselecteerd`}
        </p>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
          <select
            className={selectClass}
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleExport("all")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-slate-400 disabled:opacity-50"
          >
            Alles exporteren
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleExport("filtered")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-slate-400 disabled:opacity-50"
          >
            Gefilterde resultaten exporteren
          </button>
          <button
            type="button"
            disabled={isExporting || selectedIds.size === 0}
            onClick={() => handleExport("selected")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-slate-400 disabled:opacity-50"
          >
            Selectie exporteren ({selectedIds.size})
          </button>
        </div>
      </div>

      {exportError && <p className="text-sm text-red-600">{exportError}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="p-2">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  aria-label="Alle zichtbare rijen selecteren"
                />
              </th>
              <th className="p-2">Originele naam</th>
              <th className="p-2">Officiële KVK-naam</th>
              <th className="p-2">KVK-nummer</th>
              <th className="p-2">Rechtsvorm</th>
              <th className="p-2">Plaats</th>
              <th className="p-2">SBI-activiteit</th>
              <th className="p-2">Medewerkers</th>
              <th className="p-2">KVK-confidence</th>
              <th className="p-2">Bedrijfsclassificatie</th>
              <th className="p-2">ICP-score</th>
              <th className="p-2">ICP-classificatie</th>
              <th className="p-2">Belangrijkste reden</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((row) => (
              <tr key={row.importRowId}>
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.importRowId)}
                    onChange={() => toggleRow(row.importRowId)}
                    aria-label={`${row.origineleBedrijfsnaam ?? "Bedrijf"} selecteren`}
                  />
                </td>
                <td className="p-2 text-slate-900">{formatValue(row.origineleBedrijfsnaam)}</td>
                <td className="p-2 text-slate-600">{formatValue(row.officieleNaam)}</td>
                <td className="p-2 text-slate-600">{formatValue(row.kvkNummer)}</td>
                <td className="p-2 text-slate-600">{formatValue(row.rechtsvorm)}</td>
                <td className="p-2 text-slate-600">{formatValue(row.plaats)}</td>
                <td className="max-w-[220px] truncate p-2 text-slate-600" title={row.sbiActiviteit ?? undefined}>
                  {formatValue(row.sbiActiviteit)}
                </td>
                <td className="p-2 text-slate-600">{formatValue(row.aantalMedewerkers)}</td>
                <td className="p-2 text-slate-600">{formatValue(row.kvkMatchConfidence)}</td>
                <td className="p-2 text-slate-600">
                  {BEDRIJFSCLASSIFICATIE_LABEL[row.bedrijfsclassificatie]}
                </td>
                <td className="p-2 text-slate-600">{formatValue(row.icpScore)}</td>
                <td className="p-2 text-slate-600">
                  {row.icpClassification ? ICP_LABEL[row.icpClassification] : "—"}
                </td>
                <td
                  className="max-w-[260px] truncate p-2 text-slate-600"
                  title={row.belangrijksteReden ?? undefined}
                >
                  {formatValue(row.belangrijksteReden)}
                </td>
                <td className="p-2">
                  <span
                    className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[row.status]}`}
                  >
                    {STATUS_LABEL[row.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedRows.length === 0 && (
          <p className="p-4 text-sm text-slate-500">Geen bedrijven gevonden voor deze filters.</p>
        )}
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs font-medium text-slate-500">{label}</span>}
      {children}
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
  accent?: "slate" | "amber" | "emerald" | "blue" | "red";
}) {
  const accentClass: Record<string, string> = {
    slate: "text-slate-900",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    blue: "text-blue-700",
    red: "text-red-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accentClass[accent]}`}>{value}</p>
    </div>
  );
}
