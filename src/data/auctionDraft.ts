// ---------------------------------------------------------------------------
// Auction Draft ("Bid Wars") — themes + PURE rule logic.
//
// No React / Supabase in this file: everything here is deterministic given its
// inputs (time is passed in as `now`, randomness as `rng`) so it can be unit
// tested / simulated (see scripts/auctionDraftSim.ts).
// ---------------------------------------------------------------------------

import { BankItem } from "./bank/items";
import { ThemeRecipe, THEME_RECIPES, chooseRecipe, drawRecipePool, getThemeRecipe, recentCapFor, themeEligible } from "./bank/recipes";

/** Placeholder display name — rename here and it changes everywhere. */
export const AUCTION_GAME_NAME = "Bid Wars";

export const STARTING_MONEY = 20;
export const TURN_SECONDS = 15;
export const TURN_MS = TURN_SECONDS * 1000;
/** How long the "SOLD to X" / "FREE to X" card stays up before the host advances. */
export const RESULT_MS = 2500;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const CUSTOM_THEME_ID = "custom";
export const CUSTOM_ITEM_EMOJI = "✨";

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

export type AuctionItem = { id: string; name: string; emoji: string };

/** Theme metadata (everything except the item pool) — stored in game_state. */
export type AuctionThemeInfo = {
  id: string;
  name: string;
  emoji: string;
  /** The thing everyone starts with. */
  baseName: string;
  baseEmoji: string;
  /** Singular noun for an auctioned item, e.g. "topping". */
  itemNoun: string;
  /** Singular noun for a finished creation, e.g. "burger". */
  finishedNoun: string;
};

export type AuctionTheme = AuctionThemeInfo & { items: AuctionItem[] };

// Built-in themes come from the recipe engine (src/data/bank/recipes.ts) over
// the shared tagged item bank (src/data/bank/items.ts). Item ids are stable
// slugs of the bank name, so no-repeat tracking survives app restarts.

function toAuctionItem(it: BankItem): AuctionItem {
  return { id: it.id, name: it.name, emoji: it.emoji };
}

const eligibleCache = new Map<string, AuctionItem[]>();

function makeTheme(t: ThemeRecipe): AuctionTheme {
  return {
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    baseName: t.bases[0][0],
    baseEmoji: t.bases[0][1],
    itemNoun: t.itemNoun,
    finishedNoun: t.finishedNoun,
    /** Every item this theme (any variant) can deal; built lazily. */
    get items(): AuctionItem[] {
      let hit = eligibleCache.get(t.id);
      if (!hit) eligibleCache.set(t.id, (hit = themeEligible(t).map(toAuctionItem)));
      return hit;
    },
  };
}

export const AUCTION_THEMES: AuctionTheme[] = THEME_RECIPES.map(makeTheme);

/** Device recent-list key (deck.ts) for a built-in theme. */
export function auctionRecentKey(themeId: string): string {
  return `bidwars:${themeId}`;
}

/** How many recently dealt ids to remember for a theme. */
export function auctionRecentCap(themeId: string): number {
  const t = getThemeRecipe(themeId);
  return t ? recentCapFor(t) : 0;
}

/**
 * Host: deal a coherent pool for a built-in theme. Picks the base recipe or
 * one of its variants (e.g. "Breakfast Burger"), a base (e.g. "Pretzel bun")
 * and exactly playerCount × itemsPerPlayer items, avoiding `recent` ids.
 * The returned info keeps the parent theme id; its name is the variant title.
 */
