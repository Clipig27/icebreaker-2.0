// ─────────────────────────────────────────────────────────────────────────────
// 1 to 100 — deterministic numeric-question generator.
//
// Every answer is either COMPUTED exactly in code (calendar/unit math, Roman
// numerals, alphabet positions, primes, polygon diagonals…) or read from a
// small curated table of well-established facts (atomic numbers, rules of
// sports, anatomy). Facts that are approximate, disputed or that change over
// time are deliberately left out. All answers are integers in 1–100.
// Pure TS, no react-native imports.
// ─────────────────────────────────────────────────────────────────────────────

import type { NumberPrompt } from '../numberGuessor';
import { hashString } from '../../utils/deck';

// Elements 1–100 in atomic-number order (US spellings).
const ELEMENTS = (
  'Hydrogen|Helium|Lithium|Beryllium|Boron|Carbon|Nitrogen|Oxygen|Fluorine|Neon|' +
  'Sodium|Magnesium|Aluminum|Silicon|Phosphorus|Sulfur|Chlorine|Argon|Potassium|Calcium|' +
  'Scandium|Titanium|Vanadium|Chromium|Manganese|Iron|Cobalt|Nickel|Copper|Zinc|' +
  'Gallium|Germanium|Arsenic|Selenium|Bromine|Krypton|Rubidium|Strontium|Yttrium|Zirconium|' +
  'Niobium|Molybdenum|Technetium|Ruthenium|Rhodium|Palladium|Silver|Cadmium|Indium|Tin|' +
  'Antimony|Tellurium|Iodine|Xenon|Cesium|Barium|Lanthanum|Cerium|Praseodymium|Neodymium|' +
  'Promethium|Samarium|Europium|Gadolinium|Terbium|Dysprosium|Holmium|Erbium|Thulium|Ytterbium|' +
  'Lutetium|Hafnium|Tantalum|Tungsten|Rhenium|Osmium|Iridium|Platinum|Gold|Mercury|' +
  'Thallium|Lead|Bismuth|Polonium|Astatine|Radon|Francium|Radium|Actinium|Thorium|' +
  'Protactinium|Uranium|Neptunium|Plutonium|Americium|Curium|Berkelium|Californium|Einsteinium|Fermium'
).split('|');

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'.split('|');
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // non-leap year

const US_STATES = (
  'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|' +
  'Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|' +
  'Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|' +
  'New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|' +
  'South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming'
).split('|');

