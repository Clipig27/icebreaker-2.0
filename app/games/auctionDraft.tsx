import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii, spacing, type } from "../../src/theme";
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
import CountdownBar from "../../src/components/CountdownBar";
import GameLogo from "../../src/components/GameLogo";
import { competitionRanks, joinNames } from "../../src/utils/rank";
import { awardTrophies } from "../../src/utils/trophies";
import {
  AUCTION_GAME_NAME,
  AUCTION_THEMES,
  CUSTOM_THEME_ID,
  CUSTOM_THEME_INFO,
  CUSTOM_ITEM_EMOJI,
  MAX_PLAYERS,
  RESULT_MS,
  STARTING_MONEY,
  TURN_MS,
  AuctionState,
  AuctionTheme,
  AuctionThemeInfo,
  AuctionItem,
  applyBid,
  applyPass,
  applyTimeout,
  bidBounds,
  buildCustomTheme,
  createAuction,
  auctionRecentCap,
  auctionRecentKey,
  drawPool,
  drawThemePool,
  itemsPerPlayerFor,
  markDeparted,
  nextItem,
  playerAuctionStatus,
  PlayerAuctionStatus,
  splitItemLines,
  tallyVotes,
  themeInfo,
  validateCustomTheme,
  validatePlayerCount,
} from "../../src/data/auctionDraft";
import { getRecent, loadRecent, markUsed } from "../../src/utils/deck";

