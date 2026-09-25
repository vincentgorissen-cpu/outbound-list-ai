import { describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "@/lib/http/fetchWithRetry";

function response(status: number, headers: Record<string, string> = {}): Response {
  return {
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

function noopDelay() {
  const calls: number[] = [];
  const delay = vi.fn(async (ms: number) => {
    calls.push(ms);
  });
  return { delay, calls };
}

describe("fetchWithRetry", () => {
  it("geeft direct het resultaat terug bij een geslaagde eerste poging, zonder te wachten", async () => {
    const { delay } = noopDelay();
    const fetchOnce = vi.fn().mockResolvedValue(response(200));

    const result = await fetchWithRetry(fetchOnce, { delay });

    expect(result.status).toBe(200);
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it("probeert opnieuw bij 429 en geeft daarna het geslaagde resultaat terug", async () => {
    const { delay } = noopDelay();
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(200));

    const result = await fetchWithRetry(fetchOnce, { delay, maxRetries: 3 });

    expect(result.status).toBe(200);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledTimes(1);
  });

  it("probeert opnieuw bij een 5xx-serverfout", async () => {
    const { delay } = noopDelay();
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));

    const result = await fetchWithRetry(fetchOnce, { delay });

    expect(result.status).toBe(200);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it("respecteert de Retry-After-header (in seconden) boven de standaard backoff", async () => {
    const { delay, calls } = noopDelay();
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce(response(429, { "retry-after": "7" }))
      .mockResolvedValueOnce(response(200));

    await fetchWithRetry(fetchOnce, { delay, baseDelayMs: 500 });

    expect(calls[0]).toBe(7000);
  });

  it("gebruikt exponentiële backoff zonder Retry-After-header", async () => {
    const { delay, calls } = noopDelay();
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(200));

    await fetchWithRetry(fetchOnce, { delay, baseDelayMs: 100 });

    expect(calls).toEqual([100, 200]);
  });

  it("stopt na maxRetries en geeft de laatste (nog steeds foute) respons terug", async () => {
    const { delay } = noopDelay();
    const fetchOnce = vi.fn().mockResolvedValue(response(503));

    const result = await fetchWithRetry(fetchOnce, { delay, maxRetries: 2 });

    expect(result.status).toBe(503);
    expect(fetchOnce).toHaveBeenCalledTimes(3);
  });

  it("probeert niet opnieuw bij een niet-retryable fout (400/401/404)", async () => {
    const { delay } = noopDelay();
    const fetchOnce = vi.fn().mockResolvedValue(response(404));

    const result = await fetchWithRetry(fetchOnce, { delay });

    expect(result.status).toBe(404);
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it("probeert opnieuw bij een netwerkfout (fetch gooit een exception)", async () => {
    const { delay } = noopDelay();
    const fetchOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(response(200));

    const result = await fetchWithRetry(fetchOnce, { delay });

    expect(result.status).toBe(200);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it("gooit de laatste netwerkfout als alle pogingen mislukken", async () => {
    const { delay } = noopDelay();
    const fetchOnce = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(fetchWithRetry(fetchOnce, { delay, maxRetries: 1 })).rejects.toThrow("network down");
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });
});
