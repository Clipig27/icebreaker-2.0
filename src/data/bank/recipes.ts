// ---------------------------------------------------------------------------
// Bid Wars RECIPE ENGINE: themes as slot recipes over the shared item bank.
//
// A slot spec is a compact string:   any,of,tags+must+have-must-not:min-max
//   "patty:2-4"                          -> 2..4 items tagged `patty`
//   "burger_topping,sauce,cheese+spicy:3-5" -> 3..5 items with one of those
//                                            tags AND the `spicy` tag
//   "gameday_moment-basketball-baseball-football:2-4"
//                                         -> generic moments only
// The engine fills exactly `count` distinct items, respecting every slot's
// min/max, preferring items not in the device's recent list (pickFresh), and
// is fully deterministic for a given rng. Pure: no React / RN imports.
// ---------------------------------------------------------------------------

import { pickFresh, shuffleWith } from "../../utils/deck";
import { BankItem, getBank } from "./items";

export type Slot = { spec: string; any: string[]; all: string[]; none: string[]; min: number; max: number };
export type Base = readonly [name: string, emoji: string];

export type Recipe = {
  /** "burger" for a base theme, "burger:breakfast" for a variant. */
  key: string;
  themeId: string;
  name: string;
  emoji: string;
  bases: readonly Base[];
  itemNoun: string;
  finishedNoun: string;
  slots: Slot[];
};

export type ThemeRecipe = Recipe & { id: string; variants: Recipe[] };

type VariantDef = { id: string; name: string; emoji?: string; bases?: Base[]; slots: string };
type ThemeDef = {
  id: string;
  name: string;
  emoji: string;
  bases: Base[];
  itemNoun: string;
  finishedNoun: string;
  slots: string;
  variants: VariantDef[];
};

export function parseSlot(spec: string): Slot {
  const m = /^([^:]+):(\d+)-(\d+)$/.exec(spec.trim());
  if (!m) throw new Error(`bad slot spec: ${spec}`);
  const parts = m[1].split(/(?=[+-])/);
  const any = parts[0].split(",").filter(Boolean);
  const all: string[] = [];
  const none: string[] = [];
  for (const p of parts.slice(1)) (p[0] === "+" ? all : none).push(p.slice(1));
  return { spec, any, all, none, min: +m[2], max: +m[3] };
}

export function slotAccepts(slot: Slot, item: BankItem): boolean {
  const t = item.tags;
  return slot.any.some((x) => t.includes(x)) && slot.all.every((x) => t.includes(x)) && !slot.none.some((x) => t.includes(x));
}

// ---------------------------------------------------------------------------
// Theme table (ids of the first 7 must stay stable: testIDs ad-theme-<id>)
// ---------------------------------------------------------------------------

const SPORTS = "-basketball-baseball-football";

