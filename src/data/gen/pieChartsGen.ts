// ─────────────────────────────────────────────────────────────────────────────
// Pie Charts — deterministic "Who's most likely…" prompt generator.
//
// ACTIONS are bare verb phrases ("adopt three cats"), so they slot into any
// "to {vp}" / "would {vp}" frame grammatically. Tags (prefix):
//   (none) things that just happen to you  → generic frames only
//   v:     deliberate choices              → + "…without a second thought?"
//   w:     choices people daydream about   → + "…secretly love to…?"
//   s:     ongoing habits/traits           → no "first to" frame
// Pure TS, no react-native imports.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIONS = (
  "w:adopt three cats in one weekend|v:start a podcast nobody asked for|w:quit their job to travel the world|cry during a cartoon|w:eat a whole pizza alone|get lost using GPS|run a marathon on a whim|fall asleep at a party|w:dye their hair a wild color|w:join a reality TV show|w:open a food truck|v:learn a language just to impress someone|forget where they parked|sing karaoke without being asked|laugh at the worst possible moment|v:befriend a stranger on a train|v:buy something useless at 2 a.m.|w:move to a tiny island|w:write a novel|w:get a matching tattoo with a friend|show up two hours early|show up two hours late|v:plan a surprise party|accidentally ruin a surprise party|w:enter a hot-dog-eating contest|w:climb a mountain|trip over nothing|v:take a selfie with a celebrity|be mistaken for a celebrity|v:volunteer to give a speech|s:keep a secret for ten years|spill a secret within ten minutes|v:try every flavor at an ice-cream shop|send a text to the wrong group chat|w:start a dance-off in public|v:organize the group trip|w:skydive on their birthday|v:build their own furniture|w:grow all their own vegetables|w:invent something genius|win a game show|w:binge a whole series in one night|w:wear pajamas to the grocery store|v:argue with a referee|talk their way out of a speeding ticket|get locked out of their own house|v:rescue a lost puppy|v:eat cereal for dinner|v:read the terms and conditions|change their mind three times when ordering|s:return a shopping cart every single time|v:reply to emails within a minute|leave a message on read for a week|w:color-code their closet|v:wake up at 5 a.m. on purpose|sleep through three alarms|v:bake a cake from scratch|set off the smoke alarm while cooking|s:pet every dog they see|v:talk to their plants|v:name their car|w:collect something unusual|v:haggle at a fancy store|v:wear socks with sandals|v:make friends with the waiter|w:learn to juggle|v:try a food they can't pronounce|v:start a group chat at midnight|w:become a stand-up comedian|w:host a dinner party for twenty|w:knit a sweater for their pet|w:go camping without a tent|w:ride a roller coaster ten times in a row|scream on a kiddie ride|s:know all the words to every song|hum during an exam|v:hide snacks in their bag|v:share their fries|v:refuse to share their fries|w:start a book club|v:finish a puzzle in one sitting|lose their phone twice in one day|v:fix the Wi-Fi for everyone|s:give the best advice|s:give the worst advice|w:dance at a wedding until closing|v:take charge in an emergency|panic in an emergency|s:quote movies all day|win an argument with a lawyer|v:convince everyone to order dessert|v:propose on a jumbotron|w:sleep in a hammock for a week|w:live without their phone for a month|w:run for mayor|w:make a viral dance video|w:get a pet snake|v:jump into a cold lake|v:try to pet a goose|get chased by a goose|v:eat the spiciest wing on the menu|v:wear a costume to a non-costume party|v:say yes to every invitation|cancel plans at the last minute|w:own fifty houseplants|v:plan a trip down to the minute|w:book a last-minute flight abroad|v:learn magic tricks to impress a date|w:write a song about their friends|w:take up ballroom dancing|w:become a professional gamer|v:walk barefoot in the city|s:talk to animals like they're people|w:make up their own holiday|v:make pancakes at midnight|s:watch the same movie a hundred times|w:start a business from their bedroom|v:write a strongly worded letter|v:send back food at a restaurant|apologize to a piece of furniture|v:bring a guitar to a party|w:organize a flash mob|v:wear sunglasses indoors|w:go on a blind date|w:try every sushi roll on the menu|v:cut their own hair|v:paint their whole room in one night|v:race a stranger to a parking spot|v:clap when the plane lands|cry at a wedding|cry at a commercial|v:make a spreadsheet for fun|memorize a whole map|befriend a cat in a new city|go viral for a cooking fail|w:join a circus|w:sleep under the stars|w:sell everything and live in a van|w:compete on a baking show|v:teach a grandparent to use emojis|w:run a bed and breakfast|v:give a stranger a compliment|s:keep a diary for twenty years|w:start a garden on a balcony|win a staring contest|lose a staring contest|w:learn to surf at fifty|w:host a talk show|w:write a cookbook|w:build a treehouse|w:adopt a retired racehorse|w:try out for the Olympics|v:pay for everyone's dinner|v:pull an all-nighter for fun|s:make the group chat's best memes"
).split("|");

const ALL_FRAMES = [
  (vp: string) => `Who is most likely to ${vp}?`,
  (vp: string) => `Who is least likely to ${vp}?`,
  (vp: string) => `Who would be the first to ${vp}?`,
];
const CHOICE_FRAME = (vp: string) => `Who would ${vp} without a second thought?`;
const WISH_FRAME = (vp: string) => `Who would secretly love to ${vp}?`;

let memo: string[] | null = null;

/** All generated prompt texts, in a fixed deterministic order. */
export function generatePieChartTexts(): string[] {
  if (memo) return memo;
  const out: string[] = [];
  for (const raw of ACTIONS) {
    const tag = raw[1] === ":" ? raw[0] : "";
    const vp = tag ? raw.slice(2) : raw;
    // Habits/traits ("s:") don't have a "first to" moment.
    for (const f of tag === "s" ? ALL_FRAMES.slice(0, 2) : ALL_FRAMES) out.push(f(vp));
    if (tag === "v" || tag === "w") out.push(CHOICE_FRAME(vp));
    if (tag === "w") out.push(WISH_FRAME(vp));
  }
  memo = out;
  return out;
}