export function drawThemePool(
  themeId: string,
  playerCount: number,
  recent: readonly string[] = [],
  rng: () => number = Math.random
): { info: AuctionThemeInfo; pool: AuctionItem[]; recipeKey: string } {
  const theme = getThemeRecipe(themeId);
  if (!theme) throw new Error(`drawThemePool: unknown theme ${themeId}`);
  const count = playerCount * itemsPerPlayerFor(playerCount);
  const recipe = chooseRecipe(theme, rng);
  const { base, picks } = drawRecipePool(recipe, count, rng, recent);
  return {
    info: {
      id: theme.id,
      name: recipe.name,
      emoji: recipe.emoji,
      baseName: base[0],
      baseEmoji: base[1],
      itemNoun: recipe.itemNoun,
      finishedNoun: recipe.finishedNoun,
    },
    pool: picks.map((p) => toAuctionItem(p.item)),
    recipeKey: recipe.key,
  };
}

/** Metadata for the Custom tile (items/base supplied by the host). */
export const CUSTOM_THEME_INFO: AuctionThemeInfo = {
  id: CUSTOM_THEME_ID,
  name: "Custom",
  emoji: "✏️",
  baseName: "",
  baseEmoji: "📦",
  itemNoun: "item",
  finishedNoun: "creation",
};

export function themeInfo(t: AuctionTheme): AuctionThemeInfo {
  const { items: _items, ...info } = t;
  return info;
}

// ---------------------------------------------------------------------------
// Player count / pool
// ---------------------------------------------------------------------------

export function itemsPerPlayerFor(playerCount: number): number {
  if (playerCount === 2) return 5;
  if (playerCount === 3) return 4;
  if (playerCount === 4) return 3;
  return 0;
}

export function validatePlayerCount(playerCount: number): { ok: boolean; message: string | null } {
  if (playerCount < MIN_PLAYERS) return { ok: false, message: `Need at least ${MIN_PLAYERS} players to start.` };
  if (playerCount > MAX_PLAYERS)
    return { ok: false, message: `${AUCTION_GAME_NAME} is for ${MIN_PLAYERS}-${MAX_PLAYERS} players. ${playerCount} are in the room.` };
  return { ok: true, message: null };
}

export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Draw `count` distinct items (by id and by name) in random order. Throws if not enough. */
export function drawPool(pool: readonly AuctionItem[], count: number, rng: () => number = Math.random): AuctionItem[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const unique: AuctionItem[] = [];
  for (const it of pool) {
    const key = it.name.trim().toLowerCase();
    if (!key || seenIds.has(it.id) || seenNames.has(key)) continue;
    seenIds.add(it.id);
    seenNames.add(key);
    unique.push(it);
  }
  if (unique.length < count) throw new Error(`drawPool: need ${count} items, only ${unique.length} available`);
  return shuffle(unique, rng).slice(0, count);
}

// ---------------------------------------------------------------------------
// Custom theme
// ---------------------------------------------------------------------------

/** Trim, drop empties and case-insensitive duplicates; assign ids + default emoji. */
export function parseCustomItems(raw: readonly string[]): AuctionItem[] {
  const seen = new Set<string>();
  const out: AuctionItem[] = [];
  for (const line of raw) {
    const name = line.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `custom${out.length + 1}`, name, emoji: CUSTOM_ITEM_EMOJI });
  }
  return out;
}

