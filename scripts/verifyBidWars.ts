// Verifies the Bid Wars item bank + recipe engine.
// Run: npx --yes tsx scripts/verifyBidWars.ts
//
// - Bank: unique names/ids, every item has an emoji and >= 1 known tag, every
//   tag is used by some theme slot (or reserved), every slot tag exists.
// - Engine: >= 1000 seeded games per recipe (base + each variant) across
//   2/3/4 players: exact count, no duplicates, every item accepted by the slot
//   it filled, slot min/max respected, deterministic for a seed.
// - Freshness: consecutive games on a theme fed the device recent list
//   (same cap as the app) -> % overlap must stay < 15%.
// Exits non-zero on any failure.

import { hashString, pushRecent, seededRng } from "../src/utils/deck";
import { getBank, RESERVED_TAGS, slugify } from "../src/data/bank/items";
import {
  THEME_RECIPES,
  allRecipes,
  drawRecipePool,
  recentCapFor,
  recipeEligible,
  slotAccepts,
  slotItems,
  themeEligible,
} from "../src/data/bank/recipes";
import { AUCTION_THEMES, drawThemePool, itemsPerPlayerFor } from "../src/data/auctionDraft";

const failures: string[] = [];
function check(cond: unknown, msg: string): void {
  if (!cond && failures.length < 50) failures.push(msg);
  else if (!cond) failures.length++;
}

// ---------------------------------------------------------------- bank checks
const bank = getBank();
const names = new Set<string>();
const ids = new Set<string>();
const slotTags = new Set<string>();
const modTags = new Set<string>();
for (const th of THEME_RECIPES)
  for (const r of allRecipes(th))
    for (const s of r.slots) {
      s.any.forEach((t) => slotTags.add(t));
      [...s.all, ...s.none].forEach((t) => modTags.add(t));
    }
const known = new Set<string>([...slotTags, ...modTags, ...RESERVED_TAGS]);
const tagUse = new Map<string, number>();
for (const it of bank) {
  const key = it.name.toLowerCase();
  check(!names.has(key), `duplicate name: ${it.name}`);
  check(!ids.has(it.id), `duplicate id: ${it.id}`);
  names.add(key);
  ids.add(it.id);
  check(it.id === slugify(it.name) && it.id.length > 0, `bad id for ${it.name}`);
  check(it.emoji.length > 0 && !/[A-Za-z0-9]/.test(it.emoji), `missing/bad emoji: ${it.name}`);
  check(it.tags.length > 0, `no tags: ${it.name}`);
  check(it.tags.some((t) => slotTags.has(t)), `no slot tag: ${it.name}`);
  for (const t of it.tags) {
    check(known.has(t), `unknown tag "${t}" on ${it.name}`);
    tagUse.set(t, (tagUse.get(t) ?? 0) + 1);
  }
}
for (const t of known) check(RESERVED_TAGS.includes(t) || (tagUse.get(t) ?? 0) > 0, `tag "${t}" used by a theme but no item has it`);

// ------------------------------------------------------------- engine checks
const PLAYERS = [2, 3, 4];
const GAMES_PER_RECIPE = 1200; // 400 per player count
type Row = { theme: string; recipes: number; eligible: number; minSlot: number; pools: number; overlap: number; maxOverlap: number };
const rows: Row[] = [];
let totalPools = 0;

