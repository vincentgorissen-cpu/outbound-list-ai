"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  EmptyFileError,
  UnsupportedFileTypeError,
  parseImportFile,
} from "@/lib/import/parseFile";
import { buildMappingSuggestions } from "@/lib/import/buildMappingSuggestions";
import { normalizeRows } from "@/lib/import/normalizeRecord";
import { sanitizeFilename } from "@/lib/import/sanitizeFilename";
import { TARGET_FIELDS } from "@/lib/import/targetFields";
import {
  MAX_FILE_SIZE_BYTES,
  MAX_PREVIEW_ROWS,
  STORAGE_BUCKET,
} from "@/lib/import/constants";
import type { ColumnMapping, MappingSuggestion, TargetFieldId } from "@/lib/import/types";

export type UploadImportResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      importId: string;
      headers: string[];
      previewRows: string[][];
      rowCount: number;
      suggestions: MappingSuggestion[];
    };

export type ConfirmImportResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; rowCount: number };

const TARGET_FIELD_IDS = new Set(TARGET_FIELDS.map((field) => field.id));

export async function uploadImportFile(
  _prevState: UploadImportResult,
  formData: FormData,
): Promise<UploadImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Je sessie is verlopen. Log opnieuw in." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Kies eerst een CSV- of XLSX-bestand." };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      status: "error",
      message: `Bestand is te groot (max. ${Math.floor(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB).`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseImportFile(buffer, file.name);
  } catch (error) {
    if (error instanceof UnsupportedFileTypeError || error instanceof EmptyFileError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Kon het bestand niet lezen. Controleer het formaat." };
  }

  const suggestions = await buildMappingSuggestions(parsed);

  const importId = randomUUID();
  const storagePath = `${user.id}/${importId}/${sanitizeFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    return { status: "error", message: "Opslaan van het bestand is mislukt. Probeer opnieuw." };
  }

  const previewRows = parsed.rows.slice(0, MAX_PREVIEW_ROWS);
  const initialMapping: ColumnMapping = {};
  for (const suggestion of suggestions) {
    if (suggestion.field) initialMapping[suggestion.field] = suggestion.columnIndex;
  }

  const { error: insertError } = await supabase.from("imports").insert({
    id: importId,
    user_id: user.id,
    original_filename: file.name,
    storage_path: storagePath,
    status: "pending_mapping",
    headers: parsed.headers,
    preview_rows: previewRows,
    row_count: parsed.rows.length,
    column_mapping: initialMapping,
  });
  if (insertError) {
    return { status: "error", message: "Opslaan van de import is mislukt. Probeer opnieuw." };
  }

  return {
    status: "success",
    importId,
    headers: parsed.headers,
    previewRows,
    rowCount: parsed.rows.length,
    suggestions,
  };
}

function parseMappingFromFormData(formData: FormData): ColumnMapping | null {
  const mapping: ColumnMapping = {};
  const usedFields = new Set<TargetFieldId>();

  for (const [key, value] of formData.entries()) {
    const match = /^mapping_(\d+)$/.exec(key);
    if (!match) continue;
    const columnIndex = Number(match[1]);
    const fieldId = String(value);
    if (!fieldId) continue;
    if (!TARGET_FIELD_IDS.has(fieldId as TargetFieldId)) return null;
    if (usedFields.has(fieldId as TargetFieldId)) return null;
    usedFields.add(fieldId as TargetFieldId);
    mapping[fieldId as TargetFieldId] = columnIndex;
  }

  return mapping;
}

export async function confirmImportMapping(
  _prevState: ConfirmImportResult,
  formData: FormData,
): Promise<ConfirmImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Je sessie is verlopen. Log opnieuw in." };
  }

  const importId = String(formData.get("importId") ?? "");
  if (!importId) {
    return { status: "error", message: "Onbekende import." };
  }

  const mapping = parseMappingFromFormData(formData);
  if (!mapping) {
    return {
      status: "error",
      message: "Ongeldige mapping: elk veld mag maar aan één kolom gekoppeld worden.",
    };
  }
  if (mapping.bedrijfsnaam === undefined) {
    return { status: "error", message: "Koppel in ieder geval de kolom Bedrijfsnaam." };
  }

  const { data: importRecord, error: fetchError } = await supabase
    .from("imports")
    .select("storage_path, status")
    .eq("id", importId)
    .single();

  if (fetchError || !importRecord) {
    return { status: "error", message: "Import niet gevonden." };
  }
  if (importRecord.status === "completed") {
    return { status: "error", message: "Deze import is al afgerond." };
  }

  const { data: downloaded, error: downloadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(importRecord.storage_path);
  if (downloadError || !downloaded) {
    return { status: "error", message: "Kon het opgeslagen bestand niet terugvinden." };
  }

  const buffer = Buffer.from(await downloaded.arrayBuffer());
  const originalFilename = importRecord.storage_path.split("/").pop() ?? "bestand.csv";

  let parsed;
  try {
    parsed = await parseImportFile(buffer, originalFilename);
  } catch {
    return { status: "error", message: "Kon het bestand niet opnieuw inlezen." };
  }

  const records = normalizeRows(parsed.rows, mapping);
  const rowsToInsert = records.map((record, rowIndex) => ({
    import_id: importId,
    user_id: user.id,
    row_index: rowIndex,
    ...record,
  }));

  const CHUNK_SIZE = 500;
  for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
    const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
    const { error: insertError } = await supabase.from("import_rows").insert(chunk);
    if (insertError) {
      return { status: "error", message: "Wegschrijven van de records is mislukt." };
    }
  }

  const { error: updateError } = await supabase
    .from("imports")
    .update({
      status: "completed",
      column_mapping: mapping,
      row_count: records.length,
      completed_at: new Date().toISOString(),
    })
    .eq("id", importId);
  if (updateError) {
    return { status: "error", message: "Import kon niet worden afgerond." };
  }

  revalidatePath("/dashboard/import");
  return { status: "success", rowCount: records.length };
}
