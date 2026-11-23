// ─────────────────────────────────────────────────────────────────────────────
// 1 to 100 — deterministic numeric-question generator.
//
// Every answer is either COMPUTED exactly in code (calendar/unit math, Roman
// numerals, alphabet positions, primes, polygon diagonals…) or read from a
// curated table of well-established facts (FACTS + FUN_FACTS: rules of sports,
// games, finished TV shows, retired athletes, anatomy, landmarks…). Dry lookup
// families (atomic numbers, Roman numerals, month-day sums, letter positions)
// are capped at ≤ 20 each. Facts that are approximate, disputed or that change
// over time are deliberately left out. All answers are integers in 1–100.
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

// Capped "dry lookup" families (verifyBanks enforces ≤ 25 each).
const FAMOUS_ELEMENTS = new Set(
  'Hydrogen|Helium|Carbon|Nitrogen|Oxygen|Neon|Sodium|Aluminum|Silicon|Chlorine|Calcium|Iron|Copper|Zinc|Silver|Tin|Gold|Mercury|Lead|Uranium'.split('|')
);
const ROMAN_PICKS = [14, 19, 24, 29, 33, 38, 44, 46, 49, 54, 59, 64, 69, 74, 78, 83, 88, 94, 97, 99];
const LETTER_PICKS = 'GHJKMNPQRTVW'.split('');
// Adjacent months + months six apart + 3 extras = 20 pairs.
const MONTH_PAIRS: [number, number][] = [
  ...Array.from({ length: 11 }, (_, a) => [a, a + 1] as [number, number]),
  ...Array.from({ length: 6 }, (_, a) => [a, a + 6] as [number, number]),
  [0, 11], [1, 3], [5, 8],
];

