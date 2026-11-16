import { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { competitionRanks } from "../../src/utils/rank";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const CATEGORIES = [
  {
    category: "THE FOOD DEBATE",
    emoji: "\u{1F355}",
    name: "Best Pizza Toppings",
    items: ["Pepperoni", "Mushrooms", "Pineapple", "Sausage", "Olives"],
  },
  {
    category: "ANIMAL KINGDOM",
    emoji: "\u{1F43E}",
    name: "Scariest Animals",
    items: ["Shark", "Spider", "Snake", "Bear", "Crocodile"],
  },
  {
    category: "FANTASY POWERS",
    emoji: "\u{26A1}",
    name: "Best Superpowers",
    items: ["Flying", "Invisibility", "Super Strength", "Teleportation", "Time Travel"],
  },
];

const TOTAL_ROUNDS = 3;
const ROUND_SECONDS = 30;
const ITEM_COUNT = 5;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute group consensus: for each item, average the positions across all players. */
function computeConsensus(
  rankings: Record<string, string[]>,
  items: string[]
): string[] {
  const playerIds = Object.keys(rankings);
  if (playerIds.length === 0) return items;

  const avgPosition: Record<string, number> = {};
  for (const item of items) {
    let total = 0;
    for (const pid of playerIds) {
      const idx = rankings[pid]?.indexOf(item);
      total += idx !== undefined && idx !== -1 ? idx : ITEM_COUNT - 1;
    }
    avgPosition[item] = total / playerIds.length;
  }

  return [...items].sort((a, b) => avgPosition[a] - avgPosition[b]);
}

/** Score one player's ranking vs consensus. Each item: 5 - |yourPos - consensusPos|. */
function scoreRanking(playerRanking: string[], consensus: string[]): number {
  let total = 0;
  for (const item of consensus) {
    const pPos = playerRanking.indexOf(item);
    const cPos = consensus.indexOf(item);
    total += ITEM_COUNT - Math.abs(pPos - cPos);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BlindRankingScreen() {
  const router = useRouter();
  const { room, players, isHost, mutateGameState, endGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? "";

  // Local ranking state (only used during the "ranking" phase)
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [timer, setTimer] = useState(ROUND_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const gs = room?.game_state ?? {};
  const phase: string = gs.phase ?? "starting";
  const round: number = gs.round ?? 0;
  const categoryIndex: number = gs.categoryIndex ?? 0;
  const rankings: Record<string, string[]> = gs.rankings ?? {};
  const roundScores: Record<string, number> = gs.roundScores ?? {};
  const totalScores: Record<string, number> = gs.totalScores ?? {};
  const consensus: string[] = gs.consensus ?? [];
  const category = CATEGORIES[categoryIndex] ?? CATEGORIES[0];

  // ------------------------------------------------------------------
  // Navigate away if room goes back to lobby
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // Host: initialize game on mount if phase is "starting"
  // ------------------------------------------------------------------
  useEffect(() => {
    if (isHost && phase === "starting") {
      const initScores: Record<string, number> = {};
      players.forEach((p) => {
        initScores[p.user_id] = 0;
      });
      // CAS on the fresh state: never clobber a newer phase, and never write
      // into a room endGame() already reset (game_state {} also reads as "starting").
      mutateGameState((cur) => {
        if (cur?.phase && cur.phase !== "starting") return null;
        return {
          phase: "intro",
          round: 1,
          categoryIndex: 0,
          rankings: {},
          roundScores: {},
          totalScores: initScores,
          consensus: [],
        };
      }).then((ok) => console.log("[tapdiag] blindRanking host init write:", ok));
    }
  }, [isHost, phase]);

  // ------------------------------------------------------------------
  // Reset local state when a new ranking phase begins
  // ------------------------------------------------------------------
  useEffect(() => {
    if (phase === "ranking") {
      setSelectedOrder([]);
      setHasSubmitted(false);
      setTimer(ROUND_SECONDS);
    }
  }, [phase, round]);

  // ------------------------------------------------------------------
  // Countdown timer during ranking phase
  // ------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "ranking") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Auto-submit if not yet submitted
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, round]);

  // ------------------------------------------------------------------
  // Auto-submit when timer hits 0
  // ------------------------------------------------------------------
  useEffect(() => {
    if (timer === 0 && phase === "ranking" && !hasSubmitted) {
      handleSubmitRanking(true);
    }
  }, [timer, phase, hasSubmitted]);

  // ------------------------------------------------------------------
  // Host: check if all players have submitted
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || phase !== "ranking") return;

    const submittedIds = Object.keys(rankings);
    const allSubmitted = players.length > 0 && players.every((p) => submittedIds.includes(p.user_id));

    if (allSubmitted) {
      const forRound = round;
      // Calculate consensus and scores from the FRESH server state (idempotent)
      mutateGameState((cur) => {
        if (!cur || cur.phase !== "ranking" || cur.round !== forRound) return null;
        const curRankings: Record<string, string[]> = cur.rankings ?? {};
        const cat = CATEGORIES[cur.categoryIndex ?? 0] ?? CATEGORIES[0];
        const cons = computeConsensus(curRankings, cat.items);
        const rScores: Record<string, number> = {};
        const tScores: Record<string, number> = { ...(cur.totalScores ?? {}) };

        for (const pid of Object.keys(curRankings)) {
          const s = scoreRanking(curRankings[pid], cons);
          rScores[pid] = s;
          tScores[pid] = (tScores[pid] ?? 0) + s;
        }

        return {
          ...cur,
          phase: "reveal",
          consensus: cons,
          roundScores: rScores,
          totalScores: tScores,
        };
      });
    }
  }, [rankings, players, isHost, phase]);

  // ------------------------------------------------------------------
  // Tap an item to rank it (or un-rank)
  // ------------------------------------------------------------------
  const handleTapItem = useCallback(
    (item: string) => {
      if (hasSubmitted) return;

      setSelectedOrder((prev) => {
        if (prev.includes(item)) {
          // Remove this item and everything after it
          return prev.slice(0, prev.indexOf(item));
        }
        if (prev.length >= ITEM_COUNT) return prev;
        return [...prev, item];
      });
    },
    [hasSubmitted]
  );

  // ------------------------------------------------------------------
  // Submit ranking
  // ------------------------------------------------------------------
  const handleSubmitRanking = useCallback(
    (auto = false) => {
      if (hasSubmitted) return;
      setHasSubmitted(true);

      let ranking = [...selectedOrder];
      // Fill unranked items in their original order
      const cat = CATEGORIES[categoryIndex] ?? CATEGORIES[0];
      for (const item of cat.items) {
        if (!ranking.includes(item)) {
          ranking.push(item);
        }
      }

      if (!userId) return;
      // Merge only our own ranking into the fresh server state (no lost updates)
      mutateGameState((cur) => {
        if (!cur || cur.phase !== "ranking" || cur.round !== round) return null;
        const curRankings = cur.rankings ?? {};
        if (curRankings[userId]) return null;
        return { ...cur, rankings: { ...curRankings, [userId]: ranking } };
      });
    },
    [hasSubmitted, selectedOrder, categoryIndex, round, userId, mutateGameState]
  );

  // ------------------------------------------------------------------
  // Host: next round or game over
  // ------------------------------------------------------------------
  const handleNextRound = () => {
    if (!isHost) return;
    const forRound = round;

    mutateGameState((cur) => {
      if (!cur || cur.phase !== "reveal" || cur.round !== forRound) return null;
      const nextRound = forRound + 1;
      if (nextRound > TOTAL_ROUNDS) {
        return { ...cur, phase: "game-over" };
      }
      return {
        ...cur,
        phase: "ranking",
        round: nextRound,
        categoryIndex: nextRound - 1,
        rankings: {},
        roundScores: {},
        consensus: [],
      };
    });
  };

  // ------------------------------------------------------------------
  // Back to lobby
  // ------------------------------------------------------------------
  const handleBackToLobby = async () => {
    // Navigation happens in the room-status effect above once status is "lobby".
    await endGame();
  };

  const startFromIntro = useCallback(async () => {
    console.log("[tapdiag] blindRanking Start onPress fired, local phase:", phase);
    const t0 = Date.now();
    const ok = await mutateGameState((cur) => {
      if (!cur || cur.phase !== "intro") return null;
      return { ...cur, phase: "ranking" };
    });
    console.log("[tapdiag] blindRanking Start mutateGameState:", ok, `${Date.now() - t0}ms`);
  }, [mutateGameState, phase]);

  // ==================================================================
  // RENDER
  // ==================================================================

  // ----- INTRO PHASE -----
  if (phase === "intro") {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.introContainer}>
          <Text style={s.introEmoji}>{"\uD83D\uDCCB"}</Text>
          <Text style={s.introTitle}>Blind Ranking</Text>
          <Text style={s.introTagline}>Rank items and match the group.</Text>

          <View style={s.introRulesContainer}>
            <View style={s.introRuleCard}>
              <Text style={s.introRuleText}>{"\uD83D\uDCDD"}  Each round shows a category with 5 items</Text>
            </View>
            <View style={s.introRuleCard}>
              <Text style={s.introRuleText}>{"\uD83D\uDC46"}  Tap items in order from best to worst</Text>
            </View>
            <View style={s.introRuleCard}>
              <Text style={s.introRuleText}>{"\u23F1\uFE0F"}  30 seconds to submit your ranking</Text>
            </View>
            <View style={s.introRuleCard}>
              <Text style={s.introRuleText}>{"\uD83E\uDD1D"}  Score based on how closely you match the group consensus</Text>
            </View>
            <View style={s.introRuleCard}>
              <Text style={s.introRuleText}>{"\uD83C\uDFC6"}  Highest score after 3 rounds wins!</Text>
            </View>
          </View>

          {isHost ? (
            <Pressable
              style={s.introStartButton}
              onPressIn={() => console.log("[tapdiag] blindRanking Start onPressIn")}
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

  // ----- RANKING PHASE -----
  if (phase === "ranking") {
    const allRanked = selectedOrder.length >= ITEM_COUNT;

    return (
      <SafeAreaView style={s.safe}>
        {/* Top bar */}
        <View style={s.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.white} />
          </Pressable>
          <Text style={s.topBarTitle}>BLIND RANKING</Text>
          <Text style={s.topBarRound}>Round {round} / {TOTAL_ROUNDS}</Text>
        </View>

        {/* Category label */}
        <View style={s.headerSection}>
          <Text style={s.categoryLabel}>{category.emoji} {category.category}</Text>
          <Text style={s.title}>{category.name}</Text>
          <Text style={s.instruction}>Tap items in order from best to worst</Text>
        </View>

        {/* Timer */}
        <View style={s.timerRow}>
          <View style={s.timerLeft}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={s.timerText}>{timer}s</Text>
          </View>
          <View style={s.timerBarOuter}>
            <View
              style={[
                s.timerBarInner,
                { width: `${(timer / ROUND_SECONDS) * 100}%` },
              ]}
            />
          </View>
        </View>

        {/* Items */}
        <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
          {category.items.map((item) => {
            const rankIndex = selectedOrder.indexOf(item);
            const isSelected = rankIndex !== -1;

            return (
              <Pressable
                key={item}
                style={[
                  s.itemCard,
                  isSelected && s.itemCardSelected,
                  hasSubmitted && s.itemCardDisabled,
                ]}
                onPress={() => handleTapItem(item)}
                disabled={hasSubmitted}
              >
                <View style={s.itemLeft}>
                  {isSelected ? (
                    <View style={s.rankCircleActive}>
                      <Text style={s.rankCircleActiveText}>{rankIndex + 1}</Text>
                    </View>
                  ) : (
                    <View style={s.rankCircle}>
                      <Ionicons name="add" size={18} color={colors.gray400} />
                    </View>
                  )}
                  <Text style={s.itemText}>{item}</Text>
                </View>
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.gray500} />
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Bottom text */}
        <Text style={s.bottomQuip}>Your taste. No wrong answers. (Probably.)</Text>

        {/* Bottom button */}
        <View style={s.footer}>
          {hasSubmitted ? (
            <View style={s.waitingBox}>
              <Ionicons name="hourglass-outline" size={20} color={colors.primaryLight} />
              <Text style={s.waitingText}>
                Waiting for others... ({Object.keys(rankings).length}/{players.length})
              </Text>
            </View>
          ) : (
            <Pressable
              style={[s.submitBtn, !allRanked && s.submitBtnDisabled]}
              onPress={() => handleSubmitRanking(false)}
              disabled={!allRanked}
            >
              <Text style={s.submitBtnText}>
                {allRanked
                  ? "Submit Ranking"
                  : `Rank all items (${selectedOrder.length}/${ITEM_COUNT})`}
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ----- REVEAL PHASE -----
  if (phase === "reveal") {
    const cat = CATEGORIES[categoryIndex] ?? CATEGORIES[0];
    const myRanking = rankings[userId] ?? cat.items;
    const myScore = roundScores[userId] ?? 0;

    return (
      <SafeAreaView style={s.safe}>
        {/* Top bar */}
        <View style={s.topBar}>
          <View style={{ width: 24 }} />
          <Text style={s.topBarTitle}>BLIND RANKING</Text>
          <Text style={s.topBarRound}>Round {round} / {TOTAL_ROUNDS}</Text>
        </View>

        <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
          {/* Header */}
          <View style={s.revealHeader}>
            <Text style={s.categoryLabel}>{cat.emoji} {cat.category}</Text>
            <Text style={s.title}>{cat.name}</Text>
            <Text style={s.revealSubtitle}>Round {round} Results</Text>
          </View>

          {/* Consensus */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Ionicons name="people" size={18} color={colors.primaryLight} />
              <Text style={s.cardTitle}>Group Consensus</Text>
            </View>
            {consensus.map((item, i) => (
              <View key={item} style={s.consensusRow}>
                <View style={s.consensusRank}>
                  <Text style={s.consensusRankText}>{i + 1}</Text>
                </View>
                <Text style={s.consensusItem}>{item}</Text>
              </View>
            ))}
          </View>

          {/* Your ranking vs consensus */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Ionicons name="person" size={18} color={colors.lime} />
              <Text style={s.cardTitle}>Your Ranking</Text>
              <View style={s.scorePill}>
                <Text style={s.scorePillText}>+{myScore} pts</Text>
              </View>
            </View>
            {myRanking.map((item, i) => {
              const consensusPos = consensus.indexOf(item);
              const diff = Math.abs(i - consensusPos);
              const isExact = diff === 0;

              return (
                <View key={item} style={s.compareRow}>
                  <View style={s.compareLeft}>
                    <View style={[s.compareBadge, isExact ? s.compareBadgeExact : s.compareBadgeOff]}>
                      <Text style={s.compareBadgeText}>{i + 1}</Text>
                    </View>
                    <Text style={s.compareItem}>{item}</Text>
                  </View>
                  <Text style={[s.compareDiff, isExact && { color: colors.success }]}>
                    {isExact ? "Exact!" : `Off by ${diff}`}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Round scores */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Ionicons name="trophy" size={18} color={colors.gold} />
              <Text style={s.cardTitle}>Round Scores</Text>
            </View>
            {players
              .slice()
              .sort((a, b) => (roundScores[b.user_id] ?? 0) - (roundScores[a.user_id] ?? 0))
              .map((p, i, arr) => (
                <View key={p.user_id} style={s.scoreRow}>
                  <View style={s.scoreLeft}>
                    <Text style={s.scoreRank}>
                      #{competitionRanks(arr, (x) => roundScores[x.user_id] ?? 0)[i]}
                    </Text>
                    <Text style={s.scoreName}>
                      {p.username}
                      {p.user_id === userId ? " (you)" : ""}
                    </Text>
                  </View>
                  <Text style={s.scoreValue}>+{roundScores[p.user_id] ?? 0}</Text>
                </View>
              ))}
          </View>
        </ScrollView>

        {/* Next round / game over */}
        {isHost && (
          <View style={s.footer}>
            <Pressable style={s.submitBtn} onPress={handleNextRound}>
              <Text style={s.submitBtnText}>
                {round >= TOTAL_ROUNDS ? "See Final Results" : "Next Round"}
              </Text>
            </Pressable>
          </View>
        )}

        {!isHost && (
          <View style={s.footer}>
            <View style={s.waitingBox}>
              <Ionicons name="hourglass-outline" size={20} color={colors.primaryLight} />
              <Text style={s.waitingText}>Waiting for host...</Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ----- GAME OVER PHASE -----
  if (phase === "game-over") {
    const sorted = players
      .slice()
      .sort((a, b) => (totalScores[b.user_id] ?? 0) - (totalScores[a.user_id] ?? 0));

    const maxScore = totalScores[sorted[0]?.user_id] ?? 0;
    const ranks = competitionRanks(sorted, (p) => totalScores[p.user_id] ?? 0);

    return (
      <SafeAreaView style={s.safe}>
        {/* Top bar */}
        <View style={s.topBar}>
          <View style={{ width: 24 }} />
          <Text style={s.topBarTitle}>BLIND RANKING</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={s.body} contentContainerStyle={[s.bodyContent, { alignItems: "center" }]}>
          {/* Trophy */}
          <View style={s.trophyContainer}>
            <Ionicons name="trophy" size={64} color={colors.gold} />
          </View>
          <Text style={s.gameOverTitle}>Game Over!</Text>
          <Text style={s.gameOverSub}>Blind Ranking - {TOTAL_ROUNDS} Rounds</Text>

          {/* Leaderboard */}
          <View style={[s.card, { width: "100%", marginTop: 24 }]}>
            {sorted.map((p, i) => {
              const score = totalScores[p.user_id] ?? 0;
              const isWinner = score === maxScore;
              const barWidth = maxScore > 0 ? (score / maxScore) * 100 : 0;
              const medals = ["gold", "silver", "#CD7F32"];
              const rank = ranks[i] ?? i + 1;

              return (
                <View key={p.user_id} style={s.leaderRow}>
                  <View style={s.leaderLeft}>
                    <View
                      style={[
                        s.leaderRank,
                        rank <= 3 && { backgroundColor: (medals[rank - 1] ?? colors.gray500) + "30" },
                      ]}
                    >
                      {rank === 1 ? (
                        <Ionicons name="medal" size={20} color="gold" />
                      ) : rank === 2 ? (
                        <Ionicons name="medal" size={20} color="silver" />
                      ) : rank === 3 ? (
                        <Ionicons name="medal" size={20} color="#CD7F32" />
                      ) : (
                        <Text style={s.leaderRankText}>{rank}</Text>
                      )}
                    </View>
                    <View style={s.leaderInfo}>
                      <Text style={[s.leaderName, isWinner && { color: colors.gold }]}>
                        {p.username}
                        {p.user_id === userId ? " (you)" : ""}
                      </Text>
                      <View style={s.leaderBarOuter}>
                        <View
                          style={[
                            s.leaderBarInner,
                            {
                              width: `${barWidth}%`,
                              backgroundColor: rank === 1 ? colors.gold : rank === 2 ? colors.gray400 : colors.primary,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                  <Text style={[s.leaderScore, isWinner && { color: colors.gold }]}>
                    {score}/{TOTAL_ROUNDS * 25}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Back to lobby (host only; players follow room status) */}
        <View style={s.footer}>
          {isHost ? (
            <Pressable style={s.submitBtn} onPress={handleBackToLobby}>
              <Text style={s.submitBtnText}>Back to Lobby</Text>
            </Pressable>
          ) : (
            <View style={s.waitingBox}>
              <Ionicons name="hourglass-outline" size={20} color={colors.primaryLight} />
              <Text style={s.waitingText}>Waiting for host...</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ----- FALLBACK / LOADING -----
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.centerContainer}>
        <Ionicons name="hourglass-outline" size={48} color={colors.primaryLight} />
        <Text style={s.loadingText}>Setting up game...</Text>
      </View>
    </SafeAreaView>
  );
}

// ==================================================================
// STYLES
// ==================================================================

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // --- Intro ---
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

  // --- Top bar ---
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  topBarTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.gray400,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  topBarRound: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray400,
  },

  // --- Header section ---
  headerSection: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  categoryLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.lime,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    color: colors.white,
    marginBottom: 6,
  },
  instruction: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray400,
  },

  // --- Timer ---
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 16,
    gap: 12,
  },
  timerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timerText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primaryLight,
  },
  timerBarOuter: {
    flex: 1,
    height: 6,
    backgroundColor: colors.gray500,
    borderRadius: 3,
    overflow: "hidden",
  },
  timerBarInner: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.primary,
  },

  // --- Body ---
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },

  // --- Item cards (ranking phase) ---
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemCardSelected: {
    borderLeftWidth: 3,
    borderLeftColor: colors.lime,
  },
  itemCardDisabled: {
    opacity: 0.6,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rankCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  rankCircleActive: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  rankCircleActiveText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.lime,
  },
  itemText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
  },

  // --- Bottom quip ---
  bottomQuip: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray500,
    textAlign: "center",
    fontStyle: "italic",
    paddingHorizontal: 24,
    marginBottom: 8,
  },

  // --- Footer ---
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
  },
  submitBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: 14,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
  waitingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    paddingVertical: 18,
    borderRadius: 14,
    gap: 10,
  },
  waitingText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.primaryLight,
  },

  // --- Reveal phase ---
  revealHeader: {
    paddingVertical: 16,
  },
  revealSubtitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.primaryLight,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.white,
    flex: 1,
  },
  scorePill: {
    backgroundColor: colors.success + "20",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scorePillText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.success,
  },

  // Consensus rows
  consensusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 12,
  },
  consensusRank: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primaryLight + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  consensusRankText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.primaryLight,
  },
  consensusItem: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
  },

  // Compare rows (your ranking)
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  compareLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  compareBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  compareBadgeExact: {
    backgroundColor: colors.success + "20",
  },
  compareBadgeOff: {
    backgroundColor: colors.gold + "20",
  },
  compareBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
  },
  compareItem: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.white,
  },
  compareDiff: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.gold,
  },

  // Score rows
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoreLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  scoreRank: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.gray500,
    width: 28,
  },
  scoreName: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.white,
  },
  scoreValue: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.success,
  },

  // --- Game over ---
  trophyContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.gold + "15",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    marginBottom: 16,
  },
  gameOverTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    color: colors.white,
  },
  gameOverSub: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.gray400,
    marginTop: 4,
  },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  leaderRank: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  leaderRankText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.gray400,
  },
  leaderInfo: {
    flex: 1,
  },
  leaderName: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
    marginBottom: 4,
  },
  leaderBarOuter: {
    height: 4,
    backgroundColor: colors.surfaceLight,
    borderRadius: 2,
    overflow: "hidden",
  },
  leaderBarInner: {
    height: "100%",
    borderRadius: 2,
  },
  leaderScore: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.white,
    marginLeft: 12,
  },

  // --- Loading ---
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.primaryLight,
  },
});
