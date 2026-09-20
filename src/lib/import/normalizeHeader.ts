/**
 * Normaliseert een kolomkop zodat spelling-varianten (hoofdletters,
 * spaties, koppeltekens, accenten) als gelijk herkend worden.
 * "KVK-Nummer", "kvk nummer" en "KVK_Nummer" worden alle "kvk nummer".
 */
export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