// "question|answer|category" — well-established, stable facts only.
const FACTS = (
  'How many players per side are on the field in an American football game?|11|sports;' +
  'How many players per side are on the court in a basketball game?|5|sports;' +
  'How many players are on a rugby union team on the field?|15|sports;' +
  'How many players are on a rugby league team on the field?|13|sports;' +
  'How many players are on a cricket team in the field?|11|sports;' +
  'How many players per side are in the water in water polo?|7|sports;' +
  'How many players per side are on the court in netball?|7|sports;' +
  'How many players per side are on the court in team handball?|7|sports;' +
  'How many players per side are on the field in Australian rules football?|18|sports;' +
  'How many players are on a beach volleyball team?|2|sports;' +
  'How many holes are played in a standard round of golf?|18|sports;' +
  'How many pins are set up in ten-pin bowling?|10|sports;' +
  'How many frames are in a game of ten-pin bowling?|10|sports;' +
  'How many points is a touchdown worth in American football (before the extra point)?|6|sports;' +
  'How many points is a field goal worth in American football?|3|sports;' +
  'How many points is the bullseye worth in standard darts?|50|sports;' +
  'How many points is the outer bull worth in standard darts?|25|sports;' +
  'How many minutes long is a standard soccer match, excluding stoppage time?|90|sports;' +
  'How many minutes long is an NBA game, excluding overtime?|48|sports;' +
  'How many minutes long is each quarter of an NBA game?|12|sports;' +
  'How many minutes long is each period of an NHL game?|20|sports;' +
  'How many minutes long is an NFL game, excluding overtime?|60|sports;' +
  'How many minutes long is each half of a rugby union match?|40|sports;' +
  'How many rounds is a men\'s world-title boxing fight scheduled for?|12|sports;' +
  'How many minutes long is a round in men\'s professional boxing?|3|sports;' +
  'How many innings are in a standard baseball game?|9|sports;' +
  'How many legal balls are bowled in an over in cricket?|6|sports;' +
  'How many full miles long is a marathon?|26|sports;' +
  'How many squares are on a chessboard?|64|sports;' +
  'How many pieces does each player start with in chess?|16|sports;' +
  'How many pawns does each player start with in chess?|8|sports;' +
  'How many pieces does each player start with in checkers?|12|sports;' +
  'How many tiles are in a standard double-six domino set?|28|sports;' +
  'How many cards are in a standard deck, not counting jokers?|52|sports;' +
  'How many cards are in each suit of a standard deck?|13|sports;' +
  'How many face cards (jacks, queens and kings) are in a standard deck?|12|sports;' +
  'How many letter tiles are in a standard English Scrabble set?|100|sports;' +
  'How many points is the letter Q worth in English Scrabble?|10|sports;' +
  'How many points is the letter K worth in English Scrabble?|5|sports;' +
  'How many dots are on a standard six-sided die in total?|21|math;' +
  'How many baby (primary) teeth does a child normally have?|20|science;' +
  'How many adult teeth does a person normally have, including wisdom teeth?|32|science;' +
  'How many pairs of chromosomes do humans have?|23|science;' +
  'How many chambers does the human heart have?|4|science;' +
  'How many legs does an insect have?|6|nature;' +
  'How many legs does a crab have, including its claws?|10|nature;' +
  'How many arms does an octopus have?|8|nature;' +
  'How many arms and tentacles does a squid have in total?|10|nature;' +
  'How many planets are in our solar system?|8|science;' +
  'How many moons does Mars have?|2|science;' +
  'How many US states are there?|50|geography;' +
  'How many provinces does Canada have?|10|geography;' +
  'How many territories does Canada have?|3|geography;' +
  'How many states does Australia have?|6|geography;' +
  'How many continents are there?|7|geography;' +
  'How many Great Lakes are there in North America?|5|geography;' +
  'How many stripes are on the US flag?|13|history;' +
  'How many stars are on the US flag?|50|history;' +
  'How many senators does each US state have?|2|history;' +
  'How many US senators are there in total?|100|history;' +
  'How many years is a US president\'s term?|4|history;' +
  'How many years is a US senator\'s term?|6|history;' +
  'How many amendments make up the US Bill of Rights?|10|history;' +
  'How many keys are on a standard piano?|88|science;' +
  'How many strings does a standard guitar have?|6|science;' +
  'How many strings does a standard violin have?|4|science;' +
  'How many lines are in a sonnet?|14|history;' +
  'How many syllables are in a traditional English haiku?|17|history;' +
  'How many degrees are in a right angle?|90|math;' +
  'How many degrees does each angle of an equilateral triangle measure?|60|math;' +
  'How many sides does a dodecagon have?|12|math;' +
  'How many sides does a hendecagon have?|11|math;' +
  'How many faces does a cube have?|6|math;' +
  'How many vertices does a cube have?|8|math;' +
  'How many faces does a tetrahedron have?|4|math;' +
  'How many edges does a tetrahedron have?|6|math;' +
  'How many faces does an octahedron have?|8|math;' +
  'How many edges does an octahedron have?|12|math;' +
  'How many vertices does an octahedron have?|6|math;' +
  'How many edges does a dodecahedron have?|30|math;' +
  'How many edges does an icosahedron have?|30|math;' +
  'How many vertices does an icosahedron have?|12|math;' +
  'How many edges does a square pyramid have?|8|math;' +
  'How many edges does a triangular prism have?|9|math;' +
  'How many edges does a hexagonal prism have?|18|math;' +
  'How many vertices does a hexagonal prism have?|12|math;' +
  'How many letters are in the English alphabet?|26|history;' +
  'How many vowels are in the English alphabet (not counting Y)?|5|history'
).split(';');

const ORD = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return n + s;
};

function roman(n: number): string {
  const t: [number, string][] = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of t) while (n >= v) { out += s; n -= v; }
  return out;
}

const isPrime = (n: number) => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
const NUMBER_WORDS = 'two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen'.split('|');
const word = (n: number) => NUMBER_WORDS[n - 2] ?? String(n);
const POLYGONS: [string, number][] = [['pentagon', 5], ['heptagon', 7], ['octagon', 8], ['nonagon', 9], ['decagon', 10], ['dodecagon', 12], ['hendecagon', 11]];

type Raw = [text: string, answer: number, category: string];

let memo: NumberPrompt[] | null = null;

