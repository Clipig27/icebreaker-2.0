// ─────────────────────────────────────────────────────────────────────────────
// Smarty Pot — deterministic offline trivia generator.
//
// Every answer comes from a curated fact table below (only well-established
// facts) or is computed exactly (arithmetic, Roman numerals, unit math).
// Distractors are other answers of the SAME kind from the same table, so all
// four choices are plausible but only one is correct.
//
// No React Native imports: safe to run under plain Node for verification.
// ─────────────────────────────────────────────────────────────────────────────

import type { PotLuckQuestion } from "../potLuck";
import { hashString, seededRng, shuffleWith } from "../../utils/deck";

type Diff = PotLuckQuestion["difficulty"];

// Row prefixes: "*" = easy, "!" = hard, none = medium. "~" (after the
// difficulty mark) = skip the continent question (transcontinental etc.).

/** Country|Capital, grouped by continent code (E,A,F,N,S,O). */
const CAPITALS: Record<string, string> = {
  E: "*Germany|Berlin;*Italy|Rome;*Spain|Madrid;Portugal|Lisbon;Belgium|Brussels;Austria|Vienna;Switzerland|Bern;Poland|Warsaw;Czech Republic|Prague;Hungary|Budapest;*Greece|Athens;Sweden|Stockholm;Norway|Oslo;Denmark|Copenhagen;Finland|Helsinki;Iceland|Reykjavik;Ireland|Dublin;*United Kingdom|London;Romania|Bucharest;Bulgaria|Sofia;Serbia|Belgrade;Croatia|Zagreb;!Slovenia|Ljubljana;!Slovakia|Bratislava;Ukraine|Kyiv;*~Russia|Moscow;!Estonia|Tallinn;!Latvia|Riga;!Lithuania|Vilnius;!Albania|Tirana;!Belarus|Minsk;!Moldova|Chisinau;!Malta|Valletta;!~Cyprus|Nicosia;!Bosnia and Herzegovina|Sarajevo;!North Macedonia|Skopje;!Montenegro|Podgorica",
  A: "*China|Beijing;*South Korea|Seoul;North Korea|Pyongyang;India|New Delhi;Pakistan|Islamabad;Bangladesh|Dhaka;Nepal|Kathmandu;*Thailand|Bangkok;Vietnam|Hanoi;Cambodia|Phnom Penh;!Laos|Vientiane;Malaysia|Kuala Lumpur;Philippines|Manila;Mongolia|Ulaanbaatar;Afghanistan|Kabul;Iran|Tehran;Iraq|Baghdad;Saudi Arabia|Riyadh;~Turkey|Ankara;Jordan|Amman;Lebanon|Beirut;Syria|Damascus;Qatar|Doha;United Arab Emirates|Abu Dhabi;!Oman|Muscat;!Uzbekistan|Tashkent;!Kyrgyzstan|Bishkek;!Tajikistan|Dushanbe;!Turkmenistan|Ashgabat;!Bhutan|Thimphu;!~Armenia|Yerevan;!~Georgia|Tbilisi;!~Azerbaijan|Baku;!Bahrain|Manama",
  F: "~Egypt|Cairo;Kenya|Nairobi;Ethiopia|Addis Ababa;Morocco|Rabat;Algeria|Algiers;Tunisia|Tunis;Libya|Tripoli;Ghana|Accra;Senegal|Dakar;Uganda|Kampala;Rwanda|Kigali;Zimbabwe|Harare;!Zambia|Lusaka;!Angola|Luanda;!Mozambique|Maputo;!Madagascar|Antananarivo;!Somalia|Mogadishu;!Mali|Bamako;!Niger|Niamey;!Chad|N'Djamena;!Cameroon|Yaoundé;!Namibia|Windhoek;!Botswana|Gaborone;!Democratic Republic of the Congo|Kinshasa;!Gabon|Libreville;!Liberia|Monrovia;!Sierra Leone|Freetown;!Guinea|Conakry;!Malawi|Lilongwe;!Eritrea|Asmara;Nigeria|Abuja",
  N: "*Canada|Ottawa;*Mexico|Mexico City;Cuba|Havana;Jamaica|Kingston;!Honduras|Tegucigalpa;!Nicaragua|Managua;Costa Rica|San José;Haiti|Port-au-Prince;Dominican Republic|Santo Domingo;Bahamas|Nassau;El Salvador|San Salvador;!Belize|Belmopan;!~Trinidad and Tobago|Port of Spain;!Barbados|Bridgetown",
  S: "Brazil|Brasília;*Argentina|Buenos Aires;Chile|Santiago;Peru|Lima;Colombia|Bogotá;Venezuela|Caracas;Ecuador|Quito;Uruguay|Montevideo;!Paraguay|Asunción;!Guyana|Georgetown;!Suriname|Paramaribo",
  O: "New Zealand|Wellington;!Fiji|Suva;!Papua New Guinea|Port Moresby;!Samoa|Apia;!Tonga|Nuku'alofa",
};
/** Country names that read naturally with "the" inside a sentence. */
const THE = new Set(["United Kingdom", "Czech Republic", "United Arab Emirates", "Democratic Republic of the Congo", "Bahamas", "Dominican Republic", "Philippines"]);
const inSentence = (c: string) =>
  c === "Georgia" ? "the country of Georgia" : THE.has(c) ? `the ${c}` : c;

