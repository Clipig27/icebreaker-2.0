import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";

const STORAGE_KEY = "icebreaker_game_history";
const MAX_ENTRIES = 10;

export interface GameHistoryPlayer {
  id: string;
  username: string;
}

export interface GameHistoryEntry {
  id: string;
  game_type: string;
  winner_id: string | null;
  winner_name: string | null;
  players: GameHistoryPlayer[];
  trophy_delta: number;
  timestamp: string; // ISO string
}

/**
 * Save a game result to local storage (and attempt Supabase).
 *
 * Supabase table schema (create later if it doesn't exist):
 * ```sql
 * create table game_history (
 *   id uuid default gen_random_uuid() primary key,
 *   user_id uuid references users(id) not null,
 *   game_type text not null,
 *   winner_id uuid,
 *   winner_name text,
 *   players jsonb not null default '[]',
 *   trophy_delta int not null default 0,
 *   created_at timestamptz default now()
 * );
 * create index on game_history(user_id, created_at desc);
 * ```
 */
export async function saveGameResult(
  userId: string,
  entry: Omit<GameHistoryEntry, "id" | "timestamp">
): Promise<void> {
  const record: GameHistoryEntry = {
    ...entry,
    id: generateId(),
    timestamp: new Date().toISOString(),
  };

  // 1. Save to AsyncStorage (always works)
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const history: GameHistoryEntry[] = raw ? JSON.parse(raw) : [];
    history.unshift(record);
    // Keep only the last MAX_ENTRIES
    if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e: any) {
    console.warn("[gameHistory] AsyncStorage save failed:", e.message);
  }

  // 2. Try Supabase (gracefully fail if table doesn't exist)
  try {
    await supabase.from("game_history").insert({
      user_id: userId,
      game_type: entry.game_type,
      winner_id: entry.winner_id,
      winner_name: entry.winner_name,
      players: entry.players,
      trophy_delta: entry.trophy_delta,
    });
  } catch (e: any) {
    // Table may not exist yet — that's fine
    console.warn("[gameHistory] Supabase save failed (table may not exist):", e.message);
  }
}

/**
 * Load the last 10 game history entries.
 * Tries Supabase first, falls back to AsyncStorage.
 */
export async function loadGameHistory(userId: string): Promise<GameHistoryEntry[]> {
  // Try Supabase first
  try {
    const { data, error } = await supabase
      .from("game_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_ENTRIES);

    if (!error && data && data.length > 0) {
      return data.map((row: any) => ({
        id: row.id,
        game_type: row.game_type,
        winner_id: row.winner_id,
        winner_name: row.winner_name,
        players: row.players ?? [],
        trophy_delta: row.trophy_delta ?? 0,
        timestamp: row.created_at,
      }));
    }
  } catch (e: any) {
    console.warn("[gameHistory] Supabase load failed:", e.message);
  }

  // Fallback to AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e: any) {
    console.warn("[gameHistory] AsyncStorage load failed:", e.message);
  }

  return [];
}

/** Format a timestamp into a relative string like "2 hours ago", "Yesterday", etc. */
export function timeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return new Date(timestamp).toLocaleDateString();
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