// ---------------------------------------------------------------------------
// Game-specific color palette (dark green)
// ---------------------------------------------------------------------------
const THEME = {
  bg: "#1A2E1A",
  card: "#243824",
  accent: "#5ABF9C",
  gold: "#F0C66A",
  accentSoft: "rgba(90,191,156,0.15)",
  accentBorder: "rgba(90,191,156,0.25)",
  cardBorder: "rgba(90,191,156,0.12)",
  surface: "#243824",
  surfaceLight: "#2E4A2E",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "intro" | "setup" | "auction" | "reveal" | "voting" | "vote-results" | "game-over";

type GameState = {
  phase: Phase;
  game: "auctionDraft";
  theme: AuctionThemeInfo | null;
  auction: AuctionState | null;
  /** Username snapshot at auction start so players who leave still render. */
  names: Record<string, string>;
  votes: Record<string, string>; // voterId -> voteeId
  votedPlayerIds: string[];
  winners: string[];
  round: number; // 1-based, bumps on Play Again
};

const GAME_ID = "auctionDraft";

function initialState(): GameState {
  return {
    phase: "intro",
    game: GAME_ID,
    theme: null,
    auction: null,
    names: {},
    votes: {},
    votedPlayerIds: [],
    winners: [],
    round: 1,
  };
}

/** Write a new auction into the game state; a finished auction moves to the reveal. */
function withAuction(cur: GameState, next: AuctionState | null): GameState | null {
  if (!next) return null;
  return { ...cur, auction: next, phase: next.status === "done" ? "reveal" : cur.phase };
}

const warn = (e: unknown) => console.warn("[auctionDraft]", e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AuctionDraftScreen() {
  const router = useRouter();
  const { room, players, isHost, mutateGameState, endGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const gs: GameState | null = room?.game_state ?? null;
  const phase = gs?.phase ?? null;
  const auction = gs?.auction ?? null;
  const myId = user?.id ?? "";

  // Host setup (local)
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customBase, setCustomBase] = useState("");
  const [customDraft, setCustomDraft] = useState("");
  const [customItems, setCustomItems] = useState<string[]>([]);
  const [launching, setLaunching] = useState(false);
  const customScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const customItemInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  // Latest draft for the "+" handler (fires on press-in, before any re-render).
  const customDraftRef = useRef("");
  customDraftRef.current = customDraft;

  // Bidding (local)
  const [bidAmount, setBidAmount] = useState(1);
  const [acting, setActing] = useState(false);

  // Voting (local)
  const [myVote, setMyVote] = useState<string | null>(null);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [trophyDelta, setTrophyDelta] = useState(0);

  const presentIds = useMemo(() => new Set(players.map((p) => p.user_id)), [players]);
  const presentKey = players.map((p) => p.user_id).join(",");

  const nameOf = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "?";
      return players.find((p) => p.user_id === id)?.username ?? gs?.names?.[id] ?? "Player";
    },
    [players, gs?.names]
  );

  // -----------------------------------------------------------------------
  // Host effects (all depend on isHost so a new host picks them up)
  // -----------------------------------------------------------------------

  // Initialise on mount
  useEffect(() => {
    if (!isHost || !room) return;
    if (gs && gs.game === GAME_ID && gs.phase && (gs.phase as string) !== "starting") return;
    mutateGameState((cur) => {
      if (cur?.phase && cur.phase !== "starting") return null;
      return initialState();
    }).catch(warn);
  }, [isHost, room?.id, gs?.phase === "starting"]);

  // Hydrate this device's recently-dealt item ids so pools don't repeat
  useEffect(() => {
    if (!isHost) return;
    for (const t of AUCTION_THEMES) loadRecent(auctionRecentKey(t.id)).catch(() => {});
  }, [isHost]);

  // Players who left mid-auction are skipped (treated as passed / sat out)
  useEffect(() => {
    if (!isHost || phase !== "auction" || !auction || players.length === 0) return;
    const missing = auction.order.filter((id) => !presentIds.has(id) && !auction.departed.includes(id));
    if (missing.length === 0) return;
    mutateGameState((cur: GameState) => {
      if (!cur || cur.phase !== "auction" || !cur.auction) return null;
      return withAuction(cur, markDeparted(cur.auction, missing, Date.now()));
    }).catch(warn);
  }, [isHost, phase, presentKey, auction?.departed?.length, auction?.seq]);

  // Non-host clients step in this long after a deadline if the host hasn't.
  const BACKUP_GRACE_MS = 5000;

  // Turn timer: auto-pass the current bidder when their deadline passes.
  // The host fires on time; every other client is a backup a few seconds later,
  // so a host whose app dies or disconnects can't freeze the game. Writes are
  // guarded by seq + compare-and-swap, so a double fire is a no-op.
  useEffect(() => {
    if (phase !== "auction" || !auction || auction.status !== "bidding") return;
    const seq = auction.seq;
    // Clamp so a writer with a skewed clock can't stall the game.
    const delay = Math.min(Math.max(0, auction.deadline - Date.now()), TURN_MS) + 400 + (isHost ? 0 : BACKUP_GRACE_MS);
    const t = setTimeout(() => {
      mutateGameState((cur: GameState) => {
        if (!cur || cur.phase !== "auction" || !cur.auction) return null;
        return withAuction(cur, applyTimeout(cur.auction, seq, Date.now()));
      }).catch(warn);
    }, delay);
    return () => clearTimeout(t);
  }, [isHost, phase, auction?.seq, auction?.status, auction?.deadline]);

  // Result card ("SOLD to X") → next item after ~2.5s
  const advanceFromResult = useCallback(
    (seq: number) =>
      mutateGameState((cur: GameState) => {
        if (!cur || cur.phase !== "auction" || !cur.auction || cur.auction.seq !== seq) return null;
        return withAuction(cur, nextItem(cur.auction, Date.now()));
      }).catch(warn),
    [mutateGameState]
  );

  useEffect(() => {
    if (phase !== "auction" || !auction || auction.status !== "result") return;
    const seq = auction.seq;
    const delay = Math.min(Math.max(0, auction.deadline - Date.now()), RESULT_MS) + (isHost ? 0 : BACKUP_GRACE_MS);
    const t = setTimeout(() => advanceFromResult(seq), delay);
    return () => clearTimeout(t);
  }, [isHost, phase, auction?.seq, auction?.status, auction?.deadline]);

  // Safety net: a finished auction always lands on the reveal
  useEffect(() => {
    if (phase !== "auction" || auction?.status !== "done") return;
    mutateGameState((cur: GameState) => {
      if (!cur || cur.phase !== "auction" || cur.auction?.status !== "done") return null;
      return { ...cur, phase: "reveal" };
    }).catch(warn);
  }, [isHost, phase, auction?.status]);

  // Voting: participants still in the room who have someone to vote for
  const voterIds = useMemo(() => {
    const connected = (auction?.order ?? []).filter((id) => presentIds.has(id));
    return connected.length >= 2 ? connected : [];
  }, [auction?.order, presentIds]);

  const tallyAndShowResults = useCallback(
    (requireAll: string[] | null) =>
      mutateGameState((cur: GameState) => {
        if (!cur || cur.phase !== "voting" || !cur.auction) return null;
        if (requireAll && !requireAll.every((id) => (cur.votedPlayerIds ?? []).includes(id))) return null;
        const { winners } = tallyVotes(cur.votes ?? {}, cur.auction.order);
        return { ...cur, phase: "vote-results", winners };
      }).catch(warn),
    [mutateGameState]
  );

  useEffect(() => {
    if (!isHost || phase !== "voting" || !gs || voterIds.length === 0) return;
    const voted = gs.votedPlayerIds ?? [];
    if (voterIds.every((id) => voted.includes(id))) tallyAndShowResults(voterIds);
  }, [isHost, phase, gs?.votedPlayerIds?.length, voterIds]);

  // -----------------------------------------------------------------------
  // Everyone: local resets, stats, navigation
  // -----------------------------------------------------------------------

  // Reset bid amount whenever the item / high bid / turn changes
  const bidKey = auction ? `${auction.itemIndex}:${auction.highBid}:${auction.turn}` : "";
  useEffect(() => {
    if (!auction || auction.status !== "bidding") return;
    const { min, max } = bidBounds(auction, myId);
    setBidAmount(Math.max(1, Math.min(min, max)));
    setActing(false);
  }, [bidKey]);

  useEffect(() => {
    if (phase !== "voting") {
      setMyVote(null);
      setSubmittingVote(false);
    }
  }, [phase]);

  // Reset refs when game restarts (Play Again)
  useEffect(() => {
    if (phase === "intro" || phase === "starting" || (gs as any)?.phase === "starting") {
      trackedGameRef.current = false;
      navigatedBackRef.current = false;
    }
  }, [phase]);

  // Track wins / games played (once per finished game)
  const trackedGameRef = useRef(false);
  useEffect(() => {
    if (phase !== "game-over") {
      trackedGameRef.current = false;
      return;
    }
    if (trackedGameRef.current || !gs?.auction?.order.includes(myId)) return;
    trackedGameRef.current = true;
    useAuthStore.getState().incrementGamesPlayed();
    if ((gs.winners ?? []).includes(myId)) useAuthStore.getState().incrementWins();
    const winners = gs.winners ?? [];
    if (winners.length > 0) {
      awardTrophies(winners[0], "auctionDraft").then((d) => setTrophyDelta(d));
    }
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

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const startFromIntro = useCallback(() => {
    mutateGameState((cur: GameState) => {
      if (!cur || cur.phase !== "intro") return null;
      return { ...cur, phase: "setup" };
    }).catch(warn);
  }, [mutateGameState]);

  const playerCount = players.length;
  const countCheck = validatePlayerCount(playerCount);
  const perPlayer = itemsPerPlayerFor(playerCount);
  const customCheck = validateCustomTheme(customBase, customItems, playerCount);

  const addCustomItems = useCallback(() => {
    const lines = splitItemLines(customDraftRef.current);
    // Keep the keyboard up on the item field so the host can keep adding.
    customItemInputRef.current?.focus();
    if (lines.length === 0) return;
    customDraftRef.current = "";
    setCustomItems((prev) => {
      const seen = new Set(prev.map((s) => s.toLowerCase()));
      const next = [...prev];
      for (const l of lines) {
        if (seen.has(l.toLowerCase())) continue;
        seen.add(l.toLowerCase());
        next.push(l);
      }
      return next;
    });
    setCustomDraft("");
  }, []);

  // New chip added -> keep the newest chips + the input in view above the footer.
  useEffect(() => {
    if (!customOpen) return;
    const t = setTimeout(() => customScrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [customItems.length, customOpen]);

  const beginAuction = useCallback(async () => {
    if (!selectedTheme || launching) return;
    const order = players.map((p) => p.user_id);
    const n = order.length;
    if (!validatePlayerCount(n).ok) return;
    let auctionState: AuctionState;
    let info: AuctionThemeInfo;
    try {
      if (selectedTheme === CUSTOM_THEME_ID) {
        const check = validateCustomTheme(customBase, customItems, n);
        if (!check.ok) return;
        const theme: AuctionTheme = buildCustomTheme(customBase, check.items);
        auctionState = createAuction(order, drawPool(theme.items, n * itemsPerPlayerFor(n)), Date.now());
        info = themeInfo(theme);
      } else {
        if (!AUCTION_THEMES.some((t) => t.id === selectedTheme)) return;
        // Built-in theme: coherent pool from the recipe engine, avoiding this device's recent items
        const key = auctionRecentKey(selectedTheme);
        const drawn = drawThemePool(selectedTheme, n, getRecent(key));
        auctionState = createAuction(order, drawn.pool, Date.now());
        info = drawn.info;
        markUsed(key, drawn.pool.map((it) => it.id), auctionRecentCap(selectedTheme));
      }
    } catch (e) {
      warn(e);
      return;
    }
    const names = Object.fromEntries(players.map((p) => [p.user_id, p.username]));
    setLaunching(true);
    await mutateGameState((cur: GameState) => {
      if (!cur || cur.phase !== "setup") return null;
      return {
        ...cur,
        phase: "auction",
        theme: info,
        auction: { ...auctionState, deadline: Date.now() + TURN_MS },
        names,
        votes: {},
        votedPlayerIds: [],
        winners: [],
      };
    }).catch(warn);
    setLaunching(false);
  }, [selectedTheme, launching, players, customBase, customItems, mutateGameState]);

  const placeBid = useCallback(
    async (amount: number) => {
      if (acting) return;
      setActing(true);
      const ok = await mutateGameState((cur: GameState) => {
        if (!cur || cur.phase !== "auction" || !cur.auction) return null;
        return withAuction(cur, applyBid(cur.auction, myId, amount, Date.now()));
      }).catch(warn);
      if (!ok) setActing(false);
    },
    [acting, myId, mutateGameState]
  );

  const pass = useCallback(async () => {
    if (acting) return;
    setActing(true);
    const ok = await mutateGameState((cur: GameState) => {
      if (!cur || cur.phase !== "auction" || !cur.auction) return null;
      return withAuction(cur, applyPass(cur.auction, myId, Date.now()));
    }).catch(warn);
    if (!ok) setActing(false);
  }, [acting, myId, mutateGameState]);

  const toVoting = useCallback(() => {
    mutateGameState((cur: GameState) => {
      if (!cur || cur.phase !== "reveal") return null;
      return { ...cur, phase: "voting", votes: {}, votedPlayerIds: [], winners: [] };
    }).catch(warn);
  }, [mutateGameState]);

  const submitVote = useCallback(async () => {
    if (!myVote || myVote === myId || submittingVote) return;
    setSubmittingVote(true);
    const voteeId = myVote;
    const ok = await mutateGameState((cur: GameState) => {
      if (!cur || cur.phase !== "voting") return null;
      if ((cur.votedPlayerIds ?? []).includes(myId)) return null;
      return {
        ...cur,
        votes: { ...(cur.votes ?? {}), [myId]: voteeId },
        votedPlayerIds: [...(cur.votedPlayerIds ?? []), myId],
      };
    }).catch(warn);
    if (!ok) setSubmittingVote(false);
  }, [myVote, myId, submittingVote, mutateGameState]);

  const toGameOver = useCallback(() => {
    mutateGameState((cur: GameState) => {
      if (!cur || cur.phase !== "vote-results") return null;
      return { ...cur, phase: "game-over" };
    }).catch(warn);
  }, [mutateGameState]);

  const playAgain = useCallback(() => {
    setSelectedTheme(null);
    setCustomOpen(false);
    mutateGameState((cur: GameState) => {
      if (!cur || cur.phase !== "game-over") return null;
      return {
        ...cur,
        phase: "setup",
        theme: null,
        auction: null,
        votes: {},
        votedPlayerIds: [],
        winners: [],
        round: (cur.round ?? 1) + 1,
      };
    }).catch(warn);
  }, [mutateGameState]);

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (!gs || (gs.game as string) !== GAME_ID || !phase || (phase as string) === "starting") {
    return <GameLoadingScreen name={AUCTION_GAME_NAME} icon="pricetags" color="#F472B6" />;
  }

  const theme = gs.theme;
  const roundPill = (gs.round ?? 1) > 1 ? `Game ${gs.round}` : undefined;

  // === INTRO ===
  if (phase === "intro") {
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Continue" icon="arrow-forward" onPress={startFromIntro} testID="ad-start" />
          ) : (
            <WaitingNote label="Waiting for host to start..." />
          )
        }
      >
        <ScreenTitle title={AUCTION_GAME_NAME} subtitle="Bid on items one at a time and build the best creation." />
        <HeroGradient>
          <View style={st.heroContent}>
            <View style={st.heroCopy}>
              <Eyebrow tone="dark">${STARTING_MONEY} each · 2-4 players</Eyebrow>
              <Text style={st.heroTitle}>Outbid. Outbuild. Win the vote.</Text>
            </View>
            <Text style={st.heroEmoji}>{"🔨"}</Text>
          </View>
        </HeroGradient>
        <Eyebrow style={st.sectionEyebrow}>How it works</Eyebrow>
        <View style={st.list}>
          {[
            ["💰", `Everyone starts with $${STARTING_MONEY} and the same base.`],
            ["🔨", "Items go up one at a time. On your turn, raise the bid or pass — a pass is final."],
            ["🎒", "Fill every slot (2 players: 5, 3: 4, 4: 3). Full or broke? You sit out."],
            ["🎁", "Nobody bids? The item goes free to whoever needs it most."],
            ["🏆", "Reveal your creations and vote for the best one."],
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
          <ScreenTitle title="Pick a Theme" subtitle="Host is choosing what you'll be bidding on." pill={roundPill} />
          <GradientCard contentStyle={st.centerCard}>
            <View style={st.artTileLg}>
              <Text style={st.artEmojiLg}>{"🏷️"}</Text>
            </View>
            <Eyebrow>Up next</Eyebrow>
            <Text style={st.centerCardText}>Start saving — you've got ${STARTING_MONEY}.</Text>
          </GradientCard>
        </Shell>
      );
    }

    // Custom theme editor
    if (customOpen) {
      const canStart = countCheck.ok && customCheck.ok && !launching;
      return (
        <Shell
          keyboard
          scrollRef={customScrollRef}
          footer={
            <View style={st.footerStack}>
              <Text style={[st.footerMsg, st.footerMsgFixed, canStart && st.footerMsgOk]} numberOfLines={2}>
                {countCheck.message ?? customCheck.message ?? `Ready: ${customCheck.items.length} items for ${playerCount} players.`}
              </Text>
              <PrimaryAction
                label="Start Auction"
                icon="hammer"
                onPress={beginAuction}
                disabled={!canStart}
                loading={launching}
                testID="ad-begin"
              />
            </View>
          }
        >
          <View style={st.titleBlock}>
            <View style={st.eyebrowRow}>
              <GameLogo gameId="auctionDraft" height={44} />
              <Pill tone="peach" label="Custom" />
            </View>
            <Text style={type.title}>Custom Theme</Text>
          </View>
          <View style={st.field}>
            <Eyebrow>Everyone starts with</Eyebrow>
            <TextInput
              testID="ad-custom-base"
              style={st.input}
              placeholder="e.g. Pizza crust"
              placeholderTextColor={colors.gray500}
              value={customBase}
              onChangeText={setCustomBase}
              returnKeyType="next"
              maxLength={40}
            />
          </View>
          <View style={st.field}>
            <View style={st.fieldLabelRow}>
              <Eyebrow>Items to auction</Eyebrow>
              <Text style={st.editorCount}>
                {customItems.length}/{customCheck.needed || "—"}
              </Text>
            </View>
            {/* Chips sit ABOVE the input so, with the keyboard up, they stay in the
                visible scroll area instead of being pushed under the pinned footer. */}
            <View style={st.chipWrap}>
              {customItems.length === 0 ? (
                <Text style={st.chipEmpty}>No items yet. Add them one at a time below.</Text>
              ) : (
                customItems.map((it) => (
                  <Pressable
                    key={it}
                    onPress={() => setCustomItems((prev) => prev.filter((x) => x !== it))}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${it}`}
                    style={({ pressed }) => [st.chip, pressed && st.pressed]}
                  >
                    <Text style={st.chipText} numberOfLines={1}>
                      {CUSTOM_ITEM_EMOJI} {it}
                    </Text>
                    <Ionicons name="close" size={13} color={colors.gray400} />
                  </Pressable>
                ))
              )}
            </View>
            <View style={st.addRow}>
              <TextInput
                ref={customItemInputRef}
                testID="ad-custom-item"
                style={[st.input, st.flex1]}
                placeholder="Add an item"
                placeholderTextColor={colors.gray500}
                value={customDraft}
                onChangeText={setCustomDraft}
                onSubmitEditing={addCustomItems}
                onFocus={() => setTimeout(() => customScrollRef.current?.scrollToEnd({ animated: true }), 250)}
                submitBehavior="submit"
                returnKeyType="done"
                // Autocorrect/predictive commits can land after the "+" tap and
                // swallow it (or re-fill the cleared field); plain entry is safer.
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                maxLength={40}
              />
              <Pressable
                testID="ad-custom-add"
                accessibilityRole="button"
                accessibilityLabel="Add item"
                // Fire on touch-down: can't be cancelled by a keyboard/layout shift
                // mid-press, so the first tap always adds.
                onPressIn={addCustomItems}
                // Accessibility activation only calls onPress; after a press-in add
                // the draft ref is already empty so this is a no-op.
                onPress={addCustomItems}
                hitSlop={8}
                style={({ pressed }) => [st.addBtn, pressed && st.pressed]}
              >
                <Ionicons name="add" size={24} color={colors.onLavender} />
              </Pressable>
            </View>
          </View>
          <TextLink label="Back to themes" onPress={() => setCustomOpen(false)} />
        </Shell>
      );
    }

    const builtIn = AUCTION_THEMES.find((t) => t.id === selectedTheme);
    const canStart = countCheck.ok && !!builtIn && !launching;
    return (
      <Shell
        footer={
          <View style={st.footerStack}>
            {countCheck.message ? (
              <Text style={st.footerMsg} numberOfLines={2}>{countCheck.message}</Text>
            ) : !builtIn ? (
              <Text style={st.footerMsg}>Pick a theme to start.</Text>
            ) : null}
            <PrimaryAction
              label={builtIn ? `Start: ${builtIn.name}` : "Start Auction"}
              icon="hammer"
              onPress={beginAuction}
              disabled={!canStart}
              loading={launching}
              testID="ad-begin"
            />
          </View>
        }
      >
        <ScreenTitle
          title="Pick a Theme"
          subtitle={
            countCheck.ok
              ? `${playerCount} players · ${perPlayer} items each · $${STARTING_MONEY} to spend`
              : `2-${MAX_PLAYERS} players · $${STARTING_MONEY} to spend`
          }
          pill={roundPill}
        />
        <View style={st.catGrid}>
          {[...AUCTION_THEMES.map(themeInfo), CUSTOM_THEME_INFO].map((t) => {
            const selected = selectedTheme === t.id;
            const isCustom = t.id === CUSTOM_THEME_ID;
            return (
              <Pressable
                key={t.id}
                testID={`ad-theme-${t.id}`}
                style={({ pressed }) => [st.catTileWrap, pressed && st.pressed]}
                onPress={() => {
                  setSelectedTheme(t.id);
                  if (isCustom) setCustomOpen(true);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <GradientCard
                  radius={radii.lg}
                  style={st.flex1}
                  borderColors={selected ? SELECTED_BORDER : undefined}
                  contentStyle={st.catCard}
                >
                  <View style={[st.catEmojiTile, selected && st.catEmojiTileOn]}>
                    <Text style={st.catEmoji}>{t.emoji}</Text>
                  </View>
                  <Text style={st.catLabel} numberOfLines={2}>{t.name}</Text>
                  <Text style={st.catItemCount} numberOfLines={1}>
                    {isCustom ? "Your own list" : `${t.baseEmoji} ${t.baseName}`}
                  </Text>
                </GradientCard>
              </Pressable>
            );
          })}
        </View>
      </Shell>
    );
  }

  // === AUCTION ===
  if (phase === "auction" && auction && theme) {
    return (
      <AuctionView
        auction={auction}
        theme={theme}
        myId={myId}
        isHost={isHost}
        nameOf={nameOf}
        presentIds={presentIds}
        bidAmount={bidAmount}
        setBidAmount={setBidAmount}
        acting={acting}
        onBid={placeBid}
        onPass={pass}
        onNext={() => advanceFromResult(auction.seq)}
      />
    );
  }

  // === REVEAL ===
  if (phase === "reveal" && auction && theme) {
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction
              label={`Vote for the Best ${cap(theme.finishedNoun)}`}
              icon="arrow-forward"
              onPress={toVoting}
              testID="ad-next"
            />
          ) : (
            <WaitingNote label="Waiting for host to continue..." />
          )
        }
      >
        <ScreenTitle title="The Reveal" subtitle={`Behold: every ${theme.finishedNoun}.`} pill={roundPill} />
        <View style={st.list}>
          {auction.order.map((id) => (
            <CreationCard
              key={id}
              theme={theme}
              name={nameOf(id)}
              items={auction.players[id]?.items ?? []}
              money={auction.players[id]?.money ?? 0}
              isMe={id === myId}
              left={!presentIds.has(id)}
            />
          ))}
        </View>
      </Shell>
    );
  }

  // === VOTING ===
  if (phase === "voting" && auction && theme) {
    const amParticipant = voterIds.includes(myId);
    const iHaveVoted = (gs.votedPlayerIds ?? []).includes(myId);
    const votesIn = voterIds.filter((id) => (gs.votedPlayerIds ?? []).includes(id)).length;
    const hostForce = isHost ? (
      <PrimaryAction
        label="End Voting"
        variant="dark"
        onPress={() => tallyAndShowResults(null)}
        testID="ad-next"
      />
    ) : null;

    if (!amParticipant || iHaveVoted) {
      return (
        <Shell
          footer={
            <View style={st.footerStack}>
              <WaitingNote done={iHaveVoted} label={`${votesIn} / ${voterIds.length} voted`} />
              {hostForce}
            </View>
          }
        >
          <ScreenTitle
            title={iHaveVoted ? "Vote submitted!" : "Voting..."}
            subtitle={`Players are picking the best ${theme.finishedNoun}.`}
            pill={roundPill}
          />
          <GradientCard contentStyle={st.centerCard}>
            <View style={st.submittedIcon}>
              <Ionicons name={iHaveVoted ? "checkmark" : "hourglass-outline"} size={36} color={THEME.accent} />
            </View>
            <Eyebrow>Votes in</Eyebrow>
            <Text style={st.bigCount}>
              {votesIn}
              <Text style={st.bigCountDen}>/{voterIds.length}</Text>
            </Text>
          </GradientCard>
        </Shell>
      );
    }

    return (
      <Shell
        footer={
          <View style={st.footerStack}>
            <PrimaryAction
              label={myVote ? `Vote for ${nameOf(myVote)}` : "Pick a favorite"}
              icon="checkmark"
              onPress={submitVote}
              disabled={!myVote || submittingVote}
              loading={submittingVote}
              testID="ad-vote-submit"
            />
            {hostForce}
          </View>
        }
      >
        <ScreenTitle
          title={`Best ${cap(theme.finishedNoun)}?`}
          subtitle="You can't vote for yourself."
          pill={roundPill}
        />
        <View style={st.list}>
          {auction.order.map((id, idx) => {
            if (id === myId || !presentIds.has(id)) return null;
            const selected = myVote === id;
            return (
              <Pressable
                key={id}
                testID={`ad-vote-${idx}`}
                onPress={() => setMyVote(id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [pressed && st.pressed]}
              >
                <CreationCard
                  theme={theme}
                  name={nameOf(id)}
                  items={auction.players[id]?.items ?? []}
                  money={auction.players[id]?.money ?? 0}
                  selected={selected}
                  compact
                />
              </Pressable>
            );
          })}
        </View>
      </Shell>
    );
  }

  // === VOTE RESULTS ===
  if (phase === "vote-results" && auction && theme) {
    const { counts } = tallyVotes(gs.votes ?? {}, auction.order);
    const winners = gs.winners ?? [];
    const sorted = auction.order
      .map((id) => ({ id, name: nameOf(id), votes: counts[id] ?? 0 }))
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
    const ranks = competitionRanks(sorted, (p) => p.votes);
    const tie = winners.length > 1;
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="See Final Results" icon="arrow-forward" onPress={toGameOver} testID="ad-next" />
          ) : (
            <WaitingNote label="Waiting for host..." />
          )
        }
      >
        <ScreenTitle
          title={tie ? "It's a tie!" : "Vote Results"}
          subtitle={
            winners.length === 0
              ? "No votes were cast."
              : `${joinNames(winners.map(nameOf))} ${tie ? "share" : "takes"} the win.`
          }
          pill={roundPill}
        />
        <View style={st.list}>
          {sorted.map((p, i) => {
            const won = winners.includes(p.id);
            return (
              <GradientCard
                key={p.id}
                radius={radii.lg}
                borderColors={won ? GOLD_BORDER : p.id === myId ? SELECTED_BORDER : undefined}
                contentStyle={st.candidateRow}
              >
                <View style={[st.numTile, won ? st.numTileGold : st.numTileMuted]}>
                  <Text style={won ? st.numTileTextOn : st.numTileText}>{ranks[i]}</Text>
                </View>
                <PlayerAvatar username={p.name} size={32} />
                <Text style={st.candidateName} numberOfLines={1}>
                  {p.name}
                  {p.id === myId ? " (You)" : ""}
                </Text>
                {won ? <Ionicons name="trophy" size={18} color={colors.goldStat} /> : null}
                <Text style={[st.rankValue, won && { color: colors.goldStat }]}>
                  {p.votes} vote{p.votes !== 1 ? "s" : ""}
                </Text>
              </GradientCard>
            );
          })}
        </View>
      </Shell>
    );
  }

  // === GAME OVER ===
  if (phase === "game-over" && auction && theme) {
    const winners = gs.winners ?? [];
    const tie = winners.length > 1;
    const iWon = winners.includes(myId);
    const title =
      winners.length === 0
        ? "No winner"
        : iWon
          ? tie
            ? "You tied for the win!"
            : "You Win!"
          : tie
            ? "It's a tie!"
            : `${nameOf(winners[0])} Wins!`;
    return (
      <Shell
        footer={
          isHost ? (
            <View style={st.footerStack}>
              <PrimaryAction label="Play Again" icon="refresh" iconPosition="left" onPress={playAgain} testID="ad-play-again" />
              <PrimaryAction label="Back to Lobby" variant="dark" onPress={() => endGame()} testID="ad-lobby" />
            </View>
          ) : (
            <View style={st.centerRow}>
              <HostWaitingPill label="Waiting for host..." style={{ marginTop: 0 }} />
            </View>
          )
        }
      >
        <ScreenTitle title={title} subtitle={`Best ${theme.finishedNoun}, as voted by the table`} pill={roundPill} />
        {winners.length > 0 && (
          <HeroGradient>
            <View style={st.winnerContent}>
              <Ionicons name="trophy" size={30} color={colors.onPrimary} />
              <View style={st.flex1}>
                <Eyebrow tone="dark">{tie ? "Co-winners" : "Winner"}</Eyebrow>
                <Text style={st.winnerName} numberOfLines={2}>{joinNames(winners.map(nameOf))}</Text>
              </View>
            </View>
          </HeroGradient>
        )}
        {trophyDelta !== 0 && (
          <Text style={trophyDelta > 0 ? st.trophyGain : st.trophyLoss}>
            {trophyDelta > 0 ? `\uD83C\uDFC6 +${trophyDelta} trophies!` : `\uD83C\uDFC6 -1 trophy`}
          </Text>
        )}
        <View style={st.list}>
          {[...auction.order]
            .sort((a, b) => Number(winners.includes(b)) - Number(winners.includes(a)))
            .map((id) => (
              <CreationCard
                key={id}
                theme={theme}
                name={nameOf(id)}
                items={auction.players[id]?.items ?? []}
                money={auction.players[id]?.money ?? 0}
                isMe={id === myId}
                winner={winners.includes(id)}
                compact
              />
            ))}
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <ActivityIndicator size="small" color={colors.gray500} />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Auction phase view
// ---------------------------------------------------------------------------

function AuctionView({
  auction,
  theme,
  myId,
  isHost,
  nameOf,
  presentIds,
  bidAmount,
  setBidAmount,
  acting,
  onBid,
  onPass,
  onNext,
}: {
  auction: AuctionState;
  theme: AuctionThemeInfo;
  myId: string;
  isHost: boolean;
  nameOf: (id: string | null | undefined) => string;
  presentIds: Set<string>;
  bidAmount: number;
  setBidAmount: (n: number) => void;
  acting: boolean;
  onBid: (amount: number) => void;
  onPass: () => void;
  onNext: () => void;
}) {
  const total = auction.pool.length;
  const showing = Math.min(auction.itemIndex, total - 1);
  const item = auction.pool[showing];
  const isBidding = auction.status === "bidding";
  const myTurn = isBidding && auction.turn === myId;
  const amIn = auction.order.includes(myId);
  const { min, max, canRaise } = bidBounds(auction, myId);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  // CountdownBar runs locally from mount; remount per turn with the time left.
  const turnSeconds = useMemo(
    () => Math.max(1, Math.ceil((auction.deadline - Date.now()) / 1000)),
    [auction.seq, auction.deadline]
  );

  let footer: React.ReactNode;
  if (myTurn) {
    footer = (
      <View style={st.footerStack} testID="ad-my-turn">
        <View style={st.stepRow}>
          <Stepper label="-$1" testID="ad-bid-minus" disabled={!canRaise || bidAmount <= min} onPress={() => setBidAmount(clamp(bidAmount - 1))} />
          <View style={st.amountBox}>
            <Text style={st.amountText}>${canRaise ? bidAmount : "—"}</Text>
            <Text style={st.amountMeta}>max ${max}</Text>
          </View>
          <Stepper label="+$1" testID="ad-bid-plus1" disabled={!canRaise || bidAmount >= max} onPress={() => setBidAmount(clamp(bidAmount + 1))} />
          <Stepper label="+$5" testID="ad-bid-plus5" disabled={!canRaise || bidAmount >= max} onPress={() => setBidAmount(clamp(bidAmount + 5))} />
        </View>
        <View style={st.actionRow}>
          <PrimaryAction label="Pass" variant="dark" onPress={onPass} disabled={acting} style={st.passBtn} testID="ad-pass" />
          <PrimaryAction
            label={canRaise ? `Bid $${bidAmount}` : "Can't raise"}
            icon="hammer"
            onPress={() => onBid(bidAmount)}
            disabled={!canRaise || acting || bidAmount < min || bidAmount > max}
            style={st.bidBtn}
            testID="ad-bid-submit"
          />
        </View>
      </View>
    );
  } else if (!isBidding) {
    footer = isHost ? (
      <PrimaryAction label="Next Item" icon="arrow-forward" onPress={onNext} testID="ad-next" />
    ) : (
      <WaitingNote label="Next item coming up..." />
    );
  } else {
    const myStatus = amIn ? playerAuctionStatus(auction, myId) : null;
    const label =
      myStatus === "full"
        ? `You're full — sitting out`
        : myStatus === "broke"
          ? "You're out of money — sitting out"
          : myStatus === "high"
            ? `You're winning at $${auction.highBid}...`
            : `Waiting for ${nameOf(auction.turn)}...`;
    footer = <WaitingNote label={label} done={myStatus === "high" || myStatus === "full"} />;
  }

  return (
    <Shell footer={footer}>
      <View style={st.eyebrowRow}>
        <GameLogo gameId="auctionDraft" height={44} />
        <Pill tone="peach" label={`Item ${showing + 1} of ${total}`} />
        <Pill tone="dark" label={theme.name} />
      </View>

      <HeroGradient>
        {isBidding ? (
          <View style={st.auctionHero}>
            <View style={st.auctionHeroTop}>
              <Text style={st.auctionEmoji}>{item?.emoji}</Text>
              <View style={st.flex1}>
                <Eyebrow tone="dark">
                  {cap(theme.itemNoun)} {showing + 1} of {total}
                </Eyebrow>
                <Text style={st.auctionName} numberOfLines={2}>{item?.name}</Text>
              </View>
            </View>
            <View style={st.highBidRow}>
              <View style={st.flex1}>
                <Eyebrow tone="dark">High bid</Eyebrow>
                <Text style={st.highBidText} numberOfLines={1}>
                  {auction.highBidder
                    ? `$${auction.highBid} · ${auction.highBidder === myId ? "You" : nameOf(auction.highBidder)}`
                    : "No bids — opens at $1"}
                </Text>
              </View>
              <Ionicons name="hammer" size={26} color="rgba(14,12,26,0.55)" />
            </View>
          </View>
        ) : (
          <ResultHero auction={auction} theme={theme} myId={myId} nameOf={nameOf} />
        )}
      </HeroGradient>

      {isBidding ? (
        <View style={st.turnBlock}>
          <View style={st.turnRow}>
            <Text style={[st.turnLabel, myTurn && st.turnLabelMine]}>{myTurn ? "Your turn!" : "Waiting for"}</Text>
            <Text testID="ad-turn" style={[st.turnName, myTurn && st.turnNameHidden]} numberOfLines={1}>
              {nameOf(auction.turn)}
            </Text>
          </View>
          <CountdownBar key={`${auction.seq}`} seconds={turnSeconds} onExpire={noop} color={colors.lavender} />
        </View>
      ) : null}

      <View style={st.strip}>
        {auction.order.map((id) => (
          <PlayerChip
            key={id}
            name={nameOf(id)}
            isMe={id === myId}
            money={auction.players[id]?.money ?? 0}
            filled={auction.players[id]?.items.length ?? 0}
            slots={auction.itemsPerPlayer}
            status={presentIds.has(id) || auction.departed.includes(id) ? playerAuctionStatus(auction, id) : "left"}
            isTurn={isBidding && auction.turn === id}
          />
        ))}
      </View>

      {amIn ? (
        <GradientCard radius={radii.lg} contentStyle={st.mineRow}>
          <Eyebrow>Your {theme.finishedNoun}</Eyebrow>
          <Text style={st.mineEmojis} numberOfLines={1}>
            {theme.baseEmoji}
            {(auction.players[myId]?.items ?? []).map((it) => it.emoji).join("")}
            {"▫️".repeat(Math.max(0, auction.itemsPerPlayer - (auction.players[myId]?.items.length ?? 0)))}
          </Text>
        </GradientCard>
      ) : null}
    </Shell>
  );
}

function ResultHero({
  auction,
  theme,
  myId,
  nameOf,
}: {
  auction: AuctionState;
  theme: AuctionThemeInfo;
  myId: string;
  nameOf: (id: string | null | undefined) => string;
}) {
  const results = auction.lastResults;
  const who = (id: string) => (id === myId ? "You" : nameOf(id));
  if (results.length === 0) {
    return (
      <View style={st.auctionHero}>
        <Eyebrow tone="dark">All done</Eyebrow>
        <Text style={st.auctionName}>Every {theme.itemNoun} is gone!</Text>
      </View>
    );
  }
  if (results[0].kind === "leftover") {
    return (
      <View style={st.auctionHero}>
        <Eyebrow tone="dark">No bidders left</Eyebrow>
        <Text style={st.auctionName}>Leftovers dealt</Text>
        <View style={st.leftoverList}>
          {results.map((r) => (
            <Text key={r.item.id} style={st.leftoverText} numberOfLines={1}>
              {r.item.emoji} {r.item.name} → {who(r.playerId)}
            </Text>
          ))}
        </View>
      </View>
    );
  }
  const r = results[0];
  return (
    <View style={st.auctionHero}>
      <View style={st.auctionHeroTop}>
        <Text style={st.auctionEmoji}>{r.item.emoji}</Text>
        <View style={st.flex1}>
          <Eyebrow tone="dark">{r.kind === "sold" ? "Sold!" : "Free!"}</Eyebrow>
          <Text style={st.auctionName} numberOfLines={2}>{r.item.name}</Text>
        </View>
      </View>
      <Text style={st.soldText} numberOfLines={2}>
        {r.kind === "sold" ? `SOLD to ${who(r.playerId)} for $${r.price}` : `FREE to ${who(r.playerId)}`}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Presentational helpers (no game logic)
// ---------------------------------------------------------------------------

const noop = () => {};
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const SELECTED_BORDER = [THEME.accent, THEME.accent] as const;
const GOLD_BORDER = ["#F6E3A6", "#D4A843"] as const;

const STATUS_LABEL: Record<PlayerAuctionStatus, string> = {
  left: "LEFT",
  full: "FULL",
  broke: "BROKE",
  high: "HIGH",
  passed: "PASSED",
  turn: "TURN",
  in: "",
};

function PlayerChip({
  name,
  isMe,
  money,
  filled,
  slots,
  status,
  isTurn,
}: {
  name: string;
  isMe: boolean;
  money: number;
  filled: number;
  slots: number;
  status: PlayerAuctionStatus;
  isTurn: boolean;
}) {
  const dim = status === "left" || status === "full" || status === "broke" || status === "passed";
  return (
    <GradientCard
      radius={radii.md}
      style={st.chipCard}
      borderColors={isTurn ? SELECTED_BORDER : status === "high" ? GOLD_BORDER : undefined}
      contentStyle={[st.chipContent, dim && st.dim]}
    >
      <PlayerAvatar username={name} size={28} />
      <Text style={st.chipName} numberOfLines={1}>
        {isMe ? "You" : name}
      </Text>
      <Text style={st.chipMoney}>${money}</Text>
      <Text style={st.chipSlots}>
        {filled}/{slots}
      </Text>
      <Text
        style={[
          st.chipStatus,
          status === "high" && { color: colors.goldStat },
          status === "turn" && { color: colors.lavender },
        ]}
        numberOfLines={1}
      >
        {STATUS_LABEL[status] || " "}
      </Text>
    </GradientCard>
  );
}

function CreationCard({
  theme,
  name,
  items,
  money,
  isMe = false,
  left = false,
  selected = false,
  winner = false,
  compact = false,
}: {
  theme: AuctionThemeInfo;
  name: string;
  items: AuctionItem[];
  money: number;
  isMe?: boolean;
  left?: boolean;
  selected?: boolean;
  winner?: boolean;
  compact?: boolean;
}) {
  return (
    <GradientCard
      radius={radii.lg}
      borderColors={winner ? GOLD_BORDER : selected || isMe ? SELECTED_BORDER : undefined}
      contentStyle={st.creation}
    >
      <View style={st.creationHead}>
        <PlayerAvatar username={name} size={32} />
        <Text style={st.candidateName} numberOfLines={1}>
          {name}
          {isMe ? " (You)" : ""}
          {left ? " (left)" : ""}
        </Text>
        {winner ? <Ionicons name="trophy" size={18} color={colors.goldStat} /> : null}
        {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.lavender} /> : null}
        <Text style={st.moneyLeft}>${money} left</Text>
      </View>
      {compact ? (
        <Text style={st.creationStack} numberOfLines={1}>
          {theme.baseEmoji} {items.map((it) => it.emoji).join(" ")}
        </Text>
      ) : null}
      <View style={st.chipWrap}>
        <View style={[st.itemChip, st.baseChip]}>
          <Text style={st.itemChipText} numberOfLines={1}>
            {theme.baseEmoji} {theme.baseName}
          </Text>
        </View>
        {items.map((it) => (
          <View key={it.id} style={st.itemChip}>
            <Text style={st.itemChipText} numberOfLines={1}>
              {it.emoji} {it.name}
            </Text>
          </View>
        ))}
      </View>
    </GradientCard>
  );
}

function Stepper({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [st.stepper, disabled && st.dim, pressed && !disabled && st.pressed]}
    >
      <Text style={st.stepperText}>{label}</Text>
    </Pressable>
  );
}

/** Screen frame: background, room toolbar, scrolling body and pinned footer. */
function Shell({
  children,
  footer,
  keyboard = false,
  scrollRef,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  keyboard?: boolean;
  scrollRef?: React.RefObject<React.ComponentRef<typeof ScrollView> | null>;
}) {
  // While the keyboard is up the footer sits right on top of it, so the
  // home-indicator inset padding is wasted space that hides scroll content.
  const [kbVisible, setKbVisible] = useState(false);
  useEffect(() => {
    if (!keyboard) return;
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const a = Keyboard.addListener(showEvt, () => setKbVisible(true));
    const b = Keyboard.addListener(hideEvt, () => setKbVisible(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, [keyboard]);

  const body = (
    <>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[st.scroll, !footer && st.scrollNoFooter]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // "interactive" lets the scroll view claim touches to track a keyboard
        // drag, which can swallow the first tap on a button while the keyboard
        // is up. Keyboard screens dismiss via tapping empty space instead.
        keyboardDismissMode={keyboard ? "none" : "interactive"}
      >
        {children}
      </ScrollView>
      {footer ? (
        <PrimaryActionBar style={keyboard && kbVisible ? st.footerKb : undefined}>{footer}</PrimaryActionBar>
      ) : null}
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
        <GameLogo gameId="auctionDraft" height={44} />
        {pill ? <Pill tone="peach" label={pill} /> : null}
      </View>
      {subtitle ? <Text style={type.subtitle}>{subtitle}</Text> : null}
    </View>
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
        <Ionicons name="checkmark-circle" size={18} color={THEME.accent} />
      ) : (
        <ActivityIndicator size="small" color={THEME.accent} />
      )}
      <Text style={st.waitingText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  scrollNoFooter: { paddingBottom: 48 },
  flex1: { flex: 1 },
  list: { gap: spacing.sm },
  centerRow: { alignItems: "center" },
  footerStack: { gap: spacing.md },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  dim: { opacity: 0.5 },

  // Title block
  titleBlock: { gap: spacing.sm },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  sectionEyebrow: { marginTop: spacing.xs },
  artTileLg: {
    width: 80,
    height: 80,
    borderRadius: radii.xl,
    backgroundColor: THEME.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  artEmojiLg: { fontSize: 40 },

  centerCard: { alignItems: "center", padding: 24, gap: spacing.md },
  centerCardText: { fontFamily: fonts.medium, fontSize: 15, color: colors.gray300, textAlign: "center" },

  // Intro hero + rules
  heroContent: { flexDirection: "row", alignItems: "center", padding: 22, gap: spacing.md },
  heroCopy: { flex: 1, gap: 6 },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 29, color: colors.onPrimary },
  heroEmoji: { fontSize: 56 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  ruleIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: THEME.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  ruleEmoji: { fontSize: 20 },
  ruleText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.white },

  // Footer
  waiting: {
    minHeight: 56,
    borderRadius: radii.pill,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  waitingText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.gray300 },
  footerMsg: { fontFamily: fonts.medium, fontSize: 13, color: colors.warning, textAlign: "center" },
  footerMsgOk: { color: colors.joinedGreen },

  // Setup grid
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catTileWrap: { width: "31%" },
  catCard: { padding: 8, alignItems: "center", gap: 4, minHeight: 100 },
  catEmojiTile: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: THEME.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  catEmojiTileOn: { backgroundColor: "rgba(186,162,249,0.35)" },
  catEmoji: { fontSize: 22 },
  catLabel: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.white, textAlign: "center" },
  catItemCount: { fontFamily: fonts.medium, fontSize: 10, color: colors.gray500 },
  textLink: { alignSelf: "center", paddingVertical: spacing.sm },
  textLinkText: { fontFamily: fonts.semibold, fontSize: 14, color: THEME.accent },

  // Custom editor
  field: { gap: spacing.sm },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  input: {
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.white,
    fontFamily: fonts.medium,
  },
  editorCount: { fontFamily: fonts.semibold, fontSize: 12, color: THEME.accent },
  addRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  addBtn: {
    width: 50,
    height: 50,
    borderRadius: radii.md,
    backgroundColor: colors.lavender,
    alignItems: "center",
    justifyContent: "center",
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chipEmpty: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray500 },
  footerKb: { paddingTop: spacing.sm, paddingBottom: spacing.sm },
  // Reserve two lines so the Start button never jumps under a finger mid-tap.
  footerMsgFixed: { minHeight: 36, textAlignVertical: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  chipText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.white },

  // Auction hero
  auctionHero: { padding: 18, gap: spacing.md },
  auctionHeroTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  auctionEmoji: { fontSize: 60, lineHeight: 72 },
  auctionName: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 31, color: colors.onPrimary },
  highBidRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(14,12,26,0.12)",
  },
  highBidText: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.onPrimary, marginTop: 2 },
  soldText: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 26, color: colors.onPrimary },
  leftoverList: { gap: 2 },
  leftoverText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.onPrimary },

  // Turn
  turnBlock: { gap: spacing.sm },
  turnRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  turnLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.gray400 },
  turnLabelMine: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.lavender },
  turnName: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  turnNameHidden: { fontSize: 12, color: colors.gray500 },

  // Player strip
  strip: { flexDirection: "row", gap: spacing.sm },
  chipCard: { flex: 1 },
  chipContent: { alignItems: "center", paddingVertical: 10, paddingHorizontal: 4, gap: 2 },
  chipName: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white, maxWidth: "100%" },
  chipMoney: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.white, fontVariant: ["tabular-nums"] },
  chipSlots: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray400 },
  chipStatus: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.8, color: colors.gray500 },

  mineRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.lg },
  mineEmojis: { flex: 1, fontSize: 22, textAlign: "right" },

  // Bid controls
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepper: {
    width: 58,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  amountBox: { flex: 1, alignItems: "center" },
  amountText: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white, fontVariant: ["tabular-nums"] },
  amountMeta: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray400 },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  passBtn: { flex: 1, paddingHorizontal: 12 },
  bidBtn: { flex: 2, paddingHorizontal: 12 },

  // Creations / voting
  creation: { padding: spacing.lg, gap: spacing.sm },
  creationHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  creationStack: { fontSize: 26, lineHeight: 34 },
  moneyLeft: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray400 },
  itemChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    maxWidth: "100%",
  },
  baseChip: { backgroundColor: THEME.accentSoft },
  itemChipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.white },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  candidateName: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  rankValue: { fontFamily: fonts.bold, fontSize: 15, color: colors.gray300, fontVariant: ["tabular-nums"] },
  numTile: { width: 32, height: 32, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  numTileGold: { backgroundColor: colors.goldStat },
  numTileMuted: { backgroundColor: THEME.surfaceLight },
  numTileText: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.white },
  numTileTextOn: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.onPrimary },
  submittedIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: THEME.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bigCount: { fontFamily: fonts.extrabold, fontSize: 44, color: colors.white, fontVariant: ["tabular-nums"] },
  bigCountDen: { fontSize: 22, color: colors.gray500 },

  // Game over
  winnerContent: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 20 },
  winnerName: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.onPrimary },
  trophyGain: { fontFamily: fonts.bold, fontSize: 16, color: "#FFD700", textAlign: "center", marginTop: spacing.sm },
  trophyLoss: { fontFamily: fonts.bold, fontSize: 16, color: colors.gray400, textAlign: "center", marginTop: spacing.sm },
});