const CONTINENT_NAME: Record<string, string> = {
  E: "Europe", A: "Asia", F: "Africa", N: "North America", S: "South America", O: "Oceania",
};

/** Name|Symbol|Atomic number. */
const ELEMENTS =
  "*Hydrogen|H|1;*Helium|He|2;Lithium|Li|3;Beryllium|Be|4;Boron|B|5;*Carbon|C|6;*Nitrogen|N|7;Fluorine|F|9;Neon|Ne|10;Sodium|Na|11;Magnesium|Mg|12;Aluminum|Al|13;Silicon|Si|14;Phosphorus|P|15;Sulfur|S|16;Chlorine|Cl|17;Argon|Ar|18;Potassium|K|19;*Calcium|Ca|20;!Titanium|Ti|22;!Chromium|Cr|24;!Manganese|Mn|25;Iron|Fe|26;!Cobalt|Co|27;Nickel|Ni|28;Copper|Cu|29;Zinc|Zn|30;!Arsenic|As|33;!Bromine|Br|35;!Krypton|Kr|36;Silver|Ag|47;Tin|Sn|50;Iodine|I|53;!Xenon|Xe|54;!Tungsten|W|74;Platinum|Pt|78;Mercury|Hg|80;Lead|Pb|82;!Radon|Rn|86;Uranium|U|92;!Plutonium|Pu|94;!Antimony|Sb|51;!Strontium|Sr|38;!Cadmium|Cd|48;!Bismuth|Bi|83;!Radium|Ra|88;!Palladium|Pd|46;!Gallium|Ga|31;!Selenium|Se|34;!Cesium|Cs|55;!Barium|Ba|56";

/** US state|Capital. */
const US_CAPITALS =
  "Alabama|Montgomery;Alaska|Juneau;Arizona|Phoenix;Arkansas|Little Rock;*California|Sacramento;Colorado|Denver;!Connecticut|Hartford;!Delaware|Dover;*Florida|Tallahassee;Georgia|Atlanta;Hawaii|Honolulu;!Idaho|Boise;Illinois|Springfield;Indiana|Indianapolis;!Iowa|Des Moines;!Kansas|Topeka;!Kentucky|Frankfort;Louisiana|Baton Rouge;!Maine|Augusta;!Maryland|Annapolis;Massachusetts|Boston;!Michigan|Lansing;!Minnesota|Saint Paul;!Mississippi|Jackson;!Missouri|Jefferson City;!Montana|Helena;!Nebraska|Lincoln;!Nevada|Carson City;!New Hampshire|Concord;!New Jersey|Trenton;New Mexico|Santa Fe;*New York|Albany;!North Carolina|Raleigh;!North Dakota|Bismarck;Ohio|Columbus;Oklahoma|Oklahoma City;!Oregon|Salem;!Pennsylvania|Harrisburg;!Rhode Island|Providence;!South Carolina|Columbia;!South Dakota|Pierre;Tennessee|Nashville;*Texas|Austin;Utah|Salt Lake City;!Vermont|Montpelier;!Virginia|Richmond;!Washington|Olympia;!West Virginia|Charleston;!Wisconsin|Madison;!Wyoming|Cheyenne";