for (const th of THEME_RECIPES) {
  let pools = 0;
  let minSlot = Infinity;
  for (const r of allRecipes(th)) {
    check(recipeEligible(r).length >= 36, `${r.key}: only ${recipeEligible(r).length} eligible items (< 36)`);
    for (const s of r.slots) {
      minSlot = Math.min(minSlot, slotItems(s).length);
      check(slotItems(s).length >= Math.max(s.max, 1), `${r.key}: slot ${s.spec} has ${slotItems(s).length} items < max ${s.max}`);
    }
    const sumMin = r.slots.reduce((a, s) => a + s.min, 0);
    const sumMax = r.slots.reduce((a, s) => a + s.max, 0);
    check(sumMin <= 10 && sumMax >= 12, `${r.key}: slot totals ${sumMin}-${sumMax} can't make 10..12`);

    for (let g = 0; g < GAMES_PER_RECIPE; g++) {
      const n = PLAYERS[g % PLAYERS.length];
      const count = n * itemsPerPlayerFor(n);
      const seed = hashString(`${r.key}#${g}`);
      let res;
      try {
        res = drawRecipePool(r, count, seededRng(seed));
      } catch (e) {
        check(false, `${r.key} seed ${seed}: ${(e as Error).message}`);
        continue;
      }
      pools++;
      check(res.picks.length === count, `${r.key}: ${res.picks.length} items, expected ${count}`);
      check(new Set(res.picks.map((p) => p.item.id)).size === res.picks.length, `${r.key}: duplicate item`);
      check(new Set(res.picks.map((p) => p.item.name.toLowerCase())).size === res.picks.length, `${r.key}: duplicate name`);
      const per = r.slots.map(() => 0);
      for (const p of res.picks) {
        per[p.slot]++;
        check(slotAccepts(r.slots[p.slot], p.item), `${r.key}: ${p.item.name} not allowed in slot ${r.slots[p.slot].spec}`);
      }
      r.slots.forEach((s, i) => check(per[i] >= s.min && per[i] <= s.max, `${r.key}: slot ${s.spec} got ${per[i]}`));
      check(r.bases.some((b) => b === res.base), `${r.key}: base not from recipe`);
      if (g < 20) {
        const again = drawRecipePool(r, count, seededRng(seed));
        check(again.picks.map((p) => p.item.id).join() === res.picks.map((p) => p.item.id).join(), `${r.key}: not deterministic`);
      }
    }
  }

  // Freshness: consecutive games through the app path (variant choice + recent list).
  const cap = recentCapFor(th);
  let overlapSum = 0;
  let maxOverlap = 0;
  let games = 0;
  for (const n of PLAYERS) {
    let recent: string[] = [];
    let prev: Set<string> | null = null;
    const rng = seededRng(hashString(`fresh:${th.id}:${n}`));
    for (let g = 0; g < 400; g++) {
      const drawn = drawThemePool(th.id, n, recent, rng);
      const idsNow = drawn.pool.map((p) => p.id);
      check(drawn.pool.length === n * itemsPerPlayerFor(n), `${th.id}: app pool size`);
      check(drawn.info.id === th.id, `${th.id}: info id changed`);
      if (prev) {
        const o = idsNow.filter((id) => prev!.has(id)).length / idsNow.length;
        overlapSum += o;
        maxOverlap = Math.max(maxOverlap, o);
        games++;
      }
      prev = new Set(idsNow);
      recent = pushRecent(recent, idsNow, cap);
    }
  }
  const avg = overlapSum / games;
  check(avg < 0.15, `${th.id}: avg consecutive overlap ${(avg * 100).toFixed(1)}% >= 15%`);
  totalPools += pools;
  rows.push({ theme: th.id, recipes: allRecipes(th).length, eligible: themeEligible(th).length, minSlot, pools, overlap: avg, maxOverlap });
}

// The app's theme list must still contain the legacy ids (testIDs ad-theme-<id>).
for (const id of ["burger", "hotdog", "smoothie", "cursed", "house", "bedroom", "vacation", "pizza", "sports", "roadtrip", "festival", "apocalypse"])
  check(AUCTION_THEMES.some((t) => t.id === id), `missing theme id ${id}`);

// ----------------------------------------------------------------- report
// Node built-ins via untyped require (the app tsconfig has no @types/node).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs: { statSync(p: string): { size: number } } = require("fs");
// Run from the repo root (as documented above).
const bankFile = "src/data/bank/items.ts";
const recipeFile = "src/data/bank/recipes.ts";
const pad = (s: string | number, w: number) => String(s).padEnd(w);
console.log(`Bank: ${bank.length} items, ${tagUse.size} tags, items.ts ${fs.statSync(bankFile).size} bytes, recipes.ts ${fs.statSync(recipeFile).size} bytes`);
console.log(`${pad("theme", 12)}${pad("recipes", 9)}${pad("eligible", 10)}${pad("minSlot", 9)}${pad("pools", 8)}${pad("avgOverlap", 12)}maxOverlap`);
for (const r of rows)
  console.log(
    `${pad(r.theme, 12)}${pad(r.recipes, 9)}${pad(r.eligible, 10)}${pad(r.minSlot, 9)}${pad(r.pools, 8)}${pad((r.overlap * 100).toFixed(1) + "%", 12)}${(r.maxOverlap * 100).toFixed(0)}%`
  );
console.log(`Total pools generated: ${totalPools}`);

if (failures.length) {
  console.error(`\nverifyBidWars FAILED (${failures.length} problems):`);
  for (const f of failures.slice(0, 50)) console.error(" - " + f);
  process.exit(1);
}
console.log("verifyBidWars OK");
