/**
 * Lightweight data cache with localStorage persistence.
 *
 * Values are kept in memory AND mirrored to localStorage, so cached data
 * survives full page reloads. Data pages read the cached value on mount to
 * render instantly, then fetch fresh data in the background and update the
 * cache ("stale-while-revalidate").
 *
 * Cleared on sign-out (see clearDataCache) so a new user never sees stale data.
 */

const memory = new Map<string, unknown>();
const storagePrefix = "wl_cache:";
const persistentCacheBudgetBytes = 2 * 1024 * 1024;

function storageSize(value: string): number {
  return value.length * 2;
}

function makePersistentCacheRoom(targetKey: string, targetValue: string): boolean {
  if (!hasWindow()) {
    return false;
  }

  const targetSize = storageSize(targetKey) + storageSize(targetValue);
  if (targetSize > persistentCacheBudgetBytes) {
    window.localStorage.removeItem(targetKey);
    return false;
  }

  const entries: { key: string; size: number }[] = [];
  let totalSize = 0;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(storagePrefix) || key === targetKey) {
      continue;
    }
    const value = window.localStorage.getItem(key) ?? "";
    const size = storageSize(key) + storageSize(value);
    entries.push({ key, size });
    totalSize += size;
  }

  entries.sort((left, right) => right.size - left.size);
  while (entries.length && totalSize + targetSize > persistentCacheBudgetBytes) {
    const entry = entries.shift();
    if (!entry) {
      break;
    }
    window.localStorage.removeItem(entry.key);
    totalSize -= entry.size;
  }

  return totalSize + targetSize <= persistentCacheBudgetBytes;
}

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/** Return the cached value for a key, or undefined if not cached yet. */
export function getCached<T>(key: string): T | undefined {
  if (memory.has(key)) {
    return memory.get(key) as T;
  }

  if (hasWindow()) {
    try {
      const raw = window.localStorage.getItem(storagePrefix + key);
      if (raw) {
        const value = JSON.parse(raw) as T;
        memory.set(key, value);
        return value;
      }
    } catch {
      // Ignore parse/storage errors and fall through to undefined.
    }
  }

  return undefined;
}

/** Store a value for a key (memory + localStorage). */
export function setCached(key: string, value: unknown): void {
  memory.set(key, value);

  if (hasWindow()) {
    try {
      const storageKey = storagePrefix + key;
      const serialized = JSON.stringify(value);
      if (makePersistentCacheRoom(storageKey, serialized)) {
        window.localStorage.setItem(storageKey, serialized);
      }
    } catch {
      // Storage full or unavailable — memory cache still works.
    }
  }
}

/** Clear a single cached key. */
export function clearCached(key: string): void {
  memory.delete(key);

  if (hasWindow()) {
    try {
      window.localStorage.removeItem(storagePrefix + key);
    } catch {
      // Ignore.
    }
  }
}

/** Clear only persisted cache entries while keeping the in-memory cache available. */
export function clearPersistentDataCache(): void {
  if (hasWindow()) {
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key && key.startsWith(storagePrefix)) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore.
    }
  }
}

/** Clear everything — call on sign-out. */
export function clearDataCache(): void {
  memory.clear();
  clearPersistentDataCache();
}
