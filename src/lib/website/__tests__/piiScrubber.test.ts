import { describe, expect, it } from "vitest";
import {
  scrubPersonalInformation,
  stripEmailAddresses,
  stripPhoneNumbers,
  stripTitledNames,
} from "@/lib/website/piiScrubber";

describe("stripEmailAddresses", () => {
  it("verwijdert e-mailadressen", () => {
    expect(stripEmailAddresses("Mail ons op info@bedrijf.nl voor meer info.")).toBe("Mail ons op  voor meer info.");
  });

  it("verwijdert ook een persoonlijk e-mailadres", () => {
    expect(stripEmailAddresses("Contact: jan.jansen@bedrijf.nl")).toBe("Contact: ");
  });

  it("laat tekst zonder e-mailadres ongemoeid", () => {
    expect(stripEmailAddresses("Wij maken machines voor de foodindustrie.")).toBe(
      "Wij maken machines voor de foodindustrie.",
    );
  });
});

describe("stripPhoneNumbers", () => {
  it("verwijdert een Nederlands mobiel nummer", () => {
    expect(stripPhoneNumbers("Bel ons: 06-12345678 voor meer info.")).toBe("Bel ons:  voor meer info.");
  });

  it("verwijdert een internationaal nummer met landcode", () => {
    expect(stripPhoneNumbers("Tel: +31 6 12 34 56 78")).toBe("Tel: ");
  });

  it("laat een jaartal ongemoeid", () => {
    expect(stripPhoneNumbers("Opgericht in 1990.")).toBe("Opgericht in 1990.");
  });

  it("laat een huisnummer/postcode ongemoeid", () => {
    expect(stripPhoneNumbers("Hoofdstraat 123, 1234 AB Amsterdam")).toBe("Hoofdstraat 123, 1234 AB Amsterdam");
  });

  it("laat aantallen medewerkers ongemoeid", () => {
    expect(stripPhoneNumbers("Wij hebben 50 tot 500 medewerkers.")).toBe("Wij hebben 50 tot 500 medewerkers.");
  });
});

describe("stripTitledNames", () => {
  it("verwijdert een naam na een aanspreekvorm", () => {
    expect(stripTitledNames("Neem contact op met dhr. Jan Jansen voor meer info.")).toBe(
      "Neem contact op met  voor meer info.",
    );
  });

  it("verwijdert een naam na 'de heer'/'mevrouw'", () => {
    expect(stripTitledNames("Gesproken met mevrouw De Vries.")).toBe("Gesproken met .");
  });

  it("verwijdert alleen de naam na een functielabel, behoudt het label", () => {
    expect(stripTitledNames("Contactpersoon: Piet Pietersen")).toBe("Contactpersoon");
  });

  it("laat gewone bedrijfstekst zonder namen ongemoeid", () => {
    const text = "Wij zijn gespecialiseerd in machinebouw voor de foodproductie-industrie.";
    expect(stripTitledNames(text)).toBe(text);
  });
});

describe("scrubPersonalInformation", () => {
  it("combineert alle stappen en ruimt overgebleven witruimte op", () => {
    const input = "Contactpersoon: Jan Jansen, tel: 06-12345678, e-mail jan@bedrijf.nl.";
    const result = scrubPersonalInformation(input);
    expect(result).not.toContain("Jan Jansen");
    expect(result).not.toContain("06-12345678");
    expect(result).not.toContain("jan@bedrijf.nl");
    expect(result).toContain("Contactpersoon");
  });

  it("behoudt normale bedrijfsinhoud volledig intact", () => {
    const text =
      "Wij zijn een machinebouwer gespecialiseerd in food-productielijnen. Onze klanten zitten in de sectoren logistiek en foodproductie.";
    expect(scrubPersonalInformation(text)).toBe(text);
  });
});