const DEFS: ThemeDef[] = [
  {
    id: "burger",
    name: "Burger",
    emoji: "🍔",
    bases: [["Brioche bun", "🍔"], ["Sesame seed bun", "🍔"], ["Pretzel bun", "🥨"], ["Potato bun", "🍔"]],
    itemNoun: "topping",
    finishedNoun: "burger",
    slots: "patty:2-4 cheese:1-3 burger_topping:4-6 sauce:1-2",
    variants: [
      { id: "breakfast", name: "Breakfast Burger", emoji: "🍳", bases: [["English muffin", "🍞"], ["Brioche bun", "🍔"]], slots: "patty:1-3 cheese:1-2 burger_topping+breakfast:3-4 burger_topping:1-3 sauce:1-2" },
      { id: "spicy", name: "Spicy Burger", emoji: "🌶️", slots: "patty:2-3 cheese:1-2 burger_topping,sauce,cheese+spicy:3-5 burger_topping:1-3 sauce:0-1" },
    ],
  },
  {
    id: "hotdog",
    name: "Hot Dog",
    emoji: "🌭",
    bases: [["Hot dog bun", "🌭"], ["Poppy seed bun", "🌭"], ["Pretzel roll", "🥨"], ["Toasted split-top bun", "🌭"]],
    itemNoun: "topping",
    finishedNoun: "hot dog",
    slots: "hotdog_style:1-2 hotdog_topping:5-8 condiment:2-3",
    variants: [
      { id: "spicy", name: "Spicy Dog", emoji: "🔥", slots: "hotdog_style:1-2 hotdog_topping,condiment+spicy:3-5 hotdog_topping:2-4 condiment:1-2" },
    ],
  },
  {
    id: "smoothie",
    name: "Smoothie",
    emoji: "🥤",
    bases: [["Blender", "🥤"], ["Smoothie cup", "🥤"], ["Mason jar", "🫙"]],
    itemNoun: "ingredient",
    finishedNoun: "smoothie",
    slots: "smoothie_fruit:3-6 smoothie_base:1-2 smoothie_boost:2-5",
    variants: [
      { id: "tropical", name: "Tropical Smoothie", emoji: "🍍", bases: [["Coconut shell", "🥥"], ["Blender", "🥤"]], slots: "smoothie_fruit,smoothie_base,smoothie_boost+tropical:4-5 smoothie_fruit:1-3 smoothie_base:1-2 smoothie_boost:2-4" },
      { id: "green", name: "Green Smoothie", emoji: "🥬", slots: "smoothie_fruit,smoothie_base,smoothie_boost+green:4-5 smoothie_fruit:1-3 smoothie_base:1-2 smoothie_boost:1-3" },
    ],
  },
  {
    id: "cursed",
    name: "Cursed Combo",
    emoji: "🤢",
    bases: [["Mystery bowl", "🥣"], ["Lunch tray", "🍱"], ["Paper plate", "🍽️"], ["Mixing bowl", "🥣"]],
    itemNoun: "ingredient",
    finishedNoun: "cursed dish",
    slots: "cursed_combo:4-7 gross_food:3-6",
    variants: [
      { id: "breakfast", name: "Cursed Breakfast", emoji: "🥞", bases: [["Cereal bowl", "🥣"]], slots: "cursed_combo+breakfast:4-6 gross_food:3-6" },
      { id: "dessert", name: "Cursed Dessert", emoji: "🍨", bases: [["Ice cream cone", "🍦"], ["Sundae dish", "🍨"]], slots: "cursed_combo+dessert:5-7 gross_food:3-6" },
    ],
  },
  {
    id: "house",
    name: "Dream House",
    emoji: "🏡",
    bases: [["Empty lot", "🏗️"], ["Hilltop lot", "⛰️"], ["Lakeside lot", "🏞️"]],
    itemNoun: "feature",
    finishedNoun: "house",
    slots: "room:3-5 home_feature:3-5 home_amenity:2-4",
    variants: [
      { id: "cabin", name: "Cabin House", emoji: "🌲", bases: [["Forest clearing", "🌲"], ["Snowy hillside", "🏔️"]], slots: "room,home_feature,home_amenity+cabin:4-6 room-beach:1-3 home_feature-beach:1-3 home_amenity-beach:1-2" },
      { id: "beach", name: "Beach House", emoji: "🏖️", bases: [["Beachfront lot", "🏖️"], ["Oceanfront cliff", "🌊"]], slots: "room,home_feature,home_amenity+beach:4-6 room-cabin:1-3 home_feature-cabin:1-3 home_amenity-cabin:1-2" },
    ],
  },
  {
    id: "bedroom",
    name: "Dream Bedroom",
    emoji: "🛏️",
    bases: [["Empty room", "🚪"], ["Attic room", "🏠"], ["Basement room", "🧱"], ["Loft", "🪜"]],
    itemNoun: "upgrade",
    finishedNoun: "bedroom",
    slots: "bedroom_item:4-7 bedroom_decor:3-6",
    variants: [
      { id: "gamer", name: "Gamer Bedroom", emoji: "🎮", slots: "bedroom_item,bedroom_decor+gamer:5-7 bedroom_item:1-3 bedroom_decor:1-3" },
      { id: "cozy", name: "Cozy Bedroom", emoji: "🧸", slots: "bedroom_item,bedroom_decor+cozy:5-7 bedroom_item:1-3 bedroom_decor:1-3" },
    ],
  },
  {
    id: "vacation",
    name: "Dream Vacation",
    emoji: "🏝️",
    bases: [["Passport", "🛂"], ["Suitcase", "🧳"], ["Boarding pass", "🎫"], ["Backpack", "🎒"]],
    itemNoun: "perk",
    finishedNoun: "vacation",
    slots: "destination:2-4 lodging:1-3 activity:3-5 travel_perk:2-4",
    variants: [
      { id: "beach", name: "Beach Vacation", emoji: "🏖️", bases: [["Beach bag", "👜"], ["Passport", "🛂"]], slots: "destination+beach:2-3 lodging+beach:1-2 activity+beach:3-5 travel_perk-snow:2-3" },
      { id: "snow", name: "Winter Getaway", emoji: "⛷️", bases: [["Ski pass", "🎿"], ["Passport", "🛂"]], slots: "destination+snow:2-3 lodging+snow:1-2 activity+snow:3-5 travel_perk-beach:2-3" },
      { id: "city", name: "City Break", emoji: "🏙️", bases: [["Metro card", "🚇"], ["Passport", "🛂"]], slots: "destination+city:2-3 lodging+city:1-2 activity+city:3-5 travel_perk-snow-beach:2-3" },
    ],
  },
  {
    id: "pizza",
    name: "Pizza",
    emoji: "🍕",
    bases: [["Thin-crust dough", "🍕"], ["Deep-dish crust", "🍕"], ["Neapolitan dough", "🍕"], ["Sicilian square crust", "🍕"], ["Hand-tossed dough", "🍕"]],
    itemNoun: "topping",
    finishedNoun: "pizza",
    slots: "pizza_crust:0-1 pizza_sauce:1-2 pizza_cheese:1-3 pizza_topping:5-8",
    variants: [
      { id: "meat", name: "Meat Lover's Pizza", emoji: "🥩", slots: "pizza_crust:0-1 pizza_sauce:1-1 pizza_cheese:1-2 pizza_topping+meat:5-7 pizza_topping:1-2" },
      { id: "veggie", name: "Veggie Garden Pizza", emoji: "🥦", slots: "pizza_crust:0-1 pizza_sauce:1-2 pizza_cheese:1-3 pizza_topping+veggie:5-7" },
    ],
  },
  {
    id: "sports",
    name: "Game Day",
    emoji: "🏟️",
    bases: [["Game day pass", "🎟️"], ["Stadium seat", "🏟️"], ["Tailgate spot", "🚙"]],
    itemNoun: "perk",
    finishedNoun: "game day",
    slots: `gameday_snack:3-4 gameday_moment${SPORTS}:2-4 sports_gear${SPORTS}:2-3 gameday_seat${SPORTS}:1-2`,
    variants: [
      { id: "basketball", name: "Basketball Night", emoji: "🏀", bases: [["Arena ticket", "🏟️"]], slots: `gameday_snack:3-4 gameday_moment,sports_gear,gameday_seat+basketball:3-5 gameday_moment${SPORTS}:2-3 sports_gear${SPORTS}:1-2` },
      { id: "baseball", name: "Baseball Day", emoji: "⚾", bases: [["Ballpark ticket", "🎟️"]], slots: `gameday_snack:3-4 gameday_moment,sports_gear,gameday_seat+baseball:3-5 gameday_moment${SPORTS}:2-3 sports_gear${SPORTS}:1-2` },
      { id: "football", name: "Football Sunday", emoji: "🏈", bases: [["Tailgate spot", "🚙"], ["Stadium ticket", "🎟️"]], slots: `gameday_snack:3-4 gameday_moment,sports_gear,gameday_seat+football:3-5 gameday_moment${SPORTS}:2-3 sports_gear${SPORTS}:1-2` },
    ],
  },
  {
    id: "roadtrip",
    name: "Road Trip",
    emoji: "🚗",
    bases: [["Car keys", "🔑"], ["Full tank of gas", "⛽"], ["Open highway", "🛣️"]],
    itemNoun: "pick",
    finishedNoun: "road trip",
    slots: "roadtrip_ride:0-1 roadtrip_stop:4-6 roadtrip_gear:2-4 roadtrip_snack:2-3",
    variants: [
      { id: "coastal", name: "Coastal Road Trip", emoji: "🌊", slots: "roadtrip_ride:0-1 roadtrip_stop+coastal:3-4 roadtrip_stop-coastal-nature:1-2 roadtrip_gear:2-4 roadtrip_snack:2-3" },
      { id: "parks", name: "National Parks Trip", emoji: "🏞️", bases: [["Park pass", "🎟️"], ["Car keys", "🔑"]], slots: "roadtrip_ride:0-1 roadtrip_stop+nature:4-5 roadtrip_stop-coastal:0-1 roadtrip_gear+nature:1-2 roadtrip_gear:1-2 roadtrip_snack:2-3" },
    ],
  },
  {
    id: "festival",
    name: "Festival",
    emoji: "🎪",
    bases: [["Festival wristband", "🎟️"], ["Campsite plot", "⛺"], ["General admission ticket", "🎫"]],
    itemNoun: "pick",
    finishedNoun: "festival",
    slots: "festival_act:3-4 festival_gear:2-4 festival_food:2-3 festival_perk:1-2",
    variants: [
      { id: "food", name: "Food Fest", emoji: "🌮", bases: [["Tasting pass", "🍴"]], slots: "festival_food:5-6 festival_act:2-3 festival_gear:1-2 festival_perk:1-2" },
    ],
  },
  {
    id: "apocalypse",
    name: "Apocalypse Kit",
    emoji: "☢️",
    bases: [["Empty backpack", "🎒"], ["Bug-out bag", "🎒"], ["Rusty shopping cart", "🛒"]],
    itemNoun: "supply",
    finishedNoun: "survival kit",
    slots: "apocalypse_supply-zombie-alien:4-6 apocalypse_skill-zombie-alien:2-3 apocalypse_ally-zombie-alien:1-2 apocalypse_base-zombie-alien:1-2",
    variants: [
      { id: "zombie", name: "Zombie Apocalypse", emoji: "🧟", slots: "apocalypse_supply,apocalypse_skill,apocalypse_ally,apocalypse_base+zombie:2-3 apocalypse_supply-zombie-alien:3-5 apocalypse_skill-zombie-alien:1-2 apocalypse_ally-zombie-alien:1-2 apocalypse_base-zombie-alien:0-1" },
      { id: "alien", name: "Alien Invasion", emoji: "👽", slots: "apocalypse_supply,apocalypse_skill,apocalypse_ally,apocalypse_base+alien:2-3 apocalypse_supply-zombie-alien:3-5 apocalypse_skill-zombie-alien:1-2 apocalypse_ally-zombie-alien:1-2 apocalypse_base-zombie-alien:0-1" },
    ],
  },
];