/** Book|Author. */
const BOOKS =
  "*Pride and Prejudice|Jane Austen;Emma|Jane Austen;Sense and Sensibility|Jane Austen;*1984|George Orwell;*Animal Farm|George Orwell;*To Kill a Mockingbird|Harper Lee;The Great Gatsby|F. Scott Fitzgerald;Moby-Dick|Herman Melville;War and Peace|Leo Tolstoy;Anna Karenina|Leo Tolstoy;Crime and Punishment|Fyodor Dostoevsky;!The Brothers Karamazov|Fyodor Dostoevsky;Don Quixote|Miguel de Cervantes;*Hamlet|William Shakespeare;*Macbeth|William Shakespeare;Othello|William Shakespeare;A Midsummer Night's Dream|William Shakespeare;Great Expectations|Charles Dickens;*Oliver Twist|Charles Dickens;*A Christmas Carol|Charles Dickens;Jane Eyre|Charlotte Brontë;Wuthering Heights|Emily Brontë;Frankenstein|Mary Shelley;*Dracula|Bram Stoker;The Adventures of Tom Sawyer|Mark Twain;Adventures of Huckleberry Finn|Mark Twain;The Catcher in the Rye|J.D. Salinger;Of Mice and Men|John Steinbeck;The Grapes of Wrath|John Steinbeck;The Old Man and the Sea|Ernest Hemingway;Brave New World|Aldous Huxley;Fahrenheit 451|Ray Bradbury;*The Hobbit|J.R.R. Tolkien;*The Lord of the Rings|J.R.R. Tolkien;*Harry Potter and the Philosopher's Stone|J.K. Rowling;The Chronicles of Narnia|C.S. Lewis;Alice's Adventures in Wonderland|Lewis Carroll;The Odyssey|Homer;The Iliad|Homer;Les Misérables|Victor Hugo;The Hunchback of Notre-Dame|Victor Hugo;The Count of Monte Cristo|Alexandre Dumas;The Three Musketeers|Alexandre Dumas;Around the World in Eighty Days|Jules Verne;Twenty Thousand Leagues Under the Seas|Jules Verne;The Picture of Dorian Gray|Oscar Wilde;Lord of the Flies|William Golding;*Charlie and the Chocolate Factory|Roald Dahl;*Matilda|Roald Dahl;*The Cat in the Hat|Dr. Seuss;Little Women|Louisa May Alcott;Treasure Island|Robert Louis Stevenson;The Shining|Stephen King;Murder on the Orient Express|Agatha Christie;The Hound of the Baskervilles|Arthur Conan Doyle;!One Hundred Years of Solitude|Gabriel García Márquez;!The Divine Comedy|Dante Alighieri;Gulliver's Travels|Jonathan Swift;Robinson Crusoe|Daniel Defoe;The Jungle Book|Rudyard Kipling;The War of the Worlds|H.G. Wells;The Time Machine|H.G. Wells;The Handmaid's Tale|Margaret Atwood;!Beloved|Toni Morrison;!The Road|Cormac McCarthy;Slaughterhouse-Five|Kurt Vonnegut;!Catch-22|Joseph Heller;!One Flew Over the Cuckoo's Nest|Ken Kesey;The Metamorphosis|Franz Kafka;!Madame Bovary|Gustave Flaubert;!Ulysses|James Joyce;!Mrs Dalloway|Virginia Woolf;The Hunger Games|Suzanne Collins;The Da Vinci Code|Dan Brown;Charlotte's Web|E.B. White;Winnie-the-Pooh|A.A. Milne;Peter Pan|J.M. Barrie;The Little Prince|Antoine de Saint-Exupéry";

/** Painting|Artist. */
const PAINTINGS =
  "*the Mona Lisa|Leonardo da Vinci;The Last Supper|Leonardo da Vinci;*The Starry Night|Vincent van Gogh;Sunflowers|Vincent van Gogh;*The Scream|Edvard Munch;Girl with a Pearl Earring|Johannes Vermeer;The Persistence of Memory|Salvador Dalí;Guernica|Pablo Picasso;The Birth of Venus|Sandro Botticelli;The Night Watch|Rembrandt;Water Lilies|Claude Monet;!Impression, Sunrise|Claude Monet;American Gothic|Grant Wood;The Kiss|Gustav Klimt;The Creation of Adam|Michelangelo;The Great Wave off Kanagawa|Hokusai;!Nighthawks|Edward Hopper;Campbell's Soup Cans|Andy Warhol;!The Son of Man|René Magritte;!Las Meninas|Diego Velázquez;!The School of Athens|Raphael;!Liberty Leading the People|Eugène Delacroix;!A Sunday Afternoon on the Island of La Grande Jatte|Georges Seurat;!The Garden of Earthly Delights|Hieronymus Bosch;!The Arnolfini Portrait|Jan van Eyck";

