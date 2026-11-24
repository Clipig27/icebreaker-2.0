import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts, gradients, radii, spacing, type } from "../../src/theme";
import ScreenBackground from "../../src/components/ScreenBackground";
import PrimaryAction, { PrimaryActionBar } from "../../src/components/PrimaryAction";
import Eyebrow from "../../src/components/Eyebrow";
import Pill from "../../src/components/Pill";
import GradientCard from "../../src/components/GradientCard";
import HeroGradient from "../../src/components/HeroGradient";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { getAllNumberPrompts } from "../../src/data/numberGuessor";
import { drawFresh, loadRecent } from "../../src/utils/deck";

const NG_DECK_KEY = "ng";
import { competitionRanks, joinNames, ordinal } from "../../src/utils/rank";
import HostWaitingPill from "../../src/components/HostWaitingPill";
import GameHeader from "../../src/components/GameHeader";
import GameLoadingScreen from "../../src/components/GameLoadingScreen";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Guess = {
  userId: string;
  username: string;
  value: number | null;
  timeMs: number; // ms elapsed when guess was submitted
  timedOut: boolean;
};

type RoundResult = {
  promptId: string;
  promptText: string;
  correctAnswer: number;
  guesses: Guess[];
};

type GameState = {
  phase: "intro" | "setup" | "guessing" | "reveal" | "round-end" | "game-over";
  totalRounds: number;
  currentRound: number;
  promptIds: string[]; // pre-selected prompt ids for all rounds
  currentPrompt: { id: string; text: string; correctAnswer: number; category: string } | null;
  guesses: Guess[];
  roundResults: RoundResult[];
  penalties: Record<string, number>; // userId -> cumulative penalty
  roundStartedAt: number; // timestamp when guessing started
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIMER_SECONDS = 20;
const NO_GUESS_PENALTY = 120;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatPenalty(p: number): string {
  return p % 1 === 0 ? String(p) : p.toFixed(1);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NumberGuessorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { room, players, isHost, mutateGameState, startGame } = useRoomStore();
  const { user } = useAuthStore();
  const myId = user?.id ?? "";

  const gs: GameState | null = room?.game_state ?? null;
  const rawPhase = gs?.phase ?? "starting";
  const phase = rawPhase === "starting" ? "intro" : rawPhase;

  // Local UI state
  const [guessText, setGuessText] = useState("");
  const [hasGuessed, setHasGuessed] = useState(false);
  // True when this client's hasGuessed came from the timer auto-submit.
  const [autoTimedOut, setAutoTimedOut] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS);
  const [selectedRounds, setSelectedRounds] = useState<number>(10);

  // Animation refs
  const timerAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  // Timer ref
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const guessStartRef = useRef<number>(Date.now());

  // -------------------------------------------------------------------------
  // Navigate back to the lobby when the room returns to lobby (host + players).
  // Single place that leaves the game screen; fires once.
  // -------------------------------------------------------------------------
  // Hydrate this device's recently-used prompt list (keeps sessions fresh).
  useEffect(() => {
    loadRecent(NG_DECK_KEY);
  }, []);

  // Reset refs when game restarts (Play Again)
  useEffect(() => {
    if (phase === "intro" || phase === "starting" || (gs as any)?.phase === "starting") {
      trackedGameRef.current = false;
      navigatedBackRef.current = false;
    }
  }, [phase]);

  // Track wins/games played
  const trackedGameRef = useRef(false);
  useEffect(() => {
    if (trackedGameRef.current || phase !== "game-over" || !gs) return;
    trackedGameRef.current = true;
    useAuthStore.getState().incrementGamesPlayed();
    // Winner = lowest penalty
    const entries = Object.entries(gs.penalties ?? {});
    if (entries.length > 0) {
      const minPenalty = Math.min(...entries.map(([, p]) => p as number));
      const winners = entries.filter(([, p]) => p === minPenalty).map(([uid]) => uid);
      if (winners.includes(myId)) useAuthStore.getState().incrementWins();
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

  // -------------------------------------------------------------------------
  // Reset local state when phase changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase === "guessing") {
      setGuessText("");
      setHasGuessed(false);
      setAutoTimedOut(false);
      setSecondsLeft(TIMER_SECONDS);
      guessStartRef.current = Date.now();

      // Animate in
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
      ]).start();

      // Start timer bar animation
      timerAnim.setValue(1);
      Animated.timing(timerAnim, {
        toValue: 0,
        duration: TIMER_SECONDS * 1000,
        useNativeDriver: false,
      }).start();
    }

    if (phase === "reveal" || phase === "round-end" || phase === "game-over") {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [phase, gs?.currentRound]);

  // -------------------------------------------------------------------------
  // Countdown timer for guessing phase
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "guessing") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, gs?.currentRound]);

  // -------------------------------------------------------------------------
  // Auto-submit when timer expires
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (secondsLeft === 0 && phase === "guessing" && !hasGuessed) {
      submitGuess(true);
    }
  }, [secondsLeft, phase, hasGuessed]);

  // -------------------------------------------------------------------------
  // Check if current player already guessed (reconnection safety)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase === "guessing" && gs?.guesses && user) {
      const already = gs.guesses.some((g: Guess) => g.userId === user.id);
      if (already) setHasGuessed(true);
    }
  }, [gs?.guesses, phase, user]);

  // This player's recorded entry decides the confirmation state; fall back to
  // the local auto-timeout flag until the server state includes our entry.
  const myRecordedGuess = user
    ? (gs?.guesses as Guess[] | undefined)?.find((g) => g.userId === user.id)
    : undefined;
  const myGuessTimedOut = myRecordedGuess
    ? myRecordedGuess.timedOut || myRecordedGuess.value === null
    : autoTimedOut;

  // Only guesses from players still in the room count (a leaver's entry is ignored).
  const activeGuesses: Guess[] = React.useMemo(
    () =>
      ((gs?.guesses as Guess[] | undefined) ?? []).filter((g) =>
        players.some((p) => p.user_id === g.userId)
      ),
    [gs?.guesses, players]
  );

  // -------------------------------------------------------------------------
  // Host auto-advance: all guesses in -> move to reveal
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || phase !== "guessing" || !gs) return;
    const totalPlayers = players.length;
    const totalGuesses = activeGuesses.length;
    if (totalPlayers > 0 && totalGuesses >= totalPlayers) {
      // Small delay so last guesser sees their submission
      const forRound = gs.currentRound;
      const t = setTimeout(() => advanceToReveal(forRound), 800);
      return () => clearTimeout(t);
    }
  }, [activeGuesses.length, phase, isHost, players.length]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const beginGame = useCallback(async () => {
    const selected = drawFresh(NG_DECK_KEY, getAllNumberPrompts(), selectedRounds, (p) => p.id);
    const firstPrompt = selected[0];

    await mutateGameState((cur) => {
      // Only start from the setup screen (idempotent: no-op if already started)
      if (!cur || cur.phase !== "setup") return null;
      const newState: GameState = {
        phase: "guessing",
        totalRounds: selectedRounds,
        currentRound: 1,
        promptIds: selected.map((p) => p.id),
        currentPrompt: firstPrompt,
        guesses: [],
        roundResults: [],
        penalties: {},
        roundStartedAt: Date.now(),
      };
      return newState;
    });
  }, [selectedRounds, mutateGameState]);

  const submitGuess = useCallback(
    async (timedOut = false) => {
      if (!gs || !user || hasGuessed) return;

      setHasGuessed(true);
      if (timedOut) setAutoTimedOut(true);

      const elapsed = Date.now() - (gs.roundStartedAt || guessStartRef.current);
      const value = timedOut ? null : Math.max(0, Math.min(100, parseInt(guessText, 10) || 0));

      const myUsername =
        players.find((p) => p.user_id === user.id)?.username ?? "Player";

      const guess: Guess = {
        userId: user.id,
        username: myUsername,
        value,
        timeMs: elapsed,
        timedOut,
      };

      const round = gs.currentRound;
      // Merge only our own guess into the fresh server state (no lost updates)
      await mutateGameState((cur) => {
        if (!cur || cur.phase !== "guessing" || cur.currentRound !== round) return null;
        const existing: Guess[] = cur.guesses || [];
        if (existing.some((g) => g.userId === user.id)) return null;
        return { ...cur, guesses: [...existing, guess] };
      });
    },
    [gs, user, hasGuessed, guessText, players, mutateGameState]
  );

  // Host transition guessing -> reveal for `forRound`. Penalties are computed
  // from the FRESH server state; idempotent (no-op if already revealed).
  const advanceToReveal = useCallback(
    async (forRound: number) => {
      await mutateGameState((cur) => {
        if (!cur || cur.phase !== "guessing" || cur.currentRound !== forRound) return null;

        const correctAnswer = cur.currentPrompt?.correctAnswer ?? 0;
        // Ignore guesses from players who have left the room
        const roomPlayers = useRoomStore.getState().players;
        const guesses: Guess[] = (cur.guesses || []).filter((g: Guess) =>
          roomPlayers.some((p) => p.user_id === g.userId)
        );

        // Calculate penalties for this round
        const newPenalties: Record<string, number> = { ...(cur.penalties || {}) };
        for (const g of guesses) {
          const distance = g.timedOut || g.value === null ? NO_GUESS_PENALTY : Math.abs(g.value - correctAnswer);
          const timePenalty = g.timedOut ? 0 : Math.round(g.timeMs / 1000);
          const roundPenalty = distance + timePenalty;
          newPenalties[g.userId] = (newPenalties[g.userId] || 0) + roundPenalty;
        }

        // Also penalize players who didn't submit at all
        for (const p of roomPlayers) {
          if (!guesses.some((g) => g.userId === p.user_id)) {
            newPenalties[p.user_id] = (newPenalties[p.user_id] || 0) + NO_GUESS_PENALTY;
          }
        }

        const roundResult: RoundResult = {
          promptId: cur.currentPrompt?.id ?? "",
          promptText: cur.currentPrompt?.text ?? "",
          correctAnswer,
          guesses,
        };

        return {
          ...cur,
          phase: "reveal",
          penalties: newPenalties,
          roundResults: [...(cur.roundResults || []), roundResult],
        };
      });
    },
    [mutateGameState]
  );

  const advanceToRoundEnd = useCallback(async () => {
    const forRound = gs?.currentRound;
    if (forRound === undefined) return;
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "reveal" || cur.currentRound !== forRound) return null;
      return { ...cur, phase: "round-end" };
    });
  }, [gs?.currentRound, mutateGameState]);

  const advanceToNextRound = useCallback(async () => {
    const forRound = gs?.currentRound;
    if (forRound === undefined) return;
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "round-end" || cur.currentRound !== forRound) return null;

      if (cur.currentRound >= cur.totalRounds) {
        return { ...cur, phase: "game-over" };
      }

      const nextRound = cur.currentRound + 1;
      const nextPromptId = cur.promptIds[nextRound - 1];
      const nextPrompt = getAllNumberPrompts().find((p) => p.id === nextPromptId) ?? null;

      return {
        ...cur,
        phase: "guessing",
        currentRound: nextRound,
        currentPrompt: nextPrompt,
        guesses: [],
        roundStartedAt: Date.now(),
      };
    });
  }, [gs?.currentRound, mutateGameState]);

  // Navigation happens in the room-status effect above once status is "lobby".
  const backToLobby = useCallback(async () => {
    const { endGame } = useRoomStore.getState();
    await endGame();
  }, []);

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const leaderboard = React.useMemo(() => {
    if (!gs?.penalties) return [];
    return players
      .map((p) => ({
        userId: p.user_id,
        username: p.username,
        penalty: gs.penalties[p.user_id] ?? 0,
      }))
      .sort((a, b) => a.penalty - b.penalty);
  }, [gs?.penalties, players]);

  const currentRoundGuesses = React.useMemo(() => {
    if (!gs?.guesses || !gs.currentPrompt) return [];
    const correct = gs.currentPrompt.correctAnswer;
    const inRoom = (g: Guess) => players.some((p) => p.user_id === g.userId);
    const dist = (g: Guess) =>
      g.timedOut || g.value === null ? NO_GUESS_PENALTY : Math.abs(g.value - correct);
    // Rank by the round penalty actually shown (distance + time); distance breaks display order only.
    const roundPen = (g: Guess) =>
      dist(g) + (g.timedOut ? 0 : Math.round(g.timeMs / 1000));
    return [...gs.guesses].filter(inRoom).sort((a, b) => roundPen(a) - roundPen(b) || dist(a) - dist(b));
  }, [gs?.guesses, gs?.currentPrompt, players]);

  const leaderboardRanks = React.useMemo(
    () => competitionRanks(leaderboard, (p) => p.penalty),
    [leaderboard]
  );

  const currentRoundRanks = React.useMemo(() => {
    const correct = gs?.currentPrompt?.correctAnswer ?? 0;
    return competitionRanks(currentRoundGuesses, (g) => {
      const distance = g.timedOut || g.value === null ? NO_GUESS_PENALTY : Math.abs(g.value - correct);
      return distance + (g.timedOut ? 0 : Math.round(g.timeMs / 1000));
    });
  }, [currentRoundGuesses, gs?.currentPrompt]);

  // -------------------------------------------------------------------------
  // Renders
  // -------------------------------------------------------------------------

  const advanceToSetup = useCallback(async () => {
    console.log("[tapdiag] numberGuessor Start onPress fired, local phase:", rawPhase);
    const t0 = Date.now();
    const ok = await mutateGameState((cur) => {
      // Only from the intro screen (idempotent: no-op if already past intro)
      const curPhase = cur?.phase ?? "starting";
      if (curPhase !== "intro" && curPhase !== "starting") return null;
      return { phase: "setup" };
    });
    console.log("[tapdiag] numberGuessor Start mutateGameState:", ok, `${Date.now() - t0}ms`);
  }, [mutateGameState, rawPhase]);

  const roundPill = `Round ${gs?.currentRound ?? 1}/${gs?.totalRounds ?? 1}`;

  const renderIntro = () => (
    <Screen
      footer={
        isHost ? (
          <View onTouchStart={() => console.log("[tapdiag] numberGuessor Start onPressIn")}>
            <PrimaryAction label="Start Game" icon="play" iconPosition="left" onPress={advanceToSetup} />
          </View>
        ) : (
          <WaitingNote label="Waiting for host to start..." />
        )
      }
    >
      <ScreenTitle title="1 to 100" subtitle="Guess closest to the correct number." />
      <HeroGradient>
        <View style={styles.heroContent}>
          <View style={styles.heroCopy}>
            <Eyebrow tone="dark">Trivia · Numbers</Eyebrow>
            <Text style={styles.heroTitle}>Closest guess wins. Fastest helps.</Text>
          </View>
          <Text style={styles.heroEmoji}>{"🎯"}</Text>
        </View>
      </HeroGradient>
      <Eyebrow style={styles.sectionEyebrow}>How it works</Eyebrow>
      <View style={styles.list}>
        {[
          ["🔢", "Each round shows a trivia question with a number answer (1-100)"],
          ["⏱️", "You have 20 seconds to type your guess"],
          ["📊", "Penalty = how far off + seconds taken. No guess = 120 penalty"],
          ["🏆", "Lowest total penalty after all rounds wins!"],
        ].map(([icon, text], i) => (
          <GradientCard key={i} radius={radii.lg} contentStyle={styles.ruleRow}>
            <View style={styles.ruleIcon}>
              <Text style={styles.ruleEmoji}>{icon}</Text>
            </View>
            <Text style={styles.ruleText}>{text}</Text>
          </GradientCard>
        ))}
      </View>
    </Screen>
  );

  const renderSetup = () => (
    <Screen
      footer={
        isHost ? (
          <PrimaryAction label="Start Game" icon="play" iconPosition="left" onPress={beginGame} />
        ) : (
          <WaitingNote label="Waiting for host to start..." />
        )
      }
    >
      <ScreenTitle title="1 to 100" subtitle="Guess the number. Lowest penalty wins!" />

      <GradientCard contentStyle={styles.rulesCard}>
        <Eyebrow tone="lavender">How to Play</Eyebrow>
        <Text style={styles.rulesText}>
          Each round shows a trivia question with a numeric answer.{"\n\n"}
          You have {TIMER_SECONDS} seconds to type your guess.{"\n\n"}
          Penalty = distance from answer + seconds taken.{"\n"}
          No guess = {NO_GUESS_PENALTY} penalty.{"\n\n"}
          Lowest total penalty wins!
        </Text>
      </GradientCard>

      {isHost ? (
        <>
          <Eyebrow style={styles.sectionEyebrow}>Number of Rounds</Eyebrow>
          <View style={styles.roundOptions}>
            {[5, 10, 20].map((n) => {
              const active = selectedRounds === n;
              return (
                <Pressable
                  key={n}
                  style={({ pressed }) => [styles.flex1, pressed && styles.pressed]}
                  onPress={() => setSelectedRounds(n)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <GradientCard
                    radius={radii.lg}
                    fill={active ? SELECTED_FILL : undefined}
                    borderColors={active ? SELECTED_BORDER : undefined}
                    contentStyle={styles.roundOption}
                  >
                    <Text style={[styles.roundOptionText, active && styles.roundOptionTextActive]}>{n}</Text>
                    <Eyebrow tone={active ? "lavender" : "gray"}>Rounds</Eyebrow>
                  </GradientCard>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </Screen>
  );

  const renderGuessing = () => {
    const prompt = gs?.currentPrompt;
    if (!prompt) return null;
    const urgent = secondsLeft <= 5;

    return (
      // Whole guessing screen avoids the keyboard (not just the input row) so
      // the layout shrinks and the timer + input row stay above the number pad.
      // The KAV measures its frame relative to its parent, which sits below the
      // SafeAreaView top inset, so offset by that inset to get the true overlap.
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <Animated.View
          style={[styles.guessBody, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
        >
          <View style={styles.eyebrowRow}>
            <Eyebrow tone="lavender">1 to 100</Eyebrow>
            <Pill tone="peach" label={roundPill} />
          </View>

          {/* Question */}
          {/* Shrinks (and scales its font down) when space is tight, e.g. with
              the keyboard open on smaller phones, instead of pushing the input
              row below the keyboard. */}
          <LinearGradient
            colors={gradients.hero}
            locations={[0, 0.35, 0.7, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.questionHero}
          >
            <Eyebrow tone="dark">
              {prompt.category.charAt(0).toUpperCase() + prompt.category.slice(1)}
            </Eyebrow>
            <Text
              style={[styles.questionText, styles.questionTextShrink]}
              numberOfLines={4}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {prompt.text}
            </Text>
          </LinearGradient>

          {/* Timer */}
          <View style={styles.timerBlock}>
            <View style={styles.timerHead}>
              <Text style={[styles.timerNum, urgent && { color: colors.danger }]}>{secondsLeft}</Text>
              <View style={styles.timerSide}>
                <Eyebrow tone={urgent ? "gray" : "lavender"} style={urgent ? { color: colors.danger } : undefined}>
                  Seconds left
                </Eyebrow>
                <Text style={styles.guessCount}>
                  {activeGuesses.length} / {players.length} guessed
                </Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: timerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  },
                ]}
              >
                <LinearGradient
                  colors={urgent ? DANGER_GRADIENT : gradients.primaryButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </View>
          </View>

          {/* Input */}
          {!hasGuessed ? (
            <TextInput
              testID="ng-guess-input"
              style={styles.guessInput}
              value={guessText}
              onChangeText={(t) => {
                const cleaned = t.replace(/[^0-9]/g, "").slice(0, 3);
                setGuessText(cleaned);
              }}
              keyboardType="number-pad"
              placeholder="0 - 100"
              placeholderTextColor={colors.gray600}
              maxLength={3}
              autoFocus
            />
          ) : myGuessTimedOut ? (
            <GradientCard radius={radii.lg} borderColors={DANGER_BORDER} contentStyle={styles.submittedCard}>
              <Ionicons name="alert-circle" size={28} color={colors.danger} />
              <View style={styles.flex1}>
                <Text style={[styles.submittedText, { color: colors.danger }]}>Time's up - no guess</Text>
                <Text style={styles.submittedSub}>Waiting for other players...</Text>
              </View>
            </GradientCard>
          ) : (
            <GradientCard radius={radii.lg} contentStyle={styles.submittedCard}>
              <View style={styles.submittedIcon}>
                <Ionicons name="checkmark" size={22} color={colors.highlight} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.submittedText}>Guess submitted!</Text>
                <Text style={styles.submittedSub}>Waiting for other players...</Text>
              </View>
            </GradientCard>
          )}
        </Animated.View>

        <PrimaryActionBar>
          {!hasGuessed ? (
            <PrimaryAction
              testID="ng-submit-guess"
              label="Submit guess"
              icon="send"
              onPress={() => submitGuess(false)}
              disabled={!guessText || guessText === ""}
            />
          ) : (
            <WaitingNote
              done={!myGuessTimedOut}
              label={`${activeGuesses.length} / ${players.length} guessed`}
            />
          )}
        </PrimaryActionBar>
      </KeyboardAvoidingView>
    );
  };

  const renderReveal = () => {
    const lastResult = gs?.roundResults?.[gs.roundResults.length - 1];
    if (!lastResult) return null;

    return (
      <Screen
        fade={fadeAnim}
        footer={
          isHost ? (
            <PrimaryAction label="Leaderboard" icon="arrow-forward" onPress={advanceToRoundEnd} />
          ) : (
            <WaitingNote label="Waiting for host..." />
          )
        }
      >
        <ScreenTitle title="The answer" subtitle={lastResult.promptText} pill={roundPill} />

        {/* Correct answer */}
        <HeroGradient>
          <View style={styles.answerHero}>
            <View style={styles.flex1}>
              <Eyebrow tone="dark">Correct Answer</Eyebrow>
              <Text style={styles.answerHint}>Closest + fastest wins the round</Text>
            </View>
            <Text style={styles.correctValue}>{lastResult.correctAnswer}</Text>
          </View>
        </HeroGradient>

        {/* Player guesses */}
        <Eyebrow style={styles.sectionEyebrow}>Penalties this round</Eyebrow>
        <View style={styles.list}>
          {currentRoundGuesses.map((item, index) => {
            const distance =
              item.timedOut || item.value === null
                ? NO_GUESS_PENALTY
                : Math.abs(item.value - lastResult.correctAnswer);
            const timePenalty = item.timedOut ? 0 : Math.round(item.timeMs / 1000);
            const roundPenalty = distance + timePenalty;
            const isMe = item.userId === user?.id;
            const rank = currentRoundRanks[index] ?? index + 1;
            const first = rank === 1;

            return (
              <GradientCard
                key={item.userId}
                radius={radii.lg}
                borderColors={isMe ? SELECTED_BORDER : undefined}
                contentStyle={styles.row}
              >
                <View style={[styles.numTile, first ? styles.numTileOn : styles.numTileMuted]}>
                  <Text style={[styles.numTileText, first && styles.numTileTextOn]}>{ordinal(rank)}</Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.username}{isMe ? " (You)" : ""}
                  </Text>
                  <Text style={styles.rowDetail} numberOfLines={1}>
                    {item.timedOut ? "No guess" : `Guessed ${item.value}`}
                    {"  "}
                    <Text style={{ color: colors.gray500 }}>
                      {item.timedOut ? "" : `off by ${distance} + ${timePenalty}s`}
                    </Text>
                  </Text>
                </View>
                <Text style={[styles.rowPenalty, first && { color: colors.highlight }]}>
                  +{formatPenalty(roundPenalty)}
                </Text>
              </GradientCard>
            );
          })}
        </View>
      </Screen>
    );
  };

  const renderLeaderboardRows = () => (
    <View style={styles.list}>
      {leaderboard.map((item, index) => {
        const isMe = item.userId === user?.id;
        const rank = leaderboardRanks[index] ?? index + 1;
        const first = rank === 1;
        return (
          <GradientCard
            key={item.userId}
            radius={radii.lg}
            borderColors={isMe ? SELECTED_BORDER : undefined}
            contentStyle={styles.row}
          >
            <View style={[styles.numTile, first ? styles.numTileOn : styles.numTileMuted]}>
              {first ? (
                <Ionicons name="trophy" size={16} color={colors.onPrimary} />
              ) : (
                <Text style={styles.numTileText}>{rank}</Text>
              )}
            </View>
            <Text style={[styles.rowName, styles.flex1]} numberOfLines={1}>
              {item.username}{isMe ? " (You)" : ""}
            </Text>
            <View style={styles.rowRight}>
              <Text style={[styles.rowPenalty, first && { color: colors.highlight }]}>
                {formatPenalty(item.penalty)}
              </Text>
              <Eyebrow style={styles.rowRightLabel}>Penalty</Eyebrow>
            </View>
          </GradientCard>
        );
      })}
    </View>
  );

  const renderRoundEnd = () => (
    <Screen
      fade={fadeAnim}
      footer={
        isHost ? (
          <PrimaryAction
            label={(gs?.currentRound ?? 0) >= (gs?.totalRounds ?? 0) ? "Final Results" : "Next Round"}
            icon="arrow-forward"
            onPress={advanceToNextRound}
          />
        ) : (
          <WaitingNote label="Waiting for host..." />
        )
      }
    >
      <ScreenTitle
        title="Leaderboard"
        subtitle={`After Round ${gs?.currentRound ?? 1} of ${gs?.totalRounds ?? 1}`}
        pill={roundPill}
      />
      {renderLeaderboardRows()}
    </Screen>
  );

  const renderGameOver = () => {
    const winner = leaderboard[0];
    const coWinners = leaderboard.filter((_, i) => leaderboardRanks[i] === 1);

    return (
      <Screen
        fade={fadeAnim}
        footer={
          isHost ? (
            <View style={styles.footerStack}>
              <PrimaryAction
                label="Play Again"
                icon="refresh"
                iconPosition="left"
                onPress={() => startGame("numberGuessor")}
              />
              <PrimaryAction label="Back to Lobby" variant="dark" onPress={backToLobby} />
            </View>
          ) : (
            <View style={styles.centerRow}>
              <HostWaitingPill style={{ marginTop: 0 }} />
            </View>
          )
        }
      >
        <ScreenTitle title="Game Over!" subtitle="Final results" />

        {winner && (
          <HeroGradient>
            <View style={styles.winnerContent}>
              <View style={styles.flex1}>
                <Eyebrow tone="dark">Winner</Eyebrow>
                <Text style={styles.winnerName}>
                  {coWinners.length > 1
                    ? `${joinNames(coWinners.map((p) => p.username))} tie!`
                    : winner.username}
                </Text>
                <Text style={styles.winnerPenalty}>
                  {formatPenalty(winner.penalty)} total penalty
                </Text>
              </View>
              <Ionicons name="trophy" size={40} color={colors.onPrimary} />
            </View>
          </HeroGradient>
        )}

        <Eyebrow style={styles.sectionEyebrow}>Standings</Eyebrow>
        {renderLeaderboardRows()}
      </Screen>
    );
  };

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  if (!gs || !phase || (phase as string) === "starting") {
    return <GameLoadingScreen name="1 to 100" icon="calculator" color="#06B6D4" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScreenBackground />
      <GameHeader />
      {phase === "intro" && renderIntro()}
      {phase === "setup" && renderSetup()}
      {phase === "guessing" && renderGuessing()}
      {phase === "reveal" && renderReveal()}
      {phase === "round-end" && renderRoundEnd()}
      {phase === "game-over" && renderGameOver()}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Presentational helpers (no game logic)
// ---------------------------------------------------------------------------

const SELECTED_BORDER = [colors.highlight, colors.highlightGradientEnd] as const;
const SELECTED_FILL = ["rgba(184,174,232,0.20)", "rgba(184,174,232,0.05)"] as const;
const DANGER_BORDER = ["rgba(239,68,68,0.6)", "rgba(239,68,68,0.1)"] as const;
const DANGER_GRADIENT = ["#F87171", "#EF4444"] as const;

/** Scrolling body with an optional fade-in and a pinned footer. */
function Screen({
  children,
  footer,
  fade,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  fade?: Animated.Value;
}) {
  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.scroll, !footer && styles.scrollNoFooter]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.stack, fade ? { opacity: fade } : null]}>{children}</Animated.View>
      </ScrollView>
      {footer ? <PrimaryActionBar>{footer}</PrimaryActionBar> : null}
    </>
  );
}

function ScreenTitle({ title, subtitle, pill }: { title: string; subtitle?: string; pill?: string }) {
  return (
    <View style={styles.titleBlock}>
      <View style={styles.eyebrowRow}>
        <Eyebrow tone="lavender">1 to 100</Eyebrow>
        {pill ? <Pill tone="peach" label={pill} /> : null}
      </View>
      <Text style={type.title}>{title}</Text>
      {subtitle ? <Text style={type.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function WaitingNote({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <View style={styles.waiting}>
      {done ? (
        <Ionicons name="checkmark-circle" size={18} color={colors.highlight} />
      ) : (
        <ActivityIndicator size="small" color={colors.highlight} />
      )}
      <Text style={styles.waitingText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPurple,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  scrollNoFooter: { paddingBottom: 48 },
  stack: { gap: spacing.lg },
  flex1: { flex: 1 },
  list: { gap: spacing.sm },
  centerRow: { alignItems: "center" },
  footerStack: { gap: spacing.md },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },

  // Title block
  titleBlock: { gap: spacing.sm },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  sectionEyebrow: { marginTop: spacing.xs },

  // Waiting note
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

  // ── Intro ──────────────────────────────────────────────────────────────
  heroContent: { flexDirection: "row", alignItems: "center", padding: 22, gap: spacing.md },
  heroCopy: { flex: 1, gap: 6 },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 29, color: colors.onPrimary },
  heroEmoji: { fontSize: 56 },
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

  // ── Setup ──────────────────────────────────────────────────────────────
  rulesCard: { padding: 20, gap: spacing.md },
  rulesText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray300,
    lineHeight: 21,
  },
  roundOptions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  roundOption: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 2,
  },
  roundOptionText: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    color: colors.white,
    fontVariant: ["tabular-nums"],
  },
  roundOptionTextActive: {
    color: colors.highlight,
  },

  // ── Guessing ───────────────────────────────────────────────────────────
  keyboardAvoid: {
    flex: 1,
  },
  guessBody: {
    flex: 1,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  questionHero: {
    flexShrink: 0,
    borderRadius: radii.xl,
    padding: 18,
    gap: spacing.sm,
    overflow: "hidden",
  },
  questionText: {
    fontFamily: fonts.extrabold,
    fontSize: 24,
    lineHeight: 31,
    color: colors.onPrimary,
  },
  questionTextShrink: {
    flexShrink: 1,
  },
  timerBlock: { gap: spacing.sm },
  timerHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  timerNum: {
    fontFamily: fonts.extrabold,
    fontSize: 60,
    lineHeight: 64,
    letterSpacing: -3,
    color: colors.white,
    fontVariant: ["tabular-nums"],
  },
  timerSide: { alignItems: "flex-end", gap: 4, paddingBottom: 10 },
  guessCount: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.gray400,
  },
  progressTrack: {
    alignSelf: "stretch",
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceLight,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: radii.pill, overflow: "hidden" },
  guessInput: {
    alignSelf: "stretch",
    minHeight: 72,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontFamily: fonts.extrabold,
    fontSize: 44,
    color: colors.white,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  submittedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  submittedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.highlightSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  submittedText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
  submittedSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray400,
    marginTop: 2,
  },

  // ── Reveal ─────────────────────────────────────────────────────────────
  answerHero: { flexDirection: "row", alignItems: "center", padding: 22, gap: spacing.md },
  answerHint: { fontFamily: fonts.semibold, fontSize: 14, color: "rgba(14,12,26,0.7)", marginTop: 6 },
  correctValue: {
    fontFamily: fonts.extrabold,
    fontSize: 72,
    lineHeight: 78,
    letterSpacing: -3,
    color: colors.onPrimary,
    fontVariant: ["tabular-nums"],
  },

  // ── Ranked rows ────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  numTile: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  numTileOn: { backgroundColor: colors.highlight },
  numTileMuted: { backgroundColor: colors.surfaceLight },
  numTileText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.white },
  numTileTextOn: { color: colors.onPrimary },
  rowName: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  rowDetail: { fontFamily: fonts.regular, fontSize: 12, color: colors.gray400, marginTop: 2 },
  rowPenalty: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.peach,
    fontVariant: ["tabular-nums"],
  },
  rowRight: { alignItems: "flex-end" },
  rowRightLabel: { fontSize: 9, marginTop: 2 },

  // ── Game Over ──────────────────────────────────────────────────────────
  winnerContent: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 22 },
  winnerName: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    lineHeight: 31,
    color: colors.onPrimary,
    marginTop: 4,
  },
  winnerPenalty: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: "rgba(14,12,26,0.7)",
    marginTop: 4,
  },
});