function build(def: ThemeDef): ThemeRecipe {
  const common = { themeId: def.id, itemNoun: def.itemNoun, finishedNoun: def.finishedNoun };
  const parse = (s: string) => s.split(/\s+/).filter(Boolean).map(parseSlot);
  return {
    ...common,
    id: def.id,
    key: def.id,
    name: def.name,
    emoji: def.emoji,
    bases: def.bases,
    slots: parse(def.slots),
    variants: def.variants.map((v) => ({
      ...common,
      key: `${def.id}:${v.id}`,
      name: v.name,
      emoji: v.emoji ?? def.emoji,
      bases: v.bases ?? def.bases,
      slots: parse(v.slots),
    })),
  };
}

export const THEME_RECIPES: readonly ThemeRecipe[] = DEFS.map(build);

export function getThemeRecipe(themeId: string): ThemeRecipe | undefined {
  return THEME_RECIPES.find((t) => t.id === themeId);
}

/** Base recipe + every variant. */
export function allRecipes(theme: ThemeRecipe): Recipe[] {
  return [theme, ...theme.variants];
}

// ---------------------------------------------------------------------------
// Eligibility (cached per slot spec)
// ---------------------------------------------------------------------------

const slotCache = new Map<string, BankItem[]>();

export function slotItems(slot: Slot): BankItem[] {
  let hit = slotCache.get(slot.spec);
  if (!hit) {
    hit = getBank().filter((it) => slotAccepts(slot, it));
    slotCache.set(slot.spec, hit);
  }
  return hit;
}