/** Country|Currency (non-euro countries only). */
const CURRENCIES =
  "*the United Kingdom|Pound sterling;*India|Rupee;Russia|Ruble;*Mexico|Peso;Brazil|Real;South Korea|Won;Switzerland|Franc;Sweden|Krona;Norway|Krone;Poland|Złoty;Turkey|Lira;South Africa|Rand;Thailand|Baht;!Vietnam|Dong;Indonesia|Rupiah;!Hungary|Forint;!Czech Republic|Koruna;Saudi Arabia|Riyal;!Nigeria|Naira;!Malaysia|Ringgit;!Bangladesh|Taka;!Ukraine|Hryvnia;!Romania|Leu;China|Yuan;Israel|Shekel";

/** Animal|Baby name (each answer unambiguous for its animal). */
const BABIES =
  "*cat|Kitten;*dog|Puppy;*cow|Calf;horse|Foal;bear|Cub;*kangaroo|Joey;goat|Kid;*sheep|Lamb;*pig|Piglet;goose|Gosling;*duck|Duckling;deer|Fawn;*frog|Tadpole;!eagle|Eaglet;!swan|Cygnet;!owl|Owlet";

/** Animals|Group noun (no answer here is also valid for another row). */
const GROUPS =
  "*lions|Pride;crows|Murder;owls|Parliament;geese|Gaggle;*fish|School;*wolves|Pack;ants|Colony;!rhinos|Crash;!giraffes|Tower;!ferrets|Business";

const PLANETS = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

/** Single fixed facts: difficulty|question|answer|d1|d2|d3. */
const SINGLES =
  "e|Which planet is known as the Red Planet?|Mars|Venus|Jupiter|Mercury;m|Which planet has the Great Red Spot?|Jupiter|Saturn|Mars|Neptune;m|Which planet is the hottest in our solar system?|Venus|Mercury|Mars|Jupiter;e|Which planet is farthest from the Sun?|Neptune|Uranus|Saturn|Jupiter;m|Which is the smallest planet in our solar system?|Mercury|Mars|Venus|Earth;h|What is the largest moon in our solar system?|Ganymede|Titan|Europa|Callisto;m|What is the largest moon of Saturn?|Titan|Ganymede|Io|Europa;h|The moons Phobos and Deimos orbit which planet?|Mars|Jupiter|Venus|Neptune";

// ─── helpers ────────────────────────────────────────────────────────────────

type Row = { d: Diff; skipCont: boolean; f: string[] };

function parse(table: string): Row[] {
  return table.split(";").map((raw) => {
    let s = raw;
    let d: Diff = "medium";
    if (s[0] === "*") { d = "easy"; s = s.slice(1); }
    else if (s[0] === "!") { d = "hard"; s = s.slice(1); }
    let skipCont = false;
    if (s[0] === "~") { skipCont = true; s = s.slice(1); }
    return { d, skipCont, f: s.split("|") };
  });
}

const POT: Record<Diff, 1 | 2 | 3> = { easy: 1, medium: 2, hard: 3 };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Build a question: `preferred` distractors are tried first (shuffled), then
 * `fallback`. Anything equal (case-insensitive) to the answer or to another
 * chosen option is skipped. Returns null if 3 distractors can't be found.
 */
function make(
  text: string,
  answer: string,
  preferred: readonly string[],
  fallback: readonly string[],
  d: Diff
): PotLuckQuestion | null {
  const rng = seededRng(hashString(text));
  const seen = new Set([answer.toLowerCase()]);
  const ds: string[] = [];
  for (const c of [...shuffleWith(preferred, rng), ...shuffleWith(fallback, rng)]) {
    if (ds.length === 3) break;
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    ds.push(c);
  }
  if (ds.length < 3) return null;
  const choices = shuffleWith([answer, ...ds], rng) as [string, string, string, string];
  return {
    id: "sp_" + hashString(text).toString(36),
    text,
    choices,
    correctIndex: choices.indexOf(answer) as 0 | 1 | 2 | 3,
    difficulty: d,
    startingPot: POT[d],
  };
}

function toRoman(n: number): string {
  const map: [number, string][] = [[100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, r] of map) while (n >= v) { out += r; n -= v; }
  return out;
}

/** Numeric distractors from candidate offsets, kept positive. */
function nums(answer: number, cands: number[]): string[] {
  return cands.filter((c) => c > 0 && c !== answer).map(String);
}

