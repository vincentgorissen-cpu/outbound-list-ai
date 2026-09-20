/**
 * Rechtsvorm-afkortingen die genegeerd worden bij het vergelijken van
 * bedrijfsnamen, zodat "Acme" en "Acme B.V." als (bijna) gelijk gelden.
 * Bewust GEEN woorden als "Holding" of "Groep": die onderscheiden vaak
 * een andere rechtspersoon binnen hetzelfde concern.
 */
const LEGAL_FORM_TOKENS = new Set([
  "bv",
  "nv",
  "vof",
  "cv",
  "eenmanszaak",
  "maatschap",
  "stichting",
  "vereniging",
  "cooperatie",
  "ua",
]);

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Normaliseert een bedrijfsnaam voor vergelijking: punten eerst
 * verwijderen (zodat "B.V." -> "BV" wordt, niet twee losse letters),
 * dan hoofdletters/accenten/overige leestekens weg, en rechtsvorm-
 * tokens eruit filteren.
 */
export function normalizeCompanyName(name: string): string {
  const withoutDots = name.replace(/\./g, "");
  const lower = stripDiacritics(withoutDots).toLowerCase();
  const withoutPunctuation = lower.replace(/[^a-z0-9\s]/g, " ");
  const tokens = withoutPunctuation
    .split(/\s+/)
    .filter((token) => token.length > 0 && !LEGAL_FORM_TOKENS.has(token));
  return tokens.join(" ").trim();
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

/**
 * Geeft 0-100 terug voor hoe gelijk twee bedrijfsnamen zijn, op basis
 * van genormaliseerde Levenshtein-afstand. 100 = identiek (na
 * normalisatie), 0 = volledig verschillend of één van beide leeg.
 */
export function companyNameSimilarity(a: string, b: string): number {
  const normA = normalizeCompanyName(a);
  const normB = normalizeCompanyName(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 100;

  const distance = levenshteinDistance(normA, normB);
  const maxLength = Math.max(normA.length, normB.length);
  const similarity = 1 - distance / maxLength;
  return Math.max(0, Math.round(similarity * 100));
}
