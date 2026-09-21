import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCompanyResultRows } from "@/lib/results/buildCompanyResults";
import { generateCsvExport, generateXlsxExport } from "@/lib/results/generateExportFile";

interface ExportRequestBody {
  importRowIds: string[];
  format: "csv" | "xlsx";
}

function isValidBody(value: unknown): value is ExportRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    Array.isArray(body.importRowIds) &&
    body.importRowIds.every((id) => typeof id === "string") &&
    (body.format === "csv" || body.format === "xlsx")
  );
}

/**
 * Genereert een export (CSV of XLSX) voor een expliciete set import_row-id's
 * (alle/gefilterde/geselecteerde resultaten worden door de client bepaald).
 * Haalt de brongegevens opnieuw op, gescopet op de ingelogde gebruiker, zodat
 * dit endpoint niet vertrouwt op door de client meegestuurde bedrijfsdata.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isValidBody(body)) {
    return NextResponse.json({ error: "Ongeldig verzoek." }, { status: 400 });
  }

  const { importRowIds, format } = body;

  if (importRowIds.length === 0) {
    return NextResponse.json({ error: "Geen bedrijven om te exporteren." }, { status: 400 });
  }

  const { data: importRows } = await supabase
    .from("import_rows")
    .select("id, bedrijfsnaam, plaats, website")
    .eq("user_id", user.id)
    .in("id", importRowIds);

  const orderById = new Map(importRowIds.map((id, index) => [id, index]));
  const orderedImportRows = [...(importRows ?? [])].sort(
    (a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0),
  );

  const ids = orderedImportRows.map((row) => row.id);

  const [{ data: enrichments }, { data: matches }, { data: icpScores }] =
    ids.length > 0
      ? await Promise.all([
          supabase.from("kvk_enrichments").select("*").in("import_row_id", ids),
          supabase.from("kvk_matches").select("*").in("import_row_id", ids),
          supabase.from("icp_scores").select("*").in("import_row_id", ids),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const rows = buildCompanyResultRows(
    orderedImportRows,
    enrichments ?? [],
    matches ?? [],
    icpScores ?? [],
  );

  const date = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const csv = generateCsvExport(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="resultaten-${date}.csv"`,
      },
    });
  }

  const xlsx = await generateXlsxExport(rows);
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="resultaten-${date}.xlsx"`,
    },
  });
}
