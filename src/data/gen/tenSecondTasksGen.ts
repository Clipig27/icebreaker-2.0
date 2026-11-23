// ─────────────────────────────────────────────────────────────────────────────
// 10 Second Tasks — deterministic task generator.
//
// Every template only combines fillers that are explicitly compatible:
//  • balance tasks pair each everyday object with the body parts it can
//    sensibly sit on (size class S/M/L ↔ allowed classes per body part),
//  • rep counts are capped per exercise so they fit in ~10 seconds,
//  • everything uses things found in any room (or nothing at all) and is safe
//    to do standing in a living room. No throwing of hard objects.
// Output matches the existing Task shape. Pure TS, no react-native imports.
// ─────────────────────────────────────────────────────────────────────────────

import type { Task } from '../tenSecondTasks';
import { hashString } from '../../utils/deck';

const L = (s: string) => s.split('|');

// Balance: object|size class (S = small/light, M = medium, L = large but soft/light)
const BALANCE_OBJECTS = L('a shoe:M|a pillow:L|a book:M|a spoon:S|a pen:S|a TV remote:S|a sock:S|a plastic cup:S|a cushion:L|a folded towel:M|a paperback:M|a coaster:S|a hat:M');
// body part : allowed size classes
const BALANCE_PARTS = L('your head:SML|the back of your hand:SM|your shoulder:SM|one foot while standing on the other:SM|your forearm:SM|your knee while sitting:SML');

// Exercises: name|max reps doable in ~10s
const EXERCISES = L('jumping jacks:10|squats:8|lunges:6|toe touches:8|star jumps:6|calf raises:10|arm circles:10|high knees:10|sit-ups:6|push-ups:5|knee hugs:6|side steps:10|tuck jumps:4|wall push-ups:8');
const REPS = [3, 5, 8, 10];

const TOUCH_KINDS = L('blue things|red things|things made of wood|things made of metal|soft things|round things|things with writing on them|square things|green things|things with a plug|things made of fabric|black things|white things|things with buttons');
const TOUCH_COUNTS = [2, 3, 4];

const FIND_THINGS = L('something yellow|something smaller than your thumb|something that starts with the letter S|something that starts with the letter B|something that starts with the letter C|something that starts with the letter P|something soft|something shiny|something with a zipper|something that makes a noise|something striped|something older than you|something you can fold|something with a logo on it|something purple|something heart-shaped|something made of paper|something with numbers on it|something that smells nice|something orange|something that bends|something with a lid|something see-through|something fuzzy|something that floats');

const NAME_CATEGORIES = L('fruits|vegetables|animals that live in the ocean|countries in Europe|colors|pizza toppings|car brands|dog breeds|breakfast foods|things in a kitchen|sports with a ball|words that rhyme with "cat"|words that rhyme with "day"|cartoon characters|board games|ice-cream flavors|musical instruments|things that are cold|zoo animals|types of shoes|cities in the USA|things you find at the beach|farm animals|types of weather|desserts|things that fly|insects|body parts above the neck|school subjects|kinds of trees|planets|types of cheese|jobs with uniforms|things in a bathroom|things that are sticky');

const ONE_LEG_ACTIONS = L('touch your nose with each hand|pat your head|clap 5 times|count to 10 out loud|spin around once|wave with both hands|close your eyes|do 3 arm circles|touch your toes|sing one line of a song|reach for the ceiling|say the days of the week');

const WALK_LIKE = L('a penguin|a crab|a flamingo|a gorilla|a chicken|a kangaroo|a duck|a cat|a frog|an elephant|a robot|a runway model|a zombie|a ninja|a toddler|a cowboy|a sloth|a T. rex|a tightrope walker|a spy|a bodybuilder|someone walking on ice|someone in high heels for the first time|an astronaut on the Moon|a soldier on parade');
const WALK_PATHS = L('across the room|in a small circle');

// Sounds: text|loud?
const SOUNDS = L('a car alarm:1|a dolphin:0|a creaky door:0|a dial-up modem:0|a rooster:1|a fire truck siren:1|a cat purring:0|a horse:0|a sheep:0|a cow:0|an owl:0|a ticking clock:0|a popcorn machine:0|a race car:1|a steam train:1|a monkey:1|a duck:0|a goat:0|a squeaky toy:0|a motorbike starting:1|a microwave beeping:0|a phone ringing:0|a drum solo:1|a sports-stadium crowd:1|a dog that wants a treat:0|a seagull:1|a turkey:0|an elephant:1|a bubbling pot:0|an old computer starting up:0');

