import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { NUMBER_GUESSOR_PROMPTS } from "../../src/data/numberGuessor";
import { competitionRanks, joinNames, ordinal } from "../../src/utils/rank";

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
  const { room, players, isHost, mutateGameState } = useRoomStore();
  const { user } = useAuthStore();

  const gs: GameState | null = room?.game_state ?? null;
  const rawPhase = gs?.phase ?? "starting";
  const phase = rawPhase === "starting" ? "intro" : rawPhase;

  // Local UI state
  const [guessText, setGuessText] = useState("");
  const [hasGuessed, setHasGuessed] = useState(false);
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

  // -------------------------------------------------------------------------
  // Host auto-advance: all guesses in -> move to reveal
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || phase !== "guessing" || !gs) return;
    const totalPlayers = players.length;
    const totalGuesses = gs.guesses?.length ?? 0;
    if (totalPlayers > 0 && totalGuesses >= totalPlayers) {
      // Small delay so last guesser sees their submission
      const forRound = gs.currentRound;
      const t = setTimeout(() => advanceToReveal(forRound), 800);
      return () => clearTimeout(t);
    }
  }, [gs?.guesses?.length, phase, isHost, players.length]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const startGame = useCallback(async () => {
    const shuffled = shuffleArray(NUMBER_GUESSOR_PROMPTS);
    const selected = shuffled.slice(0, selectedRounds);
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
        const guesses: Guess[] = cur.guesses || [];

        // Calculate penalties for this round
        const newPenalties: Record<string, number> = { ...(cur.penalties || {}) };
        for (const g of guesses) {
          const distance = g.timedOut || g.value === null ? NO_GUESS_PENALTY : Math.abs(g.value - correctAnswer);
          const timePenalty = g.timedOut ? 0 : Math.round(g.timeMs / 1000);
          const roundPenalty = distance + timePenalty;
          newPenalties[g.userId] = (newPenalties[g.userId] || 0) + roundPenalty;
        }

        // Also penalize players who didn't submit at all
        for (const p of useRoomStore.getState().players) {
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
      const nextPrompt = NUMBER_GUESSOR_PROMPTS.find((p) => p.id === nextPromptId) ?? null;

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
    const dist = (g: Guess) =>
      g.timedOut || g.value === null ? NO_GUESS_PENALTY : Math.abs(g.value - correct);
    // Rank by the round penalty actually shown (distance + time); distance breaks display order only.
    const roundPen = (g: Guess) =>
      dist(g) + (g.timedOut ? 0 : Math.round(g.timeMs / 1000));
    return [...gs.guesses].sort((a, b) => roundPen(a) - roundPen(b) || dist(a) - dist(b));
  }, [gs?.guesses, gs?.currentPrompt]);

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

  const renderIntro = () => (
    <ScrollView contentContainerStyle={styles.introContainer}>
      <Text style={styles.introEmoji}>{"\uD83C\uDFAF"}</Text>
      <Text style={styles.introTitle}>1 to 100</Text>
      <Text style={styles.introTagline}>Guess closest to the correct number.</Text>

      <View style={styles.introRulesContainer}>
        <View style={styles.introRuleCard}>
          <Text style={styles.introRuleText}>{"\uD83D\uDD22"}  Each round shows a trivia question with a number answer (1-100)</Text>
        </View>
        <View style={styles.introRuleCard}>
          <Text style={styles.introRuleText}>{"\u23F1\uFE0F"}  You have 20 seconds to type your guess</Text>
        </View>
        <View style={styles.introRuleCard}>
          <Text style={styles.introRuleText}>{"\uD83D\uDCCA"}  Penalty = how far off + seconds taken. No guess = 120 penalty</Text>
        </View>
        <View style={styles.introRuleCard}>
          <Text style={styles.introRuleText}>{"\uD83C\uDFC6"}  Lowest total penalty after all rounds wins!</Text>
        </View>
      </View>

      {isHost ? (
        <TouchableOpacity
          style={styles.introStartButton}
          onPressIn={() => console.log("[tapdiag] numberGuessor Start onPressIn")}
          onPress={advanceToSetup}
        >
          <Text style={styles.introStartButtonText}>Start Game</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.introWaitingText}>Waiting for host to start...</Text>
      )}
    </ScrollView>
  );

  const renderSetup = () => (
    <View style={styles.centerContainer}>
      <View style={styles.titleRow}>
        <Ionicons name="calculator-outline" size={32} color={colors.primary} />
        <Text style={styles.title}>1 to 100</Text>
      </View>
      <Text style={styles.subtitle}>
        Guess the number. Lowest penalty wins!
      </Text>

      <View style={styles.rulesCard}>
        <Text style={styles.rulesTitle}>How to Play</Text>
        <Text style={styles.rulesText}>
          Each round shows a trivia question with a numeric answer.{"\n\n"}
          You have {TIMER_SECONDS} seconds to type your guess.{"\n\n"}
          Penalty = distance from answer + seconds taken.{"\n"}
          No guess = {NO_GUESS_PENALTY} penalty.{"\n\n"}
          Lowest total penalty wins!
        </Text>
      </View>

      {isHost ? (
        <>
          <Text style={styles.sectionLabel}>Number of Rounds</Text>
          <View style={styles.roundOptions}>
            {[5, 10, 20].map((n) => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.roundOption,
                  selectedRounds === n && styles.roundOptionActive,
                ]}
                onPress={() => setSelectedRounds(n)}
              >
                <Text
                  style={[
                    styles.roundOptionText,
                    selectedRounds === n && styles.roundOptionTextActive,
                  ]}
                >
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={startGame}>
            <Ionicons name="play" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>Start Game</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.waitingCard}>
          <Ionicons name="hourglass-outline" size={24} color={colors.gray400} />
          <Text style={styles.waitingText}>Waiting for host to start...</Text>
        </View>
      )}
    </View>
  );

  const renderGuessing = () => {
    const prompt = gs?.currentPrompt;
    if (!prompt) return null;

    return (
      <Animated.View
        style={[styles.centerContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
      >
        {/* Round indicator */}
        <View style={styles.roundBadge}>
          <Text style={styles.roundBadgeText}>
            Round {gs?.currentRound ?? 1} / {gs?.totalRounds ?? 1}
          </Text>
        </View>

        {/* Category pill */}
        <View style={styles.categoryPill}>
          <Text style={styles.categoryText}>
            {prompt.category.charAt(0).toUpperCase() + prompt.category.slice(1)}
          </Text>
        </View>

        {/* Question */}
        <Text style={styles.questionText}>{prompt.text}</Text>

        {/* Timer bar */}
        <View style={styles.timerBarContainer}>
          <Animated.View
            style={[
              styles.timerBar,
              {
                width: timerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
                backgroundColor:
                  secondsLeft <= 5 ? colors.danger : secondsLeft <= 10 ? colors.warning : colors.primary,
              },
            ]}
          />
        </View>
        <Text
          style={[
            styles.timerText,
            secondsLeft <= 5 && { color: colors.danger },
          ]}
        >
          {secondsLeft}s
        </Text>

        {/* Input */}
        {!hasGuessed ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.inputRow}>
              <TextInput
                style={styles.guessInput}
                value={guessText}
                onChangeText={(t) => {
                  const cleaned = t.replace(/[^0-9]/g, "").slice(0, 3);
                  setGuessText(cleaned);
                }}
                keyboardType="number-pad"
                placeholder="0 - 100"
                placeholderTextColor={colors.gray500}
                maxLength={3}
                autoFocus
              />
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (!guessText || guessText === "") && styles.submitButtonDisabled,
                ]}
                onPress={() => submitGuess(false)}
                disabled={!guessText || guessText === ""}
              >
                <Ionicons name="send" size={20} color={colors.white} />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.submittedCard}>
            <Ionicons name="checkmark-circle" size={28} color={colors.success} />
            <Text style={styles.submittedText}>Guess submitted!</Text>
            <Text style={styles.submittedSub}>
              Waiting for other players...
            </Text>
          </View>
        )}

        {/* Guess count */}
        <Text style={styles.guessCount}>
          {gs?.guesses?.length ?? 0} / {players.length} guessed
        </Text>
      </Animated.View>
    );
  };

  const renderReveal = () => {
    const lastResult = gs?.roundResults?.[gs.roundResults.length - 1];
    if (!lastResult) return null;

    return (
      <Animated.View style={[styles.centerContainer, { opacity: fadeAnim }]}>
        <View style={styles.roundBadge}>
          <Text style={styles.roundBadgeText}>
            Round {gs?.currentRound ?? 1} / {gs?.totalRounds ?? 1}
          </Text>
        </View>

        <Text style={styles.revealQuestion}>{lastResult.promptText}</Text>

        {/* Correct answer */}
        <View style={styles.correctAnswerCard}>
          <Text style={styles.correctLabel}>Correct Answer</Text>
          <Text style={styles.correctValue}>{lastResult.correctAnswer}</Text>
        </View>

        {/* Player guesses */}
        <FlatList
          data={currentRoundGuesses}
          keyExtractor={(item) => item.userId}
          style={styles.guessList}
          contentContainerStyle={{ paddingBottom: 16 }}
          renderItem={({ item, index }) => {
            const distance =
              item.timedOut || item.value === null
                ? NO_GUESS_PENALTY
                : Math.abs(item.value - lastResult.correctAnswer);
            const timePenalty = item.timedOut ? 0 : Math.round(item.timeMs / 1000);
            const roundPenalty = distance + timePenalty;
            const isMe = item.userId === user?.id;
            const rank = currentRoundRanks[index] ?? index + 1;

            return (
              <View style={[styles.guessRow, isMe && styles.guessRowMe, rank === 1 && styles.guessRowFirst]}>
                <View style={styles.guessRank}>
                  <Text style={styles.guessRankText}>
                    {ordinal(rank)}
                  </Text>
                </View>
                <View style={styles.guessInfo}>
                  <Text style={[styles.guessUsername, isMe && { color: colors.primaryLight }]}>
                    {item.username}{isMe ? " (You)" : ""}
                  </Text>
                  <Text style={styles.guessDetail}>
                    {item.timedOut
                      ? "No guess"
                      : `Guessed ${item.value}`}
                    {"  "}
                    <Text style={{ color: colors.gray500 }}>
                      {item.timedOut ? "" : `off by ${distance} + ${timePenalty}s`}
                    </Text>
                  </Text>
                </View>
                <Text style={[styles.guessPenalty, rank === 1 && { color: colors.success }]}>
                  +{formatPenalty(roundPenalty)}
                </Text>
              </View>
            );
          }}
        />

        {isHost && (
          <TouchableOpacity style={styles.primaryButton} onPress={advanceToRoundEnd}>
            <Text style={styles.primaryButtonText}>Leaderboard</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  };

  const renderRoundEnd = () => (
    <Animated.View style={[styles.centerContainer, { opacity: fadeAnim }]}>
      <Text style={styles.leaderboardTitle}>Leaderboard</Text>
      <Text style={styles.leaderboardSubtitle}>
        After Round {gs?.currentRound ?? 1} of {gs?.totalRounds ?? 1}
      </Text>

      <FlatList
        data={leaderboard}
        keyExtractor={(item) => item.userId}
        style={styles.leaderboardList}
        contentContainerStyle={{ paddingBottom: 16 }}
        renderItem={({ item, index }) => {
          const isMe = item.userId === user?.id;
          const rank = leaderboardRanks[index] ?? index + 1;
          const medal =
            rank === 1
              ? { icon: "trophy" as const, color: "#FFD700" }
              : rank === 2
              ? { icon: "medal" as const, color: "#C0C0C0" }
              : rank === 3
              ? { icon: "medal" as const, color: "#CD7F32" }
              : null;

          return (
            <View style={[styles.lbRow, isMe && styles.lbRowMe]}>
              <View style={styles.lbRank}>
                {medal ? (
                  <Ionicons name={medal.icon} size={22} color={medal.color} />
                ) : (
                  <Text style={styles.lbRankText}>{rank}</Text>
                )}
              </View>
              <Text style={[styles.lbName, isMe && { color: colors.primaryLight }]}>
                {item.username}{isMe ? " (You)" : ""}
              </Text>
              <Text style={styles.lbPenalty}>{formatPenalty(item.penalty)}</Text>
            </View>
          );
        }}
      />

      {isHost && (
        <TouchableOpacity style={styles.primaryButton} onPress={advanceToNextRound}>
          <Text style={styles.primaryButtonText}>
            {(gs?.currentRound ?? 0) >= (gs?.totalRounds ?? 0) ? "Final Results" : "Next Round"}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
        </TouchableOpacity>
      )}

      {!isHost && (
        <View style={styles.waitingCard}>
          <Ionicons name="hourglass-outline" size={20} color={colors.gray400} />
          <Text style={styles.waitingText}>Waiting for host...</Text>
        </View>
      )}
    </Animated.View>
  );

  const renderGameOver = () => {
    const winner = leaderboard[0];
    const coWinners = leaderboard.filter((_, i) => leaderboardRanks[i] === 1);

    return (
      <Animated.View style={[styles.centerContainer, { opacity: fadeAnim }]}>
        <Ionicons name="trophy" size={56} color="#FFD700" style={{ marginBottom: 8 }} />
        <Text style={styles.gameOverTitle}>Game Over!</Text>

        {winner && (
          <View style={styles.winnerCard}>
            <Text style={styles.winnerLabel}>Winner</Text>
            <Text style={styles.winnerName}>
              {coWinners.length > 1
                ? `${joinNames(coWinners.map((p) => p.username))} tie!`
                : winner.username}
            </Text>
            <Text style={styles.winnerPenalty}>
              {formatPenalty(winner.penalty)} total penalty
            </Text>
          </View>
        )}

        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.userId}
          style={styles.leaderboardList}
          contentContainerStyle={{ paddingBottom: 16 }}
          renderItem={({ item, index }) => {
            const isMe = item.userId === user?.id;
            const rank = leaderboardRanks[index] ?? index + 1;
            const medal =
              rank === 1
                ? { icon: "trophy" as const, color: "#FFD700" }
                : rank === 2
                ? { icon: "medal" as const, color: "#C0C0C0" }
                : rank === 3
                ? { icon: "medal" as const, color: "#CD7F32" }
                : null;

            return (
              <View style={[styles.lbRow, isMe && styles.lbRowMe]}>
                <View style={styles.lbRank}>
                  {medal ? (
                    <Ionicons name={medal.icon} size={22} color={medal.color} />
                  ) : (
                    <Text style={styles.lbRankText}>{rank}</Text>
                  )}
                </View>
                <Text style={[styles.lbName, isMe && { color: colors.primaryLight }]}>
                  {item.username}{isMe ? " (You)" : ""}
                </Text>
                <Text style={styles.lbPenalty}>{formatPenalty(item.penalty)}</Text>
              </View>
            );
          }}
        />

        {isHost && (
          <TouchableOpacity style={styles.primaryButton} onPress={backToLobby}>
            <Ionicons name="arrow-back" size={18} color={colors.white} />
            <Text style={styles.primaryButtonText}>Back to Lobby</Text>
          </TouchableOpacity>
        )}

        {!isHost && (
          <View style={styles.waitingCard}>
            <Ionicons name="hourglass-outline" size={20} color={colors.gray400} />
            <Text style={styles.waitingText}>Waiting for host...</Text>
          </View>
        )}
      </Animated.View>
    );
  };

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {phase === "intro" && renderIntro()}
        {phase === "setup" && renderSetup()}
        {phase === "guessing" && renderGuessing()}
        {phase === "reveal" && renderReveal()}
        {phase === "round-end" && renderRoundEnd()}
        {phase === "game-over" && renderGameOver()}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },

  // ── Intro ──────────────────────────────────────────────────────────────
  introContainer: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  introEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  introTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    color: colors.white,
    marginBottom: 8,
  },
  introTagline: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.gray400,
    marginBottom: 32,
  },
  introRulesContainer: {
    width: "100%",
    marginBottom: 32,
  },
  introRuleCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  introRuleText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.white,
    lineHeight: 20,
  },
  introStartButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    width: "100%",
    alignItems: "center",
  },
  introStartButtonText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
  introWaitingText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.gray400,
    marginTop: 8,
  },

  // ── Setup ──────────────────────────────────────────────────────────────
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    color: colors.white,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.gray400,
    marginBottom: 24,
  },
  rulesCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    marginBottom: 28,
  },
  rulesTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
    marginBottom: 10,
  },
  rulesText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray400,
    lineHeight: 22,
  },
  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.gray400,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  roundOptions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },
  roundOption: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  roundOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceLight,
  },
  roundOptionText: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.gray400,
  },
  roundOptionTextActive: {
    color: colors.primary,
  },

  // ── Buttons ────────────────────────────────────────────────────────────
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: "100%",
    marginTop: 12,
  },
  primaryButtonText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
  waitingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginTop: 16,
  },
  waitingText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.gray400,
  },

  // ── Guessing ───────────────────────────────────────────────────────────
  roundBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  roundBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryLight,
  },
  categoryPill: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 20,
  },
  categoryText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.gray400,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  questionText: {
    fontFamily: fonts.semibold,
    fontSize: 22,
    color: colors.white,
    textAlign: "center",
    lineHeight: 32,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  timerBarContainer: {
    width: "100%",
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 6,
  },
  timerBar: {
    height: "100%",
    borderRadius: 3,
  },
  timerText: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.primaryLight,
    marginBottom: 24,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    paddingHorizontal: 20,
  },
  guessInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.white,
    textAlign: "center",
    borderWidth: 2,
    borderColor: colors.surfaceLight,
  },
  submitButton: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    backgroundColor: colors.surfaceLight,
    opacity: 0.5,
  },
  submittedCard: {
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  submittedText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.success,
  },
  submittedSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray500,
  },
  guessCount: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.gray500,
    marginTop: 20,
  },

  // ── Reveal ─────────────────────────────────────────────────────────────
  revealQuestion: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.gray400,
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  correctAnswerCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.success,
  },
  correctLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.success,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  correctValue: {
    fontFamily: fonts.extrabold,
    fontSize: 48,
    color: colors.success,
  },
  guessList: {
    width: "100%",
    maxHeight: 280,
  },
  guessRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  guessRowMe: {
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  guessRowFirst: {
    borderWidth: 1,
    borderColor: colors.success,
  },
  guessRank: {
    width: 36,
    alignItems: "center",
  },
  guessRankText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.gray400,
  },
  guessInfo: {
    flex: 1,
    marginLeft: 8,
  },
  guessUsername: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.white,
  },
  guessDetail: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.gray400,
    marginTop: 2,
  },
  guessPenalty: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.warning,
    marginLeft: 8,
  },

  // ── Leaderboard ────────────────────────────────────────────────────────
  leaderboardTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    color: colors.white,
    marginBottom: 4,
  },
  leaderboardSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray400,
    marginBottom: 24,
  },
  leaderboardList: {
    width: "100%",
    maxHeight: 320,
  },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  lbRowMe: {
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  lbRank: {
    width: 36,
    alignItems: "center",
  },
  lbRankText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.gray500,
  },
  lbName: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
    marginLeft: 10,
  },
  lbPenalty: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.warning,
  },

  // ── Game Over ──────────────────────────────────────────────────────────
  gameOverTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    color: colors.white,
    marginBottom: 16,
  },
  winnerCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    width: "100%",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  winnerLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#FFD700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  winnerName: {
    fontFamily: fonts.extrabold,
    fontSize: 24,
    color: colors.white,
  },
  winnerPenalty: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray400,
    marginTop: 4,
  },
});