/** Split a pasted blob (newlines) into item lines. */
export function splitItemLines(text: string): string[] {
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

export function validateCustomTheme(
  baseName: string,
  rawItems: readonly string[],
  playerCount: number
): { ok: boolean; message: string | null; needed: number; items: AuctionItem[] } {
  const parsed = parseCustomItems(rawItems);
  const k = itemsPerPlayerFor(playerCount);
  const needed = k * playerCount;
  if (!baseName.trim()) return { ok: false, message: "Give your base a name (what everyone starts with).", needed, items: parsed };
  if (k === 0) return { ok: false, message: validatePlayerCount(playerCount).message, needed, items: parsed };
  if (parsed.length < needed) {
    const more = needed - parsed.length;
    return {
      ok: false,
      message: `Add ${more} more unique item${more === 1 ? "" : "s"} (${playerCount} players × ${k} = ${needed} needed).`,
      needed,
      items: parsed,
    };
  }
  return { ok: true, message: null, needed, items: parsed };
}

export function buildCustomTheme(baseName: string, parsedItems: AuctionItem[]): AuctionTheme {
  return { ...CUSTOM_THEME_INFO, name: baseName.trim(), baseName: baseName.trim(), items: parsedItems };
}

// ---------------------------------------------------------------------------
// Auction state machine
// ---------------------------------------------------------------------------

export type AuctionResultKind = "sold" | "free" | "leftover";

export type AuctionResult = {
  itemIndex: number;
  item: AuctionItem;
  playerId: string;
  price: number;
  kind: AuctionResultKind;
};

export type AuctionPlayer = { money: number; items: AuctionItem[] };

/**
 * - "bidding": item `pool[itemIndex]` is up; `turn` must bid or pass before `deadline`.
 * - "result": `lastResults` is being shown until `deadline`; host then calls nextItem().
 * - "done": every item has been allocated (asserted).
 */
export type AuctionStatus = "bidding" | "result" | "done";

export type AuctionState = {
  order: string[]; // player ids in table order (fixed at start)
  itemsPerPlayer: number;
  startingMoney: number;
  pool: AuctionItem[]; // exactly order.length * itemsPerPlayer items, auctioned in order
  itemIndex: number; // current item (pool.length once everything is allocated)
  players: Record<string, AuctionPlayer>;
  departed: string[]; // left the room: never bid/open, but can still receive free/leftover items
  status: AuctionStatus;
  opener: string | null;
  turn: string | null;
  highBid: number; // 0 = no bid yet
  highBidder: string | null;
  passed: string[]; // passes for the current item (final)
  seq: number; // bumped on every transition; guards host timers against double-firing
  deadline: number; // ms epoch: turn deadline (bidding) or end of result display (result)
  lastResults: AuctionResult[]; // what the result card shows (1 for sold/free, n for leftovers)
  log: AuctionResult[]; // every allocation, in order
};

export function openSlots(s: AuctionState, id: string): number {
  const p = s.players[id];
  return p ? s.itemsPerPlayer - p.items.length : 0;
}

export function isFull(s: AuctionState, id: string): boolean {
  return openSlots(s, id) <= 0;
}

export function isBroke(s: AuctionState, id: string): boolean {
  return (s.players[id]?.money ?? 0) <= 0;
}

export function isDeparted(s: AuctionState, id: string): boolean {
  return s.departed.includes(id);
}

/** Can take part in auctions at all (ignores passes on the current item). */
export function isEligibleBidder(s: AuctionState, id: string): boolean {
  return !!s.players[id] && !isDeparted(s, id) && !isFull(s, id) && !isBroke(s, id);
}

/** Eligible bidders who haven't passed the current item, in table order. */
export function remainingBidders(s: AuctionState): string[] {
  return s.order.filter((id) => isEligibleBidder(s, id) && !s.passed.includes(id));
}

/** Bid range for a player right now. */
export function bidBounds(s: AuctionState, id: string): { min: number; max: number; canRaise: boolean } {
  const min = Math.max(1, s.highBid + 1);
  const max = s.players[id]?.money ?? 0;
  return { min, max, canRaise: max >= min };
}

export type PlayerAuctionStatus = "left" | "full" | "broke" | "high" | "passed" | "turn" | "in";

export function playerAuctionStatus(s: AuctionState, id: string): PlayerAuctionStatus {
  if (isDeparted(s, id)) return "left";
  if (isFull(s, id)) return "full";
  if (s.status === "bidding" && s.highBidder === id) return "high";
  if (isBroke(s, id)) return "broke";
  if (s.status === "bidding" && s.passed.includes(id)) return "passed";
  if (s.status === "bidding" && s.turn === id) return "turn";
  return "in";
}

/** First id in `candidates` scanning `order` cyclically from `fromIndex` (inclusive). */
function scanFrom(order: string[], fromIndex: number, candidates: string[]): string | null {
  const n = order.length;
  for (let step = 0; step < n; step++) {
    const id = order[(((fromIndex + step) % n) + n) % n];
    if (candidates.includes(id)) return id;
  }
  return null;
}

/** Who gets an item nobody bid on: open slots, broke first, then fewest items, then table order. */
export function freeRecipient(s: AuctionState): string {
  const cands = s.order
    .map((id, idx) => ({ id, idx }))
    .filter(({ id }) => openSlots(s, id) > 0)
    .sort((a, b) => {
      const brokeA = isBroke(s, a.id) ? 0 : 1;
      const brokeB = isBroke(s, b.id) ? 0 : 1;
      if (brokeA !== brokeB) return brokeA - brokeB;
      const itemsA = s.players[a.id].items.length;
      const itemsB = s.players[b.id].items.length;
      if (itemsA !== itemsB) return itemsA - itemsB;
      return a.idx - b.idx;
    });
  if (cands.length === 0) throw new Error("freeRecipient: nobody has an open slot");
  return cands[0].id;
}

/** Throws unless the finished allocation is exactly right. */
export function assertFinalAllocation(s: AuctionState): void {
  let total = 0;
  const ids = new Set<string>();
  for (const id of s.order) {
    const p = s.players[id];
    if (!p) throw new Error(`assert: missing player ${id}`);
    if (p.items.length !== s.itemsPerPlayer)
      throw new Error(`assert: ${id} has ${p.items.length} items, expected ${s.itemsPerPlayer}`);
    if (p.money < 0 || !Number.isInteger(p.money)) throw new Error(`assert: ${id} has invalid money ${p.money}`);
    total += p.items.length;
    for (const it of p.items) ids.add(it.id);
  }
  if (total !== s.pool.length) throw new Error(`assert: ${total} items allocated, pool is ${s.pool.length}`);
  if (ids.size !== s.pool.length) throw new Error("assert: duplicate item allocated");
  for (const it of s.pool) if (!ids.has(it.id)) throw new Error(`assert: item ${it.id} never allocated`);
}

/** Throws if any in-progress invariant is broken (used by the simulator). */
export function assertInvariants(s: AuctionState): void {
  let total = 0;
  for (const id of s.order) {
    const p = s.players[id];
    if (!p) throw new Error(`invariant: missing player ${id}`);
    if (p.money < 0) throw new Error(`invariant: ${id} money ${p.money} < 0`);
    if (p.items.length > s.itemsPerPlayer) throw new Error(`invariant: ${id} over capacity`);
    total += p.items.length;
  }
  if (total !== s.log.length) throw new Error("invariant: allocation log mismatch");
  if (s.status === "bidding" && total !== s.itemIndex) throw new Error("invariant: allocated != itemIndex while bidding");
  if (s.status === "done") assertFinalAllocation(s);
}

function finish(s: AuctionState): AuctionState {
  const done: AuctionState = {
    ...s,
    status: "done",
    itemIndex: s.pool.length,
    turn: null,
    opener: null,
    highBid: 0,
    highBidder: null,
    passed: [],
    seq: s.seq + 1,
    deadline: 0,
  };
  assertFinalAllocation(done);
  return done;
}

function cloneMembers(s: AuctionState): Record<string, AuctionPlayer> {
  const out: Record<string, AuctionPlayer> = {};
  for (const id of Object.keys(s.players)) out[id] = { money: s.players[id].money, items: [...s.players[id].items] };
  return out;
}

/** No eligible bidders left: deal every remaining item round-robin, broke players first. */
function dealLeftovers(s: AuctionState, now: number): AuctionState {
  const players = cloneMembers(s);
  const recipients = s.order
    .map((id, idx) => ({ id, idx }))
    .sort((a, b) => {
      const brokeA = players[a.id].money <= 0 ? 0 : 1;
      const brokeB = players[b.id].money <= 0 ? 0 : 1;
      return brokeA - brokeB || a.idx - b.idx;
    })
    .map((r) => r.id);
  const results: AuctionResult[] = [];
  let cursor = 0;
  for (let i = s.itemIndex; i < s.pool.length; i++) {
    let given = false;
    for (let step = 0; step < recipients.length; step++) {
      const id = recipients[(cursor + step) % recipients.length];
      if (players[id].items.length < s.itemsPerPlayer) {
        players[id].items.push(s.pool[i]);
        results.push({ itemIndex: i, item: s.pool[i], playerId: id, price: 0, kind: "leftover" });
        cursor = (cursor + step + 1) % recipients.length;
        given = true;
        break;
      }
    }
    if (!given) throw new Error("dealLeftovers: no open slot for leftover item");
  }
  return {
    ...s,
    players,
    status: "result",
    itemIndex: s.pool.length,
    opener: null,
    turn: null,
    highBid: 0,
    highBidder: null,
    passed: [],
    seq: s.seq + 1,
    deadline: now + RESULT_MS,
    lastResults: results,
    log: [...s.log, ...results],
  };
}

/** Open bidding on pool[itemIndex] (or deal leftovers / finish). */
function startItem(s: AuctionState, now: number): AuctionState {
  if (s.itemIndex >= s.pool.length) return finish(s);
  const eligible = s.order.filter((id) => isEligibleBidder(s, id));
  if (eligible.length === 0) return dealLeftovers(s, now);
  const opener = scanFrom(s.order, s.itemIndex % s.order.length, eligible)!;
  return {
    ...s,
    status: "bidding",
    opener,
    turn: opener,
    highBid: 0,
    highBidder: null,
    passed: [],
    seq: s.seq + 1,
    deadline: now + TURN_MS,
    lastResults: [],
  };
}

function award(s: AuctionState, playerId: string, price: number, kind: AuctionResultKind, now: number): AuctionState {
  const players = cloneMembers(s);
  const p = players[playerId];
  if (!p) throw new Error(`award: unknown player ${playerId}`);
  if (p.items.length >= s.itemsPerPlayer) throw new Error(`award: ${playerId} is full`);
  if (price < 0 || price > p.money) throw new Error(`award: ${playerId} can't pay ${price}`);
  const item = s.pool[s.itemIndex];
  p.items.push(item);
  p.money -= price;
  const result: AuctionResult = { itemIndex: s.itemIndex, item, playerId, price, kind };
  return {
    ...s,
    players,
    status: "result",
    turn: null,
    seq: s.seq + 1,
    deadline: now + RESULT_MS,
    lastResults: [result],
    log: [...s.log, result],
  };
}

/**
 * After a bid / pass / departure, either award the item or move the turn.
 * `fromId` is who just acted; with `keepTurn` the current turn holder keeps the
 * turn (and deadline) if they can still act.
 */
function resolve(s: AuctionState, fromId: string | null, now: number, keepTurn = false): AuctionState {
  const rem = remainingBidders(s);
  if (s.highBidder) {
    const others = rem.filter((id) => id !== s.highBidder);
    if (others.length === 0) return award(s, s.highBidder, s.highBid, "sold", now);
    return moveTurn(s, fromId, others, now, keepTurn);
  }
  if (rem.length === 0) return award(s, freeRecipient(s), 0, "free", now);
  return moveTurn(s, fromId, rem, now, keepTurn);
}

function moveTurn(s: AuctionState, fromId: string | null, candidates: string[], now: number, keepTurn: boolean): AuctionState {
  if (keepTurn && s.turn && candidates.includes(s.turn)) return { ...s, seq: s.seq + 1 };
  const fromIdx = fromId ? s.order.indexOf(fromId) : -1;
  const next = scanFrom(s.order, fromIdx + 1, candidates)!;
  return { ...s, turn: next, seq: s.seq + 1, deadline: now + TURN_MS };
}

/** Start a fresh auction. `order` = table order, `pool` = exactly order.length × itemsPerPlayer items. */
export function createAuction(
  order: string[],
  pool: AuctionItem[],
  now: number,
  startingMoney: number = STARTING_MONEY
): AuctionState {
  const n = order.length;
  if (!validatePlayerCount(n).ok) throw new Error(`createAuction: invalid player count ${n}`);
  if (new Set(order).size !== n) throw new Error("createAuction: duplicate player ids");
  const k = itemsPerPlayerFor(n);
  if (pool.length !== n * k) throw new Error(`createAuction: pool must have ${n * k} items, got ${pool.length}`);
  if (new Set(pool.map((p) => p.id)).size !== pool.length) throw new Error("createAuction: duplicate items in pool");
  const players: Record<string, AuctionPlayer> = {};
  for (const id of order) players[id] = { money: startingMoney, items: [] };
  return startItem(
    {
      order: [...order],
      itemsPerPlayer: k,
      startingMoney,
      pool: [...pool],
      itemIndex: 0,
      players,
      departed: [],
      status: "bidding",
      opener: null,
      turn: null,
      highBid: 0,
      highBidder: null,
      passed: [],
      seq: 0,
      deadline: 0,
      lastResults: [],
      log: [],
    },
    now
  );
}

/** Current bidder raises. Returns null if the bid is not legal right now. */
export function applyBid(s: AuctionState, playerId: string, amount: number, now: number): AuctionState | null {
  if (s.status !== "bidding" || s.turn !== playerId) return null;
  if (!isEligibleBidder(s, playerId) || s.passed.includes(playerId)) return null;
  const { min, max } = bidBounds(s, playerId);
  if (!Number.isInteger(amount) || amount < min || amount > max) return null;
  return resolve({ ...s, highBid: amount, highBidder: playerId }, playerId, now);
}

/** Current bidder passes (final for this item). Returns null if it's not their turn. */
export function applyPass(s: AuctionState, playerId: string, now: number): AuctionState | null {
  if (s.status !== "bidding" || s.turn !== playerId) return null;
  return resolve({ ...s, passed: [...s.passed, playerId] }, playerId, now);
}

/** Host: the turn identified by `seq` ran out of time → auto-pass. Null if stale. */
export function applyTimeout(s: AuctionState, seq: number, now: number): AuctionState | null {
  if (s.status !== "bidding" || s.seq !== seq || !s.turn) return null;
  return applyPass(s, s.turn, now);
}

/** Host: these players left the room. Null if nothing changes. */
export function markDeparted(s: AuctionState, ids: string[], now: number): AuctionState | null {
  const fresh = ids.filter((id) => s.order.includes(id) && !s.departed.includes(id));
  if (fresh.length === 0) return null;
  const next: AuctionState = { ...s, departed: [...s.departed, ...fresh], seq: s.seq + 1 };
  if (next.status !== "bidding") return next;
  // Departed players are no longer eligible, i.e. treated as passed.
  const turnLeft = next.turn !== null && fresh.includes(next.turn);
  return resolve(next, next.turn, now, !turnLeft);
}

/** Host: after the result card, move on to the next item (or finish). Null if not showing a result. */
export function nextItem(s: AuctionState, now: number): AuctionState | null {
  if (s.status !== "result") return null;
  return startItem({ ...s, itemIndex: Math.min(s.itemIndex + 1, s.pool.length) }, now);
}

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

/**
 * Count votes for `candidateIds` (self-votes and votes for non-candidates are
 * ignored). Winners = everyone tied on the max count (empty if no valid votes).
 */
export function tallyVotes(
  votes: Record<string, string>,
  candidateIds: string[]
): { counts: Record<string, number>; winners: string[] } {
  const counts: Record<string, number> = {};
  for (const id of candidateIds) counts[id] = 0;
  for (const [voter, votee] of Object.entries(votes)) {
    if (voter === votee || !(votee in counts)) continue;
    counts[votee] += 1;
  }
  const max = Math.max(0, ...Object.values(counts));
  const winners = max > 0 ? candidateIds.filter((id) => counts[id] === max) : [];
  return { counts, winners };
}
