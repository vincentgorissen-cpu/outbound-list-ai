import type { CompanyForScoring, IcpDataSource } from "./types";

type CompletenessInput = Pick<
  CompanyForScoring,
  | "plaats"
  | "aantalWerkzamePersonen"
  | "sbiOmschrijvingen"
  | "bedrijfsomschrijving"
  | "productsServices"
  | "industriesServed"
  | "operationalSignals"
  | "businessModel"
  | "websiteLocations"
>;

/** Is er substantiële, gestructureerde of vrije-tekst website-informatie voor dit bedrijf? */
function hasWebsiteContent(input: CompletenessInput): boolean {
  return Boolean(
    input.bedrijfsomschrijving?.trim() ||
      input.productsServices?.length ||
      input.industriesServed?.length ||
      input.operationalSignals?.length ||
      input.businessModel?.trim() ||
      input.websiteLocations?.length,
  );
}

/**
 * Deterministische, bron-onafhankelijke maat (0.0-1.0) voor hoeveel van de
 * voor ICP-scoring relevante datapunten daadwerkelijk bekend zijn — puur
 * gebaseerd op welke velden gevuld zijn, ongeacht of dat via upload, KVK
 * (momenteel niet gebruikt) of website intelligence kwam. Bewust géén
 * AI-inschatting: dit moet reproduceerbaar en niet gokbaar zijn.
 */
export function computeDataCompleteness(input: CompletenessInput): number {
  const factors = [
    input.plaats !== null,
    input.aantalWerkzamePersonen !== null,
    input.sbiOmschrijvingen.length > 0,
    hasWebsiteContent(input),
  ];
  const present = factors.filter(Boolean).length;
  return present / factors.length;
}

/**
 * Welke databronnen daadwerkelijk hebben bijgedragen aan dit bedrijf op
 * het moment van scoren. "upload" is altijd aanwezig (naam/plaats/website
 * komen altijd uit de eigen import); "website" alleen als er echt
 * website-inhoud is meegestuurd.
 */
export function computeDataSources(input: CompletenessInput): IcpDataSource[] {
  const sources: IcpDataSource[] = ["upload"];
  if (hasWebsiteContent(input)) {
    sources.push("website");
  }
  return sources;
}
