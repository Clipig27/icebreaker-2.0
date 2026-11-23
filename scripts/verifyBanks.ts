/**
 * Content-bank verification for every non-auction game.
 * Run: npx --yes tsx scripts/verifyBanks.ts   (plain Node, no RN)
 *
 * Checks per game: ≥500 unique items, no duplicates (normalized text),
 * grammar sanity (no unfilled {slots}, no double spaces, trimmed, capitalized,
 * proper ending punctuation, a/an agreement), 1-to-100 answers are integers in
 * range, Smarty Pot answers are valid, then simulates 20 consecutive games on
 * one host device (recent list carried over) and reports the repeat rate.
 * Exits non-zero on any failure.
 */
import { pickFresh, pushRecent, seededRng, hashString } from "../src/utils/deck";
import { BANKS, BANK_KEYS } from "../src/data/blindRankingBanks";
import {
  CURATED_TALENT_SHOW_PROMPTS,
  TALENT_SHOW_PROMPTS,
  TALENT_SHOW_TIEBREAK_PROMPTS,
  TALENT_SHOW_FINAL_PROMPTS,
} from "../src/data/talentShow";
import { NUMBER_GUESSOR_PROMPTS, getAllNumberPrompts } from "../src/data/numberGuessor";
import { PIE_CHARTS_PROMPTS, getAllPieChartPrompts } from "../src/data/pieCharts";
import { TASKS, getAllTasks } from "../src/data/tenSecondTasks";
import { DEFAULT_QUESTIONS, getAllPotLuckQuestions } from "../src/data/potLuck";

// Node built-ins without needing @types/node in the app's tsconfig.
const nodeProcess = process as any;
const builtin = (id: string): any => (nodeProcess.getBuiltinModule ? nodeProcess.getBuiltinModule(id) : eval("require")(id));
const fs = builtin("fs");
const path = builtin("path");
const ROOT: string = path.resolve(path.dirname(nodeProcess.argv[1]), "..");
let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log("  ✗ " + msg);
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Words starting with a vowel letter but a consonant sound (take "a"), and vice versa.
const A_OK = /^(u(se|sed|ni|s\b|sa|su|t)|one|euro|eu)/i;
const AN_OK = /^(h(our|onest|eir)|[A-Z]{2,}\b)/;

