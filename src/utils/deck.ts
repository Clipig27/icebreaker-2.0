/**
 * Shared, deterministic "no-repeat" helpers for every game's content bank.
 *
 * - Pure helpers (seededRng, shuffleWith, pickFresh) have no React/RN deps, so
 *   verification scripts can import them under plain Node.
 * - Recently-used ids are remembered per device in AsyncStorage (one small
 *   JSON array of string ids per bank key, capped), plus an in-memory copy for
 *   the current session. Picking prefers items not in the recent list and only
 *   falls back to the oldest-used items once the fresh supply runs out.
 */

/** Small fast deterministic PRNG (mulberry32). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit string hash (FNV-1a) for turning text into seeds/ids. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Fisher–Yates shuffle into a new array. */
export function shuffleWith<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/**
 * Pick `count` distinct items, preferring ones whose id is NOT in `recent`
 * (ordered oldest → newest). If there aren't enough fresh items, the
 * least-recently-used ones fill the gap. Pure; deterministic for a given rng.
 */
export function pickFresh<T>(
  items: readonly T[],
  count: number,
  idOf: (t: T) => string,
  recent: readonly string[] = [],
  rng: () => number = Math.random
): T[] {
  const recentIdx = new Map<string, number>();
  recent.forEach((id, i) => recentIdx.set(id, i));
  const fresh: T[] = [];
  const used: T[] = [];
  for (const it of items) (recentIdx.has(idOf(it)) ? used : fresh).push(it);
  const out = shuffleWith(fresh, rng).slice(0, count);
  if (out.length < count) {
    used.sort((a, b) => recentIdx.get(idOf(a))! - recentIdx.get(idOf(b))!); // oldest first
    out.push(...used.slice(0, count - out.length));
  }
  return out;
}

/** Append ids to a recent list (dedup, newest last) and cap its length. */
export function pushRecent(recent: readonly string[], ids: readonly string[], cap: number): string[] {
  const set = new Set(ids);
  const next = recent.filter((id) => !set.has(id)).concat(ids);
  return next.length > cap ? next.slice(next.length - cap) : next;
}

// ---------------------------------------------------------------------------
// Device-persisted recent lists (AsyncStorage), loaded lazily.
// ---------------------------------------------------------------------------

const memory: Record<string, string[]> = {};
const STORAGE_PREFIX = "deck_recent_v1:";

type Storage = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> };
let storage: Storage | null | undefined;
function getStorage(): Storage | null {
  if (storage !== undefined) return storage;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    storage = require("@react-native-async-storage/async-storage").default as Storage;
  } catch {
    storage = null; // plain Node (verification scripts)
  }
  return storage;
}

/** Recent ids for a bank key (in-memory; call loadRecent once to hydrate from disk). */
export function getRecent(key: string): string[] {
  return memory[key] ?? [];
}

/** Hydrate a bank's recent list from device storage (safe to call repeatedly). */
export async function loadRecent(key: string): Promise<string[]> {
  if (memory[key]) return memory[key];
  const s = getStorage();
  let list: string[] = [];
  if (s) {
    try {
      const raw = await s.getItem(STORAGE_PREFIX + key);
      if (raw) list = JSON.parse(raw);
    } catch {}
  }
  memory[key] = Array.isArray(list) ? list : [];
  return memory[key];
}

/** Remember ids as used (memory + device storage). */
export function markUsed(key: string, ids: readonly string[], cap = 400): void {
  memory[key] = pushRecent(memory[key] ?? [], ids, cap);
  const s = getStorage();
  if (s) s.setItem(STORAGE_PREFIX + key, JSON.stringify(memory[key])).catch(() => {});
}

/** Convenience: pick fresh items for a bank key and mark them used. */
export function drawFresh<T>(key: string, items: readonly T[], count: number, idOf: (t: T) => string, cap = 400): T[] {
  const picked = pickFresh(items, count, idOf, getRecent(key));
  markUsed(key, picked.map(idOf), cap);
  return picked;
}
