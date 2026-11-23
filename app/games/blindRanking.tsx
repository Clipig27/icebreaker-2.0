import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts, gradients, radii, spacing, type } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import HostWaitingPill from "../../src/components/HostWaitingPill";
import GameHeader from "../../src/components/GameHeader";
import GameLoadingScreen from "../../src/components/GameLoadingScreen";
import ScreenBackground from "../../src/components/ScreenBackground";
import PrimaryAction, { PrimaryActionBar } from "../../src/components/PrimaryAction";
import Eyebrow from "../../src/components/Eyebrow";
import Pill from "../../src/components/Pill";
import GradientCard from "../../src/components/GradientCard";
import HeroGradient from "../../src/components/HeroGradient";
import PlayerAvatar from "../../src/components/PlayerAvatar";
import { competitionRanks } from "../../src/utils/rank";
import { BANKS, BANK_KEYS, drawBankItems, preloadBankRecents } from "../../src/data/blindRankingBanks";

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

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ---------------------------------------------------------------------------
// Banks — see src/data/blindRankingBanks.ts (55 categories, 36–50 items each).
// Items are drawn with device-level no-repeat tracking (key `br:<category>`).
// ---------------------------------------------------------------------------

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
  const { room, players, isHost, mutateGameState, endGame, startGame } = useRoomStore();
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

  // Hydrate per-category "recently drawn" lists so item draws avoid repeats.
  useEffect(() => {
    preloadBankRecents().catch(() => {});
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
  // Track wins/games played
  const trackedGameRef = useRef(false);
  useEffect(() => {
    if (trackedGameRef.current || phase !== "game-over" || !gs) return;
    trackedGameRef.current = true;
    useAuthStore.getState().incrementGamesPlayed();
    const scores = gs.brScores ?? {};
    const maxScore = Math.max(...Object.values(scores), 0);
    if (maxScore > 0 && (scores[myId] ?? 0) === maxScore) useAuthStore.getState().incrementWins();
  }, [phase]);

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
    let draw: string[], label: string, emoji: string;
    if (isCustom) {
      const cat = customCategories.find((c) => c.id === selectedCategory.replace("custom:", ""));
      if (!cat || cat.items.length < size) return;
      draw = shuffle(cat.items).slice(0, size); label = cat.label; emoji = "\u270E";
    } else {
      const bank = BANKS[selectedCategory];
      if (!bank || bank.items.length < size) return;
      // Prefer items this device hasn't drawn recently for this category.
      draw = drawBankItems(selectedCategory, size); label = bank.label; emoji = bank.emoji;
    }
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
    return <GameLoadingScreen name="Blind Ranking" icon="list" color="#A78BFA" />;
  }

  const roundPill = `Round ${gs.currentGame ?? 1}/${gs.totalGames ?? 1}`;

  // === INTRO ===
  if (phase === "intro") {
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Continue" icon="arrow-forward" onPress={startFromIntro} />
          ) : (
            <WaitingNote label="Waiting for host to start..." />
          )
        }
      >
        <ScreenTitle
          title="Blind Ranking"
          subtitle={`Rank items blind — lock each one in as it appears. No take-backs.`}
        />
        <HeroGradient>
          <View style={st.heroContent}>
            <View style={st.heroCopy}>
              <Eyebrow tone="dark">No take-backs</Eyebrow>
              <Text style={st.heroTitle}>Trust your gut. Lock it in.</Text>
            </View>
            <Text style={st.heroEmoji}>{"🙈"}</Text>
          </View>
        </HeroGradient>
        <Eyebrow style={st.sectionEyebrow}>How it works</Eyebrow>
        <View style={st.list}>
          {[
            ["🎲", "Items from a category appear one at a time in random order."],
            ["📌", "Place each item into a rank slot. Once placed, it's locked."],
            ["👀", "You can't see what's coming next — trust your gut!"],
            ["📊", "After everyone finishes, rankings are compared side-by-side."],
          ].map(([icon, text], i) => (
            <GradientCard key={i} radius={radii.lg} contentStyle={st.ruleRow}>
              <View style={st.ruleIcon}>
                <Text style={st.ruleEmoji}>{icon}</Text>
              </View>
              <Text style={st.ruleText}>{text}</Text>
            </GradientCard>
          ))}
        </View>
      </Shell>
    );
  }

  // === SETUP ===
  if (phase === "setup") {
    if (!isHost) {
      return (
        <Shell footer={<WaitingNote label="Waiting for host..." />}>
          <ScreenTitle
            title="Blind Ranking"
            subtitle="Host is choosing the category and size."
            pill={(gs.totalGames ?? 1) > 1 ? roundPill : undefined}
          />
          <GradientCard contentStyle={st.centerCard}>
            <View style={st.artTileLg}>
              <Text style={st.artEmojiLg}>{"≣"}</Text>
            </View>
            <Eyebrow>Up next</Eyebrow>
            <Text style={st.centerCardText}>A new category to rank blind.</Text>
          </GradientCard>
        </Shell>
      );
    }

    // Custom category editor
    if (showCustomEditor) {
      const itemCount = customItems.split("\n").map((s) => s.trim()).filter(Boolean).length;
      const canSave = customName.trim().length > 0 && itemCount >= 5;
      return (
        <Shell
          keyboard
          footer={
            <View style={st.footerStack}>
              <PrimaryAction
                label={editingCategory ? "Save Changes" : "Save Category"}
                onPress={saveCustomCategory}
                disabled={!canSave}
              />
              <PrimaryAction
                label="Cancel"
                variant="dark"
                onPress={() => { setShowCustomEditor(false); setEditingCategory(null); setCustomName(""); setCustomItems(""); }}
              />
            </View>
          }
        >
          <ScreenTitle
            title={editingCategory ? "Edit Category" : "New Category"}
            subtitle="Create your own ranking category."
          />
          <View style={st.field}>
            <Eyebrow>Category name</Eyebrow>
            <TextInput
              style={st.input}
              placeholder="e.g. Best Marvel movies"
              placeholderTextColor={colors.gray500}
              value={customName}
              onChangeText={setCustomName}
            />
          </View>
          <View style={st.field}>
            <View style={st.fieldLabelRow}>
              <Eyebrow>Items (one per line, min 5)</Eyebrow>
              <Text style={st.editorCount}>{itemCount} items</Text>
            </View>
            <TextInput
              style={[st.input, st.inputMultiline]}
              placeholder={"Iron Man\nEndgame\nSpider-Man\n..."}
              placeholderTextColor={colors.gray500}
              value={customItems}
              onChangeText={setCustomItems}
              multiline
            />
          </View>
        </Shell>
      );
    }

    // Step 1: pick category
    if (!selectedCategory) {
      return (
        <Shell>
          <ScreenTitle
            title="Pick a Category"
            subtitle={
              (gs.totalGames ?? 1) > 1
                ? `Round ${gs.currentGame ?? 1} of ${gs.totalGames} — pick a category.`
                : "Choose what everyone will rank."
            }
            pill={(gs.totalGames ?? 1) > 1 ? roundPill : undefined}
          />
          <View style={st.catGrid}>
            {BANK_KEYS.map((key) => {
              const bank = BANKS[key];
              return (
                <Pressable
                  key={key}
                  style={({ pressed }) => [st.catTileWrap, pressed && st.pressed]}
                  onPress={() => setSelectedCategory(key)}
                  accessibilityRole="button"
                >
                  <GradientCard radius={radii.lg} style={st.flex1} contentStyle={st.catCard}>
                    <View style={st.catEmojiTile}>
                      <Text style={st.catEmoji}>{bank.emoji}</Text>
                    </View>
                    <Text style={st.catLabel} numberOfLines={2}>{bank.label}</Text>
                  </GradientCard>
                </Pressable>
              );
            })}
          </View>

          {customCategories.length > 0 && (
            <>
              <Eyebrow tone="lavender" style={st.sectionEyebrow}>Your Categories</Eyebrow>
              <View style={st.catGrid}>
                {customCategories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    style={({ pressed }) => [st.catTileWrap, pressed && st.pressed]}
                    onPress={() => setSelectedCategory(`custom:${cat.id}`)}
                    onLongPress={() => {
                      Alert.alert(cat.label, `${cat.items.length} items`, [
                        { text: "Play", onPress: () => setSelectedCategory(`custom:${cat.id}`) },
                        { text: "Edit", onPress: () => startEditCategory(cat) },
                        { text: "Delete", style: "destructive", onPress: () => deleteCustomCategory(cat.id) },
                        { text: "Cancel", style: "cancel" },
                      ]);
                    }}
                    accessibilityRole="button"
                  >
                    <GradientCard
                      radius={radii.lg}
                      style={st.flex1}
                      borderColors={SELECTED_BORDER}
                      contentStyle={st.catCard}
                    >
                      <View style={st.catEmojiTile}>
                        <Text style={st.catEmoji}>{"✎"}</Text>
                      </View>
                      <Text style={st.catLabel} numberOfLines={2}>{cat.label}</Text>
                      <Text style={st.catItemCount}>{cat.items.length} items</Text>
                    </GradientCard>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <PrimaryAction
            label="Make Your Own"
            icon="add-circle-outline"
            iconPosition="left"
            variant="ghost"
            onPress={() => { setEditingCategory(null); setCustomName(""); setCustomItems(""); setShowCustomEditor(true); }}
          />
        </Shell>
      );
    }

    // Step 2: pick size
    const isCustomCat = selectedCategory.startsWith("custom:");
    const bank = isCustomCat ? null : BANKS[selectedCategory];
    const customCat = isCustomCat ? customCategories.find((c) => c.id === selectedCategory.replace("custom:", "")) : null;
    const catLabel = customCat?.label ?? bank?.label ?? "";
    const catEmoji = customCat ? "✎" : (bank?.emoji ?? "");
    const catItemCount = customCat?.items.length ?? bank?.items.length ?? 0;
    if (!selectedSize) {
      // Filter size options based on available items
      const sizeOptions = ([5, 10] as const).filter((s) => catItemCount >= s);
      return (
        <Shell>
          <CategoryTitle emoji={catEmoji} label={catLabel} eyebrow="How many items to rank?" pill={(gs.totalGames ?? 1) > 1 ? roundPill : undefined} />
          <View style={st.optionRow}>
            {sizeOptions.map((size) => (
              <OptionTile
                key={size}
                value={String(size)}
                label={`Top ${size}`}
                onPress={() => {
                  setSelectedSize(size);
                  // Rounds are only picked for game 1; later games launch straight away.
                  if ((gs.currentGame ?? 1) > 1) launchGame(gs.totalGames, gs.currentGame, size);
                }}
              />
            ))}
          </View>
          <TextLink label="Change category" onPress={() => setSelectedCategory(null)} />
        </Shell>
      );
    }

    // Games 2..N: rounds were already chosen in game 1 — launching (fallback button if it didn't).
    if ((gs.currentGame ?? 1) > 1) {
      return (
        <Shell
          footer={
            <PrimaryAction label="Start" icon="play" onPress={() => launchGame(gs.totalGames, gs.currentGame)} />
          }
        >
          <CategoryTitle
            emoji={catEmoji}
            label={catLabel}
            eyebrow={`Top ${selectedSize} · Game ${gs.currentGame}/${gs.totalGames}`}
            pill={roundPill}
          />
          <TextLink label="Change size" onPress={() => setSelectedSize(null)} />
        </Shell>
      );
    }

    // Step 3: pick rounds
    return (
      <Shell>
        <CategoryTitle emoji={catEmoji} label={catLabel} eyebrow={`Top ${selectedSize} · How many rounds?`} />
        <View style={st.optionRow}>
          {([1, 3, 5] as const).map((n) => (
            <OptionTile
              key={n}
              value={String(n)}
              label={n === 1 ? "Round" : "Rounds"}
              onPress={() => launchGame(n, gs.currentGame ?? 1)}
            />
          ))}
        </View>
        <TextLink label="Change size" onPress={() => setSelectedSize(null)} />
      </Shell>
    );
  }

  // === PLAYING ===
  if (phase === "playing") {
    const currentItem = gs.draw[gs.currentRound];
    const mySlots = gs.placements?.[myId] ?? new Array(gs.size).fill(null);
    const submittedCount = countInRoom(gs.roundSubmitted);
    const totalPlayers = players.length;
    const filledCount = mySlots.filter((s: string | null) => s !== null).length;
    const remaining = Math.max(0, gs.size - filledCount);
    const progress = gs.size > 0 ? Math.min(1, filledCount / gs.size) : 0;

    return (
      <Shell
        footer={
          hasPlacedThisRound ? (
            <WaitingNote done label={`Placed! Waiting for others... ${submittedCount}/${totalPlayers}`} />
          ) : (
            <PrimaryAction
              label={`Rank ${remaining} more item${remaining !== 1 ? "s" : ""} (${filledCount}/${gs.size})`}
              disabled
            />
          )
        }
      >
        <View style={st.titleBlock}>
          <View style={st.eyebrowRow}>
            <Eyebrow tone="lavender">Blind Ranking</Eyebrow>
            <Pill tone="peach" label={roundPill} />
          </View>
          <View style={st.promptRow}>
            <View style={st.flex1}>
              <Eyebrow>Your top {gs.size}</Eyebrow>
              <Text style={[type.title, st.promptTitle]}>{gs.categoryLabel}</Text>
            </View>
            <View style={st.artTile}>
              <Text style={st.artEmoji}>{gs.categoryEmoji}</Text>
            </View>
          </View>
        </View>

        {/* Progress (no timer in this game: item count instead) */}
        <View style={st.progressBlock}>
          <View style={st.progressHead}>
            <Text style={st.progressNum}>
              {gs.currentRound + 1}
              <Text style={st.progressDen}>/{gs.size}</Text>
            </Text>
            <Text style={st.progressMeta}>{submittedCount}/{totalPlayers} placed</Text>
          </View>
          <View style={st.progressTrack}>
            <LinearGradient
              colors={gradients.primaryButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[st.progressFill, { width: `${progress * 100}%` }]}
            />
          </View>
        </View>

        {/* Current item card */}
        <HeroGradient>
          <View style={st.nowPlacing}>
            <Eyebrow tone="dark">{hasPlacedThisRound ? "PLACED!" : "NOW PLACING"}</Eyebrow>
            <Text style={st.nowPlacingItem}>{currentItem}</Text>
            <Text style={st.nowPlacingHint}>
              {hasPlacedThisRound
                ? `Waiting for others... ${submittedCount}/${totalPlayers}`
                : `Tap a slot below · ${gs.size - gs.currentRound} items left`}
            </Text>
          </View>
        </HeroGradient>

        {/* Slots */}
        <Eyebrow style={st.sectionEyebrow}>Your Top {gs.size} Ranking</Eyebrow>
        <View style={st.list}>
          {mySlots.map((slotItem: string | null, idx: number) => {
            const isFilled = slotItem !== null;
            const canPlace = !isFilled && !hasPlacedThisRound;
            return (
              <Pressable
                key={idx}
                onPress={() => canPlace && handlePlaceItem(idx)}
                disabled={!canPlace}
                accessibilityRole="button"
                style={({ pressed }) => [pressed && canPlace && st.pressed]}
              >
                <GradientCard
                  radius={radii.lg}
                  borderColors={canPlace ? OPEN_BORDER : undefined}
                  contentStyle={[st.slotRow, !isFilled && !canPlace && st.slotDim]}
                >
                  <View style={[st.numTile, isFilled ? st.numTileOn : st.numTileOpen]}>
                    {isFilled ? (
                      <Text style={st.numTileTextOn}>{idx + 1}</Text>
                    ) : canPlace ? (
                      <Ionicons name="add" size={18} color={colors.highlight} />
                    ) : (
                      <Text style={st.numTileText}>{idx + 1}</Text>
                    )}
                  </View>
                  {isFilled ? (
                    <Text style={st.slotItemText} numberOfLines={1}>{slotItem}</Text>
                  ) : (
                    <Text style={st.slotEmpty} numberOfLines={1}>
                      {canPlace ? `Place at #${idx + 1}` : "—"}
                    </Text>
                  )}
                  {isFilled ? (
                    <View style={st.slotTag}>
                      <Ionicons name="lock-closed" size={12} color={colors.gray500} />
                      <Text style={st.slotTagMuted}>LOCKED</Text>
                    </View>
                  ) : canPlace ? (
                    <Text style={st.slotTagText}>TAP</Text>
                  ) : null}
                </GradientCard>
              </Pressable>
            );
          })}
        </View>
      </Shell>
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
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Vote for Best List" icon="arrow-forward" onPress={advanceToVoting} />
          ) : (
            <WaitingNote label="Waiting for host to continue..." />
          )
        }
      >
        <ScreenTitle
          title="Results"
          subtitle={`${gs.categoryEmoji} ${gs.categoryLabel} — Top ${gs.size}`}
          pill={roundPill}
        />

        {divisive.length > 0 && (
          <GradientCard radius={radii.lg} borderColors={WARN_BORDER} contentStyle={st.callout}>
            <Eyebrow style={{ color: colors.warning }}>Most Divisive</Eyebrow>
            {divisive.map((s, i) => (
              <View key={i} style={st.calloutRow}>
                <Text style={st.calloutNum}>{i + 1}</Text>
                <Text style={st.calloutItem} numberOfLines={1}>{s.item}</Text>
                <Text style={st.calloutMeta}>spread {s.spread}</Text>
              </View>
            ))}
          </GradientCard>
        )}
        {agreed.length > 0 && (
          <GradientCard radius={radii.lg} borderColors={SUCCESS_BORDER} contentStyle={st.callout}>
            <Eyebrow style={{ color: colors.success }}>Everyone Agrees</Eyebrow>
            {agreed.map((s, i) => (
              <View key={i} style={st.calloutRow}>
                <Text style={st.calloutNum}>{i + 1}</Text>
                <Text style={st.calloutItem} numberOfLines={1}>{s.item}</Text>
              </View>
            ))}
          </GradientCard>
        )}

        {/* Side-by-side table */}
        <Eyebrow style={st.sectionEyebrow}>Side-by-Side</Eyebrow>
        <GradientCard radius={radii.lg} contentStyle={st.compCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={st.compHeaderRow}>
                <View style={st.compRankCol}><Text style={st.compHeaderText}>#</Text></View>
                {pids.map((pid) => (
                  <View key={pid} style={[st.compPlayerCol, { width: colWidth }]}>
                    <Text style={[st.compHeaderText, pid === myId && { color: colors.highlight }]} numberOfLines={1}>
                      {playerMap[pid]?.username ?? "Player"}
                    </Text>
                  </View>
                ))}
              </View>
              {Array.from({ length: gs.size }).map((_, rowIdx) => (
                <View key={rowIdx} style={[st.compDataRow, rowIdx % 2 === 0 && st.compDataRowAlt]}>
                  <View style={st.compRankCol}>
                    <View style={st.compRankTile}>
                      <Text style={st.compRankNum}>{rowIdx + 1}</Text>
                    </View>
                  </View>
                  {pids.map((pid) => (
                    <View key={pid} style={[st.compPlayerCol, { width: colWidth }]}>
                      <Text style={st.compItemText} numberOfLines={1}>{(rankings[pid] ?? [])[rowIdx] ?? "—"}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </GradientCard>
      </Shell>
    );
  }

  // === VOTING ===
  if (phase === "voting") {
    const iHaveVoted = (gs.votedPlayerIds ?? []).includes(myId);
    const votesIn = countInRoom(gs.votedPlayerIds);

    if (iHaveVoted) {
      const pct = players.length > 0 ? Math.min(100, (votesIn / players.length) * 100) : 0;
      return (
        <Shell footer={<WaitingNote label={`${votesIn} / ${players.length} voted`} />}>
          <ScreenTitle title="Vote submitted!" subtitle={`${votesIn} / ${players.length} voted`} pill={roundPill} />
          <GradientCard contentStyle={st.centerCard}>
            <View style={st.submittedIcon}>
              <Ionicons name="checkmark" size={36} color={colors.highlight} />
            </View>
            <Eyebrow>Votes in</Eyebrow>
            <View style={st.progressTrack}>
              <LinearGradient
                colors={gradients.primaryButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[st.progressFill, { width: `${pct}%` }]}
              />
            </View>
          </GradientCard>
        </Shell>
      );
    }

    return (
      <Shell footer={<WaitingNote label={`${votesIn} / ${players.length} voted`} />}>
        <ScreenTitle title="Vote for the Best List" subtitle="Whose ranking do you think is best?" pill={roundPill} />
        <View style={st.list}>
          {players
            .filter((p) => p.user_id !== myId)
            .map((p) => (
              <Pressable
                key={p.user_id}
                onPress={() => handleVote(p.user_id)}
                accessibilityRole="button"
                style={({ pressed }) => [pressed && st.pressed]}
              >
                <GradientCard radius={radii.lg} contentStyle={st.candidateRow}>
                  <PlayerAvatar username={p.username} size={40} />
                  <Text style={st.candidateName} numberOfLines={1}>{p.username}</Text>
                  <View style={st.voteTag}>
                    <Text style={st.slotTagText}>VOTE</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.highlight} />
                  </View>
                </GradientCard>
              </Pressable>
            ))}
        </View>
      </Shell>
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
      <Shell
        footer={
          isHost ? (
            <PrimaryAction
              label={gs.currentGame >= gs.totalGames ? "See Final Results" : "Next Round"}
              icon="arrow-forward"
              onPress={handleNextGameOrEnd}
            />
          ) : (
            <WaitingNote label="Waiting for host..." />
          )
        }
      >
        <ScreenTitle title="Vote Results" subtitle={`${gs.categoryEmoji} ${gs.categoryLabel}`} pill={roundPill} />
        <View style={st.list}>
          {sorted.map((p, i) => (
            <RankRow
              key={p.uid}
              rank={voteRanks[i]}
              name={p.username}
              isMe={p.uid === myId}
              value={`${p.votes} vote${p.votes !== 1 ? "s" : ""}`}
            />
          ))}
        </View>

        {gs.totalGames > 1 && (
          <>
            <Eyebrow style={st.sectionEyebrow}>SERIES SCORES</Eyebrow>
            <View style={st.list}>
              {scoreSorted.map((p, i) => (
                <RankRow
                  key={p.uid}
                  rank={scoreRanks[i]}
                  name={p.username}
                  isMe={p.uid === myId}
                  value={`${p.score} pt${p.score !== 1 ? "s" : ""}`}
                />
              ))}
            </View>
          </>
        )}
      </Shell>
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
      <Shell
        footer={
          isHost ? (
            <View style={st.footerStack}>
              <PrimaryAction
                label="Play Again"
                icon="refresh"
                iconPosition="left"
                onPress={() => startGame("blindRanking")}
              />
              <PrimaryAction label="Back to Lobby" variant="dark" onPress={handleBackToLobby} />
            </View>
          ) : (
            <View style={st.centerRow}>
              <HostWaitingPill label="Waiting for host..." style={{ marginTop: 0 }} />
            </View>
          )
        }
      >
        <ScreenTitle
          title={winner?.uid === myId ? "You Win!" : `${winner?.username ?? "?"} Wins!`}
          subtitle="Final results"
        />
        {winner && (
          <HeroGradient>
            <View style={st.winnerContent}>
              <View style={[st.numTile, st.numTileHero]}>
                <Text style={st.numTileTextHero}>1</Text>
              </View>
              <PlayerAvatar username={winner.username} size={48} />
              <View style={st.flex1}>
                <Eyebrow tone="dark">Winner</Eyebrow>
                <Text style={st.winnerName} numberOfLines={1}>{winner.username}</Text>
                <Text style={st.winnerScore}>{winner.score} point{winner.score !== 1 ? "s" : ""}</Text>
              </View>
              <Ionicons name="trophy" size={30} color={colors.onPrimary} />
            </View>
          </HeroGradient>
        )}

        <Eyebrow style={st.sectionEyebrow}>Standings</Eyebrow>
        <View style={st.list}>
          {sorted.map((p, i) => (
            <RankRow
              key={p.uid}
              rank={ranks[i]}
              name={`${p.username}${p.uid === myId ? " (You)" : ""}`}
              isMe={p.uid === myId}
              value={`${p.score} pts`}
            />
          ))}
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <Text style={st.loadingText}>Unknown phase: {phase}</Text>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Presentational helpers (no game logic)
// ---------------------------------------------------------------------------

const SELECTED_BORDER = [colors.highlight, colors.highlightGradientEnd] as const;
const OPEN_BORDER = ["rgba(184,174,232,0.6)", "rgba(184,174,232,0.15)"] as const;
const WARN_BORDER = ["rgba(245,158,11,0.6)", "rgba(245,158,11,0.1)"] as const;
const SUCCESS_BORDER = ["rgba(16,185,129,0.6)", "rgba(16,185,129,0.1)"] as const;

/** Screen frame: background, room toolbar, scrolling body and pinned footer. */
function Shell({
  children,
  footer,
  keyboard = false,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  keyboard?: boolean;
}) {
  const body = (
    <>
      <ScrollView
        contentContainerStyle={[st.scroll, !footer && st.scrollNoFooter]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? <PrimaryActionBar>{footer}</PrimaryActionBar> : null}
    </>
  );
  return (
    <SafeAreaView style={st.container} edges={["top", "left", "right"]}>
      <ScreenBackground />
      <GameHeader />
      {keyboard ? (
        <KeyboardAvoidingView style={st.flex1} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

function ScreenTitle({ title, subtitle, pill }: { title: string; subtitle?: string; pill?: string }) {
  return (
    <View style={st.titleBlock}>
      <View style={st.eyebrowRow}>
        <Eyebrow tone="lavender">Blind Ranking</Eyebrow>
        {pill ? <Pill tone="peach" label={pill} /> : null}
      </View>
      <Text style={type.title}>{title}</Text>
      {subtitle ? <Text style={type.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function CategoryTitle({
  emoji,
  label,
  eyebrow,
  pill,
}: {
  emoji: string;
  label: string;
  eyebrow: string;
  pill?: string;
}) {
  return (
    <View style={st.titleBlock}>
      <View style={st.eyebrowRow}>
        <Eyebrow tone="lavender">Blind Ranking</Eyebrow>
        {pill ? <Pill tone="peach" label={pill} /> : null}
      </View>
      <View style={st.promptRow}>
        <View style={st.flex1}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <Text style={[type.title, st.promptTitle]}>{label}</Text>
        </View>
        <View style={st.artTile}>
          <Text style={st.artEmoji}>{emoji}</Text>
        </View>
      </View>
    </View>
  );
}

function OptionTile({ value, label, onPress }: { value: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [st.optionWrap, pressed && st.pressed]}
    >
      <GradientCard radius={radii.lg} contentStyle={st.optionCard}>
        <Text style={st.optionNum}>{value}</Text>
        <Eyebrow>{label}</Eyebrow>
      </GradientCard>
    </Pressable>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={st.textLink} hitSlop={8}>
      <Text style={st.textLinkText}>{label}</Text>
    </Pressable>
  );
}

function WaitingNote({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <View style={st.waiting}>
      {done ? (
        <Ionicons name="checkmark-circle" size={18} color={colors.highlight} />
      ) : (
        <ActivityIndicator size="small" color={colors.highlight} />
      )}
      <Text style={st.waitingText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function RankRow({
  rank,
  name,
  value,
  isMe = false,
}: {
  rank: number;
  name: string;
  value: string;
  isMe?: boolean;
}) {
  const first = rank === 1;
  return (
    <GradientCard radius={radii.lg} borderColors={isMe ? SELECTED_BORDER : undefined} contentStyle={st.candidateRow}>
      <View style={[st.numTile, first ? st.numTileOn : st.numTileMuted]}>
        <Text style={first ? st.numTileTextOn : st.numTileText}>{rank}</Text>
      </View>
      <Text style={st.candidateName} numberOfLines={1}>{name}</Text>
      <Text style={[st.rankValue, first && { color: colors.highlight }]}>{value}</Text>
    </GradientCard>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  scrollNoFooter: { paddingBottom: 48 },
  flex1: { flex: 1 },
  list: { gap: spacing.sm },
  centerRow: { alignItems: "center" },
  footerStack: { gap: spacing.md },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  loadingText: { fontFamily: fonts.medium, fontSize: 16, color: colors.gray400, marginTop: 16 },

  // Title block
  titleBlock: { gap: spacing.sm },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  sectionEyebrow: { marginTop: spacing.xs },
  promptRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  promptTitle: { marginTop: 6 },
  artTile: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    backgroundColor: colors.highlightSoft,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "6deg" }],
  },
  artEmoji: { fontSize: 32, color: colors.highlight },
  artTileLg: {
    width: 80,
    height: 80,
    borderRadius: radii.xl,
    backgroundColor: colors.highlightSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  artEmojiLg: { fontSize: 40, color: colors.highlight },

  // Generic centered card
  centerCard: { alignItems: "center", padding: 24, gap: spacing.md },
  centerCardText: { fontFamily: fonts.medium, fontSize: 15, color: colors.gray300, textAlign: "center" },

  // Hero
  heroContent: { flexDirection: "row", alignItems: "center", padding: 22, gap: spacing.md },
  heroCopy: { flex: 1, gap: 6 },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 29, color: colors.onPrimary },
  heroEmoji: { fontSize: 56 },

  // Rules
  ruleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  ruleIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.highlightSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  ruleEmoji: { fontSize: 20 },
  ruleText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.white },

  // Waiting note (footer)
  waiting: {
    minHeight: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  waitingText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.gray300 },

  // Setup: category grid
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catTileWrap: { width: "31%" },
  catCard: { padding: 12, alignItems: "center", gap: 8, minHeight: 112 },
  catEmojiTile: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.highlightSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  catEmoji: { fontSize: 22, color: colors.highlight },
  catLabel: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.white, textAlign: "center" },
  catItemCount: { fontFamily: fonts.medium, fontSize: 10, color: colors.gray500 },

  // Setup: size / rounds options
  optionRow: { flexDirection: "row", gap: spacing.md },
  optionWrap: { flex: 1 },
  optionCard: { alignItems: "center", paddingVertical: 22, gap: 4 },
  optionNum: { fontFamily: fonts.extrabold, fontSize: 40, color: colors.white, fontVariant: ["tabular-nums"] },
  textLink: { alignSelf: "center", paddingVertical: spacing.sm },
  textLinkText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.highlight },

  // Custom editor
  field: { gap: spacing.sm },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.white,
    fontFamily: fonts.medium,
  },
  inputMultiline: { height: 180, textAlignVertical: "top" },
  editorCount: { fontFamily: fonts.semibold, fontSize: 12, color: colors.highlight },

  // Playing: progress
  progressBlock: { gap: spacing.sm },
  progressHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  progressNum: {
    fontFamily: fonts.extrabold,
    fontSize: 64,
    lineHeight: 68,
    letterSpacing: -2,
    color: colors.white,
    fontVariant: ["tabular-nums"],
  },
  progressDen: { fontSize: 28, color: colors.gray500, letterSpacing: 0 },
  progressMeta: { ...type.eyebrow, marginBottom: 12 },
  progressTrack: {
    alignSelf: "stretch",
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceLight,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: radii.pill },

  // Playing: now placing
  nowPlacing: { padding: 22, gap: 6 },
  nowPlacingItem: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, color: colors.onPrimary },
  nowPlacingHint: { fontFamily: fonts.medium, fontSize: 13, color: "rgba(14,12,26,0.65)" },

  // Playing: slots
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  slotDim: { opacity: 0.55 },
  numTile: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  numTileOn: { backgroundColor: colors.highlight },
  numTileOpen: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(184,174,232,0.55)",
    backgroundColor: colors.highlightSoft,
  },
  numTileMuted: { backgroundColor: colors.surfaceLight },
  numTileHero: { backgroundColor: colors.onPrimary },
  numTileText: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.white },
  numTileTextOn: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.onPrimary },
  numTileTextHero: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.highlight },
  slotItemText: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  slotEmpty: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.gray400 },
  slotTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  slotTagMuted: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2, color: colors.gray500 },
  slotTagText: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2, color: colors.highlight },

  // Reveal
  callout: { padding: spacing.lg, gap: spacing.sm },
  calloutRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  calloutNum: { width: 18, fontFamily: fonts.bold, fontSize: 13, color: colors.gray500 },
  calloutItem: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  calloutMeta: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray400 },
  compCard: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  compHeaderRow: {
    flexDirection: "row",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  compRankCol: { width: 40, alignItems: "center", justifyContent: "center" },
  compPlayerCol: { alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  compHeaderText: { ...type.eyebrow, fontSize: 11 },
  compDataRow: { flexDirection: "row", paddingVertical: 8, borderRadius: radii.sm },
  compDataRowAlt: { backgroundColor: "rgba(255,255,255,0.03)" },
  compRankTile: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: colors.highlightSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  compRankNum: { fontFamily: fonts.bold, fontSize: 12, color: colors.highlight },
  compItemText: { fontFamily: fonts.medium, fontSize: 13, color: colors.white, textAlign: "center" },

  // Voting / ranked rows
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  candidateName: { flex: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.white },
  voteTag: { flexDirection: "row", alignItems: "center", gap: 2 },
  rankValue: { fontFamily: fonts.bold, fontSize: 15, color: colors.gray300, fontVariant: ["tabular-nums"] },
  submittedIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.highlightSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  // Game over
  winnerContent: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 20 },
  winnerName: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.onPrimary },
  winnerScore: { fontFamily: fonts.semibold, fontSize: 13, color: "rgba(14,12,26,0.65)" },
});
