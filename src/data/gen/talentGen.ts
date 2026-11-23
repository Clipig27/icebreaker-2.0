// ─────────────────────────────────────────────────────────────────────────────
// Nobody's Got Talent — deterministic performance-prompt generator.
//
// Every template has its own slot tables. Each filler is written for that
// exact slot (articles and verb forms baked in), and the few fillers that
// don't fit every partner carry a tag that excludes the clashing combos, so
// every output reads naturally. No randomness here: generation is a pure
// cross-product in a fixed order; the screen does the (fresh) picking.
// Pure TS — no react-native imports (verification scripts run under Node).
// ─────────────────────────────────────────────────────────────────────────────

const L = (s: string) => s.split("|");

// "Act like {character} who just {situation}"
// Characters carry their own article. Any of these can comically react to any
// situation below, so the cross-product is fully compatible.
const CHARACTERS = L(
  "a pirate captain|a medieval knight|a cranky toddler|a sweet old grandma|a cowboy|a malfunctioning robot|a vampire|a superhero|a ballerina|a caveman|a wizard|a fancy French chef|an astronaut|a hard-boiled detective|a gym coach|a TV news anchor|a pop star|a ghost|an alien visiting Earth|a royal butler|a nervous intern|a lifeguard|a mad scientist|a ninja|a game-show host|a dramatic soap-opera star|a sleepy sloth|a strict librarian|a tour guide|a zombie"
);
const SITUATIONS = L(
  "won the lottery|stepped on a LEGO brick|saw snow for the first time|got a parking ticket|found out pizza exists|lost a staring contest|got stuck in a revolving door|smelled something terrible|missed the last bus home|saw a spider on the ceiling|got a terrible haircut|heard their favorite song come on|tasted a lemon for the first time|got promoted|forgot their own birthday|walked into a glass door|got a text from their ex|burned the toast|found a twenty in an old coat|got a paper cut|realized they're on live TV|sat on a whoopee cushion|got caught singing in the shower|lost their phone|was told a really bad joke|dropped their ice cream|met their hero|woke up late for something important"
);

// "Sell {object} like {seller}"
const SELL_OBJECTS = L(
  "a used toothbrush|a single sock|a broken umbrella|a rubber chicken|an invisible hat|a half-eaten sandwich|a rock you found outside|a very old banana|a spoon with a hole in it|a bag of air|a chair with three legs|a mystery box|a slightly haunted lamp|a pen that doesn't work|a cold cup of coffee|a puddle in a jar|a single shoelace|a doorknob|a wet towel|an empty water bottle|a sandwich made of ice|a pillow that's too flat"
);
const SELLERS = L(
  "a late-night infomercial host|a fast-talking auctioneer|a pushy used-car salesman|a nervous first-day salesperson|a luxury perfume commercial|a movie-trailer narrator|a street-market vendor|a whispering ASMR video|a sports commentator|a royal herald|an over-the-top game-show host|a tearful charity appeal|a museum tour guide"
);

// "Turn {activity} into {genre}"
const ACTIVITIES = L(
  "brushing your teeth|making toast|doing laundry|waiting for the bus|tying your shoes|parallel parking|ordering a coffee|folding a fitted sheet|taking out the trash|waking up on a Monday|looking for your keys|making a sandwich|watering a plant|unloading the dishwasher|answering an email|walking the dog|assembling flat-pack furniture|getting out of bed|putting on a tight pair of jeans|peeling a banana|vacuuming the living room|charging your phone|eating spaghetti|making the bed|stretching in the morning"
);
const GENRES = L(
  "an opera|a horror movie scene|a nature documentary|a soap-opera cliffhanger|a rap battle|a sports broadcast|a slow-motion action scene|a Broadway number|a breaking-news report|a silent film|an interpretive dance|a workout video|a courtroom drama|a fashion runway show|a magic act|a cooking-show segment"
);

// "Give {speech} about {topic}"
const SPEECHES = L(
  "a passionate TED talk|a wedding toast|a pre-game locker-room speech|a tearful farewell speech|a presidential victory speech|an award acceptance speech|an evil villain monologue|a eulogy|a motivational pep talk"
);
const TOPICS = L(
  "your favorite sandwich|socks|the snooze button|houseplants|the last slice of pizza|Wi-Fi passwords|rubber ducks|Mondays|the TV remote|leftovers|your left shoe|the color beige|bubble wrap|paper clips|traffic cones|your morning coffee|the microwave|a lost glove|cereal|elevator music|umbrellas|toast"
);

// "Do {performance + its own preposition} {subject}"
const IMPRESSION_KINDS = L(
  "a dramatic slow-motion reenactment of|a nature-documentary narration of|an interpretive dance about|a dramatic poem about|a sports-commentary play-by-play of"
);
const IMPRESSION_SUBJECTS = L(
  "a cat chasing a laser pointer|a squirrel crossing the road|a pigeon finding a french fry|your morning routine|a goldfish seeing its own reflection|a toddler refusing to eat broccoli|a dog meeting a vacuum cleaner|someone trying to catch a fly|a penguin learning to fly|a snail running late"
);

let memo: string[] | null = null;

/** All generated R1/R2 talent prompts, in a fixed deterministic order. */
export function generateTalentPrompts(): string[] {
  if (memo) return memo;
  const out: string[] = [];
  for (const c of CHARACTERS) for (const s of SITUATIONS) out.push(`Act like ${c} who just ${s}`);
  for (const o of SELL_OBJECTS) for (const s of SELLERS) out.push(`Sell ${o} like ${s}`);
  for (const a of ACTIVITIES) for (const g of GENRES) out.push(`Turn ${a} into ${g}`);
  for (const sp of SPEECHES) for (const t of TOPICS) out.push(`Give ${sp} about ${t}`);
  for (const k of IMPRESSION_KINDS) for (const s of IMPRESSION_SUBJECTS) out.push(`Do ${k} ${s}`);
  memo = out;
  return out;
}