function unionById(lists: BankItem[][]): BankItem[] {
  const seen = new Set<string>();
  const out: BankItem[] = [];
  for (const l of lists) for (const it of l) if (!seen.has(it.id)) (seen.add(it.id), out.push(it));
  return out;
}

export function recipeEligible(r: Recipe): BankItem[] {
  return unionById(r.slots.map(slotItems));
}

const themeCache = new Map<string, BankItem[]>();
/** Every item any recipe of this theme (base or variant) can use. */
export function themeEligible(theme: ThemeRecipe): BankItem[] {
  let hit = themeCache.get(theme.id);
  if (!hit) {
    hit = unionById(allRecipes(theme).map(recipeEligible));
    themeCache.set(theme.id, hit);
  }
  return hit;
}

/**
 * How many recent ids to remember per theme. Keeping it to ~60% of the
 * theme's items means fresh picks are always available AND still random.
 */
export function recentCapFor(theme: ThemeRecipe): number {
  return Math.max(24, Math.floor(themeEligible(theme).length * 0.6));
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** Base recipe weighted 2, each variant weighted 1. */
export function chooseRecipe(theme: ThemeRecipe, rng: () => number): Recipe {
  const opts = allRecipes(theme);
  const r = Math.floor(rng() * (opts.length + 1));
  return r <= 1 ? theme : opts[r - 1];
}

export type Pick = { item: BankItem; slot: number };
export type DrawResult = { recipe: Recipe; base: Base; picks: Pick[] };

/**
 * Draw exactly `count` distinct items for a recipe. Slot sizes start at their
 * minimum and the remainder is spread at random (capped by max and supply).
 * Smallest slots are filled first so shared items can't starve them. Throws
 * if the recipe can't produce `count` items (the verifier proves it can).
 */
export function drawRecipePool(recipe: Recipe, count: number, rng: () => number, recent: readonly string[] = []): DrawResult {
  const pools = recipe.slots.map(slotItems);
  const counts = recipe.slots.map((s) => s.min);
  let rem = count - counts.reduce((a, b) => a + b, 0);
  if (rem < 0) throw new Error(`${recipe.key}: slot minimums exceed ${count}`);
  while (rem > 0) {
    const open = recipe.slots.map((s, i) => i).filter((i) => counts[i] < Math.min(recipe.slots[i].max, pools[i].length));
    if (open.length === 0) throw new Error(`${recipe.key}: slots can't hold ${count} items`);
    counts[open[Math.floor(rng() * open.length)]]++;
    rem--;
  }
  const order = recipe.slots.map((_, i) => i).sort((a, b) => pools[a].length - pools[b].length || a - b);
  const used = new Set<string>();
  const picks: Pick[] = [];
  for (const i of order) {
    if (counts[i] === 0) continue;
    const avail = pools[i].filter((it) => !used.has(it.id));
    if (avail.length < counts[i]) throw new Error(`${recipe.key}: slot ${recipe.slots[i].spec} ran out`);
    for (const item of pickFresh(avail, counts[i], (it) => it.id, recent, rng)) {
      used.add(item.id);
      picks.push({ item, slot: i });
    }
  }
  const base = recipe.bases[Math.floor(rng() * recipe.bases.length)];
  return { recipe, base, picks: shuffleWith(picks, rng) };
}
