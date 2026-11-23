// Self-check for the Auction Draft rule logic.
// Run: npx --yes tsx scripts/auctionDraftSim.ts
//
// Simulates many random games for 2, 3 and 4 players (all-pass items, players
// going broke early, full players, timeouts, players leaving mid-game) and
// asserts every invariant after every transition.

import {
  AUCTION_THEMES,
  AuctionState,
  STARTING_MONEY,
  applyBid,
  applyPass,
  applyTimeout,
  assertFinalAllocation,
  assertInvariants,
  bidBounds,
  createAuction,
  drawPool,
  itemsPerPlayerFor,
  markDeparted,
  nextItem,
  remainingBidders,
  tallyVotes,
  validateCustomTheme,
} from "../src/data/auctionDraft";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`CHECK FAILED: ${msg}`);
}

type Strategy = "allPass" | "spendAll" | "random" | "cheap";
const STRATEGIES: Strategy[] = ["allPass", "spendAll", "random", "cheap"];

const stats = { games: 0, sold: 0, free: 0, leftover: 0, departures: 0, timeouts: 0, brokeEarly: 0, allPassItems: 0 };

function simulateGame(n: number, seed: number, mode: Strategy | "mixed", allowDepartures: boolean): void {
  const rng = mulberry32(seed);
  const order = Array.from({ length: n }, (_, i) => `p${i}`);
  const k = itemsPerPlayerFor(n);
  const theme = AUCTION_THEMES[Math.floor(rng() * AUCTION_THEMES.length)];
  const pool = drawPool(theme.items, n * k, rng);
  check(pool.length === n * k, "pool size");
  check(new Set(pool.map((p) => p.id)).size === pool.length, "pool has no duplicates");

  const strat: Record<string, Strategy> = {};
  for (const id of order) strat[id] = mode === "mixed" ? STRATEGIES[Math.floor(rng() * STRATEGIES.length)] : mode;

  let now = 1_000_000;
  let s: AuctionState = createAuction(order, pool, now);
  assertInvariants(s);
  let steps = 0;
  let itemHadBid = false;

  while (s.status !== "done") {
    if (++steps > 10_000) throw new Error("simulation did not terminate");
    now += 1 + Math.floor(rng() * 3000);
    const prevMoney: Record<string, number> = {};
    for (const id of order) prevMoney[id] = s.players[id].money;

    // Random departures (never the whole table every game, but sometimes everyone).
    if (allowDepartures && rng() < 0.03) {
      const id = order[Math.floor(rng() * n)];
      const next = markDeparted(s, [id], now);
      if (next) {
        stats.departures++;
        s = next;
        check(markDeparted(s, [id], now) === null, "markDeparted is idempotent");
        assertInvariants(s);
        continue;
      }
    }

    if (s.status === "result") {
      for (const r of s.lastResults) stats[r.kind]++;
      if (s.lastResults.length === 1 && s.lastResults[0].kind === "free" && !itemHadBid) stats.allPassItems++;
      const next = nextItem(s, now);
      check(next !== null, "nextItem from result");
      s = next;
      itemHadBid = false;
      assertInvariants(s);
      continue;
    }

    // Bidding
    check(s.turn !== null, "bidding has a turn");
    const turn = s.turn;
    check(!s.departed.includes(turn), "departed player never holds the turn");
    check(s.players[turn].money > 0, "broke player never holds the turn");
    check(s.players[turn].items.length < s.itemsPerPlayer, "full player never holds the turn");
    check(turn !== s.highBidder, "high bidder never holds the turn");
    check(remainingBidders(s).includes(turn), "turn holder is a remaining bidder");

    // Wrong player can't act
    const other = order.find((id) => id !== turn)!;
    check(applyBid(s, other, bidBounds(s, other).min, now) === null, "out-of-turn bid rejected");
    check(applyPass(s, other, now) === null, "out-of-turn pass rejected");
    // Illegal bids rejected
    const { min, max, canRaise } = bidBounds(s, turn);
    check(applyBid(s, turn, min - 1, now) === null, "bid <= high bid rejected");
    check(applyBid(s, turn, max + 1, now) === null, "bid > money rejected");
    check(applyBid(s, turn, min + 0.5, now) === null, "non-integer bid rejected");

    // Occasional timeout (and a stale one that must be ignored)
    if (rng() < 0.1) {
      check(applyTimeout(s, s.seq - 1, now) === null, "stale timeout ignored");
      const next = applyTimeout(s, s.seq, now);
      check(next !== null, "timeout applies");
      check(applyTimeout(next, s.seq, now) === null, "timeout can't double-fire");
      stats.timeouts++;
      s = next;
      assertInvariants(s);
      continue;
    }

    const st = strat[turn];
    let bid: number | null = null;
    if (canRaise) {
      if (st === "spendAll") bid = max;
      else if (st === "cheap") bid = rng() < 0.6 ? min : null;
      else if (st === "random") bid = rng() < 0.5 ? min + Math.floor(rng() * (max - min + 1)) : null;
      // allPass: never bids
    }
    const next = bid !== null ? applyBid(s, turn, bid, now) : applyPass(s, turn, now);
    check(next !== null, `legal action accepted (${st}, bid=${bid})`);
    if (bid !== null) itemHadBid = true;
    s = next;
    for (const id of order) {
      check(s.players[id].money >= 0, "money never negative");
      check(s.players[id].money <= prevMoney[id], "money never increases");
    }
    if (st === "spendAll" && s.players[turn].money === 0 && s.players[turn].items.length < s.itemsPerPlayer)
      stats.brokeEarly++;
    assertInvariants(s);
  }

  assertFinalAllocation(s);
  for (const id of order) {
    check(s.players[id].items.length === k, `${id} ends with exactly ${k} items`);
    check(s.players[id].money >= 0 && s.players[id].money <= STARTING_MONEY, "money in range");
  }
  const totalItems = order.reduce((sum, id) => sum + s.players[id].items.length, 0);
  check(totalItems === pool.length, "total items == pool size");
  const spent = s.log.reduce((sum, r) => sum + r.price, 0);
  const left = order.reduce((sum, id) => sum + s.players[id].money, 0);
  check(spent + left === n * STARTING_MONEY, "money is conserved");
  stats.games++;
}