const FACES = L('surprised|disgusted|suspicious|terrified|confused|smug|heartbroken|furious|sleepy|starstruck|guilty|bored|overjoyed|nervous|proud|innocent');
const FACE_REASONS = L('you just tasted a lemon|you smelled old cheese|you saw a ghost|you won a prize|you stepped in something wet|you forgot someone\'s name|you\'re trying not to laugh|you heard a terrible joke|you just woke up|you saw your crush|someone ate your leftovers|your phone hit 1% battery');

const AIR_SHAPES = L('a circle|a star|a figure eight|a heart|your initials|a triangle|a spiral|a smiley face|a house|the number 7|a square|a lightning bolt');
const AIR_PARTS = L('your elbow|your nose|your foot|your hip|your knee|your chin|your pinky|your head');

const WIGGLE = L('ears:face|nose:face|eyebrows:face|toes:physical|hips:movement|shoulders:movement|fingers:physical|belly:movement|lips:face|cheeks:face');

const HOLDS = L('a plank|a wall sit|tree pose|airplane pose (arms out, one leg back)|a superman pose on the floor|a squat|a side plank|a glute bridge on the floor|a frog pose|a lunge');

const PASS_OBJECTS = L('a pillow|a sock|a shoe|a book|a TV remote|a cushion|a folded towel');
const PASS_AROUND = L('your waist|your head|one knee');
const PASS_TIMES = [3, 5];

const TOSS_OBJECTS = L('a rolled-up sock|a pillow|a scrunched-up piece of paper|a cushion');
const TOSS_CLAPS = [1, 2, 3];

const MULTI = L('pat your head and rub your belly|rub your belly and pat your head|tap your foot and snap your fingers|march on the spot and clap');
const MULTI_WHILE = L('counting to 10|saying the alphabet|humming a tune|saying your full name');

let memo: Task[] | null = null;

/** All generated tasks, deterministic order; ids are a hash of the text. */
export function generateTasks(): Task[] {
  if (memo) return memo;
  const out: Task[] = [];
  const add = (text: string, tags: string[], flags: string[] = []) =>
    out.push({ id: 'tg_' + hashString(text).toString(36), text, tags, flags });

  for (const o of BALANCE_OBJECTS) {
    const [obj, size] = o.split(':');
    for (const p of BALANCE_PARTS) {
      const [part, allowed] = p.split(':');
      if (allowed.includes(size)) add(`Balance ${obj} on ${part} for 5 seconds`, ['physical']);
    }
  }
  for (const e of EXERCISES) {
    const [name, max] = e.split(':');
    for (const n of REPS) if (n <= Number(max)) add(`Do ${n} ${name}`, ['physical']);
  }
  for (const k of TOUCH_KINDS) for (const n of TOUCH_COUNTS) add(`Touch ${n} different ${k} in the room`, ['movement']);
  for (const t of FIND_THINGS) add(`Find ${t} and hold it up`, ['movement']);
  for (const c of NAME_CATEGORIES) add(`Name 5 ${c} out loud`, ['audio']);
  for (const a of ONE_LEG_ACTIONS) add(`Stand on one leg and ${a}`, ['physical']);
  for (const w of WALK_LIKE) for (const p of WALK_PATHS) add(`Walk ${p} like ${w}`, ['movement']);
  for (const s of SOUNDS) {
    const [snd, loud] = s.split(':');
    add(`Make the sound of ${snd}`, ['audio'], loud === '1' ? ['loud'] : []);
  }
  for (const f of FACES) add(`Make your most ${f} face and hold it`, ['face']);
  for (const r of FACE_REASONS) add(`Make the face you'd make if ${r}`, ['face']);
  for (const s of AIR_SHAPES) for (const p of AIR_PARTS) add(`Draw ${s} in the air with ${p}`, ['movement']);
  for (const w of WIGGLE) {
    const [part, tag] = w.split(':');
    add(`Wiggle your ${part} without moving anything else`, [tag]);
  }
  for (const h of HOLDS) add(`Hold ${h} for 8 seconds`, ['physical']);
  for (const o of PASS_OBJECTS) for (const a of PASS_AROUND) for (const n of PASS_TIMES) add(`Pass ${o} around ${a} ${n} times`, ['physical']);
  for (const o of TOSS_OBJECTS)
    for (const n of TOSS_CLAPS) add(`Toss ${o} up and clap ${n === 1 ? 'once' : n + ' times'} before catching it`, ['physical']);
  for (const m of MULTI) for (const w of MULTI_WHILE) add(`${m[0].toUpperCase()}${m.slice(1)} while ${w}`, ['physical', 'audio']);

  memo = out;
  return out;
}
