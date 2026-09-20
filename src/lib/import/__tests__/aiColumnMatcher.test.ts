import { describe, expect, it, vi } from "vitest";
import { suggestColumnMappingWithAI } from "@/lib/import/aiColumnMatcher";
import type { AiMatchClient } from "@/lib/import/aiColumnMatcher";
import type { DetectedColumn } from "@/lib/import/types";

function column(columnIndex: number, header: string, sampleValues: string[] = []): DetectedColumn {
  return { columnIndex, header, sampleValues };
}

describe("suggestColumnMappingWithAI", () => {
  it("roept de AI niet aan als er niets onopgelost is", async () => {
    const create = vi.fn();
    const client: AiMatchClient = { messages: { create } };

    const result = await suggestColumnMappingWithAI(
      { unresolvedColumns: [], unresolvedFields: ["kvk_nummer"] },
      client,
    );

    expect(create).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it("verwerkt een geldig tool_use-antwoord naar een mapping per kolomindex", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: { col_2: "telefoon", col_3: null },
        },
      ],
    });
    const client: AiMatchClient = { messages: { create } };

    const result = await suggestColumnMappingWithAI(
      {
        unresolvedColumns: [
          column(2, "Nr.", ["0612345678"]),
          column(3, "Opmerkingen", ["n.v.t."]),
        ],
        unresolvedFields: ["telefoon", "functie"],
      },
      client,
    );

    expect(result.get(2)).toBe("telefoon");
    expect(result.has(3)).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("negeert een door de AI voorgesteld veld dat niet in unresolvedFields zit", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", input: { col_0: "bedrijfsnaam" } }],
    });
    const client: AiMatchClient = { messages: { create } };

    const result = await suggestColumnMappingWithAI(
      {
        unresolvedColumns: [column(0, "Naam")],
        unresolvedFields: ["telefoon"],
      },
      client,
    );

    expect(result.size).toBe(0);
  });

  it("kent een doelveld nooit aan twee kolommen tegelijk toe", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        { type: "tool_use", input: { col_0: "telefoon", col_1: "telefoon" } },
      ],
    });
    const client: AiMatchClient = { messages: { create } };

    const result = await suggestColumnMappingWithAI(
      {
        unresolvedColumns: [column(0, "Nr 1"), column(1, "Nr 2")],
        unresolvedFields: ["telefoon"],
      },
      client,
    );

    expect(result.size).toBe(1);
  });

  it("geeft een lege mapping terug als de AI-aanroep faalt", async () => {
    const create = vi.fn().mockRejectedValue(new Error("network error"));
    const client: AiMatchClient = { messages: { create } };

    const result = await suggestColumnMappingWithAI(
      {
        unresolvedColumns: [column(0, "Nr.")],
        unresolvedFields: ["telefoon"],
      },
      client,
    );

    expect(result.size).toBe(0);
  });

  it("geeft een lege mapping terug bij een antwoord zonder tool_use", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text" }] });
    const client: AiMatchClient = { messages: { create } };

    const result = await suggestColumnMappingWithAI(
      {
        unresolvedColumns: [column(0, "Nr.")],
        unresolvedFields: ["telefoon"],
      },
      client,
    );

    expect(result.size).toBe(0);
  });
});
