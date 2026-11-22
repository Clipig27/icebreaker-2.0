import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import HostWaitingPill from "../../src/components/HostWaitingPill";
import GameHeader from "../../src/components/GameHeader";
import { competitionRanks } from "../../src/utils/rank";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "intro" | "setup" | "playing" | "reveal" | "voting" | "vote-results" | "game-over";

type GameState = {
  phase: Phase;
  game: "blindRanking";
  categoryKey: string;
  categoryLabel: string;
  categoryEmoji: string;
  size: 5 | 10;
  draw: string[]; // items in display order
  currentRound: number; // 0-indexed, which item is being placed
  placements: Record<string, (string | null)[]>; // userId -> slot array
  roundSubmitted: string[]; // who has placed for current round
  rankings: Record<string, string[]>;
  // Voting
  votes: Record<string, string>; // voterId -> voteeId (whose list they liked best)
  votedPlayerIds: string[];
  // Series
  totalGames: number;
  currentGame: number; // 1-indexed
  brScores: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCENT = "#e8927c";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ---------------------------------------------------------------------------
// Banks (18 categories, 50 items each)
// ---------------------------------------------------------------------------

const BANKS: Record<string, { label: string; emoji: string; items: string[] }> = {
  artists: { label: "Legendary pop artists", emoji: "\u2605", items: ["Michael Jackson","Madonna","Prince","Whitney Houston","Beyonce","Mariah Carey","Elton John","David Bowie","Stevie Wonder","Freddie Mercury","Lady Gaga","Rihanna","Adele","Bruno Mars","Taylor Swift","Janet Jackson","George Michael","Tina Turner","Cher","Diana Ross","Britney Spears","Justin Timberlake","Usher","Katy Perry","Christina Aguilera","Elvis Presley","The Beatles","Stevie Nicks","Dolly Parton","Lionel Richie","Phil Collins","Billy Joel","Paul McCartney","Donna Summer","Aretha Franklin","Marvin Gaye","Sade","Annie Lennox","Kate Bush","Robbie Williams","Shakira","Celine Dion","Barbra Streisand","Gloria Estefan","Sting","Boy George","Cyndi Lauper","Lenny Kravitz","Seal","Sam Smith"] },
  sports: { label: "Sports to watch live", emoji: "\u25C8", items: ["Soccer","Basketball","American Football","Tennis","Boxing","MMA","Baseball","Ice Hockey","Formula 1","Golf","Cricket","Rugby","Volleyball","Table Tennis","Badminton","Swimming","Track & Field","Gymnastics","Figure Skating","Skiing","Snowboarding","Surfing","Skateboarding","Cycling","Marathon","Wrestling","Fencing","Archery","Rowing","Sailing","Horse Racing","Darts","Snooker","Bowling","Climbing","Beach Volleyball","Handball","Water Polo","Diving","Curling","Lacrosse","Field Hockey","Sumo","Polo","Squash","Triathlon","Motocross","Drag Racing","Esports","Bull Riding"] },
  fastfood: { label: "Fast food items", emoji: "\u25A3", items: ["Big Mac","Chicken nuggets","French fries","Whopper","Chicken sandwich","Cheeseburger","Tacos","Burrito","Pizza slice","Hot dog","Onion rings","Mozzarella sticks","Chicken wings","Quesadilla","Fish sandwich","Milkshake","Soft serve cone","Apple pie","Curly fries","Loaded nachos","Spicy chicken sandwich","Double cheeseburger","Bacon burger","Chili cheese fries","Breakfast burrito","Hash browns","Egg McMuffin","Pancakes","Waffle fries","Crispy chicken tenders","Sliders","Corn dog","Cheese pizza","Pepperoni pizza","Garlic bread","Cinnamon rolls","Donuts","Frozen lemonade","Iced coffee","Sweet tea","Coleslaw","Mac and cheese","Mashed potatoes","Biscuits","Jalapeno poppers","Cheese curds","Poutine","Churros","Soft pretzel","Fountain soda"] },
  movies: { label: "Movies to rewatch forever", emoji: "\u25B6", items: ["The Godfather","Pulp Fiction","The Dark Knight","Forrest Gump","Inception","The Matrix","Goodfellas","Fight Club","Shawshank Redemption","Interstellar","Gladiator","Titanic","Jurassic Park","Back to the Future","Star Wars","Lord of the Rings","Harry Potter","The Lion King","Toy Story","Finding Nemo","Avengers","Spider-Man","Joker","Parasite","Whiplash","La La Land","The Departed","Django Unchained","Inglourious Basterds","No Country for Old Men","Mad Max: Fury Road","Blade Runner","Alien","The Shining","Jaws","Rocky","Die Hard","Terminator 2","The Truman Show","Eternal Sunshine","Good Will Hunting","Catch Me If You Can","The Wolf of Wall Street","Scarface","Casino","Heat","Se7en","The Silence of the Lambs","Saving Private Ryan","Schindlers List"] },
  travel: { label: "Dream travel destinations", emoji: "\u2708", items: ["Tokyo","Paris","Rome","New York","Bali","Santorini","Maldives","Iceland","Kyoto","Barcelona","London","Dubai","Sydney","Cape Town","Rio de Janeiro","Bangkok","Amsterdam","Venice","Prague","Marrakech","Istanbul","Singapore","Hawaii","Swiss Alps","Patagonia","Banff","Machu Picchu","Petra","Great Barrier Reef","Serengeti","Norwegian Fjords","Grand Canyon","Vienna","Lisbon","Seoul","Hong Kong","Queenstown","Reykjavik","Florence","Dubrovnik","Phuket","Maui","Tuscany","Greek Islands","Costa Rica","New Zealand","Scotland Highlands","Kenya Safari","Antarctica","Galapagos"] },
  snacks: { label: "Best snacks of all time", emoji: "\u25C9", items: ["Doritos","Cheetos","Pringles","Oreos","Lays chips","Goldfish","Pretzels","Popcorn","Trail mix","Cheez-Its","Ruffles","Takis","Sour Patch Kids","Skittles","M&Ms","Reeses","Kit Kat","Snickers","Twix","Gummy bears","Beef jerky","String cheese","Granola bars","Fruit snacks","Pop-Tarts","Rice Krispies Treats","Chips Ahoy","Nutter Butters","Animal crackers","Saltines","Ritz crackers","Wheat Thins","Triscuits","Veggie straws","Pita chips","Hummus","Guacamole","Salsa","Nachos","Ice cream sandwich","Push pop","Fruit Roll-Ups","Dunkaroos","Combos","Bugles","Funyuns","Sun Chips","Tostitos","Chex Mix","Hot Fries"] },
  superpowers: { label: "Superpowers to have", emoji: "\u26A1", items: ["Flight","Invisibility","Super strength","Telepathy","Teleportation","Time travel","Mind reading","Super speed","Healing factor","Telekinesis","Shapeshifting","Immortality","X-ray vision","Invulnerability","Elemental control","Fire control","Ice control","Weather control","Force fields","Phasing through walls","Duplication","Size changing","Animal communication","Plant control","Electricity control","Magnetism","Gravity control","Dream walking","Memory manipulation","Luck manipulation","Probability control","Super intelligence","Photographic memory","Night vision","Echolocation","Underwater breathing","Regeneration","Energy blasts","Sound manipulation","Light manipulation","Portal creation","Astral projection","Empathy","Precognition","Mind control","Technopathy","Super agility","Wall-crawling","Density control","Time stop"] },
  pizzas: { label: "Pizza toppings", emoji: "\u25B2", items: ["Pepperoni","Mushroom","Sausage","Extra cheese","Bacon","Onion","Green pepper","Black olives","Pineapple","Ham","Jalapeno","Spinach","Tomato","Garlic","Basil","Anchovies","Chicken","Ground beef","Salami","Prosciutto","Artichoke","Sun-dried tomato","Feta","Goat cheese","Ricotta","Arugula","Red onion","Banana pepper","Pesto drizzle","Hot honey","Buffalo chicken","BBQ chicken","Meatball","Capicola","Pancetta","Roasted red pepper","Caramelized onion","Truffle oil","Fresh mozzarella","Parmesan","Cheddar","Corn","Egg","Shrimp","Clams","Eggplant","Zucchini","Pickles","Pulled pork","Chili flakes"] },
  candy: { label: "Candy & chocolate", emoji: "\u2726", items: ["Reeses Cups","Snickers","Kit Kat","Twix","M&Ms","Hersheys bar","Milky Way","3 Musketeers","Butterfinger","Skittles","Starburst","Sour Patch Kids","Swedish Fish","Gummy bears","Haribo","Sour Worms","Jolly Ranchers","Twizzlers","Red Vines","Nerds","Warheads","Airheads","Laffy Taffy","Tootsie Roll","Werthers","Lindt truffles","Ferrero Rocher","Toblerone","Kinder Bueno","Crunch bar","100 Grand","Almond Joy","Mounds","Whoppers","Junior Mints","Milk Duds","Hot Tamales","Mike and Ike","Dots","Now and Later","Pixy Stix","Pop Rocks","Ring Pop","Push Pop","Candy corn","Peeps","Cadbury Egg","York Peppermint","Andes Mints","Reeses Pieces"] },
  hobbies: { label: "Hobbies to pick up", emoji: "\u273F", items: ["Photography","Painting","Cooking","Baking","Gardening","Hiking","Rock climbing","Yoga","Meditation","Reading","Writing","Playing guitar","Playing piano","Singing","Dancing","Pottery","Knitting","Woodworking","Calligraphy","Drawing","Chess","Video games","Board games","Cycling","Running","Swimming","Surfing","Skateboarding","Skiing","Fishing","Camping","Birdwatching","Astronomy","Coding","3D printing","Drone flying","Podcasting","DJing","Music production","Film making","Journaling","Scrapbooking","Coin collecting","Wine tasting","Coffee roasting","Home brewing","Bonsai","Origami","Magic tricks","Stand-up comedy"] },
};

const BANK_KEYS = Object.keys(BANKS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Custom categories
// ---------------------------------------------------------------------------

type CustomCategory = { id: string; label: string; items: string[] };
const CUSTOM_CATEGORIES_KEY = "br_custom_categories";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BlindRankingScreen() {
  const router = useRouter();
  const { room, players, isHost, mutateGameState, endGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const gs: GameState | null = room?.game_state ?? null;
  const phase = gs?.phase ?? null;
  const myId = user?.id ?? "";

  // Local setup state (host only)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<5 | 10 | null>(null);
  const [hasPlacedThisRound, setHasPlacedThisRound] = useState(false);
  const [myVote, setMyVote] = useState<string | null>(null);

  // Custom categories (persisted locally)
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [showCustomEditor, setShowCustomEditor] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CustomCategory | null>(null);
  const [customName, setCustomName] = useState("");
  const [customItems, setCustomItems] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(CUSTOM_CATEGORIES_KEY).then((raw) => {
      if (raw) setCustomCategories(JSON.parse(raw));
    }).catch(() => {});
  }, []);

  const saveCustomCategory = async () => {
    const items = customItems.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!customName.trim() || items.length < 5) return;
    let next: CustomCategory[];
    if (editingCategory) {
      next = customCategories.map((c) =>
        c.id === editingCategory.id ? { ...c, label: customName.trim(), items } : c
      );
    } else {
      const cat: CustomCategory = { id: `c${Date.now()}`, label: customName.trim(), items };
      next = [...customCategories, cat];
    }
    setCustomCategories(next);
    await AsyncStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(next));
    setCustomName("");
    setCustomItems("");
    setEditingCategory(null);
    setShowCustomEditor(false);
  };

  const deleteCustomCategory = async (id: string) => {
    Alert.alert("Delete Category", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const next = customCategories.filter((c) => c.id !== id);
          setCustomCategories(next);
          await AsyncStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(next));
        },
      },
    ]);
  };

  const startEditCategory = (cat: CustomCategory) => {
    setEditingCategory(cat);
    setCustomName(cat.label);
    setCustomItems(cat.items.join("\n"));
    setShowCustomEditor(true);
  };

  // Reset placed flag when round advances
  useEffect(() => {
    if (!gs || gs.phase !== "playing") return;
    setHasPlacedThisRound((gs.roundSubmitted ?? []).includes(myId));
  }, [gs?.currentRound, gs?.roundSubmitted?.length, gs?.phase]);

  // Reset vote when phase changes
  useEffect(() => {
    if (gs?.phase !== "voting") setMyVote(null);
  }, [gs?.phase]);

  // Host: initialise game on mount
  useEffect(() => {
    if (!isHost || !room) return;
    if (gs && gs.game === "blindRanking" && gs.phase && (gs.phase as string) !== "starting") return;

    const initialState: GameState = {
      phase: "intro",
      game: "blindRanking",
      categoryKey: "",
      categoryLabel: "",
      categoryEmoji: "",
      size: 5,
      draw: [],
      currentRound: 0,
      placements: {},
      roundSubmitted: [],
      rankings: {},
      votes: {},
      votedPlayerIds: [],
      totalGames: 1,
      currentGame: 1,
      brScores: Object.fromEntries(players.map((p) => [p.user_id, 0])),
    };
    mutateGameState((cur) => {
      if (cur?.phase && cur.phase !== "starting") return null;
      return initialState;
    });
  }, [isHost, room?.id]);

  // Navigate away if room returns to lobby
  const navigatedBackRef = useRef(false);
  useEffect(() => {
    if (navigatedBackRef.current) return;
    if (room?.status === "lobby" || room?.status === "finished") {
      navigatedBackRef.current = true;
      if (router.canGoBack()) router.back();
      else router.replace("/lobby");
    }
  }, [room?.status]);

  // Only players still in the room count (a leaver's submission is ignored).
  const countInRoom = (ids: string[] | undefined) =>
    (ids ?? []).filter((id) => players.some((p) => p.user_id === id)).length;

  // Host: auto-advance round when all placed
  useEffect(() => {
    if (!isHost || phase !== "playing" || !gs) return;
    const totalPlayers = players.length;
    const totalSubmitted = countInRoom(gs.roundSubmitted);
    if (totalPlayers > 0 && totalSubmitted >= totalPlayers) {
      // All placed for this round — advance
      if (gs.currentRound >= gs.size - 1) {
        // Last item placed — go to reveal
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "playing") return null;
          if (countInRoom(cur.roundSubmitted) < totalPlayers) return null;
          return { ...cur, phase: "reveal" as Phase };
        });
      } else {
        // Next item
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "playing") return null;
          if (countInRoom(cur.roundSubmitted) < totalPlayers) return null;
          return { ...cur, currentRound: cur.currentRound + 1, roundSubmitted: [] };
        });
      }
    }
  }, [gs?.roundSubmitted?.length, players, phase, isHost, gs?.currentRound]);

  // Host: auto-advance voting when all voted
  useEffect(() => {
    if (!isHost || phase !== "voting" || !gs) return;
    const totalPlayers = players.length;
    const totalVoted = countInRoom(gs.votedPlayerIds);
    if (totalPlayers > 0 && totalVoted >= totalPlayers) {
      // Tally votes
      mutateGameState((cur) => {
        if (!cur || cur.phase !== "voting") return null;
        if (countInRoom(cur.votedPlayerIds) < totalPlayers) return null;
        // Find winner(s) of this round's vote
        const voteCounts: Record<string, number> = {};
        for (const voteeId of Object.values(cur.votes ?? {})) {
          voteCounts[voteeId] = (voteCounts[voteeId] ?? 0) + 1;
        }
        const maxVotes = Math.max(...Object.values(voteCounts), 0);
        const roundWinners = Object.entries(voteCounts).filter(([_, c]) => c === maxVotes).map(([id]) => id);
        // Award points
        const newScores = { ...(cur.brScores ?? {}) };
        for (const wid of roundWinners) {
          newScores[wid] = (newScores[wid] ?? 0) + 1;
        }
        return { ...cur, phase: "vote-results" as Phase, brScores: newScores };
      });
    }
  }, [gs?.votedPlayerIds?.length, players, phase, isHost]);

  // Derived
  const playerMap: Record<string, { username: string }> = {};
  players.forEach((p) => {
    playerMap[p.user_id] = { username: p.username };
  });

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const startFromIntro = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "intro") return null;
      return { ...cur, phase: "setup" as Phase };
    });
  }, [mutateGameState]);

  const launchGame = useCallback(async (totalGames: number, currentGame: number, sizeOverride?: number) => {
    const size = sizeOverride ?? selectedSize;
    if (!selectedCategory || !size) return;
    const isCustom = selectedCategory.startsWith("custom:");
    let pool: string[], label: string, emoji: string;
    if (isCustom) {
      const cat = customCategories.find((c) => c.id === selectedCategory.replace("custom:", ""));
      if (!cat || cat.items.length < size) return;
      pool = cat.items; label = cat.label; emoji = "\u270E";
    } else {
      const bank = BANKS[selectedCategory];
      if (!bank || bank.items.length < size) return;
      pool = bank.items; label = bank.label; emoji = bank.emoji;
    }
    const draw = shuffle(pool).slice(0, size);
    const placements: Record<string, (string | null)[]> = {};
    for (const p of players) {
      placements[p.user_id] = new Array(size).fill(null);
    }
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "setup") return null;
      return {
        ...cur,
        phase: "playing" as Phase,
        categoryKey: selectedCategory,
        categoryLabel: label,
        categoryEmoji: emoji,
        size,
        draw,
        currentRound: 0,
        placements,
        roundSubmitted: [],
        rankings: {},
        votes: {},
        votedPlayerIds: [],
        // Rounds are picked once (game 1); later games keep the series length.
        totalGames: currentGame > 1 ? cur.totalGames : totalGames,
        currentGame,
      };
    });
  }, [selectedCategory, selectedSize, players, customCategories, mutateGameState]);

  const handlePlaceItem = useCallback(async (slotIndex: number) => {
    if (!gs || gs.phase !== "playing" || hasPlacedThisRound) return;
    const currentItem = gs.draw[gs.currentRound];
    if (!currentItem) return;
    const mySlots = gs.placements?.[myId];
    if (!mySlots || mySlots[slotIndex] !== null) return;

    setHasPlacedThisRound(true);
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "playing") return null;
      if ((cur.roundSubmitted ?? []).includes(myId)) return null;
      const item = cur.draw[cur.currentRound];
      const curSlots = cur.placements?.[myId];
      if (!curSlots || curSlots[slotIndex] !== null) return null;
      const newSlots = [...curSlots];
      newSlots[slotIndex] = item;
      return {
        ...cur,
        placements: { ...cur.placements, [myId]: newSlots },
        roundSubmitted: [...(cur.roundSubmitted ?? []), myId],
      };
    });
  }, [gs, myId, hasPlacedThisRound, mutateGameState]);

  const advanceToVoting = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "reveal") return null;
      return { ...cur, phase: "voting" as Phase, votes: {}, votedPlayerIds: [] };
    });
  }, [mutateGameState]);

  const handleVote = useCallback(async (voteeId: string) => {
    if (!gs || myVote) return;
    setMyVote(voteeId);
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "voting") return null;
      if ((cur.votedPlayerIds ?? []).includes(myId)) return null;
      return {
        ...cur,
        votes: { ...(cur.votes ?? {}), [myId]: voteeId },
        votedPlayerIds: [...(cur.votedPlayerIds ?? []), myId],
      };
    });
  }, [gs, myId, myVote, mutateGameState]);

  const handleNextGameOrEnd = useCallback(async () => {
    if (!gs) return;
    if (gs.currentGame >= gs.totalGames) {
      // Series over
      await mutateGameState((cur) => {
        if (!cur) return null;
        return { ...cur, phase: "game-over" as Phase };
      });
    } else {
      // Next game in series — go back to setup
      setSelectedCategory(null);
      setSelectedSize(null);
      await mutateGameState((cur) => {
        if (!cur) return null;
        return { ...cur, phase: "setup" as Phase, currentGame: cur.currentGame + 1 };
      });
    }
  }, [gs, mutateGameState]);

  const handleBackToLobby = useCallback(async () => {
    await endGame();
  }, [endGame]);

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (!gs || (gs.game as string) !== "blindRanking" || !phase || (phase as string) === "starting") {
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <View style={st.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={st.loadingText}>Setting up the game...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // === INTRO ===
  if (phase === "intro") {
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.introScroll}>
          <Text style={st.bigEmoji}>{"\u2263"}</Text>
          <Text style={st.title}>Blind Ranking</Text>
          <Text style={st.tagline}>Rank items blind {"\u2014"} lock each one in as it appears. No take-backs.</Text>
          <View style={st.rulesBox}>
            {[
              ["\uD83C\uDFB2", "Items from a category appear one at a time in random order."],
              ["\uD83D\uDCCC", "Place each item into a rank slot. Once placed, it's locked."],
              ["\uD83D\uDC40", "You can't see what's coming next \u2014 trust your gut!"],
              ["\uD83D\uDCCA", "After everyone finishes, rankings are compared side-by-side."],
            ].map(([icon, text], i) => (
              <View key={i} style={st.ruleCard}>
                <Text style={st.ruleText}>{icon}  {text}</Text>
              </View>
            ))}
          </View>
          {isHost ? (
            <TouchableOpacity style={st.primaryBtn} onPress={startFromIntro}>
              <Text style={st.primaryBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <Text style={st.wait}>Waiting for host to start...</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === SETUP ===
  if (phase === "setup") {
    if (!isHost) {
      return (
        <SafeAreaView style={st.container}><GameHeader />
          <View style={st.centered}>
            <Text style={st.bigEmoji}>{"\u2263"}</Text>
            <Text style={st.title}>Blind Ranking</Text>
            <Text style={st.wait}>Host is choosing the category and size.</Text>
          </View>
        </SafeAreaView>
      );
    }

    // Custom category editor
    if (showCustomEditor) {
      const itemCount = customItems.split("\n").map((s) => s.trim()).filter(Boolean).length;
      const canSave = customName.trim().length > 0 && itemCount >= 5;
      return (
        <SafeAreaView style={st.container}><GameHeader />
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={st.editorScroll} keyboardShouldPersistTaps="handled">
              <Text style={st.setupTitle}>{editingCategory ? "Edit Category" : "New Category"}</Text>
              <Text style={st.setupSub}>Create your own ranking category.</Text>
              <Text style={st.editorLabel}>CATEGORY NAME</Text>
              <TextInput
                style={st.editorInput}
                placeholder="e.g. Best Marvel movies"
                placeholderTextColor={colors.gray500}
                value={customName}
                onChangeText={setCustomName}
              />
              <Text style={st.editorLabel}>ITEMS (one per line, min 5)</Text>
              <TextInput
                style={[st.editorInput, { height: 180, textAlignVertical: "top" }]}
                placeholder={"Iron Man\nEndgame\nSpider-Man\n..."}
                placeholderTextColor={colors.gray500}
                value={customItems}
                onChangeText={setCustomItems}
                multiline
              />
              <Text style={st.editorCount}>{itemCount} items</Text>
              <TouchableOpacity
                style={[st.primaryBtn, !canSave && { opacity: 0.4 }]}
                onPress={saveCustomCategory}
                disabled={!canSave}
              >
                <Text style={st.primaryBtnText}>{editingCategory ? "Save Changes" : "Save Category"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setShowCustomEditor(false); setEditingCategory(null); setCustomName(""); setCustomItems(""); }}
                style={{ marginTop: 8, alignSelf: "center" }}
              >
                <Text style={st.backLink}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      );
    }

    // Step 1: pick category
    if (!selectedCategory) {
      return (
        <SafeAreaView style={st.container}><GameHeader />
          <ScrollView contentContainerStyle={st.setupScroll}>
            <Text style={st.bigEmoji}>{"\u2263"}</Text>
            <Text style={st.setupTitle}>Pick a Category</Text>
            <Text style={st.setupSub}>
              {(gs.totalGames ?? 1) > 1
                ? `Round ${gs.currentGame ?? 1} of ${gs.totalGames} \u2014 pick a category.`
                : "Choose what everyone will rank."}
            </Text>
            <View style={st.catGrid}>
              {BANK_KEYS.map((key) => {
                const bank = BANKS[key];
                return (
                  <TouchableOpacity
                    key={key}
                    style={st.catCard}
                    onPress={() => setSelectedCategory(key)}
                    activeOpacity={0.7}
                  >
                    <Text style={st.catEmoji}>{bank.emoji}</Text>
                    <Text style={st.catLabel} numberOfLines={2}>{bank.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {customCategories.length > 0 && (
              <>
                <Text style={st.customSectionTitle}>Your Categories</Text>
                <View style={st.catGrid}>
                  {customCategories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[st.catCard, { borderColor: ACCENT + "66" }]}
                      onPress={() => setSelectedCategory(`custom:${cat.id}`)}
                      onLongPress={() => {
                        Alert.alert(cat.label, `${cat.items.length} items`, [
                          { text: "Play", onPress: () => setSelectedCategory(`custom:${cat.id}`) },
                          { text: "Edit", onPress: () => startEditCategory(cat) },
                          { text: "Delete", style: "destructive", onPress: () => deleteCustomCategory(cat.id) },
                          { text: "Cancel", style: "cancel" },
                        ]);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={st.catEmoji}>{"\u270E"}</Text>
                      <Text style={st.catLabel} numberOfLines={2}>{cat.label}</Text>
                      <Text style={st.catItemCount}>{cat.items.length} items</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity
              style={st.makeOwnBtn}
              onPress={() => { setEditingCategory(null); setCustomName(""); setCustomItems(""); setShowCustomEditor(true); }}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.primaryLight} />
              <Text style={st.makeOwnText}>Make Your Own</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      );
    }

    // Step 2: pick size
    const isCustomCat = selectedCategory.startsWith("custom:");
    const bank = isCustomCat ? null : BANKS[selectedCategory];
    const customCat = isCustomCat ? customCategories.find((c) => c.id === selectedCategory.replace("custom:", "")) : null;
    const catLabel = customCat?.label ?? bank?.label ?? "";
    const catEmoji = customCat ? "\u270E" : (bank?.emoji ?? "");
    const catItemCount = customCat?.items.length ?? bank?.items.length ?? 0;
    if (!selectedSize) {
      // Filter size options based on available items
      const sizeOptions = ([5, 10] as const).filter((s) => catItemCount >= s);
      return (
        <SafeAreaView style={st.container}><GameHeader />
          <View style={st.centered}>
            <Text style={st.bigEmoji}>{catEmoji}</Text>
            <Text style={st.setupTitle}>{catLabel}</Text>
            <Text style={st.setupSub}>How many items to rank?</Text>
            <View style={st.sizeRow}>
              {sizeOptions.map((size) => (
                <TouchableOpacity
                  key={size}
                  style={st.sizeCard}
                  onPress={() => {
                    setSelectedSize(size);
                    // Rounds are only picked for game 1; later games launch straight away.
                    if ((gs.currentGame ?? 1) > 1) launchGame(gs.totalGames, gs.currentGame, size);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={st.sizeNum}>{size}</Text>
                  <Text style={st.sizeLabel}>Top {size}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setSelectedCategory(null)} style={{ marginTop: 12 }}>
              <Text style={st.backLink}>Change category</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    // Games 2..N: rounds were already chosen in game 1 — launching (fallback button if it didn't).
    if ((gs.currentGame ?? 1) > 1) {
      return (
        <SafeAreaView style={st.container}><GameHeader />
          <View style={st.centered}>
            <Text style={st.bigEmoji}>{catEmoji}</Text>
            <Text style={st.setupTitle}>{catLabel}</Text>
            <Text style={st.setupSub}>Top {selectedSize} {"·"} Game {gs.currentGame}/{gs.totalGames}</Text>
            <View style={st.sizeRow}>
              <TouchableOpacity style={st.sizeCard} onPress={() => launchGame(gs.totalGames, gs.currentGame)} activeOpacity={0.7}>
                <Text style={st.sizeLabel}>Start</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setSelectedSize(null)} style={{ marginTop: 12 }}>
              <Text style={st.backLink}>Change size</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    // Step 3: pick rounds
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <View style={st.centered}>
          <Text style={st.bigEmoji}>{catEmoji}</Text>
          <Text style={st.setupTitle}>{catLabel}</Text>
          <Text style={st.setupSub}>Top {selectedSize} {"\u00B7"} How many rounds?</Text>
          <View style={st.sizeRow}>
            {([1, 3, 5] as const).map((n) => (
              <TouchableOpacity key={n} style={st.sizeCard} onPress={() => launchGame(n, gs.currentGame ?? 1)} activeOpacity={0.7}>
                <Text style={st.sizeNum}>{n}</Text>
                <Text style={st.sizeLabel}>{n === 1 ? "Round" : "Rounds"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setSelectedSize(null)} style={{ marginTop: 12 }}>
            <Text style={st.backLink}>Change size</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // === PLAYING ===
  if (phase === "playing") {
    const currentItem = gs.draw[gs.currentRound];
    const mySlots = gs.placements?.[myId] ?? new Array(gs.size).fill(null);
    const submittedCount = countInRoom(gs.roundSubmitted);
    const totalPlayers = players.length;

    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.playScroll}>
          <Text style={st.playCatLabel}>
            {gs.categoryEmoji} {gs.categoryLabel}
            {gs.totalGames > 1 ? ` \u00B7 Game ${gs.currentGame}/${gs.totalGames}` : ""}
          </Text>
          <Text style={st.playProgress}>
            Round {gs.currentRound + 1} / {gs.size} {"\u00B7"} {submittedCount}/{totalPlayers} placed
          </Text>

          {/* Current item card */}
          {hasPlacedThisRound ? (
            <View style={[st.nowPlacing, { borderColor: colors.success + "66" }]}>
              <Text style={[st.nowPlacingLabel, { color: colors.success }]}>PLACED!</Text>
              <Text style={st.nowPlacingItem}>{currentItem}</Text>
              <Text style={st.nowPlacingHint}>Waiting for others... {submittedCount}/{totalPlayers}</Text>
            </View>
          ) : (
            <View style={st.nowPlacing}>
              <Text style={st.nowPlacingLabel}>NOW PLACING</Text>
              <Text style={st.nowPlacingItem}>{currentItem}</Text>
              <Text style={st.nowPlacingHint}>Tap a slot below {"\u00B7"} {gs.size - gs.currentRound} items left</Text>
            </View>
          )}

          {/* Slots */}
          <Text style={st.slotsHeader}>Your Top {gs.size} Ranking</Text>
          <View style={{ gap: 6 }}>
            {mySlots.map((slotItem: string | null, idx: number) => {
              const isFilled = slotItem !== null;
              const canPlace = !isFilled && !hasPlacedThisRound;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[st.slot, isFilled && st.slotFilled, canPlace && st.slotOpen]}
                  onPress={() => canPlace && handlePlaceItem(idx)}
                  activeOpacity={canPlace ? 0.6 : 1}
                  disabled={!canPlace}
                >
                  <Text style={[st.slotRank, isFilled && st.slotRankFilled]}>#{idx + 1}</Text>
                  {isFilled ? (
                    <Text style={st.slotItemText} numberOfLines={1}>{slotItem}</Text>
                  ) : (
                    <Text style={st.slotEmpty}>{canPlace ? "Tap to place here" : "\u2014"}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === REVEAL (side-by-side comparison) ===
  if (phase === "reveal") {
    const rankings = gs.placements ?? {};
    const pids = Object.keys(rankings);
    const colWidth = Math.max(100, (SCREEN_WIDTH - 60) / pids.length);

    // Compute divisive & agreed
    const items = gs.draw ?? [];
    const threshold = gs.size === 10 ? 4 : 2;
    const itemStats = items.map((item) => {
      const ranks: number[] = [];
      for (const pid of pids) {
        const idx = (rankings[pid] ?? []).indexOf(item);
        if (idx >= 0) ranks.push(idx + 1);
      }
      const spread = ranks.length > 0 ? Math.max(...ranks) - Math.min(...ranks) : 0;
      return { item, spread };
    });
    const divisive = itemStats.filter((s) => s.spread >= threshold).sort((a, b) => b.spread - a.spread).slice(0, 3);
    const agreed = itemStats.filter((s) => s.spread <= 1).sort((a, b) => a.spread - b.spread).slice(0, 3);

    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.revealScroll}>
          <Text style={st.revealTitle}>Results</Text>
          <Text style={st.revealCatLabel}>{gs.categoryEmoji} {gs.categoryLabel} {"\u2014"} Top {gs.size}</Text>

          {divisive.length > 0 && (
            <View style={st.callout}>
              <Text style={st.calloutTitle}>Most Divisive</Text>
              {divisive.map((s, i) => (
                <Text key={i} style={st.calloutItem}>{i + 1}. {s.item} (spread: {s.spread})</Text>
              ))}
            </View>
          )}
          {agreed.length > 0 && (
            <View style={[st.callout, { borderColor: colors.success + "44" }]}>
              <Text style={[st.calloutTitle, { color: colors.success }]}>Everyone Agrees</Text>
              {agreed.map((s, i) => (
                <Text key={i} style={st.calloutItem}>{i + 1}. {s.item}</Text>
              ))}
            </View>
          )}

          {/* Side-by-side table */}
          <Text style={st.compTitle}>Side-by-Side</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={st.compHeaderRow}>
                <View style={st.compRankCol}><Text style={st.compHeaderText}>#</Text></View>
                {pids.map((pid) => (
                  <View key={pid} style={[st.compPlayerCol, { width: colWidth }]}>
                    <Text style={[st.compHeaderText, pid === myId && { color: ACCENT }]} numberOfLines={1}>
                      {playerMap[pid]?.username ?? "Player"}
                    </Text>
                  </View>
                ))}
              </View>
              {Array.from({ length: gs.size }).map((_, rowIdx) => (
                <View key={rowIdx} style={[st.compDataRow, rowIdx % 2 === 0 && st.compDataRowAlt]}>
                  <View style={st.compRankCol}><Text style={st.compRankNum}>{rowIdx + 1}</Text></View>
                  {pids.map((pid) => (
                    <View key={pid} style={[st.compPlayerCol, { width: colWidth }]}>
                      <Text style={st.compItemText} numberOfLines={1}>{(rankings[pid] ?? [])[rowIdx] ?? "\u2014"}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>

          {isHost ? (
            <TouchableOpacity style={st.primaryBtn} onPress={advanceToVoting} activeOpacity={0.7}>
              <Text style={st.primaryBtnText}>Vote for Best List</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <Text style={st.wait}>Waiting for host to continue...</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === VOTING ===
  if (phase === "voting") {
    const iHaveVoted = (gs.votedPlayerIds ?? []).includes(myId);
    const votesIn = countInRoom(gs.votedPlayerIds);

    if (iHaveVoted) {
      return (
        <SafeAreaView style={st.container}><GameHeader />
          <View style={st.centered}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Text style={st.title}>Vote submitted!</Text>
            <Text style={st.wait}>{votesIn} / {players.length} voted</Text>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.voteScroll}>
          <Text style={st.voteTitle}>Vote for the Best List</Text>
          <Text style={st.voteSub}>Whose ranking do you think is best?</Text>
          {players
            .filter((p) => p.user_id !== myId)
            .map((p) => (
              <TouchableOpacity
                key={p.user_id}
                style={st.voteBtn}
                onPress={() => handleVote(p.user_id)}
                activeOpacity={0.75}
              >
                <Text style={st.voteBtnText}>{p.username}</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.gray400} />
              </TouchableOpacity>
            ))}
          <Text style={st.voteProg}>{votesIn} / {players.length} voted</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === VOTE RESULTS ===
  if (phase === "vote-results") {
    const voteCounts: Record<string, number> = {};
    for (const voteeId of Object.values(gs.votes ?? {})) {
      voteCounts[voteeId] = (voteCounts[voteeId] ?? 0) + 1;
    }
    const sorted = players
      .map((p) => ({ uid: p.user_id, username: p.username, votes: voteCounts[p.user_id] ?? 0 }))
      .sort((a, b) => b.votes - a.votes || a.username.localeCompare(b.username));
    const voteRanks = competitionRanks(sorted, (p) => p.votes);

    const scores = gs.brScores ?? {};
    const scoreSorted = Object.entries(scores)
      .map(([uid, score]) => ({ uid, username: playerMap[uid]?.username ?? "?", score }))
      .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
    const scoreRanks = competitionRanks(scoreSorted, (p) => p.score);

    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.voteResultScroll}>
          <Text style={st.voteResultTitle}>Vote Results</Text>
          {sorted.map((p, i) => (
            <View key={p.uid} style={st.voteResultRow}>
              <Text style={[st.voteResultRank, voteRanks[i] === 1 && { color: colors.gold }]}>#{voteRanks[i]}</Text>
              <Text style={st.voteResultName}>{p.username}</Text>
              <Text style={st.voteResultVotes}>{p.votes} vote{p.votes !== 1 ? "s" : ""}</Text>
            </View>
          ))}

          {gs.totalGames > 1 && (
            <>
              <Text style={st.seriesHeader}>SERIES SCORES</Text>
              {scoreSorted.map((p, i) => (
                <View key={p.uid} style={st.voteResultRow}>
                  <Text style={[st.voteResultRank, scoreRanks[i] === 1 && { color: colors.gold }]}>{scoreRanks[i]}</Text>
                  <Text style={st.voteResultName}>{p.username}</Text>
                  <Text style={st.voteResultVotes}>{p.score} pt{p.score !== 1 ? "s" : ""}</Text>
                </View>
              ))}
            </>
          )}

          {isHost ? (
            <TouchableOpacity style={st.primaryBtn} onPress={handleNextGameOrEnd} activeOpacity={0.7}>
              <Text style={st.primaryBtnText}>
                {gs.currentGame >= gs.totalGames ? "See Final Results" : "Next Round"}
              </Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <Text style={st.wait}>Waiting for host...</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === GAME OVER ===
  if (phase === "game-over") {
    const scores = gs.brScores ?? {};
    const sorted = Object.entries(scores)
      .map(([uid, score]) => ({ uid, username: playerMap[uid]?.username ?? "?", score }))
      .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
    const ranks = competitionRanks(sorted, (p) => p.score);
    const winner = sorted[0];

    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.gameOverScroll}>
          <Ionicons name="trophy" size={48} color={colors.warning} />
          <Text style={st.gameOverTitle}>
            {winner?.uid === myId ? "You Win!" : `${winner?.username ?? "?"} Wins!`}
          </Text>
          {winner && <Text style={st.gameOverScore}>{winner.score} point{winner.score !== 1 ? "s" : ""}</Text>}

          {sorted.map((p, i) => (
            <View key={p.uid} style={[st.standingRow, p.uid === myId && st.standingRowMe]}>
              <Text style={[st.standingRank, ranks[i] === 1 && { color: colors.gold }]}>#{ranks[i]}</Text>
              <Text style={st.standingName}>{p.username}{p.uid === myId ? " (You)" : ""}</Text>
              <Text style={st.standingScore}>{p.score} pts</Text>
            </View>
          ))}

          {isHost ? (
            <TouchableOpacity style={st.primaryBtn} onPress={handleBackToLobby} activeOpacity={0.7}>
              <Text style={st.primaryBtnText}>Back to Lobby</Text>
              <Ionicons name="arrow-back" size={20} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <HostWaitingPill label="Waiting for host to return to lobby..." style={{ marginTop: 0, marginBottom: 20 }} />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}><GameHeader />
      <View style={st.centered}>
        <Text style={st.loadingText}>Unknown phase: {phase}</Text>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  loadingText: { fontFamily: fonts.medium, fontSize: 16, color: colors.gray400, marginTop: 16 },
  bigEmoji: { fontSize: 64, marginBottom: 16 },
  title: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white, marginBottom: 8 },
  tagline: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray400, marginBottom: 32, textAlign: "center" },
  wait: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray400, textAlign: "center" },

  introScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 24 },
  rulesBox: { width: "100%", marginBottom: 32 },
  ruleCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  ruleText: { fontFamily: fonts.regular, fontSize: 14, color: colors.white, lineHeight: 20 },

  // Setup
  setupScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, alignItems: "center", gap: 12 },
  setupTitle: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.white },
  setupSub: { fontFamily: fonts.regular, fontSize: 14, color: colors.gray400, textAlign: "center", marginBottom: 8 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  catCard: {
    width: "30%", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceLight,
    padding: 14, alignItems: "center", gap: 6,
  },
  catEmoji: { fontSize: 24 },
  catLabel: { fontFamily: fonts.semibold, fontSize: 11, color: colors.white, textAlign: "center" },
  sizeRow: { flexDirection: "row", gap: 16, marginTop: 16 },
  sizeCard: {
    width: 80, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.surfaceLight,
    padding: 16, alignItems: "center", gap: 4,
  },
  sizeNum: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white },
  sizeLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray400 },
  backLink: { fontFamily: fonts.medium, fontSize: 14, color: colors.primaryLight, textDecorationLine: "underline" },
  customSectionTitle: { fontFamily: fonts.extrabold, fontSize: 13, color: ACCENT, letterSpacing: 1.5, marginTop: 16 },
  catItemCount: { fontFamily: fonts.regular, fontSize: 10, color: colors.gray500 },
  makeOwnBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary + "18", borderRadius: 12, borderWidth: 1, borderColor: colors.primary + "44",
    paddingVertical: 14, marginTop: 12, width: "100%",
  },
  makeOwnText: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryLight },
  editorScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 12 },
  editorLabel: { fontFamily: fonts.extrabold, fontSize: 11, color: colors.gray500, letterSpacing: 1.5 },
  editorInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceLight, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.white, fontFamily: fonts.regular,
  },
  editorCount: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray400, alignSelf: "flex-end" },

  // Playing
  playScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 12 },
  playCatLabel: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryLight },
  playProgress: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray400 },
  nowPlacing: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1.5, borderColor: ACCENT,
    padding: 20, alignItems: "center", gap: 6,
  },
  nowPlacingLabel: { fontFamily: fonts.extrabold, fontSize: 11, color: ACCENT, letterSpacing: 2 },
  nowPlacingItem: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.white },
  nowPlacingHint: { fontFamily: fonts.regular, fontSize: 13, color: colors.gray400 },
  slotsHeader: { fontFamily: fonts.bold, fontSize: 14, color: colors.gray400, marginTop: 4 },
  slot: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceLight, paddingHorizontal: 14, paddingVertical: 14,
  },
  slotFilled: { borderColor: colors.surfaceLight, backgroundColor: colors.surface },
  slotOpen: { borderColor: ACCENT + "66", borderStyle: "dashed" },
  slotRank: { fontFamily: fonts.bold, fontSize: 14, color: colors.gray500, width: 30 },
  slotRankFilled: { color: colors.gray400 },
  slotItemText: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  slotEmpty: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.gray500 },

  // Reveal
  revealScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 16 },
  revealTitle: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.white },
  revealCatLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray400 },
  callout: {
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.warning + "44",
    padding: 14, gap: 4,
  },
  calloutTitle: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.warning },
  calloutItem: { fontFamily: fonts.regular, fontSize: 13, color: colors.gray300 },
  compTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.gray400, marginTop: 4 },
  compHeaderRow: { flexDirection: "row", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.surfaceLight },
  compRankCol: { width: 32, alignItems: "center" },
  compPlayerCol: { alignItems: "center" },
  compHeaderText: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray400 },
  compDataRow: { flexDirection: "row", paddingVertical: 8 },
  compDataRowAlt: { backgroundColor: colors.surface },
  compRankNum: { fontFamily: fonts.bold, fontSize: 13, color: colors.gray500 },
  compItemText: { fontFamily: fonts.regular, fontSize: 12, color: colors.white, textAlign: "center" },

  // Voting
  voteScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 12 },
  voteTitle: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.white },
  voteSub: { fontFamily: fonts.regular, fontSize: 14, color: colors.gray400 },
  voteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceLight,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  voteBtnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  voteProg: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray400, textAlign: "center" },

  // Vote results
  voteResultScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 12 },
  voteResultTitle: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.white },
  voteResultRow: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.surfaceLight,
  },
  voteResultRank: { fontFamily: fonts.bold, fontSize: 14, color: colors.gray500, width: 28 },
  voteResultName: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  voteResultVotes: { fontFamily: fonts.bold, fontSize: 14, color: colors.gray400 },
  seriesHeader: { fontFamily: fonts.extrabold, fontSize: 11, color: colors.gray500, letterSpacing: 2, marginTop: 12 },

  // Game over
  gameOverScroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 20, paddingTop: 40, paddingBottom: 40, gap: 12 },
  gameOverTitle: { fontFamily: fonts.extrabold, fontSize: 32, color: colors.white },
  gameOverScore: { fontFamily: fonts.medium, fontSize: 16, color: colors.gray400 },
  standingRow: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.surfaceLight, width: "100%",
  },
  standingRowMe: { borderColor: colors.primary },
  standingRank: { fontFamily: fonts.bold, fontSize: 14, color: colors.gray500, width: 28 },
  standingName: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  standingScore: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, width: "100%",
  },
  primaryBtnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
});
