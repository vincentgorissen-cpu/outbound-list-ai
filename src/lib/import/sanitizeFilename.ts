/** Maakt een bestandsnaam veilig om als Storage-pad-segment te gebruiken. */
export function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim().slice(-180);
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, "_") || "bestand";
}
