import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle } from "react-native-svg";
import { colors, fonts, gradients, radii, spacing, type } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { getAllPieChartPrompts, PieChartPrompt } from "../../src/data/pieCharts";
import { drawFresh, loadRecent } from "../../src/utils/deck";

const PC_DECK_KEY = "pc";
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

// Lavender / violet / peach / gold palette (alternating light & deep for contrast between slices)
const PLAYER_COLORS = [
  "#B8AEE8", "#F6C9A8", "#7E6BD6", "#F0D78C",
  "#D9D1FA", "#E89B7A", "#9B8FDB", "#D4A843",
  "#5240A8", "#F3E2D2",
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
  const presets = drawFresh(PC_DECK_KEY, getAllPieChartPrompts(), presetCount, (p) => p.id);
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
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        {segments.map(({ pid, start, end }) => (
          <Path
            key={pid}
            d={donutSegmentPath(cx, cy, or, ir, start, end)}
            fill={PLAYER_COLORS[(playerMap[pid]?.index ?? 0) % PLAYER_COLORS.length]}
            stroke={colors.card}
            strokeWidth={3}
          />
        ))}
        <Circle cx={cx} cy={cy} r={ir - 1} fill={colors.card} />
      </Svg>
      <View style={s.donutCenter} pointerEvents="none">
        <Text style={[s.donutCenterNum, { fontSize: Math.max(18, size * 0.14) }]}>{total}</Text>
        <Text style={s.donutCenterLabel}>{total === 1 ? "VOTE" : "VOTES"}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PieChartsScreen() {
  const router = useRouter();
  const { room, players, isHost, mutateGameState, endGame, startGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const [customInput, setCustomInput] = useState("");
  const [customPrompts, setCustomPrompts] = useState<PieChartPrompt[]>([]);

  const gs: GameState | null = room?.game_state ?? null;
  const phase = gs?.phase ?? null;
  const myId = user?.id ?? "";

  // Hydrate this device's recently-used prompt list (keeps sessions fresh).
  useEffect(() => {
    loadRecent(PC_DECK_KEY);
  }, []);

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
  // Track games played (Pie Charts has no winner)
  const trackedGameRef = useRef(false);
  useEffect(() => {
    if (trackedGameRef.current || phase !== "final-results") return;
    trackedGameRef.current = true;
    useAuthStore.getState().incrementGamesPlayed();
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
    return <GameLoadingScreen name="Pie Charts" icon="pie-chart" color="#EF4444" />;
  }

  // === INTRO ===
  if (phase === "intro") {
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Continue" icon="arrow-forward" onPress={advanceToSetup} />
          ) : (
            <WaitingNote label="Waiting for host to start..." />
          )
        }
      >
        <ScreenTitle title="Pie Charts" subtitle="See who the group thinks fits each question." />
        <HeroGradient>
          <View style={s.heroRow}>
            <View style={s.heroCopy}>
              <Eyebrow tone="dark">Who's most likely to...</Eyebrow>
              <Text style={s.heroTitle}>Vote on your friends. See the slices.</Text>
            </View>
            <Text style={s.heroEmoji}>{"\uD83E\uDD67"}</Text>
          </View>
        </HeroGradient>
        <Eyebrow style={s.sectionEyebrow}>How it works</Eyebrow>
        <View style={s.list}>
          {[
            ["\u2753", 'A "who is most likely to..." question appears.'],
            ["\uD83D\uDDF3\uFE0F", "Everyone votes for a player \u2014 you can vote for yourself."],
            ["\uD83D\uDCCA", "Results are revealed as a live pie chart showing the vote split."],
            ["\uD83D\uDCCB", "After all questions, scroll through the full results."],
          ].map(([icon, text], i) => (
            <GradientCard key={i} radius={radii.lg} contentStyle={s.ruleRow}>
              <View style={s.ruleIcon}>
                <Text style={s.ruleEmoji}>{icon}</Text>
              </View>
              <Text style={s.ruleText}>{text}</Text>
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
        <Shell footer={<WaitingNote label="Host is setting up..." />}>
          <ScreenTitle title="Pie Charts" subtitle="Host is setting up..." />
          <HeroGradient>
            <View style={s.heroRow}>
              <View style={s.heroCopy}>
                <Eyebrow tone="dark">Get ready</Eyebrow>
                <Text style={s.heroTitle}>Questions are being picked.</Text>
              </View>
              <Text style={s.heroEmoji}>{"\uD83E\uDD67"}</Text>
            </View>
          </HeroGradient>
        </Shell>
      );
    }
    return (
      <Shell
        keyboard
        footer={<PrimaryAction label="Start Game" icon="arrow-forward" onPress={handleStartGame} />}
      >
        <ScreenTitle
          title="Pie Charts"
          subtitle={`Vote on "who's most likely" questions. Results revealed at the end.`}
        />
        <View style={s.statRow}>
          <StatCard
            label="Questions"
            value={customPrompts.length + Math.max(0, DEFAULT_QUESTION_COUNT - customPrompts.length)}
          />
          <StatCard label="Players voting" value={players.length} />
        </View>
        <Eyebrow style={s.sectionEyebrow}>Add custom questions (optional)</Eyebrow>
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
          <Pressable
            style={({ pressed }) => [s.addBtn, !customInput.trim() && s.addBtnOff, pressed && s.pressed]}
            onPress={() => {
              const t = customInput.trim();
              if (!t) return;
              setCustomPrompts((p) => [...p, { id: `c_${Date.now()}`, text: t, isCustom: true }]);
              setCustomInput("");
            }}
            disabled={!customInput.trim()}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color={colors.onPrimary} />
            <Text style={s.addBtnText}>Add</Text>
          </Pressable>
        </View>
        {customPrompts.length > 0 && (
          <View style={s.list}>
            {customPrompts.map((p) => (
              <GradientCard key={p.id} radius={radii.lg} contentStyle={s.chipRow}>
                <Text style={s.chipText} numberOfLines={1}>{p.text}</Text>
                <Pressable
                  onPress={() => setCustomPrompts((prev) => prev.filter((x) => x.id !== p.id))}
                  hitSlop={8}
                  style={s.chipRemove}
                  accessibilityRole="button"
                  accessibilityLabel="Remove question"
                >
                  <Ionicons name="close" size={16} color={colors.gray300} />
                </Pressable>
              </GradientCard>
            ))}
          </View>
        )}
        <Text style={s.helper}>
          {customPrompts.length > 0
            ? `${customPrompts.length} custom + ${Math.max(0, DEFAULT_QUESTION_COUNT - customPrompts.length)} preset questions`
            : `${DEFAULT_QUESTION_COUNT} questions from preset bank`}
        </Text>
      </Shell>
    );
  }

  // === QUESTION INTRO ===
  if (phase === "question-intro") {
    const currentQ = (gs.questions ?? [])[gs.questionIdx ?? 0];
    const qNum = (gs.questionIdx ?? 0) + 1;
    const qTotal = (gs.questions ?? []).length;
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Start Voting" icon="arrow-forward" onPress={handleStartVoting} />
          ) : (
            <WaitingNote label="Waiting for host to open voting..." />
          )
        }
      >
        <ScreenTitle
          title={`Question ${qNum}`}
          subtitle={`Everyone votes on their own phone \u2014 including yourself!`}
          pill={`Question ${qNum}/${qTotal}`}
        />
        <PromptHero text={currentQ?.text ?? ""} />
      </Shell>
    );
  }

  // === VOTING ===
  if (phase === "voting") {
    const iHaveVoted = (gs.submittedVoterIds ?? []).includes(myId);
    const votesIn = countInRoom(gs.submittedVoterIds);
    const currentQ = (gs.questions ?? [])[gs.questionIdx ?? 0];

    if (iHaveVoted) {
      return (
        <Shell footer={<WaitingNote label={`${votesIn} / ${players.length} players have voted`} />}>
          <ScreenTitle title="You voted!" subtitle={`${votesIn} / ${players.length} players have voted`} />
          <GradientCard contentStyle={s.submittedCard}>
            <View style={s.submittedIcon}>
              <Ionicons name="checkmark" size={36} color={colors.highlight} />
            </View>
            <Eyebrow>Votes in</Eyebrow>
            <ProgressBar progress={players.length > 0 ? votesIn / players.length : 0} />
          </GradientCard>
        </Shell>
      );
    }

    return (
      <Shell>
        <ScreenTitle
          title="Vote now"
          subtitle="Tap a player to cast your vote."
          pill={`${votesIn}/${players.length} voted`}
        />
        <PromptHero text={currentQ?.text ?? ""} compact />
        <Eyebrow style={s.sectionEyebrow}>Who are you voting for?</Eyebrow>
        <View style={s.list}>
          {players.map((p) => (
            <Pressable
              key={p.user_id}
              onPress={() => handleVote(p.user_id)}
              accessibilityRole="button"
              style={({ pressed }) => [pressed && s.pressed]}
            >
              <GradientCard radius={radii.lg} contentStyle={s.candidateRow}>
                <PlayerAvatar username={p.username} size={40} />
                <View style={[s.legendDot, { backgroundColor: colorFor(p.user_id) }]} />
                <View style={s.candidateNameWrap}>
                  <Text style={s.candidateNameText} numberOfLines={1}>{p.username}</Text>
                  {p.user_id === myId && <Pill tone="dark" label="You" style={s.youPill} />}
                </View>
                <VoteTag />
              </GradientCard>
            </Pressable>
          ))}
        </View>
        <Text style={s.helper}>{votesIn} / {players.length} voted</Text>
      </Shell>
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

    const footer =
      rStage === "suspense" ? (
        isHost ? (
          <PrimaryAction label="Reveal" icon="arrow-forward" onPress={handleReveal} />
        ) : (
          <WaitingNote label="Waiting for the reveal..." />
        )
      ) : isHost ? (
        <PrimaryAction
          label={isLast ? "See Final Results" : "Next Question"}
          icon="arrow-forward"
          onPress={handleNextReveal}
        />
      ) : (
        <WaitingNote label="Waiting for host to continue..." />
      );

    return (
      <Shell footer={footer}>
        <ScreenTitle
          title={rStage === "suspense" ? "And the pie says..." : "The results"}
          subtitle={`Question ${rIdx + 1} of ${(gs.questions ?? []).length}`}
          pill={`Reveal ${rIdx + 1}/${(gs.questions ?? []).length}`}
        />
        {rStage === "suspense" ? (
          <>
            <PromptHero text={revQ?.text ?? ""} />
            <View style={s.suspense}>
              <Text style={s.dots}>...</Text>
            </View>
          </>
        ) : (
          <>
            <GradientCard contentStyle={s.promptDarkCard}>
              <Eyebrow tone="lavender">The person most likely to...</Eyebrow>
              <Text style={s.promptDarkText}>"{revQ?.text ?? ""}"</Text>
            </GradientCard>
            <HeroGradient>
              <View style={s.winnerHero}>
                <Eyebrow tone="dark">{isTie ? "It's a tie!" : "Most likely"}</Eyebrow>
                {winners.map((wid) => (
                  <View key={wid} style={s.winnerRow}>
                    <View style={[s.swatchLg, { backgroundColor: colorFor(wid) }]} />
                    <Text style={s.winnerName} numberOfLines={1}>
                      {playerMap[wid]?.username ?? "Unknown"}
                    </Text>
                  </View>
                ))}
                <Text style={s.votesSub}>
                  {maxVotes} of {totalForQ} vote{maxVotes !== 1 ? "s" : ""}{isTie ? " each" : ""}
                </Text>
              </View>
            </HeroGradient>
            <GradientCard contentStyle={s.chartCard}>
              <DonutChart playerIds={playerIds} playerMap={playerMap} counts={counts} size={SW * 0.55} />
              <View style={s.legend}>
                {[...playerIds].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0)).map((pid) => {
                  const c = counts[pid] ?? 0;
                  const pct = totalForQ > 0 ? Math.round((c / totalForQ) * 100) : 0;
                  return (
                    <View key={pid} style={s.legendItem}>
                      <View style={s.legendRow}>
                        <View style={[s.legendDot, { backgroundColor: colorFor(pid) }]} />
                        <Text style={s.legendName} numberOfLines={1}>{playerMap[pid]?.username ?? "?"}</Text>
                        <Text style={s.legendPct}>{pct}%</Text>
                        <Text style={s.legendCnt}>({c})</Text>
                      </View>
                      <View style={s.legendTrack}>
                        <View style={[s.legendFill, { width: `${pct}%`, backgroundColor: colorFor(pid) }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </GradientCard>
          </>
        )}
      </Shell>
    );
  }

  // === FINAL RESULTS ===
  if (phase === "final-results") {
    return (
      <Shell
        footer={
          isHost ? (
            <View style={s.footerStack}>
              <PrimaryAction
                label="Play Again"
                icon="refresh"
                iconPosition="left"
                onPress={() => startGame("pieCharts")}
              />
              <PrimaryAction label="Back to Lobby" variant="dark" onPress={handleBackToLobby} />
            </View>
          ) : (
            <View style={s.centerRow}>
              <HostWaitingPill label="Waiting for host..." />
            </View>
          )
        }
      >
        <ScreenTitle
          title="All Done!"
          subtitle={`${(gs.questions ?? []).length} questions \u00B7 ${players.length} voters`}
          pill="Final results"
        />
        {(gs.questions ?? []).map((q, qi) => {
          const counts = tallyVotes(qi);
          const maxV = Math.max(...playerIds.map((pid) => counts[pid] ?? 0), 0);
          const qWinners = playerIds.filter((pid) => (counts[pid] ?? 0) === maxV && maxV > 0);
          return (
            <GradientCard key={q.id} contentStyle={s.finalBlock}>
              <View style={s.finalHead}>
                <View style={s.numTile}>
                  <Text style={s.numTileText}>{qi + 1}</Text>
                </View>
                <Text style={s.finalQText}>{q.text}</Text>
              </View>
              <View style={s.finalWRow}>
                {qWinners.map((wid) => (
                  <View key={wid} style={s.finalWinnerChip}>
                    <View style={[s.legendDot, { backgroundColor: colorFor(wid) }]} />
                    <Text style={[s.finalWinner, { color: colorFor(wid) }]}>
                      {playerMap[wid]?.username ?? "?"}
                    </Text>
                  </View>
                ))}
                {qWinners.length > 1 && <Pill tone="peach" label="Tie" />}
              </View>
              <DonutChart playerIds={playerIds} playerMap={playerMap} counts={counts} size={SW * 0.45} />
            </GradientCard>
          );
        })}
      </Shell>
    );
  }

  return (
    <Shell>
      <Text style={s.loadingText}>Unknown phase: {phase}</Text>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Presentational helpers (no game logic)
// ---------------------------------------------------------------------------

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
        contentContainerStyle={[s.scroll, !footer && s.scrollNoFooter]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? <PrimaryActionBar>{footer}</PrimaryActionBar> : null}
    </>
  );
  return (
    <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
      <ScreenBackground />
      <GameHeader />
      {keyboard ? (
        <KeyboardAvoidingView style={s.flex1} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
    <View style={s.titleBlock}>
      <View style={s.eyebrowRow}>
        <Eyebrow tone="lavender">Pie Charts</Eyebrow>
        {pill ? <Pill tone="peach" label={pill} /> : null}
      </View>
      <Text style={type.title}>{title}</Text>
      {subtitle ? <Text style={type.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function WaitingNote({ label }: { label: string }) {
  return (
    <View style={s.waiting}>
      <ActivityIndicator size="small" color={colors.highlight} />
      <Text style={s.waitingText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function PromptHero({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <HeroGradient>
      <View style={[s.promptHero, compact && s.promptHeroCompact]}>
        <Eyebrow tone="dark">The person most likely to...</Eyebrow>
        <Text style={[s.promptHeroText, compact && s.promptHeroTextCompact]}>"{text}"</Text>
      </View>
    </HeroGradient>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <GradientCard style={s.flex1} radius={radii.lg} contentStyle={s.statContent}>
      <Text style={s.statValue}>{value}</Text>
      <Eyebrow>{label}</Eyebrow>
    </GradientCard>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View style={s.progressTrack}>
      <LinearGradient
        colors={gradients.primaryButton}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[s.progressFill, { width: `${Math.min(1, Math.max(0, progress)) * 100}%` }]}
      />
    </View>
  );
}

function VoteTag() {
  return (
    <View style={s.voteTag}>
      <Text style={s.voteTagText}>VOTE</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.highlight} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
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
  helper: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray400, textAlign: "center" },

  // Title block
  titleBlock: { gap: spacing.sm },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  sectionEyebrow: { marginTop: spacing.xs },

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

  // Hero
  heroRow: { flexDirection: "row", alignItems: "center", padding: 22, gap: spacing.md },
  heroCopy: { flex: 1, gap: 6 },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 29, color: colors.onPrimary },
  heroEmoji: { fontSize: 56 },

  // Prompt hero
  promptHero: { padding: 24, gap: spacing.md, minHeight: 160, justifyContent: "center" },
  promptHeroCompact: { padding: 20, minHeight: 0, gap: spacing.sm },
  promptHeroText: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, color: colors.onPrimary },
  promptHeroTextCompact: { fontSize: 21, lineHeight: 27 },
  promptDarkCard: { padding: 20, gap: spacing.sm },
  promptDarkText: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, color: colors.white },

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

  // Stats
  statRow: { flexDirection: "row", gap: spacing.md },
  statContent: { padding: spacing.lg, gap: 4 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 30, color: colors.white, fontVariant: ["tabular-nums"] },

  // Setup input
  customRow: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  customInput: {
    flex: 1,
    minHeight: 52,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.white,
    fontFamily: fonts.medium,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.highlight,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
  },
  addBtnOff: { opacity: 0.45 },
  addBtnText: { color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 15 },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 12,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
  },
  chipText: { flex: 1, fontSize: 15, color: colors.white, fontFamily: fonts.medium },
  chipRemove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },

  // Candidate rows
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  // Name + inline "YOU" pill: pill sits right after the name, vertically centred.
  candidateNameWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 0 },
  candidateNameText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.white },
  youPill: { alignSelf: "center" },
  voteTag: { flexDirection: "row", alignItems: "center", gap: 2 },
  voteTagText: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2, color: colors.highlight },

  // Submitted
  submittedCard: { alignItems: "center", padding: 24, gap: spacing.md },
  submittedIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.highlightSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    alignSelf: "stretch",
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceLight,
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  progressFill: { height: "100%", borderRadius: radii.pill },

  // Reveal
  suspense: { alignItems: "center", paddingVertical: 32 },
  dots: { fontFamily: fonts.extrabold, fontSize: 64, color: colors.highlight, letterSpacing: 10 },
  winnerHero: { padding: 22, gap: spacing.sm },
  winnerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  swatchLg: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.onPrimary,
  },
  winnerName: {
    flexShrink: 1,
    fontFamily: fonts.extrabold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1,
    color: colors.onPrimary,
  },
  votesSub: { fontFamily: fonts.semibold, fontSize: 14, color: "rgba(14,12,26,0.7)" },
  chartCard: { padding: 20, gap: spacing.xl, alignItems: "center" },
  donutCenter: { position: "absolute", alignItems: "center", justifyContent: "center" },
  donutCenterNum: { fontFamily: fonts.extrabold, color: colors.white, fontVariant: ["tabular-nums"] },
  donutCenterLabel: { ...type.eyebrow, fontSize: 9 },
  legend: { alignSelf: "stretch", gap: spacing.md },
  legendItem: { gap: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, fontSize: 15, fontFamily: fonts.bold, color: colors.white },
  legendPct: { fontSize: 15, fontFamily: fonts.extrabold, color: colors.white, minWidth: 42, textAlign: "right" },
  legendCnt: { fontSize: 12, fontFamily: fonts.medium, color: colors.gray400, minWidth: 28, textAlign: "right" },
  legendTrack: { height: 4, borderRadius: radii.pill, backgroundColor: colors.surfaceLight, overflow: "hidden" },
  legendFill: { height: "100%", borderRadius: radii.pill },

  // Final results
  finalBlock: { padding: 20, gap: spacing.md, alignItems: "center" },
  finalHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, alignSelf: "stretch" },
  numTile: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  numTileText: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.highlight },
  finalQText: { flex: 1, fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, color: colors.white },
  finalWRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", justifyContent: "center" },
  finalWinnerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  finalWinner: { fontFamily: fonts.extrabold, fontSize: 18 },
});