// ─── generators ─────────────────────────────────────────────────────────────

function build(): PotLuckQuestion[] {
  const out: (PotLuckQuestion | null)[] = [];

  // Capitals (world)
  const byCont: Record<string, Row[]> = {};
  for (const k of Object.keys(CAPITALS)) byCont[k] = parse(CAPITALS[k]);
  const allRows = Object.values(byCont).flat();
  const allCaps = allRows.map((r) => r.f[1]);
  const allCountries = allRows.map((r) => r.f[0]);
  const contNames = Object.values(CONTINENT_NAME).filter((c) => c !== "Oceania");
  for (const k of Object.keys(byCont)) {
    const rows = byCont[k];
    for (const r of rows) {
      const [country, city] = r.f;
      const same = rows.filter((x) => x !== r);
      out.push(make(`What is the capital of ${inSentence(country)}?`, city, same.map((x) => x.f[1]), allCaps, r.d));
      out.push(make(`Which country has ${city} as its capital?`, country, same.map((x) => x.f[0]), allCountries, r.d));
      if (!r.skipCont && k !== "O") {
        out.push(make(`On which continent is ${inSentence(country)}?`, CONTINENT_NAME[k], contNames, [], r.d === "hard" ? "medium" : "easy"));
      }
    }
  }

  // Elements
  const els = parse(ELEMENTS);
  const syms = els.map((e) => e.f[1]);
  const names = els.map((e) => e.f[0]);
  for (const e of els) {
    const [name, sym, zs] = e.f;
    const z = Number(zs);
    // Prefer symbols that share a letter with the element name (plausible).
    const near = syms.filter((s) => name.toLowerCase().includes(s[0].toLowerCase()));
    const symDiff: Diff = sym[0] !== name[0] ? "hard" : e.d;
    out.push(make(`What is the chemical symbol for ${name.toLowerCase()}?`, sym, near, syms, symDiff));
    out.push(make(`Which element has the chemical symbol ${sym}?`, name, names.filter((n) => n[0] === sym[0]), names, symDiff));
    if (z <= 30) {
      out.push(make(`What is the atomic number of ${name.toLowerCase()}?`, String(z), nums(z, [z - 1, z + 1, z - 2, z + 2, z + 3]), [], z <= 8 ? "medium" : "hard"));
    }
  }

  // US state capitals
  const us = parse(US_CAPITALS);
  const usCaps = us.map((r) => r.f[1]);
  const usStates = us.map((r) => r.f[0]);
  for (const r of us) {
    const [state, city] = r.f;
    out.push(make(`What is the capital of the US state of ${state}?`, city, usCaps, [], r.d));
    out.push(make(`${city} is the capital of which US state?`, state, usStates, [], r.d));
  }

  // Books
  const books = parse(BOOKS);
  const authors = Array.from(new Set(books.map((b) => b.f[1])));
  const doneAuthor = new Set<string>();
  for (const b of books) {
    const [title, author] = b.f;
    out.push(make(`Who wrote "${title}"?`, author, authors, [], b.d));
    if (!doneAuthor.has(author)) {
      doneAuthor.add(author);
      const others = books.filter((x) => x.f[1] !== author).map((x) => x.f[0]);
      out.push(make(`Which of these books was written by ${author}?`, title, others, [], b.d));
    }
  }

  // Paintings
  const paints = parse(PAINTINGS);
  const artists = Array.from(new Set(paints.map((p) => p.f[1])));
  for (const p of paints) {
    const [title, artist] = p.f;
    const t = title.startsWith("the ") ? title : `"${title}"`;
    out.push(make(`Who painted ${t}?`, artist, artists, [], p.d));
  }

  // Currencies
  const curs = parse(CURRENCIES);
  const curNames = curs.map((c) => c.f[1]);
  for (const c of curs) {
    out.push(make(`What is the currency of ${c.f[0]}?`, c.f[1], curNames, [], c.d));
  }

  // Baby animals & group nouns
  const babies = parse(BABIES);
  for (const b of babies) out.push(make(`What is a baby ${b.f[0]} called?`, b.f[1], babies.map((x) => x.f[1]), [], b.d));
  const groups = parse(GROUPS);
  for (const g of groups) out.push(make(`What is a group of ${g.f[0]} called?`, g.f[1], groups.map((x) => x.f[1]), [], g.d));

  // Planets (order from the Sun) — first planet is already in the curated set.
  for (let i = 1; i < 8; i++) {
    out.push(make(`Which planet is ${ORDINALS[i]} from the Sun?`, PLANETS[i], PLANETS, [], i === 2 ? "easy" : "medium"));
  }
  for (let i = 0; i < 7; i++) {
    out.push(make(`Which planet is next after ${PLANETS[i]}, moving away from the Sun?`, PLANETS[i + 1], PLANETS, [], "medium"));
  }
  for (const line of SINGLES.split(";")) {
    const [d, q, a, ...ds] = line.split("|");
    out.push(make(q, a, ds, [], d === "e" ? "easy" : d === "h" ? "hard" : "medium"));
  }

  // Multiplication (exact)
  for (let a = 3; a <= 12; a++) {
    for (let b = a; b <= 12; b++) {
      const p = a * b;
      out.push(make(`What is ${a} × ${b}?`, String(p), nums(p, [p + a, p - a, p + b, p - b, p + 1, p - 1, (a + 1) * (b - 1)]), [], a <= 5 && b <= 10 ? "easy" : "medium"));
    }
  }
  // Square roots (exact)
  for (let n = 4; n <= 20; n++) {
    out.push(make(`What is the square root of ${n * n}?`, String(n), nums(n, [n - 1, n + 1, n - 2, n + 2]), [], n <= 12 ? "medium" : "hard"));
  }
  // Roman numerals (computed)
  const romans = [4, 9, 14, 19, 24, 29, 34, 39, 40, 44, 49, 54, 59, 64, 69, 74, 79, 84, 89, 90, 94, 99, 41, 46, 58, 66, 77, 88, 93, 96, 100, 47, 61, 72, 83, 91, 36, 27, 18, 52];
  for (const n of romans) {
    out.push(make(`What number is the Roman numeral ${toRoman(n)}?`, String(n), nums(n, [n - 2, n + 2, n - 10, n + 10, n - 1, n + 1, n + 20]), [], n < 40 ? "medium" : "hard"));
  }
  // Time conversions (exact)
  for (let h = 2; h <= 12; h++) out.push(make(`How many minutes are in ${h} hours?`, String(h * 60), nums(h * 60, [h * 60 - 60, h * 60 + 60, h * 100, h * 60 - 30, h * 60 + 30]), [], "easy"));
  for (let m = 2; m <= 10; m++) out.push(make(`How many seconds are in ${m} minutes?`, String(m * 60), nums(m * 60, [m * 60 - 60, m * 60 + 60, m * 100, m * 60 + 30]), [], "easy"));
  for (let w = 2; w <= 12; w++) out.push(make(`How many days are in ${w} weeks?`, String(w * 7), nums(w * 7, [w * 7 - 7, w * 7 + 7, w * 5, w * 7 - 1, w * 7 + 1]), [], "easy"));
  for (let d = 2; d <= 7; d++) out.push(make(`How many hours are in ${d} days?`, String(d * 24), nums(d * 24, [d * 24 - 24, d * 24 + 24, d * 20, d * 12, d * 24 + 12]), [], "medium"));
  // Percentages (exact integers by construction)
  for (const pct of [10, 20, 25, 50, 75]) {
    for (const m of [40, 60, 80, 100, 120, 200, 400]) {
      const v = (pct * m) / 100;
      out.push(make(`What is ${pct}% of ${m}?`, String(v), nums(v, [v * 2, v + 5, v - 5, v + 10, v - 10, Math.round(v / 2)]), [], pct === 50 || pct === 10 ? "easy" : "medium"));
    }
  }

  // Dedupe by normalized text; every question must end with "?".
  const seen = new Set<string>();
  const res: PotLuckQuestion[] = [];
  for (const q of out) {
    if (!q || !q.text.endsWith("?")) continue;
    const k = norm(q.text);
    if (seen.has(k)) continue;
    seen.add(k);
    res.push({ ...q, text: cap(q.text) });
  }
  return res;
}

let cache: PotLuckQuestion[] | null = null;

/**
 * All generated Smarty Pot questions (deterministic, memoized).
 * `excludeTexts` drops any whose normalized text matches (e.g. curated ones).
 */
export function generatePotLuckQuestions(excludeTexts: readonly string[] = []): PotLuckQuestion[] {
  if (!cache) cache = build();
  if (excludeTexts.length === 0) return cache;
  const ex = new Set(excludeTexts.map(norm));
  return cache.filter((q) => !ex.has(norm(q.text)));
}
