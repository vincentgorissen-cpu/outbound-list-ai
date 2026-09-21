import { describe, expect, it } from "vitest";
import { countByStatus } from "@/lib/processing/countByStatus";

describe("countByStatus", () => {
  it("telt elke status apart en het totaal", () => {
    const counts = countByStatus([
      { status: "pending" },
      { status: "pending" },
      { status: "processing" },
      { status: "completed" },
      { status: "review_required" },
      { status: "failed" },
    ]);

    expect(counts).toEqual({
      pending: 2,
      processing: 1,
      completed: 1,
      reviewRequired: 1,
      failed: 1,
      total: 6,
    });
  });

  it("geeft nullen terug voor een lege lijst", () => {
    expect(countByStatus([])).toEqual({
      pending: 0,
      processing: 0,
      completed: 0,
      reviewRequired: 0,
      failed: 0,
      total: 0,
    });
  });
});