// Fun, stable, verified facts across everyday life, sports, games, music,
// movies/TV/books, food, geography and animals. Only facts that are settled
// and won't change (finished shows, retired players' totals, fixed rules,
// definitions) — no records that can be broken, populations or "current" counts.
const FUN_FACTS: Raw[] = [
  // ── Everyday life ──
  ['How many years are in a century?', 100, 'everyday'],
  ['How many days are in a fortnight?', 14, 'everyday'],
  ['How many full weeks are in a year?', 52, 'everyday'],
  ['How many days are in February in a leap year?', 29, 'everyday'],
  ['How many days are in September?', 30, 'everyday'],
  ['How many minutes are in an hour?', 60, 'everyday'],
  ['How many hours are in a day?', 24, 'everyday'],
  ['How many eggs are in a dozen?', 12, 'everyday'],
  ['How many items are in a baker\'s dozen?', 13, 'everyday'],
  ['How many years are in a "score", as in "four score and seven years ago"?', 20, 'everyday'],
  ['How many cents is a US quarter worth?', 25, 'everyday'],
  ['How many cents is a US dime worth?', 10, 'everyday'],
  ['How many cents is a US nickel worth?', 5, 'everyday'],
  ['How many cents is a US half-dollar coin worth?', 50, 'everyday'],
  ['How many cents are in a US dollar?', 100, 'everyday'],
  ['How many inches are in a foot?', 12, 'everyday'],
  ['How many feet are in a yard?', 3, 'everyday'],
  ['How many centimeters are in a meter?', 100, 'everyday'],
  ['How many millimeters are in a centimeter?', 10, 'everyday'],
  ['How many ounces are in a pound?', 16, 'everyday'],
  ['How many fluid ounces are in a US cup?', 8, 'everyday'],
  ['How many teaspoons are in a tablespoon?', 3, 'everyday'],
  ['How many tablespoons are in a US cup?', 16, 'everyday'],
  ['How many cups are in a US pint?', 2, 'everyday'],
  ['How many pints are in a US quart?', 2, 'everyday'],
  ['How many quarts are in a US gallon?', 4, 'everyday'],
  ['How many cups are in a US quart?', 4, 'everyday'],
  ['How many fluid ounces are in a US pint?', 16, 'everyday'],
  ['At how many degrees Fahrenheit does water freeze?', 32, 'everyday'],
  ['At how many degrees Celsius does water boil at sea level?', 100, 'everyday'],
  ['How many buttons are on a standard phone keypad, counting * and #?', 12, 'everyday'],
  ['How many digits are in a US phone number, including the area code?', 10, 'everyday'],
  ['How many letter keys are in the top row of a QWERTY keyboard?', 10, 'everyday'],
  ['How many letter keys are in the middle row of a QWERTY keyboard?', 9, 'everyday'],
  ['How many letter keys are in the bottom row of a QWERTY keyboard?', 7, 'everyday'],
  ['How many F-keys (F1 and up) are on a standard full-size keyboard?', 12, 'everyday'],
  ['How many sides does a stop sign have?', 8, 'everyday'],
  ['How many sides does a yield sign have?', 3, 'everyday'],
  ['How many colors are in a rainbow, as in ROY G. BIV?', 7, 'everyday'],
  ['How many numbers are on a standard clock face?', 12, 'everyday'],
  ['How many signs are in the Western zodiac?', 12, 'everyday'],
  ['How many animals are in the Chinese zodiac?', 12, 'everyday'],
  ['How many candle holders are on a Hanukkah menorah, including the helper candle?', 9, 'everyday'],
  ['How many nights does Hanukkah last?', 8, 'everyday'],
  ['How many days does Kwanzaa last?', 7, 'everyday'],
  ['Which wedding anniversary is the silver anniversary?', 25, 'everyday'],
  ['Which wedding anniversary is the golden anniversary?', 50, 'everyday'],
  ['Which wedding anniversary is the ruby anniversary?', 40, 'everyday'],
  ['Which wedding anniversary is the pearl anniversary?', 30, 'everyday'],
  ['On a standard die, what do opposite faces always add up to?', 7, 'everyday'],

  // ── Sports: rules ──
  ['How many players per side are on the field in a soccer match?', 11, 'sports'],
  ['How many strikes make a strikeout in baseball?', 3, 'sports'],
  ['How many balls does it take to walk a batter in baseball?', 4, 'sports'],
  ['How many outs does each team get per half-inning in baseball?', 3, 'sports'],
  ['How many feet apart are the bases on a Major League Baseball diamond?', 90, 'sports'],
  ['How many points is a safety worth in American football?', 2, 'sports'],
  ['How many points is a free throw worth in basketball?', 1, 'sports'],
  ['How many downs does an offense get to gain 10 yards in American football?', 4, 'sports'],
  ['How many yards long is an American football field from goal line to goal line?', 100, 'sports'],
  ['How many seconds are on the NBA shot clock?', 24, 'sports'],
  ['How many periods are in a regulation NHL game?', 3, 'sports'],
  ['How many minutes long is a regulation NHL game?', 60, 'sports'],
  ['How many quarters are in an American football game?', 4, 'sports'],
  ['How many sets must a player win to take a men\'s Grand Slam singles match?', 3, 'sports'],
  ['What is the fewest games a player can win to take a set in tennis?', 6, 'sports'],
  ['How many events make up an Olympic decathlon?', 10, 'sports'],
  ['How many events make up an Olympic heptathlon?', 7, 'sports'],
  ['How many hurdles does each runner clear in a 400-meter hurdles race?', 10, 'sports'],
  ['How many whole kilometers long is a marathon?', 42, 'sports'],
  ['How many players per side are on the field in field hockey?', 11, 'sports'],
  ['How many players per side are on the field in ultimate frisbee?', 7, 'sports'],
  ['How many players are on a curling team?', 4, 'sports'],
  ['How many players per side are on the field in polo?', 4, 'sports'],
  ['How many pockets does a standard pool table have?', 6, 'sports'],
  ['How many object balls are racked at the start of a game of eight-ball?', 15, 'sports'],
  ['How many clubs may a golfer carry under the Rules of Golf?', 14, 'sports'],
  ['How many points is a try worth in rugby union?', 5, 'sports'],
  ['How many points wins a regular (non-deciding) set in indoor volleyball?', 25, 'sports'],
  ['How many points wins a standard game of table tennis?', 11, 'sports'],
  ['How many points wins a standard game of badminton?', 21, 'sports'],
  ['How many yards from the goal line is the penalty spot in soccer?', 12, 'sports'],
  ['How many numbered segments are on a standard dartboard?', 20, 'sports'],
  ['What is the highest score possible with a single dart?', 60, 'sports'],
  ['To what number does a referee count for a knockout in boxing?', 10, 'sports'],
  ['How many years apart are the Summer Olympic Games normally held?', 4, 'sports'],

  // ── Sports: legends (retired / historic, so they never change) ──
  ['What jersey number did Michael Jordan famously wear for the Chicago Bulls?', 23, 'sports'],
  ['What jersey number did Wayne Gretzky wear?', 99, 'sports'],
  ['What jersey number did Babe Ruth wear for the New York Yankees?', 3, 'sports'],
  ['What jersey number is retired across all of Major League Baseball for Jackie Robinson?', 42, 'sports'],
  ['What jersey number did Tom Brady wear?', 12, 'sports'],
  ['What jersey number did Derek Jeter wear?', 2, 'sports'],
  ['What jersey number did Peyton Manning wear?', 18, 'sports'],
  ['What jersey number did Magic Johnson wear for the Lakers?', 32, 'sports'],
  ['What jersey number did Larry Bird wear for the Celtics?', 33, 'sports'],
  ['What jersey number did Mickey Mantle famously wear?', 7, 'sports'],
  ['What jersey number did Lou Gehrig wear?', 4, 'sports'],
  ['What jersey number did Pelé famously wear for Brazil?', 10, 'sports'],
  ['What jersey number did Mario Lemieux wear?', 66, 'sports'],
  ['How many NBA championships did Michael Jordan win?', 6, 'sports'],
  ['How many Super Bowls did Tom Brady win?', 7, 'sports'],
  ['How many gold medals did Michael Phelps win at the 2008 Beijing Olympics?', 8, 'sports'],
  ['How many Olympic gold medals did Michael Phelps win in his career?', 23, 'sports'],
  ['How many Olympic gold medals did Usain Bolt win in his career?', 8, 'sports'],
  ['How many points did Wilt Chamberlain score in his famous 1962 game?', 100, 'sports'],
  ['How many home runs did Babe Ruth hit in the 1927 season?', 60, 'sports'],
  ['How many home runs did Roger Maris hit in the 1961 season?', 61, 'sports'],
  ['How many games long was Joe DiMaggio\'s 1941 hitting streak?', 56, 'sports'],
  ['How many World Cups did Pelé win with Brazil?', 3, 'sports'],
  ['How many Grand Slam singles titles did Roger Federer win?', 20, 'sports'],
  ['How many Grand Slam singles titles did Rafael Nadal win?', 22, 'sports'],
  ['How many NBA titles in a row did the Boston Celtics win from 1959 to 1966?', 8, 'sports'],

  // ── Games ──
  ['How many spaces are on the outer track of a classic Monopoly board?', 40, 'games'],
  ['How many railroads are on a classic Monopoly board?', 4, 'games'],
  ['How many color groups of streets are on a classic Monopoly board?', 8, 'games'],
  ['How many houses must be on a Monopoly property before you can build a hotel?', 4, 'games'],
  ['How many squares are on a tic-tac-toe grid?', 9, 'games'],
  ['How many columns does a standard Connect Four grid have?', 7, 'games'],
  ['How many rows does a standard Connect Four grid have?', 6, 'games'],
  ['How many cells are in a standard Sudoku grid?', 81, 'games'],
  ['How many dice are rolled in Yahtzee?', 5, 'games'],
  ['How many scoring boxes are on a Yahtzee scorecard?', 13, 'games'],
  ['How many small cubes make up the outside of a standard 3x3 Rubik\'s Cube?', 26, 'games'],
  ['How many tiles does each player keep on their rack in Scrabble?', 7, 'games'],
  ['How many bonus points do you get for playing all seven tiles in one Scrabble turn?', 50, 'games'],
  ['How many squares wide is a standard Scrabble board?', 15, 'games'],
  ['How many blank tiles are in an English Scrabble set?', 2, 'games'],
  ['How many points is the letter Z worth in English Scrabble?', 10, 'games'],
  ['How many points is the letter X worth in English Scrabble?', 8, 'games'],
  ['How many points is the letter J worth in English Scrabble?', 8, 'games'],
  ['How many cards does each player start with in Uno?', 7, 'games'],
  ['How many squares make up each Tetris piece?', 4, 'games'],
  ['How many suspects are there in classic Clue?', 6, 'games'],
  ['How many rooms are on the classic Clue board?', 9, 'games'],
  ['How many weapons are there in classic Clue?', 6, 'games'],
  ['How many squares are on a classic Battleship target grid?', 100, 'games'],
  ['How many checkers does each player start with in backgammon?', 15, 'games'],
  ['How many points (triangles) are on a backgammon board?', 24, 'games'],
  ['How many blocks come in a standard Jenga set?', 54, 'games'],
  ['How many ghosts chase Pac-Man in the original arcade game?', 4, 'games'],
  ['How many worlds are in the original Super Mario Bros. game?', 8, 'games'],
  ['How many levels are in the original Super Mario Bros. game?', 32, 'games'],
  ['How many gym badges do you need to reach the Pokémon League in Pokémon Red and Blue?', 8, 'games'],
  ['How many Pokémon types existed in the original Pokémon Red and Blue?', 15, 'games'],
  ['How many blocks make a full stack in Minecraft?', 64, 'games'],
  ['How many hearts make up full health in Minecraft?', 10, 'games'],
  ['How many tableau piles are dealt in Klondike solitaire?', 7, 'games'],
  ['What hand total are you aiming for in blackjack?', 21, 'games'],
  ['How many lines run across a standard Go board in each direction?', 19, 'games'],
  ['How many squares are on a standard US bingo card, including the free space?', 25, 'games'],
  ['What is the highest number called in standard 75-ball bingo?', 75, 'games'],
  ['How many hippos are in the game Hungry Hungry Hippos?', 4, 'games'],
  ['How many red cards are in a standard deck?', 26, 'games'],
  ['How many aces are in a standard deck of cards?', 4, 'games'],
  ['How many cards make up a poker hand?', 5, 'games'],
  ['How many players per team are in a standard League of Legends match?', 5, 'games'],
  ['How many knights does each player start with in chess?', 2, 'games'],

  // ── Books & TV ──
  ['How many books are in the main Harry Potter series?', 7, 'pop_culture'],
  ['How many films adapt the seven main Harry Potter books?', 8, 'pop_culture'],
  ['How many houses are there at Hogwarts?', 4, 'pop_culture'],
  ['How many Weasley children are there in Harry Potter?', 7, 'pop_culture'],
  ['How many years does a standard Hogwarts education last?', 7, 'pop_culture'],
  ['How many members are in the Fellowship of the Ring?', 9, 'pop_culture'],
  ['How many dwarves join Bilbo on the quest in The Hobbit?', 13, 'pop_culture'],
  ['How many books are in The Chronicles of Narnia?', 7, 'pop_culture'],
  ['How many tributes compete in a standard Hunger Games?', 24, 'pop_culture'],
  ['How many dwarfs live with Snow White in the classic fairy tale?', 7, 'pop_culture'],
  ['How many golden tickets does Willy Wonka hide in his chocolate bars?', 5, 'pop_culture'],
  ['In Jules Verne\'s classic novel, in how many days does Phileas Fogg go around the world?', 80, 'pop_culture'],
  ['How many reindeer pull Santa\'s sleigh, including Rudolph?', 9, 'pop_culture'],
  ['In "The Twelve Days of Christmas", how many lords are a-leaping?', 10, 'pop_culture'],
  ['In "The Twelve Days of Christmas", how many pipers are piping?', 11, 'pop_culture'],
  ['In "The Twelve Days of Christmas", how many drummers are drumming?', 12, 'pop_culture'],
  ['In "The Twelve Days of Christmas", how many maids are a-milking?', 8, 'pop_culture'],
  ['In "The Twelve Days of Christmas", how many swans are a-swimming?', 7, 'pop_culture'],
  ['In "The Twelve Days of Christmas", how many ladies are dancing?', 9, 'pop_culture'],
  ['In "The Twelve Days of Christmas", how many geese are a-laying?', 6, 'pop_culture'],
  ['How many seasons did Friends run?', 10, 'pop_culture'],
  ['How many main friends are in the TV show Friends?', 6, 'pop_culture'],
  ['How many seasons did The Office (US) run?', 9, 'pop_culture'],
  ['How many seasons did How I Met Your Mother run?', 9, 'pop_culture'],
  ['How many seasons did The Big Bang Theory run?', 12, 'pop_culture'],
  ['How many seasons did Parks and Recreation run?', 7, 'pop_culture'],
  ['How many seasons did Mad Men run?', 7, 'pop_culture'],
  ['How many seasons did The Wire run?', 5, 'pop_culture'],
  ['How many seasons did Lost run?', 6, 'pop_culture'],
  ['How many seasons did Better Call Saul run?', 6, 'pop_culture'],
  ['How many seasons did Schitt\'s Creek run?', 6, 'pop_culture'],
  ['How many seasons did Downton Abbey run?', 6, 'pop_culture'],
  ['How many seasons did The Fresh Prince of Bel-Air run?', 6, 'pop_culture'],
  ['How many seasons did Brooklyn Nine-Nine run?', 8, 'pop_culture'],
  ['How many seasons did The Crown run?', 6, 'pop_culture'],
  ['How many seasons did Stranger Things run?', 5, 'pop_culture'],
  ['How many seasons did Gilmore Girls run in its original run?', 7, 'pop_culture'],
  ['How many seasons ("Books") did Avatar: The Last Airbender run?', 3, 'pop_culture'],
  ['How many kids do Homer and Marge Simpson have?', 3, 'pop_culture'],
  ['How many kids are in The Brady Bunch?', 6, 'pop_culture'],
  ['How many von Trapp children are in The Sound of Music?', 7, 'pop_culture'],
  ['How many Teenage Mutant Ninja Turtles are there?', 4, 'pop_culture'],
  ['How many Teletubbies are there?', 4, 'pop_culture'],
  ['How many Powerpuff Girls are there?', 3, 'pop_culture'],
  ['How many members are in the Scooby-Doo gang, including Scooby?', 5, 'pop_culture'],
  ['How many dragons does Daenerys Targaryen hatch in Game of Thrones?', 3, 'pop_culture'],

  // ── Movies ──
  ['How fast, in miles per hour, must the DeLorean go to time travel in Back to the Future?', 88, 'movies'],
  ['How many Infinity Stones are there in the Marvel Cinematic Universe?', 6, 'movies'],
  ['How many heroes make up the team in the 2012 film The Avengers?', 6, 'movies'],
  ['How many films are in the Twilight Saga?', 5, 'movies'],
  ['How many Oscars did The Lord of the Rings: The Return of the King win?', 11, 'movies'],
  ['How many Oscars did the 1959 film Ben-Hur win?', 11, 'movies'],
  ['How many puppies do Pongo and Perdita have in Disney\'s 1961 One Hundred and One Dalmatians?', 15, 'movies'],
  ['How many Ghostbusters are on the team in the original 1984 film?', 4, 'movies'],
  ['How many Rocky films came out before the Creed spin-offs?', 6, 'movies'],
  ['How many numbered episodes make up the Star Wars Skywalker Saga?', 9, 'movies'],
  ['What number comes after the double zero in James Bond\'s code name?', 7, 'movies'],

  // ── Music ──
  ['How many members were in the Beatles?', 4, 'music'],
  ['How many members are in ABBA?', 4, 'music'],
  ['How many Spice Girls are there?', 5, 'music'],
  ['How many members are in BTS?', 7, 'music'],
  ['How many members are in BLACKPINK?', 4, 'music'],
  ['How many members were in NSYNC?', 5, 'music'],
  ['How many members are in the Backstreet Boys?', 5, 'music'],
  ['How many members were in One Direction when the group formed?', 5, 'music'],
  ['How many Gibb brothers made up the Bee Gees?', 3, 'music'],
  ['How many members were in Led Zeppelin?', 4, 'music'],
  ['How many symphonies did Beethoven complete?', 9, 'music'],
  ['How many violin concertos make up Vivaldi\'s The Four Seasons?', 4, 'music'],
  ['How many white keys are on a standard piano?', 52, 'music'],
  ['How many black keys are on a standard piano?', 36, 'music'],
  ['How many lines are on a musical staff?', 5, 'music'],
  ['How many semitones are in an octave?', 12, 'music'],
  ['How many different notes are in a major scale?', 7, 'music'],
  ['How many strings does a standard ukulele have?', 4, 'music'],
  ['How many strings does a standard cello have?', 4, 'music'],
  ['How many strings does a standard bass guitar have?', 4, 'music'],
  ['How many musicians play in a string quartet?', 4, 'music'],
  ['How many beats does a whole note last in 4/4 time?', 4, 'music'],
  ['How many lines are in a limerick?', 5, 'pop_culture'],
  ['How many lines are in a villanelle?', 19, 'pop_culture'],

  // ── Food ──
  ['How many beef patties are in a Big Mac?', 2, 'food'],
  ['How many varieties does the famous Heinz slogan boast?', 57, 'food'],
  ['How many flavors is Baskin-Robbins famous for?', 31, 'food'],
  ['How many herbs and spices are in KFC\'s Original Recipe, as advertised?', 11, 'food'],
  ['How many holes are in a classic twisted pretzel?', 3, 'food'],
  ['How many points does a slice of star fruit have?', 5, 'food'],
  ['What is the most Michelin stars a restaurant can earn?', 3, 'food'],
  ['In the nursery rhyme, how many blackbirds were baked in a pie?', 24, 'food'],
  ['In the tongue twister, how many pecks of pickled peppers did Peter Piper pick?', 1, 'food'],

  // ── Geography & landmarks ──
  ['How many US states border Mexico?', 4, 'geography'],
  ['How many contiguous US states are there?', 48, 'geography'],
  ['How many stars are on the flag of China?', 5, 'geography'],
  ['How many stars are on the flag of Australia?', 6, 'geography'],
  ['How many points does the maple leaf on Canada\'s flag have?', 11, 'geography'],
  ['How many stripes are on the flag of Greece?', 9, 'geography'],
  ['How many time zones does the contiguous United States span?', 4, 'geography'],
  ['How many countries border Lake Victoria?', 3, 'geography'],
  ['How many boroughs make up New York City?', 5, 'geography'],
  ['How many emirates make up the United Arab Emirates?', 7, 'geography'],
  ['How many hills was ancient Rome famously built on?', 7, 'geography'],
  ['How many presidents\' faces are carved into Mount Rushmore?', 4, 'geography'],
  ['How many rays are on the crown of the Statue of Liberty?', 7, 'geography'],
  ['How many sides does the Pentagon building have?', 5, 'geography'],
  ['How many main pyramids stand at Giza?', 3, 'geography'],
  ['How many states make up Germany?', 16, 'geography'],
  ['How many cantons make up Switzerland?', 26, 'geography'],
  ['How many of the Great Lakes touch the state of Michigan?', 4, 'geography'],
  ['How many US states border Lake Michigan?', 4, 'geography'],
  ['How many US states border Lake Superior?', 3, 'geography'],
  ['How many countries share the summit of Mount Everest?', 2, 'geography'],
  ['How many countries share a land border with the United States?', 2, 'geography'],
  ['How many US states border Texas?', 4, 'geography'],
  ['How many US states border California?', 3, 'geography'],
  ['How many US states border Tennessee?', 8, 'geography'],
  ['How many US states border Florida?', 2, 'geography'],
  ['How many US states border Maine?', 1, 'geography'],

  // ── Myth & history ──
  ['How many labors did Hercules complete?', 12, 'history'],
  ['How many Olympian gods ruled from Mount Olympus in Greek myth?', 12, 'history'],
  ['How many Muses were there in Greek mythology?', 9, 'history'],
  ['How many legs does Odin\'s horse Sleipnir have?', 8, 'history'],
  ['How many heads does Cerberus traditionally have?', 3, 'history'],
  ['How many Wonders of the Ancient World were there?', 7, 'history'],
  ['How many astronauts flew on Apollo 11?', 3, 'history'],
  ['How many musketeers are in the title of the Alexandre Dumas novel?', 3, 'history'],

  // ── Animals & nature ──
  ['How many wings does a bee have?', 4, 'nature'],
  ['How many wings does a butterfly have?', 4, 'nature'],
  ['How many humps does a Bactrian camel have?', 2, 'nature'],
  ['How many toes does a typical house cat have in total?', 18, 'nature'],
  ['How many adult teeth does a dog have?', 42, 'nature'],
  ['How many adult teeth does a cat have?', 30, 'nature'],
  ['How many legs does a scorpion have?', 8, 'nature'],
  ['How many chambers does a fish heart have?', 2, 'nature'],
  ['How many sides does a honeycomb cell have?', 6, 'nature'],
  ['How many points (arms) does a snowflake have?', 6, 'nature'],
  ['How many neck vertebrae do humans have?', 7, 'science'],
  ['How many bones are in the human hand, including the wrist?', 27, 'science'],
  ['How many ribs does a human have in total?', 24, 'science'],
  ['How many lobes do a human\'s two lungs have in total?', 5, 'science'],
  ['How many tiny bones are in each human middle ear?', 3, 'science'],
  ['How many blood types are in the ABO system?', 4, 'science'],
  ['What is the pH of pure water at room temperature?', 7, 'science'],
  ['The everyday pH scale runs from 0 up to what number?', 14, 'science'],
  ['What position is Earth from the Sun?', 3, 'science'],
  ['What position is Mars from the Sun?', 4, 'science'],
  ['What position is Jupiter from the Sun?', 5, 'science'],
  ['What position is Saturn from the Sun?', 6, 'science'],
  ['What position is Uranus from the Sun?', 7, 'science'],
  ['What position is Neptune from the Sun?', 8, 'science'],
  ['How many planets in our solar system have rings?', 4, 'science'],
  ['How many moons does Earth have?', 1, 'science'],
  ['How many senses do humans traditionally have?', 5, 'science'],
];