/** All generated prompts, deterministic order, ids = hash of text. */
export function generateNumberPrompts(): NumberPrompt[] {
  if (memo) return memo;
  const raw: Raw[] = [];
  const add = (text: string, answer: number, category: string) => raw.push([text, answer, category]);

  // Atomic numbers 1–100
  ELEMENTS.forEach((el, i) => add(`What is the atomic number of ${el.toLowerCase()}?`, i + 1, 'science'));

  // Roman numerals (skip the trivial one/two-character ones)
  for (let n = 11; n <= 100; n++) {
    const r = roman(n);
    if (r.length >= 3) add(`What number is the Roman numeral ${r}?`, n, 'math');
  }

  // Alphabet positions
  for (let i = 0; i < 26; i++) add(`What position is the letter ${String.fromCharCode(65 + i)} in the English alphabet?`, i + 1, 'math');

  // Days in two different months combined (non-leap year)
  for (let a = 0; a < 12; a++)
    for (let b = a + 1; b < 12; b++) {
      const feb = a === 1 || b === 1 ? ' in a non-leap year' : '';
      add(`How many days are in ${MONTHS[a]} and ${MONTHS[b]} combined${feb}?`, MONTH_DAYS[a] + MONTH_DAYS[b], 'math');
    }

  // Day-of-year for notable early dates (non-leap year)
  const dayOfYear = (m: number, d: number) => MONTH_DAYS.slice(0, m).reduce((s, x) => s + x, 0) + d;
  for (const [m, d] of [[0, 15], [0, 31], [1, 1], [1, 14], [1, 28], [2, 1], [2, 17], [2, 31], [3, 1], [3, 10]] as const)
    add(`In a non-leap year, what day of the year is ${MONTHS[m]} ${d}?`, dayOfYear(m, d), 'math');

  // Unit and calendar conversions
  for (let n = 2; n <= 14; n++) add(`How many days are in ${word(n)} weeks?`, 7 * n, 'math');
  for (let n = 2; n <= 4; n++) add(`How many hours are in ${word(n)} days?`, 24 * n, 'math');
  for (let n = 2; n <= 8; n++) add(`How many months are in ${word(n)} years?`, 12 * n, 'math');
  for (let n = 2; n <= 10; n++) add(`How many years are in ${word(n)} decades?`, 10 * n, 'math');
  for (let n = 2; n <= 8; n++) add(`How many inches are in ${word(n)} feet?`, 12 * n, 'math');
  for (let n = 2; n <= 6; n++) add(`How many ounces are in ${word(n)} pounds?`, 16 * n, 'math');
  for (let n = 2; n <= 6; n++) add(`How many US cups are in ${word(n)} US gallons?`, 16 * n, 'math');
  for (let n = 2; n <= 12; n++) add(`How many US pints are in ${word(n)} US gallons?`, 8 * n, 'math');
  for (let n = 5; n <= 16; n++) add(`How many feet are in ${word(n)} yards?`, 3 * n, 'math');
  for (let n = 2; n <= 12; n++) add(`How many legs do ${word(n)} spiders have in total?`, 8 * n, 'nature');
  for (let n = 2; n <= 16; n++) add(`How many legs do ${word(n)} ants have in total?`, 6 * n, 'nature');
  for (let n = 2; n <= 6; n++) add(`How many minutes are in ${word(n)} quarter-hours?`, 15 * n, 'math');

  // Number facts
  for (let n = 10; n <= 100; n += 10) {
    if (n === 100) continue; // "below 100" already exists in the curated bank
    let c = 0;
    for (let k = 2; k < n; k++) if (isPrime(k)) c++;
    add(`How many prime numbers are there below ${n}?`, c, 'math');
  }
  for (let n = 4; n <= 13; n++) add(`What is the sum of the whole numbers from 1 to ${n}?`, (n * (n + 1)) / 2, 'math');
  for (let n = 4; n <= 10; n++) add(`What is the square root of ${n * n}?`, n, 'math');
  for (let n = 4; n <= 10; n++) add(`What is ${n} squared?`, n * n, 'math');
  for (let n = 3; n <= 6; n++) add(`What is 2 to the power of ${n}?`, 2 ** n, 'math');
  for (const n of [3, 4]) add(`What is 3 to the power of ${n}?`, 3 ** n, 'math');
  add('What is 4 cubed?', 64, 'math');
  for (const [name, s] of POLYGONS) add(`How many diagonals does ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name} have?`, (s * (s - 3)) / 2, 'math');
  for (let n = 3; n <= 11; n++) add(`What is the ${ORD(n)} number in the Fibonacci sequence that starts 1, 1, 2, 3?`, fib(n), 'math');

  // US state name counts (computed from the list above)
  const byLetter: Record<string, number> = {};
  for (const s of US_STATES) byLetter[s[0]] = (byLetter[s[0]] ?? 0) + 1;
  for (const L of Object.keys(byLetter).sort()) if (byLetter[L] >= 2) add(`How many US state names start with the letter ${L}?`, byLetter[L], 'geography');
  add('How many US state names start with "New"?', US_STATES.filter((s) => s.startsWith('New ')).length, 'geography');
  add('How many US state names start with "North" or "South"?', US_STATES.filter((s) => /^(North|South) /.test(s)).length, 'geography');
  add('How many US state names are made of two words?', US_STATES.filter((s) => s.includes(' ')).length, 'geography');

  // Curated facts
  for (const row of FACTS) {
    const [q, a, c] = row.split('|');
    add(q, Number(a), c);
  }

  memo = raw.map(([text, correctAnswer, category]) => ({
    id: 'ngg_' + hashString(text).toString(36),
    text,
    correctAnswer,
    category,
  }));
  return memo;
}

function fib(n: number): number {
  let a = 1, b = 1;
  for (let i = 2; i < n; i++) [a, b] = [b, a + b];
  return n <= 2 ? 1 : b;
}
