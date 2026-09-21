/**
 * Voert `fn` uit voor elk item in `items`, met maximaal `limit`
 * gelijktijdige aanroepen — zodat een grotere batch de KVK API (of de
 * Anthropic API) niet overbelast. Resultaten staan op dezelfde index
 * als de invoer, ongeacht de volgorde waarin ze daadwerkelijk afronden.
 * Eén afgewezen `fn`-aanroep stopt de overige items niet; de aanroeper
 * is verantwoordelijk voor het zelf afvangen van fouten in `fn` als
 * losse items niet de hele batch mogen laten falen.
 */
export async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await fn(items[current], current);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
