import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../src/theme";
import { useRoomStore, Player } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { PIE_CHARTS_PROMPTS } from "../../src/data/pieCharts";

// ─── Constants ───────────────────────────────────────────────────────────────

const TOTAL_ROUNDS = 5;
const VOTE_TIMER = 15;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

const BAR_COLORS = [
  "#EF4444", // red
  "#F59E0B", // amber
  "#10B981", // emerald
  "#06B6D4", // cyan
  "#A78BFA", // violet
  "#EC4899", // pink
  "#F97316", // orange
  "#14B8A6", // teal
  "#8B5CF6", // purple
  "#6366F1", // indigo
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pick `count` random prompts from the bank, shuffled. */
function pickPrompts(count: number) {
  const shuffled = [...PIE_CHARTS_PROMPTS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/** Assign a stable color index per player id. */
function playerColor(index: number): string {
  return BAR_COLORS[index % BAR_COLORS.length];
}

// ─── Types ───────────────────────────────────────────────────────────────────

type GamePhase = "intro" | "voting" | "results" | "game-over";

interface PieChartsGameState {
  phase: GamePhase;
  game: "pieCharts";
  round: number; // 1-based
  prompts: { id: string; text: string }[];
  votes: Record<string, string>; // voterId -> votedForUserId
  roundWinners: string[][]; // userId arrays per round
  scores: Record<string, number>; // accumulated game scores
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PieChartsScreen() {
  const router = useRouter();
  const { room, players, isHost, updateGameState, endGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const gs = room?.game_state as PieChartsGameState | undefined;
  const rawPhase: string = gs?.phase ?? "intro";
  const phase: GamePhase = rawPhase === "starting" ? "intro" : rawPhase as GamePhase;
  const round = gs?.round ?? 1;
  const votes = gs?.votes ?? {};
  const prompts = gs?.prompts ?? [];
  const scores = gs?.scores ?? {};
  const roundWinners = gs?.roundWinners ?? [];

  const currentPrompt = prompts[round - 1];
  const myVote = user ? votes[user.id] : undefined;
  const totalPlayers = players.length;
  const totalVotes = Object.keys(votes).length;
  const allVoted = totalVotes >= totalPlayers;

  // Timer
  const [timeLeft, setTimeLeft] = useState(VOTE_TIMER);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // ── Initialization (host picks prompts & sets round 1) ─────────────────

  useEffect(() => {
    if (!isHost) return;
    if (!gs || gs.game !== "pieCharts" || !gs.prompts || gs.prompts.length === 0) {
      const chosen = pickPrompts(TOTAL_ROUNDS);
      const initialScores: Record<string, number> = {};
      players.forEach((p) => {
        initialScores[p.user_id] = 0;
      });
      updateGameState({
        game: "pieCharts",
        phase: "intro",
        round: 1,
        prompts: chosen.map((p) => ({ id: p.id, text: p.text })),
        votes: {},
        roundWinners: [],
        scores: initialScores,
      });
    }
  }, [isHost]);

  // ── Entrance animation on phase / round change ────────────────────────

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [phase, round]);

  // ── Vote timer ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "voting") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    setTimeLeft(VOTE_TIMER);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Time's up — host forces advance to results
          if (isHost) {
            advanceToResults();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, round, isHost]);

  // ── Auto-advance when all voted (host checks) ─────────────────────────

  useEffect(() => {
    if (phase === "voting" && allVoted && isHost) {
      // Small delay so voters see their selection
      const t = setTimeout(() => advanceToResults(), 800);
      return () => clearTimeout(t);
    }
  }, [phase, allVoted, isHost, totalVotes]);

  // ── Navigate away if room returns to lobby ─────────────────────────────

  useEffect(() => {
    if (room?.status === "lobby" || room?.status === "finished") {
      router.back();
    }
  }, [room?.status]);

  // ── Actions ────────────────────────────────────────────────────────────

  const castVote = useCallback(
    async (targetUserId: string) => {
      if (!user || !gs || myVote) return;
      const newVotes = { ...votes, [user.id]: targetUserId };
      await updateGameState({ ...gs, votes: newVotes });
    },
    [user, gs, votes, myVote, updateGameState]
  );

  const advanceToResults = useCallback(async () => {
    if (!gs) return;
    // Tally votes for this round
    const tally: Record<string, number> = {};
    Object.values(gs.votes).forEach((vid) => {
      tally[vid] = (tally[vid] || 0) + 1;
    });
    const maxVotes = Math.max(0, ...Object.values(tally));
    const winners = maxVotes > 0
      ? Object.entries(tally).filter(([, c]) => c === maxVotes).map(([uid]) => uid)
      : [];

    // Update scores
    const newScores = { ...gs.scores };
    winners.forEach((uid) => {
      newScores[uid] = (newScores[uid] || 0) + 1;
    });

    const newRoundWinners = [...gs.roundWinners, winners];

    await updateGameState({
      ...gs,
      phase: "results",
      scores: newScores,
      roundWinners: newRoundWinners,
    });
  }, [gs, updateGameState]);

  const nextRound = useCallback(async () => {
    if (!gs) return;
    if (round >= TOTAL_ROUNDS) {
      // Game over
      await updateGameState({ ...gs, phase: "game-over", votes: {} });
    } else {
      await updateGameState({
        ...gs,
        phase: "voting",
        round: round + 1,
        votes: {},
      });
    }
  }, [gs, round, updateGameState]);

  const handleBackToLobby = useCallback(async () => {
    await endGame();
    router.replace("/lobby");
  }, [endGame, router]);

  const startFromIntro = useCallback(async () => {
    if (!gs) return;
    await updateGameState({ ...gs, phase: "voting" });
  }, [gs, updateGameState]);

  // ── Derived data ───────────────────────────────────────────────────────

  /** Build a sorted tally for the results bar chart. */
  const resultsTally = useMemo(() => {
    const tally: Record<string, number> = {};
    players.forEach((p) => {
      tally[p.user_id] = 0;
    });
    Object.values(votes).forEach((vid) => {
      tally[vid] = (tally[vid] || 0) + 1;
    });
    return players
      .map((p, idx) => ({
        player: p,
        count: tally[p.user_id] || 0,
        color: playerColor(idx),
      }))
      .sort((a, b) => b.count - a.count);
  }, [votes, players]);

  const maxVoteCount = useMemo(
    () => Math.max(1, ...resultsTally.map((r) => r.count)),
    [resultsTally]
  );

  /** Final leaderboard sorted by game score. */
  const leaderboard = useMemo(() => {
    return players
      .map((p, idx) => ({
        player: p,
        gameScore: scores[p.user_id] ?? 0,
        color: playerColor(idx),
      }))
      .sort((a, b) => b.gameScore - a.gameScore);
  }, [players, scores]);

  // Player lookup
  const playerMap = useMemo(() => {
    const m: Record<string, Player> = {};
    players.forEach((p) => {
      m[p.user_id] = p;
    });
    return m;
  }, [players]);

  // ── Renders ────────────────────────────────────────────────────────────

  if (!gs) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.loadingText}>Setting up...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "intro") {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.introContainer}>
          <Text style={s.introEmoji}>{"\uD83E\uDD67"}</Text>
          <Text style={s.introTitle}>Pie Charts</Text>
          <Text style={s.introTagline}>Who's most likely to...?</Text>

          <View style={s.introRulesContainer}>
            <View style={s.introRuleCard}>
              <Text style={s.introRuleText}>{"\uD83D\uDDF3\uFE0F"}  Each round shows a 'who's most likely to' question</Text>
            </View>
            <View style={s.introRuleCard}>
              <Text style={s.introRuleText}>{"\uD83D\uDC46"}  Vote for the player you think fits best</Text>
            </View>
            <View style={s.introRuleCard}>
              <Text style={s.introRuleText}>{"\u23F1\uFE0F"}  15 seconds to vote</Text>
            </View>
            <View style={s.introRuleCard}>
              <Text style={s.introRuleText}>{"\uD83D\uDCCA"}  Results shown as a bar chart</Text>
            </View>
            <View style={s.introRuleCard}>
              <Text style={s.introRuleText}>{"\uD83C\uDFC6"}  Player with most votes each round gets a point. Most points wins!</Text>
            </View>
          </View>

          {isHost ? (
            <Pressable style={s.introStartButton} onPress={startFromIntro}>
              <Text style={s.introStartButtonText}>Start Game</Text>
            </Pressable>
          ) : (
            <Text style={s.introWaitingText}>Waiting for host to start...</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!currentPrompt) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.loadingText}>Setting up...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={[s.iconBox, { backgroundColor: "#EF444420" }]}>
            <Ionicons name="pie-chart" size={24} color="#EF4444" />
          </View>
          <Text style={s.headerTitle}>Pie Charts</Text>
        </View>
        {phase !== "game-over" && (
          <Text style={s.roundLabel}>
            Round {round} of {TOTAL_ROUNDS}
          </Text>
        )}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {/* ─── VOTING PHASE ─────────────────────────────────────── */}
          {phase === "voting" && (
            <>
              {/* Timer */}
              <View style={s.timerRow}>
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={timeLeft <= 5 ? colors.danger : colors.gray400}
                />
                <Text
                  style={[
                    s.timerText,
                    timeLeft <= 5 && { color: colors.danger },
                  ]}
                >
                  {timeLeft}s
                </Text>
                <Text style={s.voteTally}>
                  {totalVotes}/{totalPlayers} voted
                </Text>
              </View>

              {/* Prompt */}
              <View style={s.promptCard}>
                <Text style={s.promptText}>{currentPrompt.text}</Text>
              </View>

              {/* Player vote buttons */}
              <Text style={s.sectionLabel}>
                {myVote ? "Vote cast!" : "Tap to vote"}
              </Text>
              <View style={s.voteGrid}>
                {players
                  .filter((p) => p.user_id !== user?.id)
                  .map((p, idx) => {
                    const isSelected = myVote === p.user_id;
                    const color = playerColor(
                      players.findIndex((pl) => pl.user_id === p.user_id)
                    );
                    return (
                      <Pressable
                        key={p.user_id}
                        style={[
                          s.voteBtn,
                          isSelected && { borderColor: color, borderWidth: 2 },
                          myVote && !isSelected && { opacity: 0.4 },
                        ]}
                        onPress={() => castVote(p.user_id)}
                        disabled={!!myVote}
                      >
                        <View
                          style={[s.voteAvatar, { backgroundColor: color + "30" }]}
                        >
                          <Text style={[s.voteAvatarText, { color }]}>
                            {p.username.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={s.voteName} numberOfLines={1}>
                          {p.username}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={color}
                            style={{ marginTop: 4 }}
                          />
                        )}
                      </Pressable>
                    );
                  })}
              </View>
            </>
          )}

          {/* ─── RESULTS PHASE ────────────────────────────────────── */}
          {phase === "results" && (
            <>
              {/* Prompt recap */}
              <View style={s.promptCardSmall}>
                <Text style={s.promptTextSmall}>{currentPrompt.text}</Text>
              </View>

              {/* Bar chart */}
              <View style={s.resultsCard}>
                <Text style={s.resultsTitle}>Results</Text>
                {resultsTally.map((item) => {
                  const pct =
                    totalVotes > 0
                      ? Math.round((item.count / totalVotes) * 100)
                      : 0;
                  const barWidth =
                    maxVoteCount > 0
                      ? (item.count / maxVoteCount) * 100
                      : 0;
                  const isWinner = item.count === maxVoteCount && item.count > 0;

                  return (
                    <View key={item.player.user_id} style={s.barRow}>
                      <View style={s.barLabel}>
                        <Text
                          style={[
                            s.barName,
                            isWinner && { color: colors.warning },
                          ]}
                          numberOfLines={1}
                        >
                          {item.player.username}
                          {isWinner ? " " : ""}
                        </Text>
                        {isWinner && (
                          <Ionicons name="star" size={14} color={colors.warning} />
                        )}
                      </View>
                      <View style={s.barTrack}>
                        <View
                          style={[
                            s.barFill,
                            {
                              width: `${barWidth}%`,
                              backgroundColor: item.color,
                            },
                          ]}
                        />
                      </View>
                      <Text style={s.barPct}>
                        {pct}%{" "}
                        <Text style={s.barVoteCount}>
                          ({item.count})
                        </Text>
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Next round button (host only) */}
              {isHost && (
                <Pressable style={s.primaryBtn} onPress={nextRound}>
                  <Text style={s.primaryBtnText}>
                    {round >= TOTAL_ROUNDS ? "See Final Results" : "Next Round"}
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={20}
                    color={colors.white}
                  />
                </Pressable>
              )}
              {!isHost && (
                <Text style={s.waitingText}>
                  Waiting for host to continue...
                </Text>
              )}
            </>
          )}

          {/* ─── GAME OVER PHASE ──────────────────────────────────── */}
          {phase === "game-over" && (
            <>
              <View style={s.gameOverHeader}>
                <Ionicons name="trophy" size={48} color={colors.warning} />
                <Text style={s.gameOverTitle}>Game Over!</Text>
              </View>

              {/* Winner announcement */}
              {leaderboard.length > 0 && (
                <View style={s.winnerCard}>
                  <Text style={s.winnerLabel}>Winner</Text>
                  <Text style={s.winnerName}>
                    {leaderboard[0].player.username}
                  </Text>
                  <Text style={s.winnerScore}>
                    {leaderboard[0].gameScore}{" "}
                    {leaderboard[0].gameScore === 1 ? "point" : "points"}
                  </Text>
                </View>
              )}

              {/* Full leaderboard */}
              <View style={s.leaderboardCard}>
                <Text style={s.leaderboardTitle}>Leaderboard</Text>
                {leaderboard.map((item, idx) => (
                  <View key={item.player.user_id} style={s.lbRow}>
                    <Text
                      style={[
                        s.lbRank,
                        idx === 0 && { color: colors.warning },
                      ]}
                    >
                      #{idx + 1}
                    </Text>
                    <View
                      style={[
                        s.lbAvatar,
                        { backgroundColor: item.color + "30" },
                      ]}
                    >
                      <Text style={[s.lbAvatarText, { color: item.color }]}>
                        {item.player.username.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={s.lbName} numberOfLines={1}>
                      {item.player.username}
                    </Text>
                    <Text style={s.lbScore}>
                      {item.gameScore} pt{item.gameScore !== 1 ? "s" : ""}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Back to lobby */}
              {isHost && (
                <Pressable style={s.primaryBtn} onPress={handleBackToLobby}>
                  <Ionicons
                    name="arrow-back"
                    size={20}
                    color={colors.white}
                  />
                  <Text style={s.primaryBtnText}>Back to Lobby</Text>
                </Pressable>
              )}
              {!isHost && (
                <Text style={s.waitingText}>
                  Waiting for host to return to lobby...
                </Text>
              )}
            </>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.gray400,
  },

  // Intro
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

  // Header
  header: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.white,
  },
  roundLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.gray400,
    marginTop: 4,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },

  // Timer
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  timerText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.primaryLight,
  },
  voteTally: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.gray500,
    marginLeft: "auto",
  },

  // Prompt
  promptCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    marginBottom: 24,
  },
  promptText: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.white,
    textAlign: "center",
    lineHeight: 30,
  },
  promptCardSmall: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  promptTextSmall: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.gray400,
    textAlign: "center",
    lineHeight: 22,
  },

  // Voting
  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.gray500,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  voteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  voteBtn: {
    width: (SCREEN_WIDTH - 48 - 12) / 2, // 2 columns
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  voteAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  voteAvatarText: {
    fontFamily: fonts.bold,
    fontSize: 22,
  },
  voteName: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.white,
    textAlign: "center",
  },

  // Results
  resultsCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  resultsTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.white,
    marginBottom: 16,
  },
  barRow: {
    marginBottom: 14,
  },
  barLabel: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  barName: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.white,
  },
  barTrack: {
    height: 28,
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 2,
  },
  barFill: {
    height: "100%",
    borderRadius: 8,
    minWidth: 4,
  },
  barPct: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.gray400,
    marginTop: 2,
  },
  barVoteCount: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.gray500,
  },

  // Game Over
  gameOverHeader: {
    alignItems: "center",
    marginBottom: 24,
    gap: 8,
  },
  gameOverTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    color: colors.white,
  },
  winnerCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.warning + "40",
  },
  winnerLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.warning,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  winnerName: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    color: colors.white,
  },
  winnerScore: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.gray400,
    marginTop: 4,
  },

  // Leaderboard
  leaderboardCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  leaderboardTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.white,
    marginBottom: 16,
  },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  lbRank: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.gray400,
    width: 28,
  },
  lbAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  lbAvatarText: {
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  lbName: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
  },
  lbScore: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.primaryLight,
  },

  // Buttons
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  primaryBtnText: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.white,
  },
  waitingText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.gray500,
    textAlign: "center",
    marginTop: 8,
  },
});