function grammar(texts: readonly string[], ending: RegExp | null, label: string) {
  let bad = 0;
  for (const t of texts) {
    const problems: string[] = [];
    if (/[{}]/.test(t)) problems.push("unfilled slot");
    if (/ {2,}/.test(t)) problems.push("double space");
    if (t !== t.trim()) problems.push("untrimmed");
    if (!/^[A-Z0-9"']/.test(t)) problems.push("not capitalized");
    if (ending && !ending.test(t)) problems.push("bad ending");
    if (/[ ,;:]$/.test(t)) problems.push("dangling punctuation");
    // Articles: lowercase "a"/"an" anywhere, or capitalized at the very start
    // (a mid-sentence capital "A" is a letter name, e.g. "the letter A in…").
    for (const m of t.matchAll(/(^|[^A-Za-z])([Aa]n?) ([A-Za-z]+)/g)) {
      const [, pre, art, w] = m;
      if (art[0] === "A" && m.index !== 0 && pre !== "") continue;
      const vowel = /^[aeiou]/i.test(w);
      if (art.toLowerCase() === "a" && vowel && !A_OK.test(w)) problems.push(`"a ${w}"`);
      if (art.toLowerCase() === "an" && !vowel && !AN_OK.test(w)) problems.push(`"an ${w}"`);
    }
    if (problems.length) {
      bad++;
      if (bad <= 10) fail(`${label}: ${problems.join(", ")} → ${JSON.stringify(t)}`);
    }
  }
  if (bad > 10) fail(`${label}: …and ${bad - 10} more grammar problems`);
  return bad;
}

function dupes(texts: readonly string[], label: string) {
  const seen = new Map<string, string>();
  let n = 0;
  for (const t of texts) {
    const k = norm(t);
    if (seen.has(k)) {
      n++;
      if (n <= 5) fail(`${label}: duplicate ${JSON.stringify(t)}`);
    } else seen.set(k, t);
  }
  return n;
}

/** Simulate `games` consecutive games on one device; returns repeat rate. */
function simulate<T>(items: readonly T[], perGame: number, idOf: (t: T) => string, games = 20, cap = 400, seed = 1) {
  const rng = seededRng(seed);
  let recent: string[] = [];
  const everSeen = new Set<string>();
  let draws = 0;
  let repeats = 0;
  for (let g = 0; g < games; g++) {
    const picked = pickFresh(items, perGame, idOf, recent, rng);
    const ids = picked.map(idOf);
    for (const id of ids) {
      draws++;
      if (everSeen.has(id)) repeats++;
      everSeen.add(id);
    }
    recent = pushRecent(recent, ids, cap);
  }
  return repeats / Math.max(1, draws);
}

type Row = { game: string; before: number; after: number; repeat: number };
const rows: Row[] = [];

function report(game: string, before: number, texts: readonly string[], ending: RegExp | null, repeat: number) {
  console.log(`\n■ ${game}`);
  const after = new Set(texts.map(norm)).size;
  if (after < 500) fail(`${game}: only ${after} unique (need ≥500)`);
  dupes(texts, game);
  const bad = grammar(texts, ending, game);
  if (repeat >= 0.05) fail(`${game}: repeat rate ${(repeat * 100).toFixed(1)}% over 20 games (target <5%)`);
  console.log(`  unique ${before} → ${after}; grammar issues ${bad}; 20-game repeat rate ${(repeat * 100).toFixed(2)}%`);
  rows.push({ game, before, after, repeat });
}

const Q = /\?$/;
const STMT = /[A-Za-z0-9)"'!?.]$/;

// ── Blind Ranking ───────────────────────────────────────────────────────────
{
  const ORIGINAL_KEYS = ["artists", "sports", "fastfood", "movies", "travel", "snacks", "superpowers", "pizzas", "candy", "hobbies"];
  const before = ORIGINAL_KEYS.reduce((s, k) => s + (BANKS[k]?.items.length ?? 0), 0);
  const all: string[] = [];
  console.log(`\n■ Blind Ranking — ${BANK_KEYS.length} categories (was ${ORIGINAL_KEYS.length})`);
  if (BANK_KEYS.length < 40) fail(`Blind Ranking: ${BANK_KEYS.length} categories (<40)`);
  for (const k of ORIGINAL_KEYS) if (!BANKS[k]) fail(`Blind Ranking: original category "${k}" missing`);
  for (const k of BANK_KEYS) {
    const b = BANKS[k];
    if (b.items.length < 30) fail(`Blind Ranking ${k}: ${b.items.length} items (<30)`);
    dupes(b.items, `Blind Ranking ${k}`);
    for (const it of b.items) if (!it.trim() || it !== it.trim() || /[{}|]/.test(it)) fail(`Blind Ranking ${k}: bad item ${JSON.stringify(it)}`);
    all.push(...b.items.map((i) => `${k}: ${i}`));
  }
  // 20 games, category picked at random each game, 10 items, per-category recent lists.
  const rng = seededRng(7);
  const recent: Record<string, string[]> = {};
  const seen = new Set<string>();
  let draws = 0, repeats = 0;
  for (let g = 0; g < 20; g++) {
    const k = BANK_KEYS[Math.floor(rng() * BANK_KEYS.length)];
    const picked = pickFresh(BANKS[k].items, 10, (s) => s, recent[k] ?? [], rng);
    for (const it of picked) {
      draws++;
      if (seen.has(k + it)) repeats++;
      seen.add(k + it);
    }
    recent[k] = pushRecent(recent[k] ?? [], picked, 200);
  }
  // Same category 3 games running must still be fully fresh (≥30 items, 10 per game).
  const k0 = BANK_KEYS[0];
  let r: string[] = [];
  const s0 = new Set<string>();
  for (let g = 0; g < 3; g++) {
    const p = pickFresh(BANKS[k0].items, 10, (s) => s, r, rng);
    for (const it of p) { if (s0.has(it)) fail(`Blind Ranking: repeat within 3 games of "${k0}"`); s0.add(it); }
    r = pushRecent(r, p, 200);
  }
  const after = all.length;
  const minItems = Math.min(...BANK_KEYS.map((k) => BANKS[k].items.length));
  console.log(`  items ${before} → ${after} (min ${minItems}/category); 20-game repeat rate ${((repeats / draws) * 100).toFixed(2)}%`);
  if (repeats / draws >= 0.05) fail("Blind Ranking: repeat rate ≥5%");
  rows.push({ game: "Blind Ranking (items)", before, after, repeat: repeats / draws });
}

// ── Nobody's Got Talent ─────────────────────────────────────────────────────
{
  const id = (s: string) => hashString(s).toString(36);
  report("Nobody's Got Talent (R1/R2)", CURATED_TALENT_SHOW_PROMPTS.length, TALENT_SHOW_PROMPTS, STMT, simulate(TALENT_SHOW_PROMPTS, 10, id));
  console.log(`  tiebreak ${TALENT_SHOW_TIEBREAK_PROMPTS.length}, final ${TALENT_SHOW_FINAL_PROMPTS.length} (kept separate, unchanged)`);
  const ids = new Set(TALENT_SHOW_PROMPTS.map(id));
  if (ids.size !== TALENT_SHOW_PROMPTS.length) fail("Talent: prompt-id hash collision");
}

// ── 1 to 100 ────────────────────────────────────────────────────────────────
{
  const all = getAllNumberPrompts();
  // Originally 305 curated rows; 6 were removed (5 self-flagged wrong answers
  // that shadowed corrected rows with the same id, 1 with answer 0).
  const ORIGINAL = 305;
  console.log(`\n  curated kept: ${NUMBER_GUESSOR_PROMPTS.length} of ${ORIGINAL}`);
  report("1 to 100", ORIGINAL, all.map((p) => p.text), Q, simulate(all, 10, (p) => p.id));
  let bad = 0;
  for (const p of all) {
    if (!Number.isInteger(p.correctAnswer) || p.correctAnswer < 1 || p.correctAnswer > 100) {
      bad++;
      fail(`1 to 100: answer out of range ${p.correctAnswer} → ${p.text}`);
    }
    if (!p.category) fail(`1 to 100: missing category → ${p.text}`);
  }
  if (new Set(all.map((p) => p.id)).size !== all.length) fail("1 to 100: duplicate ids");
  const cats: Record<string, number> = {};
  for (const p of all) cats[p.category] = (cats[p.category] ?? 0) + 1;
  console.log(`  answers in 1–100: ${all.length - bad}/${all.length}; categories ${JSON.stringify(cats)}`);
}

// ── Pie Charts ──────────────────────────────────────────────────────────────
{
  const all = getAllPieChartPrompts();
  report("Pie Charts", PIE_CHARTS_PROMPTS.length, all.map((p) => p.text), Q, simulate(all, 15, (p) => p.id));
  if (new Set(all.map((p) => p.id)).size !== all.length) fail("Pie Charts: duplicate ids");
}

// ── 10 Second Tasks ─────────────────────────────────────────────────────────
{
  const all = getAllTasks();
  report("10 Second Tasks", TASKS.length, all.map((t) => t.text), STMT, simulate(all, 20, (t) => t.id));
  if (new Set(all.map((t) => t.id)).size !== all.length) fail("10 Second Tasks: duplicate ids");
  const TAGS = new Set(["physical", "movement", "audio", "face"]);
  for (const t of all) {
    if (!t.tags.length || t.tags.some((g) => !TAGS.has(g))) fail(`10 Second Tasks: bad tags ${t.tags} → ${t.text}`);
    if (t.flags.some((f) => f !== "loud")) fail(`10 Second Tasks: bad flags → ${t.text}`);
  }
}

// ── Smarty Pot ──────────────────────────────────────────────────────────────
{
  const all = getAllPotLuckQuestions();
  report("Smarty Pot", DEFAULT_QUESTIONS.length, all.map((q) => q.text), Q, simulate(all, 25, (q) => q.id));
  if (new Set(all.map((q) => q.id)).size !== all.length) fail("Smarty Pot: duplicate ids");
  const POT = { easy: 1, medium: 2, hard: 3 } as const;
  let bad = 0;
  for (const q of all) {
    const ans = q.choices[q.correctIndex];
    const problems: string[] = [];
    if (q.choices.length !== 4) problems.push("not 4 choices");
    if (!ans || !ans.trim()) problems.push("empty answer");
    if (q.choices.some((c) => !c || !c.trim())) problems.push("empty choice");
    if (new Set(q.choices.map((c) => c.trim().toLowerCase())).size !== 4) problems.push("duplicate choices");
    if (![0, 1, 2, 3].includes(q.correctIndex)) problems.push("bad correctIndex");
    if (POT[q.difficulty] !== q.startingPot) problems.push("pot/difficulty mismatch");
    if (problems.length) {
      bad++;
      if (bad <= 10) fail(`Smarty Pot: ${problems.join(", ")} → ${q.text}`);
    }
  }
  const diff = { easy: 0, medium: 0, hard: 0 };
  for (const q of all) diff[q.difficulty]++;
  console.log(`  valid answers ${all.length - bad}/${all.length}; difficulty ${JSON.stringify(diff)}`);
}

// ── Source sizes ────────────────────────────────────────────────────────────
console.log("\n■ Source bytes");
const FILES = [
  "src/data/blindRankingBanks.ts",
  "src/data/talentShow.ts",
  "src/data/numberGuessor.ts",
  "src/data/pieCharts.ts",
  "src/data/tenSecondTasks.ts",
  "src/data/potLuck.ts",
  ...(fs.readdirSync(path.join(ROOT, "src/data/gen")) as string[]).filter((f) => f.endsWith(".ts")).map((f) => "src/data/gen/" + f),
];
let total = 0;
for (const f of FILES) {
  const b = fs.statSync(path.join(ROOT, f)).size;
  total += b;
  console.log(`  ${String(b).padStart(7)}  ${f}`);
}
console.log(`  ${String(total).padStart(7)}  total`);

console.log("\n■ Summary (unique before → after, 20-game repeat rate)");
for (const r of rows) console.log(`  ${r.game.padEnd(30)} ${String(r.before).padStart(5)} → ${String(r.after).padEnd(5)}  ${(r.repeat * 100).toFixed(2)}%`);

if (failures) {
  console.log(`\nFAILED: ${failures} problem(s)`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