// --- Targeted scenarios -----------------------------------------------------

function scenarios(): void {
  const pool2 = drawPool(AUCTION_THEMES[0].items, 10, mulberry32(1));
  // Opener rotates: item k opened by order[k % n]
  let s = createAuction(["a", "b"], pool2, 0);
  check(s.opener === "a" && s.turn === "a", "item 0 opened by a");
  s = applyPass(s, "a", 0)!;
  check(s.turn === "b", "turn passes to b");
  s = applyPass(s, "b", 0)!;
  check(s.status === "result" && s.lastResults[0].kind === "free", "all pass -> free");
  check(s.lastResults[0].playerId === "a", "free tie-break: fewest items then table order");
  s = nextItem(s, 0)!;
  check(s.opener === "b", "item 1 opened by b");
  s = applyBid(s, "b", 3, 0)!;
  check(s.turn === "a" && s.highBid === 3, "a must respond to b's bid");
  s = applyPass(s, "a", 0)!;
  check(s.status === "result" && s.lastResults[0].playerId === "b" && s.players.b.money === 17, "b wins for $3");

  // Only one eligible bidder: first bid wins immediately
  let t = createAuction(["a", "b"], pool2, 0);
  t = applyBid(t, "a", 20, 0)!; // a goes all in
  check(t.players.a.money === 0 || t.status === "bidding", "a all in");
  if (t.status === "bidding") t = applyPass(t, "b", 0)!;
  check(t.players.a.money === 0, "a is broke");
  t = nextItem(t, 0)!;
  check(t.turn === "b" && remainingBidders(t).length === 1, "only b eligible");
  t = applyBid(t, "b", 1, 0)!;
  check(t.status === "result" && t.lastResults[0].playerId === "b" && t.lastResults[0].price === 1, "sole bidder wins on first bid");
  t = nextItem(t, 0)!;
  t = applyPass(t, "b", 0)!;
  check(t.lastResults[0].kind === "free" && t.lastResults[0].playerId === "a", "free item goes to broke player first");

  // Departure of the turn holder auto-advances; everyone leaving deals leftovers
  let u = createAuction(["a", "b", "c"], drawPool(AUCTION_THEMES[1].items, 12, mulberry32(2)), 0);
  u = markDeparted(u, ["a"], 0)!;
  check(u.turn === "b", "departed opener skipped");
  u = markDeparted(u, ["b", "c"], 0)!;
  check(u.status === "result", "everyone left -> item resolved");
  u = nextItem(u, 0)!;
  check(u.status === "result" && u.lastResults.every((r) => r.kind === "leftover"), "leftovers dealt");
  u = nextItem(u, 0)!;
  check(u.status === "done", "done after leftovers");
  assertFinalAllocation(u);

  // Voting
  const v1 = tallyVotes({ a: "b", b: "a" }, ["a", "b"]);
  check(v1.winners.length === 2, "1-1 is a tie with co-winners");
  const v2 = tallyVotes({ a: "a", b: "c", c: "b", d: "c" }, ["a", "b", "c", "d"]);
  check(v2.counts.a === 0 && v2.winners.join() === "c", "self votes ignored, c wins");
  check(tallyVotes({}, ["a", "b"]).winners.length === 0, "no votes -> no winner");

  // Custom validation
  check(!validateCustomTheme("", ["x"], 2).ok, "empty base rejected");
  check(!validateCustomTheme("Box", ["a", "A", " a ", "b"], 2).ok, "duplicates don't count");
  check(validateCustomTheme("Box", "abcdefghij".split(""), 2).ok, "10 items ok for 2 players");
  check(!validateCustomTheme("Box", "abcdefghij".split(""), 3).ok, "10 items not enough for 3 players (12)");
  check(!validateCustomTheme("Box", "abcdefghijklmnop".split(""), 5).ok, "5 players rejected");

  // Every built-in theme has >= 18 unique items
  for (const th of AUCTION_THEMES) {
    check(drawPool(th.items, 18).length === 18, `${th.id} has >= 18 unique items`);
  }
}

scenarios();
let seed = 1;
for (const n of [2, 3, 4]) {
  for (const mode of ["allPass", "spendAll", "random", "cheap", "mixed"] as const) {
    for (let i = 0; i < 400; i++) simulateGame(n, seed++, mode, false);
    for (let i = 0; i < 400; i++) simulateGame(n, seed++, mode, true);
  }
}
console.log("auctionDraftSim OK", JSON.stringify(stats));