let memo: NumberPrompt[] | null = null;

/** All generated prompts, deterministic order, ids = hash of text. */
export function generateNumberPrompts(): NumberPrompt[] {
  if (memo) return memo;
  const raw: Raw[] = [];
  const add = (text: string, answer: number, category: string) => raw.push([text, answer, category]);

  // Atomic numbers — only 20 well-known elements (dry lookups are capped; the
  // fun-fact table below carries the bulk of the bank).
  ELEMENTS.forEach((el, i) => {
    if (FAMOUS_ELEMENTS.has(el)) add(`What is the atomic number of ${el.toLowerCase()}?`, i + 1, 'science');
  });

  // Roman numerals — 20 picks
  for (const n of ROMAN_PICKS) add(`What number is the Roman numeral ${roman(n)}?`, n, 'math');

  // Alphabet positions — 12 mid-alphabet letters
  for (const L of LETTER_PICKS) add(`What position is the letter ${L} in the English alphabet?`, L.charCodeAt(0) - 64, 'math');

  // Days in two months combined (non-leap year) — 20 pairs
  for (const [a, b] of MONTH_PAIRS) {
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
  add('How many US state names end with the letter A?', US_STATES.filter((s) => s.endsWith('a')).length, 'geography');

  // Curated facts
  for (const row of FACTS) {
    const [q, a, c] = row.split('|');
    add(q, Number(a), c);
  }
  for (const [q, a, c] of FUN_FACTS) add(q, a, c);

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
