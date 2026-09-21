import { describe, expect, it } from "vitest";
import { mapWithConcurrencyLimit } from "@/lib/processing/concurrency";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mapWithConcurrencyLimit", () => {
  it("geeft resultaten terug op dezelfde index als de invoer", async () => {
    const results = await mapWithConcurrencyLimit([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it("verwerkt alle items, ook als er meer items dan de limiet zijn", async () => {
    const items = Array.from({ length: 11 }, (_, i) => i);
    const results = await mapWithConcurrencyLimit(items, 3, async (n) => n);
    expect(results).toEqual(items);
  });

  it("overschrijdt nooit de opgegeven concurrency-limiet", async () => {
    let active = 0;
    let maxActive = 0;

    await mapWithConcurrencyLimit(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(10);
      active -= 1;
    });

    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("werkt met een limiet groter dan het aantal items (nooit meer workers dan items)", async () => {
    const results = await mapWithConcurrencyLimit([1, 2], 10, async (n) => n);
    expect(results).toEqual([1, 2]);
  });

  it("geeft een lege array terug voor een lege invoer", async () => {
    const results = await mapWithConcurrencyLimit([], 3, async () => 1);
    expect(results).toEqual([]);
  });

  it("geeft een fout in fn door aan de aanroeper (die zelf per item moet afvangen als dat gewenst is)", async () => {
    await expect(
      mapWithConcurrencyLimit([1, 2, 3], 1, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
