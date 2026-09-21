export const NEDERLANDSE_PROVINCIES = [
  "Drenthe",
  "Flevoland",
  "Friesland",
  "Gelderland",
  "Groningen",
  "Limburg",
  "Noord-Brabant",
  "Noord-Holland",
  "Overijssel",
  "Utrecht",
  "Zeeland",
  "Zuid-Holland",
] as const;

export type NederlandseProvincie = (typeof NEDERLANDSE_PROVINCIES)[number];

/**
 * Beperkte plaats-naar-provincie-lookup voor de grootste Nederlandse
 * vestigingsplaatsen. Er is geen volledige offline plaats→provincie-
 * mapping zonder een postcodetabel (die we niet opslaan); dit dekt de
 * meest voorkomende gevallen. Een onbekende plaats levert `null` op,
 * en de provinciefilter sluit dan bewust niets uit voor dat bedrijf
 * (fail-open — nooit gokken bij een deterministische uitsluitingsregel).
 */
const CITY_TO_PROVINCIE: Record<string, NederlandseProvincie> = {
  amsterdam: "Noord-Holland",
  haarlem: "Noord-Holland",
  zaanstad: "Noord-Holland",
  alkmaar: "Noord-Holland",
  hilversum: "Noord-Holland",
  rotterdam: "Zuid-Holland",
  "den haag": "Zuid-Holland",
  "'s-gravenhage": "Zuid-Holland",
  delft: "Zuid-Holland",
  leiden: "Zuid-Holland",
  dordrecht: "Zuid-Holland",
  gouda: "Zuid-Holland",
  zoetermeer: "Zuid-Holland",
  utrecht: "Utrecht",
  amersfoort: "Utrecht",
  nieuwegein: "Utrecht",
  veenendaal: "Utrecht",
  eindhoven: "Noord-Brabant",
  tilburg: "Noord-Brabant",
  breda: "Noord-Brabant",
  "'s-hertogenbosch": "Noord-Brabant",
  "den bosch": "Noord-Brabant",
  helmond: "Noord-Brabant",
  maastricht: "Limburg",
  venlo: "Limburg",
  heerlen: "Limburg",
  sittard: "Limburg",
  arnhem: "Gelderland",
  nijmegen: "Gelderland",
  apeldoorn: "Gelderland",
  ede: "Gelderland",
  zwolle: "Overijssel",
  enschede: "Overijssel",
  deventer: "Overijssel",
  hengelo: "Overijssel",
  groningen: "Groningen",
  leeuwarden: "Friesland",
  assen: "Drenthe",
  emmen: "Drenthe",
  middelburg: "Zeeland",
  vlissingen: "Zeeland",
  goes: "Zeeland",
  lelystad: "Flevoland",
  almere: "Flevoland",
};

/** Leidt de provincie af uit een vestigingsplaats; `null` als de plaats onbekend of niet in de lookup is. */
export function resolveProvincie(plaats: string | null): NederlandseProvincie | null {
  if (!plaats) return null;
  const normalized = plaats.trim().toLowerCase();
  return CITY_TO_PROVINCIE[normalized] ?? null;
}
