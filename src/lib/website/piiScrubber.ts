import "server-only";

/**
 * Deze module gebruiken we uitsluitend voor bedrijfsinformatie. We slaan
 * bewust geen persoonsnamen, persoonlijke e-mailadressen,
 * telefoonnummers of individuele medewerkersprofielen op als onderdeel
 * van website intelligence.
 *
 * Dit is bewust deterministisch (patroonherkenning, geen AI/NER) en
 * dekt de meest voorkomende gevallen op bedrijfswebsites: contactblokken
 * (e-mail/telefoon) en namen die direct worden voorafgegaan door een
 * aanspreekvorm of functietitel. Het garandeert niet dat élke naam
 * ergens in vrije lopende tekst wordt gevonden (bv. een naam genoemd in
 * een citaat, zonder titel of functie ervoor) — zie ook
 * `removeTeamSections` in `extractContent.ts` voor het structureel
 * verwijderen van hele team-/medewerkersoverzichten, wat het resterende
 * risico daar al grotendeels wegneemt.
 */

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Digitreeksen die op een telefoonnummer lijken (spaties/haakjes/streepjes/+ toegestaan); pas als telefoonnummer behandeld bij minimaal 8 cijfers in totaal, zodat jaartallen/huisnummers/postcodes niet worden geraakt. */
const PHONE_CANDIDATE_PATTERN = /(\+?\d[\d\s().-]{6,}\d)/g;
const MIN_PHONE_DIGITS = 8;

// Let op: bewust GEEN 'i'-vlag — die zou de vereiste hoofdletter aan het
// begin van de naam (het signaal dat dit een eigennaam is) ook laten
// matchen op gewone kleine-letter-woorden zoals "voor" of "onze".
const TITLED_NAME_PATTERN =
  /\b([Dd]hr\.|[Mm]evr\.|[Dd]e heer|[Mm]evrouw|[Dd]r\.|[Mm]r\.|[Mm]s\.|[Mm]rs\.)\s+[A-ZÀ-ÖØ-Þ][\p{L}'-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'-]+){0,2}/gu;

/** "Contactpersoon: Jan Jansen" -> "Contactpersoon" (rollabel blijft, naam wordt verwijderd). */
const ROLE_NAME_PATTERN =
  /\b([Cc]ontactpersoon|[Vv]estigingsmanager|[Ff]iliaalmanager|[Mm]anager|[Dd]irecteur|[Ee]igenaar|CEO|ceo|[Ff]ounder|[Oo]prichter|[Bb]estuurder)\s*[:\-]\s*[A-ZÀ-ÖØ-Þ][\p{L}'-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'-]+){0,2}/gu;

function countDigits(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

export function stripEmailAddresses(text: string): string {
  return text.replace(EMAIL_PATTERN, "");
}

export function stripPhoneNumbers(text: string): string {
  return text.replace(PHONE_CANDIDATE_PATTERN, (match) => (countDigits(match) >= MIN_PHONE_DIGITS ? "" : match));
}

export function stripTitledNames(text: string): string {
  return text
    .replace(TITLED_NAME_PATTERN, "")
    .replace(ROLE_NAME_PATTERN, (match) => match.split(/[:\-]/)[0].trim());
}

/** Combineert alle scrub-stappen en ruimt de overgebleven witruimte op. */
export function scrubPersonalInformation(text: string): string {
  const withoutEmails = stripEmailAddresses(text);
  const withoutPhones = stripPhoneNumbers(withoutEmails);
  const withoutNames = stripTitledNames(withoutPhones);
  return withoutNames.replace(/[ \t]+/g, " ").trim();
}
