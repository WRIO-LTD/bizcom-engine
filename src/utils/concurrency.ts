/**
 * Maps an array of items using an asynchronous mapper function, limiting the number of
 * concurrent executions to a specified limit.
 *
 * @param items The items to map.
 * @param mapper The asynchronous mapper function.
 * @param concurrency The maximum number of concurrent executions.
 * @returns A promise that resolves to an array of mapped results.
 */
export async function concurrentMap<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number = 10,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await mapper(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
