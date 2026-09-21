import { describe, expect, it } from "vitest";
import { classifyCompany } from "@/lib/classification/classifyCompany";

describe("classifyCompany", () => {
  describe("legal_entity", () => {
    it.each([
      ["Besloten vennootschap", "BV"],
      ["Naamloze vennootschap", "NV"],
      ["Stichting", "Stichting"],
      ["Vereniging", "Vereniging"],
    ])("classificeert %s (%s) als legal_entity", (rechtsvorm) => {
      expect(classifyCompany({ rechtsvorm, status: "actief" })).toBe("legal_entity");
    });

    it("classificeert coöperatie en onderlinge waarborgmaatschappij ook als legal_entity", () => {
      expect(classifyCompany({ rechtsvorm: "Coöperatie", status: "actief" })).toBe("legal_entity");
      expect(
        classifyCompany({ rechtsvorm: "Onderlinge waarborgmaatschappij", status: "actief" }),
      ).toBe("legal_entity");
    });

    it("herkent een uitgebreide rechtsvorm-omschrijving", () => {
      expect(
        classifyCompany({ rechtsvorm: "Besloten vennootschap met gewone structuur", status: "actief" }),
      ).toBe("legal_entity");
    });
  });

  describe("natural_person_business", () => {
    it("classificeert eenmanszaak als natural_person_business", () => {
      expect(classifyCompany({ rechtsvorm: "Eenmanszaak", status: "actief" })).toBe(
        "natural_person_business",
      );
    });
  });

  describe("partnership", () => {
    it("classificeert VOF als partnership", () => {
      expect(classifyCompany({ rechtsvorm: "Vennootschap onder firma", status: "actief" })).toBe(
        "partnership",
      );
    });

    it("classificeert maatschap als partnership", () => {
      expect(classifyCompany({ rechtsvorm: "Maatschap", status: "actief" })).toBe("partnership");
    });

    it("classificeert commanditaire vennootschap (CV) als partnership, niet als legal_entity", () => {
      expect(classifyCompany({ rechtsvorm: "Commanditaire vennootschap", status: "actief" })).toBe(
        "partnership",
      );
    });

    it("verwart 'onderlinge waarborgmaatschappij' niet met 'maatschap' (bevat toevallig dezelfde tekst)", () => {
      expect(
        classifyCompany({ rechtsvorm: "Onderlinge waarborgmaatschappij", status: "actief" }),
      ).toBe("legal_entity");
    });
  });

  describe("inactive", () => {
    it("classificeert status inactief als inactive", () => {
      expect(classifyCompany({ rechtsvorm: "Besloten vennootschap", status: "inactief" })).toBe(
        "inactive",
      );
    });

    it("laat status inactief altijd voorgaan op de rechtsvorm (opgeheven BV is inactive, geen legal_entity)", () => {
      const result = classifyCompany({ rechtsvorm: "Besloten vennootschap", status: "inactief" });
      expect(result).not.toBe("legal_entity");
      expect(result).toBe("inactive");
    });

    it("classificeert inactief ook zonder bekende rechtsvorm als inactive, niet unknown", () => {
      expect(classifyCompany({ rechtsvorm: null, status: "inactief" })).toBe("inactive");
    });
  });

  describe("unknown", () => {
    it("classificeert een ontbrekende rechtsvorm als unknown", () => {
      expect(classifyCompany({ rechtsvorm: null })).toBe("unknown");
      expect(classifyCompany({ rechtsvorm: "" })).toBe("unknown");
    });

    it("classificeert een onherkende rechtsvorm als unknown", () => {
      expect(classifyCompany({ rechtsvorm: "Iets wat geen bestaande rechtsvorm is" })).toBe(
        "unknown",
      );
    });

    it("classificeert unknown als status ontbreekt en rechtsvorm ontbreekt", () => {
      expect(classifyCompany({ rechtsvorm: null, status: undefined })).toBe("unknown");
    });
  });

  describe("normalisatie", () => {
    it("is ongevoelig voor hoofdletters", () => {
      expect(classifyCompany({ rechtsvorm: "BESLOTEN VENNOOTSCHAP", status: "actief" })).toBe(
        "legal_entity",
      );
      expect(classifyCompany({ rechtsvorm: "eenmanszaak" })).toBe("natural_person_business");
    });

    it("is ongevoelig voor accenten (coöperatie vs cooperatie)", () => {
      expect(classifyCompany({ rechtsvorm: "cooperatie", status: "actief" })).toBe("legal_entity");
      expect(classifyCompany({ rechtsvorm: "coöperatie", status: "actief" })).toBe("legal_entity");
    });

    it("negeert overtollige spaties", () => {
      expect(classifyCompany({ rechtsvorm: "  Stichting  ", status: "actief" })).toBe(
        "legal_entity",
      );
    });
  });
});
