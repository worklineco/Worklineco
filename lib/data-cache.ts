/**
 * Lightweight in-memory data cache.
 *
 * In a single-page app the JS module context survives client-side navigation,
 * so anything stored here persists as the user moves between pages. Data pages
 * read the cached value on mount to render instantly, then fetch fresh data in
 * the background and update the cache ("stale-while-revalidate").
 *
 * This is intentionally dependency-free. It is not persisted across full page
 * reloads or sign-out (see clearDataCache).
 */

const store = new Map<string, unknown>();

/** Return the cached value for a key, or undefined if not cached yet. */
export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

/** Store a value for a key. */
export function setCached(key: string, value: unknown): void {
  store.set(key, value);
}

/** Clear a single cached key (e.g. after a change that invalidates it). */
export function clearCached(key: string): void {
  store.delete(key);
}

/** Clear everything — call on sign-out so a new user never sees stale data. */
export function clearDataCache(): void {
  store.clear();
}
