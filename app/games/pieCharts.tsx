import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path, Circle } from "react-native-svg";
import { colors, fonts } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { PIE_CHARTS_PROMPTS, PieChartPrompt } from "../../src/data/pieCharts";
import HostWaitingPill from "../../src/components/HostWaitingPill";
import GameHeader from "../../src/components/GameHeader";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase =
  | "intro"
  | "setup"
  | "question-intro"
  | "voting"
  | "reveal"
  | "final-results";

type PCVote = {
  questionIdx: number;
  voterId: string;
  voteeId: string;
};

type GameState = {
  phase: Phase;
  game: "pieCharts";
  questions: PieChartPrompt[];
  questionIdx: number;
  submittedVoterIds: string[];
  allVotes: PCVote[];
  revealIdx: number;
  revealStage: "suspense" | "revealed";
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_QUESTION_COUNT = 5;
const { width: SW } = Dimensions.get("window");

const PLAYER_COLORS = [
  "#7C5CF6", "#22C55E", "#F43F5E", "#FBBF24",
  "#3B82F6", "#EC4899", "#10B981", "#F97316",
  "#A78BFA", "#34D399",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildSession(
  customPrompts: PieChartPrompt[],
  defaultCount: number
): PieChartPrompt[] {
  const presetCount = Math.max(0, defaultCount - customPrompts.length);
  const shuffled = shuffleArray(PIE_CHARTS_PROMPTS);
  const presets = shuffled.slice(0, presetCount);
  return shuffleArray([...customPrompts, ...presets]);
}

// ---------------------------------------------------------------------------
// Donut Chart SVG
// ---------------------------------------------------------------------------

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSegmentPath(
  cx: number, cy: number,
  or: number, ir: number,
  startDeg: number, endDeg: number,
): string {
  const sweep = endDeg - startDeg;
  if (sweep >= 359.9) {
    const o1 = polarToCartesian(cx, cy, or, 0);
    const o2 = polarToCartesian(cx, cy, or, 180);
    const i1 = polarToCartesian(cx, cy, ir, 0);
    const i2 = polarToCartesian(cx, cy, ir, 180);
    return (
      `M ${o1.x} ${o1.y} A ${or} ${or} 0 1 1 ${o2.x} ${o2.y} ` +
      `A ${or} ${or} 0 1 1 ${o1.x} ${o1.y} ` +
      `M ${i1.x} ${i1.y} A ${ir} ${ir} 0 1 0 ${i2.x} ${i2.y} ` +
      `A ${ir} ${ir} 0 1 0 ${i1.x} ${i1.y} Z`
    );
  }
  const large = sweep > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, or, startDeg);
  const p2 = polarToCartesian(cx, cy, or, endDeg);
  const p3 = polarToCartesian(cx, cy, ir, endDeg);
  const p4 = polarToCartesian(cx, cy, ir, startDeg);
  return `M ${p1.x} ${p1.y} A ${or} ${or} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${ir} ${ir} 0 ${large} 0 ${p4.x} ${p4.y} Z`;
}

function DonutChart({
  playerIds,
  playerMap,
  counts,
  size = 200,
}: {
  playerIds: string[];
  playerMap: Record<string, { username: string; index: number }>;
  counts: Record<string, number>;
  size?: number;
}) {
  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const or = size * 0.44;
  const ir = size * 0.26;

  let angle = 0;
  const segments = playerIds
    .filter((pid) => (counts[pid] ?? 0) > 0)
    .map((pid) => {
      const pct = (counts[pid] ?? 0) / total;
      const sweep = pct * 360;
      const start = angle;
      angle += sweep;
      return { pid, start, end: angle };
    });

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        {segments.map(({ pid, start, end }) => (
          <Path
            key={pid}
            d={donutSegmentPath(cx, cy, or, ir, start, end)}
            fill={PLAYER_COLORS[(playerMap[pid]?.index ?? 0) % PLAYER_COLORS.length]}
            stroke={colors.background}
            strokeWidth={2}
          />
        ))}
        <Circle cx={cx} cy={cy} r={ir - 1} fill={colors.background} />
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PieChartsScreen() {
  const router = useRouter();
  const { room, players, isHost, mutateGameState, endGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const [customInput, setCustomInput] = useState("");
  const [customPrompts, setCustomPrompts] = useState<PieChartPrompt[]>([]);

  const gs: GameState | null = room?.game_state ?? null;
  const phase = gs?.phase ?? null;
  const myId = user?.id ?? "";

  // Host: initialise game on mount
  useEffect(() => {
    if (!isHost || !room) return;
    if (gs && gs.game === "pieCharts" && gs.phase && (gs.phase as string) !== "starting") return;

    const initialState: GameState = {
      phase: "intro",
      game: "pieCharts",
      questions: [],
      questionIdx: 0,
      submittedVoterIds: [],
      allVotes: [],
      revealIdx: 0,
      revealStage: "suspense",
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

  // Only voters still in the room count (a leaver's submission is ignored).
  const countInRoom = (ids: string[] | undefined) =>
    (ids ?? []).filter((id) => players.some((p) => p.user_id === id)).length;

  // Host: auto-advance when all voted
  useEffect(() => {
    if (!isHost || phase !== "voting" || !gs) return;
    const totalPlayers = players.length;
    const totalVoted = countInRoom(gs.submittedVoterIds);
    if (totalPlayers > 0 && totalVoted >= totalPlayers) {
      const isLastQ = gs.questionIdx >= gs.questions.length - 1;
      if (isLastQ) {
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "voting") return null;
          if (countInRoom(cur.submittedVoterIds) < totalPlayers) return null;
          return { ...cur, phase: "reveal" as Phase, revealIdx: 0, revealStage: "suspense" };
        });
      } else {
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "voting") return null;
          if (countInRoom(cur.submittedVoterIds) < totalPlayers) return null;
          return {
            ...cur,
            phase: "question-intro" as Phase,
            questionIdx: cur.questionIdx + 1,
            submittedVoterIds: [],
          };
        });
      }
    }
  }, [gs?.submittedVoterIds?.length, players, phase, isHost]);

  // Derived data
  const playerMap: Record<string, { username: string; index: number }> = {};
  players.forEach((p, i) => {
    playerMap[p.user_id] = { username: p.username, index: i };
  });
  const playerIds = players.map((p) => p.user_id);

  const colorFor = (uid: string) =>
    PLAYER_COLORS[(playerMap[uid]?.index ?? 0) % PLAYER_COLORS.length];

  const tallyVotes = (qIdx: number): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const pid of playerIds) counts[pid] = 0;
    for (const v of (gs?.allVotes ?? []).filter((v) => v.questionIdx === qIdx)) {
      counts[v.voteeId] = (counts[v.voteeId] ?? 0) + 1;
    }
    return counts;
  };

  // Handlers
  const handleVote = useCallback(
    async (voteeId: string) => {
      if (!gs || !myId) return;
      await mutateGameState((cur) => {
        if (!cur || cur.phase !== "voting") return null;
        if ((cur.submittedVoterIds ?? []).includes(myId)) return null;
        const newVote: PCVote = { questionIdx: cur.questionIdx, voterId: myId, voteeId };
        return {
          ...cur,
          allVotes: [...(cur.allVotes ?? []), newVote],
          submittedVoterIds: [...(cur.submittedVoterIds ?? []), myId],
        };
      });
    },
    [gs, myId, mutateGameState]
  );

  const advanceToSetup = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "intro") return null;
      return { ...cur, phase: "setup" as Phase };
    });
  }, [mutateGameState]);

  const handleStartGame = useCallback(async () => {
    const session = buildSession(customPrompts, DEFAULT_QUESTION_COUNT);
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "setup") return null;
      return {
        ...cur,
        phase: "question-intro" as Phase,
        questions: session,
        questionIdx: 0,
        submittedVoterIds: [],
        allVotes: [],
        revealIdx: 0,
        revealStage: "suspense",
      };
    });
  }, [customPrompts, mutateGameState]);

  const handleStartVoting = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "question-intro") return null;
      return { ...cur, phase: "voting" as Phase, submittedVoterIds: [] };
    });
  }, [mutateGameState]);

  const handleReveal = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "reveal") return null;
      return { ...cur, revealStage: "revealed" };
    });
  }, [mutateGameState]);

  const handleNextReveal = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "reveal") return null;
      const isLast = (cur.revealIdx ?? 0) >= (cur.questions?.length ?? 1) - 1;
      if (isLast) return { ...cur, phase: "final-results" as Phase };
      return { ...cur, revealIdx: (cur.revealIdx ?? 0) + 1, revealStage: "suspense" };
    });
  }, [mutateGameState]);

  const handleBackToLobby = useCallback(async () => {
    await endGame();
  }, [endGame]);

  // Loading
  if (!gs || (gs.game as string) !== "pieCharts" || !phase || (phase as string) === "starting") {
    return (
      <SafeAreaView style={s.container}><GameHeader />
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loadingText}>Setting up the game...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // === INTRO ===
  if (phase === "intro") {
    return (
      <SafeAreaView style={s.container}><GameHeader />
        <ScrollView contentContainerStyle={s.introScroll}>
          <Text style={s.bigEmoji}>{"\uD83E\uDD67"}</Text>
          <Text style={s.title}>Pie Charts</Text>
          <Text style={s.tagline}>See who the group thinks fits each question.</Text>
          <View style={s.rulesBox}>
            {[
              ["\u2753", 'A "who is most likely to..." question appears.'],
              ["\uD83D\uDDF3\uFE0F", "Everyone votes for a player \u2014 you can vote for yourself."],
              ["\uD83D\uDCCA", "Results are revealed as a live pie chart showing the vote split."],
              ["\uD83D\uDCCB", "After all questions, scroll through the full results."],
            ].map(([icon, text], i) => (
              <View key={i} style={s.ruleCard}>
                <Text style={s.ruleText}>{icon}  {text}</Text>
              </View>
            ))}
          </View>
          {isHost ? (
            <TouchableOpacity style={s.primaryBtn} onPress={advanceToSetup}>
              <Text style={s.primaryBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <Text style={s.wait}>Waiting for host to start...</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === SETUP ===
  if (phase === "setup") {
    if (!isHost) {
      return (
        <SafeAreaView style={s.container}><GameHeader />
          <View style={s.centered}>
            <Text style={s.bigEmoji}>{"\uD83E\uDD67"}</Text>
            <Text style={s.title}>Pie Charts</Text>
            <Text style={s.wait}>Host is setting up...</Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={s.container}><GameHeader />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={s.setupScroll} keyboardShouldPersistTaps="handled">
            <Text style={s.title}>Pie Charts</Text>
            <Text style={s.subtitle}>Vote on "who's most likely" questions. Results revealed at the end.</Text>
            <View style={s.divider} />
            <Text style={s.sectionLabel}>ADD CUSTOM QUESTIONS (OPTIONAL)</Text>
            <View style={s.customRow}>
              <TextInput
                style={s.customInput}
                value={customInput}
                onChangeText={setCustomInput}
                placeholder="Who is most likely to..."
                placeholderTextColor={colors.gray500}
                returnKeyType="done"
                onSubmitEditing={() => {
                  const t = customInput.trim();
                  if (!t) return;
                  setCustomPrompts((p) => [...p, { id: `c_${Date.now()}`, text: t, isCustom: true }]);
                  setCustomInput("");
                }}
              />
              <TouchableOpacity
                style={[s.addBtn, !customInput.trim() && s.addBtnOff]}
                onPress={() => {
                  const t = customInput.trim();
                  if (!t) return;
                  setCustomPrompts((p) => [...p, { id: `c_${Date.now()}`, text: t, isCustom: true }]);
                  setCustomInput("");
                }}
                disabled={!customInput.trim()}
              >
                <Text style={s.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            {customPrompts.length > 0 && (
              <View style={{ gap: 8 }}>
                {customPrompts.map((p) => (
                  <View key={p.id} style={s.chip}>
                    <Text style={s.chipText} numberOfLines={1}>{p.text}</Text>
                    <TouchableOpacity onPress={() => setCustomPrompts((prev) => prev.filter((x) => x.id !== p.id))}>
                      <Ionicons name="close" size={16} color={colors.gray400} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <View style={s.divider} />
            <Text style={s.info}>
              {customPrompts.length > 0
                ? `${customPrompts.length} custom + ${Math.max(0, DEFAULT_QUESTION_COUNT - customPrompts.length)} preset questions`
                : `${DEFAULT_QUESTION_COUNT} questions from preset bank`}
            </Text>
            <Text style={s.info}>{players.length} players voting</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={handleStartGame}>
              <Text style={s.primaryBtnText}>Start Game</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // === QUESTION INTRO ===
  if (phase === "question-intro") {
    const currentQ = (gs.questions ?? [])[gs.questionIdx ?? 0];
    const qNum = (gs.questionIdx ?? 0) + 1;
    const qTotal = (gs.questions ?? []).length;
    return (
      <SafeAreaView style={s.container}><GameHeader />
        <View style={s.qIntro}>
          <View style={s.badge}>
            <Text style={s.badgeText}>QUESTION {qNum} / {qTotal}</Text>
          </View>
          <View style={s.promptCard}>
            <Text style={s.promptLabel}>The person most likely to...</Text>
            <Text style={s.promptText}>"{currentQ?.text ?? ""}"</Text>
          </View>
          <Text style={s.hint}>Everyone votes on their own phone {"\u2014"} including yourself!</Text>
          {isHost ? (
            <TouchableOpacity style={s.primaryBtn} onPress={handleStartVoting}>
              <Text style={s.primaryBtnText}>Start Voting</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <Text style={s.wait}>Waiting for host to open voting...</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // === VOTING ===
  if (phase === "voting") {
    const iHaveVoted = (gs.submittedVoterIds ?? []).includes(myId);
    const votesIn = countInRoom(gs.submittedVoterIds);
    const currentQ = (gs.questions ?? [])[gs.questionIdx ?? 0];

    if (iHaveVoted) {
      return (
        <SafeAreaView style={s.container}><GameHeader />
          <View style={s.centered}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Text style={s.title}>You voted!</Text>
            <Text style={s.wait}>{votesIn} / {players.length} players have voted</Text>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={s.container}><GameHeader />
        <ScrollView contentContainerStyle={s.voteScroll}>
          <View style={s.badge}>
            <Text style={s.badgeText}>VOTE NOW</Text>
          </View>
          <View style={s.promptCardSm}>
            <Text style={s.promptLabel}>The person most likely to...</Text>
            <Text style={s.promptTextSm}>"{currentQ?.text ?? ""}"</Text>
          </View>
          <Text style={s.sectionLabel}>WHO ARE YOU VOTING FOR?</Text>
          {players.map((p) => (
            <TouchableOpacity
              key={p.user_id}
              style={[s.voteBtn, { borderColor: colorFor(p.user_id) }]}
              onPress={() => handleVote(p.user_id)}
              activeOpacity={0.75}
            >
              <View style={[s.voteDot, { backgroundColor: colorFor(p.user_id) }]} />
              <Text style={s.voteName} numberOfLines={1}>{p.username}</Text>
              {p.user_id === myId && <Text style={s.selfTag}>you</Text>}
              <Ionicons name="arrow-forward" size={16} color={colors.gray400} />
            </TouchableOpacity>
          ))}
          <Text style={s.voteProg}>{votesIn} / {players.length} voted</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === REVEAL ===
  if (phase === "reveal") {
    const rIdx = gs.revealIdx ?? 0;
    const rStage = gs.revealStage ?? "suspense";
    const revQ = (gs.questions ?? [])[rIdx];
    const counts = tallyVotes(rIdx);
    const totalForQ = (gs.allVotes ?? []).filter((v) => v.questionIdx === rIdx).length;
    const isLast = rIdx >= (gs.questions?.length ?? 1) - 1;
    const maxVotes = Math.max(...playerIds.map((pid) => counts[pid] ?? 0), 0);
    const winners = maxVotes > 0 ? playerIds.filter((pid) => (counts[pid] ?? 0) === maxVotes) : [];
    const isTie = winners.length > 1;

    return (
      <SafeAreaView style={s.container}><GameHeader />
        <ScrollView contentContainerStyle={s.revealScroll}>
          <View style={s.badge}>
            <Text style={s.badgeText}>REVEAL {rIdx + 1} / {(gs.questions ?? []).length}</Text>
          </View>
          <View style={s.promptCard}>
            <Text style={s.promptLabel}>The person most likely to...</Text>
            <Text style={s.promptText}>"{revQ?.text ?? ""}"</Text>
          </View>

          {rStage === "suspense" ? (
            <View style={s.suspense}>
              <Text style={s.dots}>...</Text>
              {isHost ? (
                <TouchableOpacity style={s.primaryBtn} onPress={handleReveal}>
                  <Text style={s.primaryBtnText}>Reveal</Text>
                  <Ionicons name="arrow-forward" size={20} color={colors.white} />
                </TouchableOpacity>
              ) : (
                <Text style={s.wait}>Waiting for the reveal...</Text>
              )}
            </View>
          ) : (
            <>
              <View style={s.winnerWrap}>
                {isTie && <Text style={s.tieLabel}>IT'S A TIE!</Text>}
                {winners.map((wid) => (
                  <Text key={wid} style={[s.winnerName, { color: colorFor(wid) }]}>
                    {playerMap[wid]?.username ?? "Unknown"}
                  </Text>
                ))}
                <Text style={s.votesSub}>
                  {maxVotes} of {totalForQ} vote{maxVotes !== 1 ? "s" : ""}{isTie ? " each" : ""}
                </Text>
              </View>
              <DonutChart playerIds={playerIds} playerMap={playerMap} counts={counts} size={SW * 0.55} />
              <View style={s.legend}>
                {[...playerIds].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0)).map((pid) => {
                  const c = counts[pid] ?? 0;
                  const pct = totalForQ > 0 ? Math.round((c / totalForQ) * 100) : 0;
                  return (
                    <View key={pid} style={s.legendRow}>
                      <View style={[s.legendDot, { backgroundColor: colorFor(pid) }]} />
                      <Text style={s.legendName} numberOfLines={1}>{playerMap[pid]?.username ?? "?"}</Text>
                      <Text style={s.legendPct}>{pct}%</Text>
                      <Text style={s.legendCnt}>({c})</Text>
                    </View>
                  );
                })}
              </View>
              {isHost ? (
                <TouchableOpacity style={s.primaryBtn} onPress={handleNextReveal} activeOpacity={0.7}>
                  <Text style={s.primaryBtnText}>{isLast ? "See Final Results" : "Next Question"}</Text>
                  <Ionicons name="arrow-forward" size={20} color={colors.white} />
                </TouchableOpacity>
              ) : (
                <Text style={s.wait}>Waiting for host to continue...</Text>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === FINAL RESULTS ===
  if (phase === "final-results") {
    return (
      <SafeAreaView style={s.container}><GameHeader />
        <ScrollView contentContainerStyle={s.finalScroll}>
          <Text style={s.finalTitle}>All Done!</Text>
          <Text style={s.finalSub}>{(gs.questions ?? []).length} questions {"\u00B7"} {players.length} voters</Text>
          {(gs.questions ?? []).map((q, qi) => {
            const counts = tallyVotes(qi);
            const maxV = Math.max(...playerIds.map((pid) => counts[pid] ?? 0), 0);
            const qWinners = playerIds.filter((pid) => (counts[pid] ?? 0) === maxV && maxV > 0);
            return (
              <View key={q.id} style={s.finalBlock}>
                <Text style={s.finalQNum}>Q{qi + 1}</Text>
                <Text style={s.finalQText}>{q.text}</Text>
                <View style={s.finalWRow}>
                  {qWinners.map((wid) => (
                    <Text key={wid} style={[s.finalWinner, { color: colorFor(wid) }]}>
                      {playerMap[wid]?.username ?? "?"}
                    </Text>
                  ))}
                  {qWinners.length > 1 && <Text style={s.finalTie}>(tie)</Text>}
                </View>
                <DonutChart playerIds={playerIds} playerMap={playerMap} counts={counts} size={SW * 0.45} />
              </View>
            );
          })}
          {isHost ? (
            <TouchableOpacity style={s.primaryBtn} onPress={handleBackToLobby} activeOpacity={0.7}>
              <Text style={s.primaryBtnText}>Back to Lobby</Text>
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
    <SafeAreaView style={s.container}><GameHeader />
      <View style={s.centered}>
        <Text style={s.loadingText}>Unknown phase: {phase}</Text>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  loadingText: { fontFamily: fonts.medium, fontSize: 16, color: colors.gray400, marginTop: 16 },
  bigEmoji: { fontSize: 64, marginBottom: 16 },
  title: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white, marginBottom: 8 },
  tagline: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray400, marginBottom: 32, textAlign: "center" },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, color: colors.gray400, lineHeight: 22 },
  wait: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray400, textAlign: "center" },
  hint: { fontFamily: fonts.regular, fontSize: 14, color: colors.gray400, textAlign: "center" },
  info: { fontSize: 14, color: colors.gray400, fontFamily: fonts.regular },

  introScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 24 },
  rulesBox: { width: "100%", marginBottom: 32 },
  ruleCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  ruleText: { fontFamily: fonts.regular, fontSize: 14, color: colors.white, lineHeight: 20 },

  setupScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 16 },
  sectionLabel: { fontFamily: fonts.bold, fontSize: 11, color: colors.gray500, letterSpacing: 1.5 },
  divider: { height: 1, backgroundColor: colors.border },
  customRow: { flexDirection: "row", gap: 10 },
  customInput: {
    flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceLight,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.white, fontFamily: fonts.regular,
  },
  addBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 16, justifyContent: "center" },
  addBtnOff: { opacity: 0.4 },
  addBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
  chip: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.surfaceLight, paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  chipText: { flex: 1, fontSize: 14, color: colors.white, fontFamily: fonts.regular },

  qIntro: { flex: 1, paddingHorizontal: 20, paddingTop: 32, paddingBottom: 40, alignItems: "center", gap: 14 },
  badge: {
    backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.surfaceLight,
    paddingVertical: 5, paddingHorizontal: 14, alignSelf: "flex-start",
  },
  badgeText: { fontSize: 11, fontFamily: fonts.extrabold, color: colors.primaryLight, letterSpacing: 2 },
  promptCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.surfaceLight,
    padding: 22, alignItems: "center", gap: 10, width: "100%",
  },
  promptCardSm: {
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceLight,
    padding: 16, alignItems: "center", gap: 8, width: "100%",
  },
  promptLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray400, textAlign: "center" },
  promptText: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.white, textAlign: "center", lineHeight: 28 },
  promptTextSm: { fontFamily: fonts.bold, fontSize: 16, color: colors.white, textAlign: "center" },

  voteScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 12 },
  voteBtn: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface,
    borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 14,
  },
  voteDot: { width: 10, height: 10, borderRadius: 5 },
  voteName: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  selfTag: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  voteProg: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray400, textAlign: "center", marginTop: 8 },

  revealScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 20, alignItems: "center" },
  suspense: { alignItems: "center", gap: 20, paddingVertical: 32, width: "100%" },
  dots: { fontFamily: fonts.extrabold, fontSize: 48, color: colors.primaryLight, letterSpacing: 8 },
  winnerWrap: { alignItems: "center", gap: 6, paddingVertical: 8 },
  tieLabel: { fontSize: 13, fontFamily: fonts.extrabold, color: colors.warning, letterSpacing: 3, marginBottom: 4 },
  winnerName: { fontSize: 36, fontFamily: fonts.extrabold, letterSpacing: -1 },
  votesSub: { fontSize: 14, color: colors.gray400, fontFamily: fonts.medium },
  legend: { width: "100%", gap: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, fontSize: 14, fontFamily: fonts.bold, color: colors.white },
  legendPct: { fontSize: 13, fontFamily: fonts.bold, color: colors.white, width: 38, textAlign: "right" },
  legendCnt: { fontSize: 12, color: colors.gray400, width: 28, textAlign: "right" },

  finalScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 20 },
  finalTitle: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white, textAlign: "center" },
  finalSub: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray400, textAlign: "center" },
  finalBlock: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.surfaceLight,
    padding: 20, gap: 12, alignItems: "center",
  },
  finalQNum: { fontFamily: fonts.extrabold, fontSize: 12, color: colors.primaryLight, letterSpacing: 2 },
  finalQText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white, textAlign: "center" },
  finalWRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  finalWinner: { fontFamily: fonts.extrabold, fontSize: 20 },
  finalTie: { fontFamily: fonts.medium, fontSize: 13, color: colors.warning },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, width: "100%",
  },
  primaryBtnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
});
