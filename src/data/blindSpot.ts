// ---------------------------------------------------------------------------
// Blind Spot -- Task Bank
// ---------------------------------------------------------------------------

export type BlindSpotTask = {
  text: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
};

export const BLIND_SPOT_TASKS: BlindSpotTask[] = [
  // ── Building ──────────────────────────────────────────────────────────
  { text: "Stack 5 cups into a pyramid", category: "building", difficulty: "easy" },
  { text: "Build a tower out of 3 books", category: "building", difficulty: "easy" },
  { text: "Stand a phone upright on a table using only household items", category: "building", difficulty: "medium" },
  { text: "Fold a piece of paper into a hat", category: "building", difficulty: "medium" },
  { text: "Fold a paper airplane", category: "building", difficulty: "medium" },
  { text: "Build a bridge between two cups using only paper", category: "building", difficulty: "hard" },
  { text: "Stack coins into a tower of at least 8", category: "building", difficulty: "medium" },
  { text: "Arrange 4 shoes in a perfect square", category: "building", difficulty: "easy" },
  { text: "Build a card house (at least 2 levels)", category: "building", difficulty: "hard" },
  { text: "Construct a fort out of pillows and blankets", category: "building", difficulty: "hard" },

  // ── Drawing ───────────────────────────────────────────────────────────
  { text: "Draw a smiley face on paper", category: "drawing", difficulty: "easy" },
  { text: "Draw a star with 5 points", category: "drawing", difficulty: "easy" },
  { text: "Draw a house with a door and 2 windows", category: "drawing", difficulty: "medium" },
  { text: "Write your name in bubble letters", category: "drawing", difficulty: "medium" },
  { text: "Draw a cat sitting down", category: "drawing", difficulty: "medium" },
  { text: "Draw a self-portrait", category: "drawing", difficulty: "hard" },
  { text: "Draw a flower with petals and a stem", category: "drawing", difficulty: "easy" },
  { text: "Draw a perfect circle freehand", category: "drawing", difficulty: "medium" },

  // ── Physical ──────────────────────────────────────────────────────────
  { text: "Walk to the nearest door and touch the handle", category: "physical", difficulty: "easy" },
  { text: "Pick up a specific object from the table", category: "physical", difficulty: "easy" },
  { text: "Pour water from a bottle into a cup without spilling", category: "physical", difficulty: "medium" },
  { text: "High-five a specific person in the room", category: "physical", difficulty: "easy" },
  { text: "Sit in a specific chair across the room", category: "physical", difficulty: "medium" },
  { text: "Put on a jacket and zip/button it up", category: "physical", difficulty: "medium" },
  { text: "Navigate to the light switch and flip it", category: "physical", difficulty: "easy" },
  { text: "Find and open a specific drawer", category: "physical", difficulty: "medium" },

  // ── Silly ─────────────────────────────────────────────────────────────
  { text: "Strike a specific yoga pose", category: "silly", difficulty: "easy" },
  { text: "Do a silly dance for 10 seconds", category: "silly", difficulty: "easy" },
  { text: "Style someone's hair into a new look", category: "silly", difficulty: "hard" },
  { text: "Mime making and eating a sandwich", category: "silly", difficulty: "medium" },
  { text: "Act out being a robot for 15 seconds", category: "silly", difficulty: "easy" },
  { text: "Tie someone else's shoelaces", category: "silly", difficulty: "hard" },
  { text: "Give someone a piggyback ride across the room", category: "silly", difficulty: "hard" },
  { text: "Do 5 jumping jacks in a specific spot", category: "silly", difficulty: "easy" },

  // ── Creative ──────────────────────────────────────────────────────────
  { text: "Arrange items on the table from smallest to largest", category: "creative", difficulty: "medium" },
  { text: "Sort a handful of coins by size", category: "creative", difficulty: "medium" },
  { text: "Make a face out of random objects on the table", category: "creative", difficulty: "hard" },
  { text: "Spell out a word using household items", category: "creative", difficulty: "hard" },
  { text: "Organize a shelf by color", category: "creative", difficulty: "hard" },
  { text: "Create a pattern using 3 different types of items", category: "creative", difficulty: "medium" },
  { text: "Wrap a gift using only paper and tape (no scissors)", category: "creative", difficulty: "hard" },
  { text: "Make a necklace out of paper clips", category: "creative", difficulty: "medium" },
  { text: "Build a smiley face out of snacks", category: "creative", difficulty: "easy" },
  { text: "Arrange everyone's phones in a circle on the table", category: "creative", difficulty: "easy" },
];
