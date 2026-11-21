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
import { competitionRanks, joinNames } from "../../src/utils/rank";
import HostWaitingPill from "../../src/components/HostWaitingPill";

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
  const { room, players, isHost, mutateGameState, endGame } = useRoomStore();
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
      // CAS on the fresh state so a late init can never clobber a newer phase
      // (or write into a room that has already gone back to the lobby).
      mutateGameState((cur) => {
        if (cur && cur.game === "pieCharts" && cur.prompts && cur.prompts.length > 0) return null;
        if (cur?.phase && cur.phase !== "starting" && cur.phase !== "intro") return null;
        return {
          game: "pieCharts",
          phase: "intro",
          round: 1,
          prompts: chosen.map((p) => ({ id: p.id, text: p.text })),
          votes: {},
          roundWinners: [],
          scores: initialScores,
        };
      }).then((ok) => console.log("[tapdiag] pieCharts host init write:", ok));
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
    const timerRound = round;
    let remaining = VOTE_TIMER;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeLeft(0);
        // Time's up — host forces advance to results (reads fresh state)
        if (useRoomStore.getState().isHost) {
          advanceToResults(timerRound);
        }
        return;
      }
      setTimeLeft(remaining);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, round, isHost]);

  // ── Auto-advance when all voted (host checks) ─────────────────────────

  useEffect(() => {
    if (phase === "voting" && allVoted && isHost) {
      // Small delay so voters see their selection
      const forRound = round;
      const t = setTimeout(() => advanceToResults(forRound), 800);
      return () => clearTimeout(t);
    }
  }, [phase, allVoted, isHost, totalVotes, round]);

  // ── Navigate away if room returns to lobby ─────────────────────────────

  // Single place that returns to the lobby (host + players); fires once.
  const navigatedBackRef = useRef(false);
  useEffect(() => {
    if (navigatedBackRef.current) return;
    if (room?.status === "lobby" || room?.status === "finished") {
      navigatedBackRef.current = true;
      if (router.canGoBack()) router.back();
      else router.replace("/lobby");
    }
  }, [room?.status]);

  // ── Actions ────────────────────────────────────────────────────────────

  const castVote = useCallback(
    async (targetUserId: string) => {
      if (!user || !gs || myVote) return;
      const voteRound = round;
      // Merge only our own vote into the fresh server state (no lost updates)
      await mutateGameState((cur) => {
        if (!cur || cur.phase !== "voting" || (cur.round ?? 1) !== voteRound) return null;
        const curVotes = cur.votes ?? {};
        if (curVotes[user.id]) return null;
        return { ...cur, votes: { ...curVotes, [user.id]: targetUserId } };
      });
    },
    [user, gs, round, myVote, mutateGameState]
  );

  // Host transition voting -> results for `forRound`. Everything is computed
  // from the FRESH server state; idempotent (no-op if already advanced).
  const advanceToResults = useCallback(
    async (forRound: number) => {
      await mutateGameState((cur) => {
        if (!cur || cur.phase !== "voting" || (cur.round ?? 1) !== forRound) return null;
        // Tally votes for this round
        const tally: Record<string, number> = {};
        Object.values((cur.votes ?? {}) as Record<string, string>).forEach((vid) => {
          tally[vid] = (tally[vid] || 0) + 1;
        });
        const maxVotes = Math.max(0, ...Object.values(tally));
        const winners = maxVotes > 0
          ? Object.entries(tally).filter(([, c]) => c === maxVotes).map(([uid]) => uid)
          : [];

        // Update scores
        const newScores: Record<string, number> = { ...(cur.scores ?? {}) };
        winners.forEach((uid) => {
          newScores[uid] = (newScores[uid] || 0) + 1;
        });

        const newRoundWinners = [...(cur.roundWinners ?? []), winners];

        return {
          ...cur,
          phase: "results",
          scores: newScores,
          roundWinners: newRoundWinners,
        };
      });
    },
    [mutateGameState]
  );

  const nextRound = useCallback(async () => {
    const forRound = round;
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "results" || (cur.round ?? 1) !== forRound) return null;
      if (forRound >= TOTAL_ROUNDS) {
        // Game over
        return { ...cur, phase: "game-over", votes: {} };
      }
      return { ...cur, phase: "voting", round: forRound + 1, votes: {} };
    });
  }, [round, mutateGameState]);

  // Navigation happens in the room-status effect above once status is "lobby".
  const handleBackToLobby = useCallback(async () => {
    await endGame();
  }, [endGame]);

  const startFromIntro = useCallback(async () => {
    console.log("[tapdiag] pieCharts Start onPress fired, local phase:", rawPhase);
    const t0 = Date.now();
    const ok = await mutateGameState((cur) => {
      if (!cur || (cur.phase !== "intro" && cur.phase !== "starting")) return null;
      // Prompts not initialised yet: starting now would show "Setting up..." forever
      if (!cur.prompts || cur.prompts.length === 0) return null;
      return { ...cur, phase: "voting" };
    });
    console.log("[tapdiag] pieCharts Start mutateGameState:", ok, `${Date.now() - t0}ms`);
  }, [mutateGameState, rawPhase]);

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
  const leaderboardRanks = useMemo(
    () => competitionRanks(leaderboard, (r) => r.gameScore),
    [leaderboard]
  );
  const topPlayers = leaderboard.filter((_, i) => leaderboardRanks[i] === 1);

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
            <Pressable
              style={s.introStartButton}
              onPressIn={() => console.log("[tapdiag] pieCharts Start onPressIn")}
              onPress={startFromIntro}
            >
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
                    {topPlayers.length > 1
                      ? `${joinNames(topPlayers.map((t) => t.player.username))} tie!`
                      : leaderboard[0].player.username}
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
                        leaderboardRanks[idx] === 1 && { color: colors.warning },
                      ]}
                    >
                      #{leaderboardRanks[idx] ?? idx + 1}
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
            </>
          )}
        </Animated.View>
      </ScrollView>

      {/* Back to lobby — pinned footer so it is never pushed below the fold */}
      {phase === "game-over" && (
        <View style={s.footer}>
          {isHost && (
            <Pressable
              style={[s.primaryBtn, { marginBottom: 0 }]}
              onPress={handleBackToLobby}
            >
              <Ionicons
                name="arrow-back"
                size={20}
                color={colors.white}
              />
              <Text style={s.primaryBtnText}>Back to Lobby</Text>
            </Pressable>
          )}
          {!isHost && (
            <HostWaitingPill
              label="Waiting for host to return to lobby..."
              style={{ marginTop: 0, marginBottom: 0 }}
            />
          )}
        </View>
      )}
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
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: colors.background,
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
