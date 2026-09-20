import Anthropic from "@anthropic-ai/sdk";
import { getTargetField } from "./targetFields";
import type { DetectedColumn, TargetFieldId } from "./types";

/**
 * Minimale vorm van de Anthropic-client die deze module nodig heeft.
 * Losgekoppeld van het echte SDK-type zodat tests een simpele mock
 * kunnen injecteren zonder een volledig Message-object te bouwen.
 */
export interface AiMatchClient {
  messages: {
    create: (params: Record<string, unknown>) => Promise<{
      content: Array<{ type: string; input?: Record<string, unknown> }>;
    }>;
  };
}

const MODEL = "claude-haiku-4-5-20251001";

let cachedClient: Anthropic | null = null;
function getDefaultClient(): AiMatchClient {
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient as unknown as AiMatchClient;
}

export interface AiMatchInput {
  /** Kolommen die niet deterministisch herkend konden worden. */
  unresolvedColumns: DetectedColumn[];
  /** Doelvelden die nog geen kolom toegewezen hebben gekregen. */
  unresolvedFields: TargetFieldId[];
}

/**
 * Vraagt de AI om alleen de kolommen te koppelen die deterministisch
 * niet betrouwbaar herkend konden worden, en alleen aan doelvelden die
 * nog niet ingevuld zijn. Faalt de aanroep (geen API-key, netwerkfout,
 * onverwacht antwoord), dan blijven de kolommen gewoon ongemapt zodat
 * de gebruiker ze handmatig kan koppelen.
 */
export async function suggestColumnMappingWithAI(
  { unresolvedColumns, unresolvedFields }: AiMatchInput,
  client: AiMatchClient = getDefaultClient(),
): Promise<Map<number, TargetFieldId>> {
  const result = new Map<number, TargetFieldId>();
  if (unresolvedColumns.length === 0 || unresolvedFields.length === 0) {
    return result;
  }

  // Interne sleutels op basis van kolomindex (niet de header-tekst zelf),
  // zodat twee kolommen met dezelfde kop elkaar niet overschrijven.
  const keyForColumn = (columnIndex: number) => `col_${columnIndex}`;

  const properties: Record<string, unknown> = {};
  for (const column of unresolvedColumns) {
    properties[keyForColumn(column.columnIndex)] = {
      type: ["string", "null"],
      enum: [...unresolvedFields, null],
    };
  }

  const fieldDescriptions = unresolvedFields
    .map((id) => {
      const field = getTargetField(id);
      return `- ${field.id}: ${field.label} — ${field.description}`;
    })
    .join("\n");

  const columnDescriptions = unresolvedColumns
    .map((column) => {
      const samples =
        column.sampleValues.filter(Boolean).slice(0, 3).join(" | ") ||
        "(geen voorbeeldwaarden)";
      return `- ${keyForColumn(column.columnIndex)}: kolomkop "${column.header}", voorbeeldwaarden: ${samples}`;
    })
    .join("\n");

  const tool = {
    name: "propose_column_mapping",
    description:
      "Stelt per kolom het best passende doelveld voor, of null als geen enkel doelveld past.",
    input_schema: {
      type: "object" as const,
      properties,
      required: unresolvedColumns.map((column) =>
        keyForColumn(column.columnIndex),
      ),
      additionalProperties: false,
    },
  };

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools: [tool],
      tool_choice: { type: "tool", name: "propose_column_mapping" },
      messages: [
        {
          role: "user",
          content: `Je koppelt kolommen uit een geüpload bestand met bedrijfsgegevens aan doelvelden voor een CRM-import.

Nog te koppelen doelvelden:
${fieldDescriptions}

Kolommen zonder betrouwbare automatische match:
${columnDescriptions}

Kies per kolom het best passende doelveld, of null als niets goed past. Ken nooit hetzelfde doelveld aan meer dan één kolom toe.`,
        },
      ],
    });
  } catch {
    return result;
  }

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse?.input) return result;

  const claimedFields = new Set<TargetFieldId>();
  for (const column of unresolvedColumns) {
    const proposed = toolUse.input[keyForColumn(column.columnIndex)];
    if (
      typeof proposed === "string" &&
      unresolvedFields.includes(proposed as TargetFieldId) &&
      !claimedFields.has(proposed as TargetFieldId)
    ) {
      claimedFields.add(proposed as TargetFieldId);
      result.set(column.columnIndex, proposed as TargetFieldId);
    }
  }

  return result;
}
