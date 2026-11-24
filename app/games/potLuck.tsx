import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts, gradients, radii, spacing, type } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { DEFAULT_QUESTIONS, PotLuckQuestion, getAllPotLuckQuestions } from "../../src/data/potLuck";
import { getRecent, loadRecent, markUsed, pickFresh } from "../../src/utils/deck";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "intro" | "rolling" | "turn-countdown" | "live" | "reveal" | "gameover";

type LastResult = {
  playerId: string;
  kind: "correct" | "wrong" | "skip";
  delta: number;
  total: number;
  potAt: number;
};

type GameState = {
  phase: Phase;
  game: "potLuck";
  // Turn order
  order: string[]; // userIds in seat order
  seatPtr: number; // index into order for current turn
  // Monotonic turn counter: bumped on EVERY turn change (incl. same-seat turns
  // and new questions). Timers and answer/skip writes are keyed on it so a
  // stale timer can never act on a newer turn.
  turnSeq?: number;
  // Question
  currentQuestion: PotLuckQuestion | null;
  usedQuestionIds: string[];
  // Pot
  pot: number;
  potCap: number;
  consecutiveSkips: number;
  // Scores & target
  scores: Record<string, number>;
  target: number;
  // Turn action
  turnAction: { playerId: string; choiceIdx: number } | null;
  turnSkip: string | null; // playerId who skipped
  // Reveal info
  revealInfo: {
    answer: string;
    scored: boolean;
    by: string;
  } | null;
  lastResult: LastResult | null;
  winnerId: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMER_SECONDS = 15;
// Host backup auto-skip fires this long after its own local turn timer, so an
// answer the player submitted right at the buzzer always reaches the server first.
const HOST_GRACE_MS = 3000;
const DEFAULT_TARGET = 10;
const DEFAULT_POT_CAP = 7;

// Difficulty chip colours (lime / peach / soft red) — shown on the lavender hero card with dark text
const DIFF_COLOR = { easy: "#C4F04D", medium: "#F6C9A8", hard: "#F5A3A3" } as const;
const DIFF_LABEL = { easy: "EASY", medium: "MEDIUM", hard: "HARD" } as const;

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

function pickQuestion(usedIds: string[]): PotLuckQuestion | null {
  // Prefer questions not used this game or recently on this device; pickFresh
  // falls back to the least-recently-used ones if the fresh supply runs out.
  const all = getAllPotLuckQuestions();
  const [q] = pickFresh(all, 1, (x) => x.id, [...getRecent("sp"), ...usedIds]);
  const picked = q ?? DEFAULT_QUESTIONS[Math.floor(Math.random() * DEFAULT_QUESTIONS.length)] ?? null;
  if (picked) markUsed("sp", [picked.id]);
  return picked;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PotLuckScreen() {
  const router = useRouter();
  const { room, players, isHost, mutateGameState, endGame, startGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const [actionSent, setActionSent] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Target score selection (host picks in intro phase)
  const [selectedTarget, setSelectedTarget] = useState(DEFAULT_TARGET);

  // Turn countdown (3-second countdown before each turn)
  const [turnCountdown, setTurnCountdown] = useState(0);
  const turnCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Delta animation (flashes +N or -N next to score)
  const [deltaText, setDeltaText] = useState<string | null>(null);
  const [deltaColor, setDeltaColor] = useState(colors.success);
  const deltaOpacity = useRef(new Animated.Value(0)).current;
  const deltaTranslateY = useRef(new Animated.Value(0)).current;
  const prevLastResultRef = useRef<string | null>(null);

  const gs: GameState | null = room?.game_state ?? null;
  const phase = gs?.phase ?? null;
  const myId = user?.id ?? "";

  const isMyTurn = phase === "live" && gs?.order?.[gs.seatPtr] === myId;

  // Hydrate this device's recently-used question ids (host picks questions).
  useEffect(() => {
    loadRecent("sp");
  }, []);

  // -----------------------------------------------------------------------
  // Host: initialise game on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || !room) return;
    if (gs && gs.game === "potLuck" && gs.phase && (gs.phase as string) !== "starting") return;

    // Wait for the device's recent-question history so question #1 is fresh too.
    loadRecent("sp").then(() => {
    const order = shuffleArray(players.map((p) => p.user_id));
    const question = pickQuestion([]);
    const initialState: GameState = {
      phase: "intro",
      game: "potLuck",
      order,
      seatPtr: 0,
      turnSeq: 0,
      currentQuestion: question,
      usedQuestionIds: question ? [question.id] : [],
      pot: question?.startingPot ?? 1,
      potCap: DEFAULT_POT_CAP,
      consecutiveSkips: 0,
      scores: Object.fromEntries(players.map((p) => [p.user_id, 0])),
      target: selectedTarget,
      turnAction: null,
      turnSkip: null,
      revealInfo: null,
      lastResult: null,
      winnerId: null,
    };
    mutateGameState((cur) => {
      if (cur?.phase && cur.phase !== "starting") return null;
      return initialState;
    });
    });
  }, [isHost, room?.id, gs?.phase === "starting"]);

  // -----------------------------------------------------------------------
  // Navigate away if room returns to lobby
  // -----------------------------------------------------------------------
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
    if (trackedGameRef.current || phase !== "gameover" || !gs) return;
    trackedGameRef.current = true;
    useAuthStore.getState().incrementGamesPlayed();
    if (gs.winnerId === myId) useAuthStore.getState().incrementWins();
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
  // Show delta animation when lastResult changes and it's about me
  useEffect(() => {
    if (!gs?.lastResult) return;
    const lr = gs.lastResult;
    const key = `${lr.playerId}-${lr.kind}-${lr.delta}-${lr.total}`;
    if (key === prevLastResultRef.current) return;
    prevLastResultRef.current = key;
    if (lr.playerId !== myId || lr.kind === "skip") return;

    const isPositive = lr.delta > 0;
    setDeltaText(`${isPositive ? "+" : ""}${lr.delta}`);
    setDeltaColor(isPositive ? colors.success : colors.danger);
    deltaOpacity.setValue(1);
    deltaTranslateY.setValue(0);
    Animated.parallel([
      Animated.timing(deltaOpacity, { toValue: 0, duration: 1500, useNativeDriver: true }),
      Animated.timing(deltaTranslateY, { toValue: -30, duration: 1500, useNativeDriver: true }),
    ]).start(() => setDeltaText(null));
  }, [gs?.lastResult]);

  // -----------------------------------------------------------------------
  // Turn identity. Every turn change bumps gs.turnSeq; seatPtr/phase are
  // folded in so pre-turnSeq states still reset per turn.
  // -----------------------------------------------------------------------
  const turnSeq = gs?.turnSeq ?? 0;
  const turnKey = `${phase}:${turnSeq}:${gs?.seatPtr ?? 0}`;

  // actionSentRef mirrors actionSent synchronously so the buzzer timer can't
  // auto-skip in the same tick that the player tapped an answer.
  const actionSentRef = useRef(false);
  const markActionSent = (v: boolean) => {
    actionSentRef.current = v;
    setActionSent(v);
  };

  // Reset per-turn local state when the turn changes
  useEffect(() => {
    markActionSent(false);
  }, [turnKey]);

  // -----------------------------------------------------------------------
  // Handlers (answer/skip writes are guarded on the exact turn they were made for)
  // -----------------------------------------------------------------------

  const submitTurn = useCallback(
    async (seq: number, patch: Partial<GameState>) => {
      const ok = await mutateGameState((cur: GameState | null) => {
        if (!cur || cur.phase !== "live") return null;
        if ((cur.turnSeq ?? 0) !== seq) return null; // turn already moved on
        if (cur.order[cur.seatPtr] !== myId) return null;
        if (cur.turnAction || cur.turnSkip) return null; // first write wins
        return { ...cur, ...patch };
      });
      if (!ok) {
        // Write rejected or failed. If it's still this exact turn and nothing has
        // been recorded, unlock so the player can try again.
        const cur = useRoomStore.getState().room?.game_state as GameState | null;
        if (
          cur?.phase === "live" &&
          (cur.turnSeq ?? 0) === seq &&
          cur.order?.[cur.seatPtr] === myId &&
          !cur.turnAction &&
          !cur.turnSkip
        ) {
          markActionSent(false);
        }
      }
    },
    [mutateGameState, myId],
  );

  const handleAnswer = useCallback(
    (choiceIdx: number) => {
      if (!isMyTurn || actionSentRef.current) return;
      markActionSent(true);
      submitTurn(turnSeq, { turnAction: { playerId: myId, choiceIdx } });
    },
    [isMyTurn, turnSeq, myId, submitTurn],
  );

  const handleSkip = useCallback(() => {
    if (!isMyTurn || actionSentRef.current) return;
    markActionSent(true);
    submitTurn(turnSeq, { turnSkip: myId });
  }, [isMyTurn, turnSeq, myId, submitTurn]);

  // Latest skip handler for the timer callback (avoids stale closures).
  const skipRef = useRef(handleSkip);
  skipRef.current = handleSkip;

  // -----------------------------------------------------------------------
  // Turn timer (local display + the active player's own auto-skip).
  // Keyed on turnKey and driven entirely from inside the interval, so the
  // auto-skip can only fire for the turn the timer was started for. (Previously
  // a separate effect watched `timeLeft === 0`; that 0 lingered from the prior
  // turn and instantly skipped the next player the moment their turn began.)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (phase !== "live") return;
    setTimeLeft(TIMER_SECONDS);
    const startedAt = Date.now();
    let fired = false;
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, TIMER_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0 && !fired) {
        fired = true;
        if (timerRef.current) clearInterval(timerRef.current);
        if (!actionSentRef.current) skipRef.current();
      }
    }, 250);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [turnKey]);

  // -----------------------------------------------------------------------
  // Host backup timeout: if the active player disconnects, the host skips for
  // them a little after the turn window. Guarded on turnSeq + no recorded
  // action, so a submitted answer always wins the race.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || phase !== "live" || !gs) return;
    const seq = turnSeq;
    const t = setTimeout(() => {
      mutateGameState((cur: GameState | null) => {
        if (!cur || cur.phase !== "live") return null;
        if ((cur.turnSeq ?? 0) !== seq) return null;
        if (cur.turnAction || cur.turnSkip) return null;
        const pid = cur.order[cur.seatPtr];
        if (!pid) return null;
        return { ...cur, turnSkip: pid };
      });
    }, TIMER_SECONDS * 1000 + HOST_GRACE_MS);
    return () => clearTimeout(t);
  }, [isHost, turnKey]);

  // -----------------------------------------------------------------------
  // Host: process turn actions. All math is done from the fresh server state
  // inside the CAS mutator (never from this render's snapshot).
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || phase !== "live" || !gs) return;
    if (!gs.turnAction && !gs.turnSkip) return;

    mutateGameState((cur: GameState | null) => {
      if (!cur || cur.phase !== "live") return null;
      const nextSeq = (cur.turnSeq ?? 0) + 1;

      // Handle answer
      if (cur.turnAction) {
        const { playerId, choiceIdx } = cur.turnAction;
        const q = cur.currentQuestion;
        if (!q) return null;
        const isCorrect = choiceIdx === q.correctIndex;
        const pot = cur.pot;
        const currentScore = cur.scores[playerId] ?? 0;
        const delta = isCorrect ? pot : -Math.min(pot, currentScore);
        const newScore = Math.max(0, currentScore + delta);
        const result: LastResult = {
          playerId,
          kind: isCorrect ? "correct" : "wrong",
          delta,
          total: newScore,
          potAt: pot,
        };
        const base = {
          ...cur,
          scores: { ...cur.scores, [playerId]: newScore },
          turnAction: null,
          turnSkip: null,
          lastResult: result,
          consecutiveSkips: 0,
          turnSeq: nextSeq,
        };
        if (isCorrect) {
          // Correct: win pot, check for game win, go to reveal
          const winner = newScore >= cur.target ? playerId : null;
          return {
            ...base,
            phase: winner ? ("gameover" as Phase) : ("reveal" as Phase),
            revealInfo: {
              answer: q.choices[q.correctIndex],
              scored: true,
              by: playerMap[playerId]?.username ?? "Player",
            },
            winnerId: winner,
          };
        }
        // Wrong: lose pot value, pot grows, pass to next player (stay in live)
        return {
          ...base,
          pot: Math.min(pot + 1, cur.potCap),
          seatPtr: (cur.seatPtr + 1) % cur.order.length,
        };
      }

      // Handle skip
      if (cur.turnSkip) {
        const playerId = cur.turnSkip;
        const newConsecutive = cur.consecutiveSkips + 1;
        const result: LastResult = {
          playerId,
          kind: "skip",
          delta: 0,
          total: cur.scores[playerId] ?? 0,
          potAt: cur.pot,
        };
        // If everyone skipped in a row, void the pot
        if (newConsecutive >= cur.order.length) {
          return {
            ...cur,
            phase: "reveal" as Phase,
            turnSkip: null,
            turnAction: null,
            lastResult: result,
            consecutiveSkips: 0,
            turnSeq: nextSeq,
            revealInfo: {
              answer: cur.currentQuestion?.choices[cur.currentQuestion.correctIndex] ?? "",
              scored: false,
              by: "",
            },
          };
        }
        return {
          ...cur,
          seatPtr: (cur.seatPtr + 1) % cur.order.length,
          pot: Math.min(cur.pot + 1, cur.potCap),
          consecutiveSkips: newConsecutive,
          turnSkip: null,
          turnAction: null,
          lastResult: result,
          turnSeq: nextSeq,
        };
      }
      return null;
    });
  }, [gs?.turnAction, gs?.turnSkip, phase, isHost]);

  // -----------------------------------------------------------------------
  // Turn countdown: 3-second countdown before each turn starts
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (turnCountdownRef.current) clearInterval(turnCountdownRef.current);
    if (phase !== "turn-countdown") return;
    setTurnCountdown(3);
    const start = Date.now();
    turnCountdownRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = Math.max(0, 3 - elapsed);
      setTurnCountdown(remaining);
      if (remaining <= 0) {
        if (turnCountdownRef.current) clearInterval(turnCountdownRef.current);
        // Host advances to live
        if (isHost) {
          mutateGameState((cur: GameState | null) => {
            if (!cur || cur.phase !== "turn-countdown") return null;
            return { ...cur, phase: "live" as Phase };
          });
        }
      }
    }, 250);
    return () => {
      if (turnCountdownRef.current) clearInterval(turnCountdownRef.current);
    };
  }, [phase === "turn-countdown", turnKey]);

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------
  const playerMap: Record<string, { username: string }> = {};
  players.forEach((p) => {
    playerMap[p.user_id] = { username: p.username };
  });

  const currentActorId = gs?.order?.[gs?.seatPtr ?? 0];
  const currentActor = currentActorId ? playerMap[currentActorId]?.username : "...";
  const mySeat = (gs?.order ?? []).indexOf(myId);
  const curSeat = gs?.seatPtr ?? 0;
  const orderLen = (gs?.order ?? []).length;
  const turnsAway = mySeat === -1 ? -1 : (mySeat - curSeat + orderLen) % orderLen;

  // Host: start from intro
  const startFromIntro = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "intro") return null;
      return { ...cur, phase: "rolling" as Phase, target: selectedTarget };
    });
    // Auto-advance to turn-countdown after a brief delay for the rolling animation
    setTimeout(async () => {
      await mutateGameState((cur) => {
        if (!cur || cur.phase !== "rolling") return null;
        return { ...cur, phase: "turn-countdown" as Phase, turnSeq: (cur.turnSeq ?? 0) + 1 };
      });
    }, 3000);
  }, [mutateGameState, selectedTarget]);

  // Host: next question from reveal
  const handleNextQuestion = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "reveal") return null;
      const q = pickQuestion(cur.usedQuestionIds);
      if (!q) return null;
      return {
        ...cur,
        phase: "turn-countdown" as Phase,
        currentQuestion: q,
        usedQuestionIds: [...cur.usedQuestionIds, q.id],
        pot: q.startingPot,
        seatPtr: (cur.seatPtr + 1) % cur.order.length,
        turnSeq: (cur.turnSeq ?? 0) + 1,
        consecutiveSkips: 0,
        turnAction: null,
        turnSkip: null,
        revealInfo: null,
        lastResult: null,
      };
    });
  }, [mutateGameState]);

  const handleBackToLobby = useCallback(async () => {
    await endGame();
  }, [endGame]);

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (!gs || (gs.game as string) !== "potLuck" || !phase || (phase as string) === "starting") {
    return <GameLoadingScreen name="Smarty Pot" icon="trophy" color="#10B981" />;
  }

  // === INTRO ===
  if (phase === "intro") {
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Start Game" icon="play" onPress={startFromIntro} />
          ) : (
            <WaitingNote label="Waiting for host to start..." />
          )
        }
      >
        <ScreenTitle title="Smarty Pot" subtitle="Risk the growing pot or pass it on." />
        <HeroGradient>
          <View style={st.heroRow}>
            <View style={st.heroCopy}>
              <Eyebrow tone="dark">{`First to ${isHost ? selectedTarget : (gs.target ?? DEFAULT_TARGET)} wins`}</Eyebrow>
              <Text style={st.heroTitle}>Answer to win the pot. Skip to grow it.</Text>
            </View>
            <Text style={st.heroEmoji}>{"\uD83E\uDDE0"}</Text>
          </View>
        </HeroGradient>
        {/* Target score selector (host only) */}
        {isHost && (
          <>
            <Eyebrow style={st.sectionEyebrow}>Target score</Eyebrow>
            <View style={st.targetRow}>
              {[10, 20, 30].map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setSelectedTarget(t)}
                  style={[
                    st.targetChip,
                    selectedTarget === t && st.targetChipActive,
                  ]}
                >
                  <Text
                    style={[
                      st.targetChipText,
                      selectedTarget === t && st.targetChipTextActive,
                    ]}
                  >
                    First to {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        {!isHost && (
          <>
            <Eyebrow style={st.sectionEyebrow}>Target score</Eyebrow>
            <View style={st.targetRow}>
              <View style={[st.targetChip, st.targetChipActive]}>
                <Text style={[st.targetChipText, st.targetChipTextActive]}>First to {gs.target ?? DEFAULT_TARGET}</Text>
              </View>
            </View>
          </>
        )}

        <Eyebrow style={st.sectionEyebrow}>How it works</Eyebrow>
        <View style={st.list}>
          {[
            ["\uD83D\uDCDA", "Each question has a difficulty: Easy, Medium, or Hard. Harder = bigger starting pot."],
            ["\u23F1\uFE0F", "On your turn you have 15 seconds \u2014 answer or skip."],
            ["\u2705", "Answer correctly = win the pot. Wrong = lose points equal to the pot."],
            ["\u23ED\uFE0F", "Skip = pot grows by 1 and passes on. First to the target score wins!"],
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

  // === ROLLING (turn order reveal) ===
  if (phase === "rolling") {
    const order = gs.order ?? [];
    return (
      <Shell footer={<WaitingNote label="Starting in a moment..." />}>
        <ScreenTitle title="Turn order" subtitle="Here's who goes when." />
        <View style={st.list}>
          {order.map((pid, seat) => {
            const isMe = pid === myId;
            return (
              <GradientCard
                key={pid}
                radius={radii.lg}
                borderColors={isMe ? SELECTED_BORDER : undefined}
                fill={isMe ? SELECTED_FILL : undefined}
                contentStyle={st.rankRow}
              >
                <View style={[st.numTile, seat === 0 && st.numTileOn]}>
                  <Text style={[st.numTileText, seat === 0 && st.numTileTextOn]}>{seat + 1}</Text>
                </View>
                <PlayerAvatar username={playerMap[pid]?.username ?? "Player"} size={36} />
                <Text style={st.rankName} numberOfLines={1}>
                  {playerMap[pid]?.username ?? "Player"}
                </Text>
                {isMe && <Pill tone="lavender" label="You" />}
              </GradientCard>
            );
          })}
        </View>
      </Shell>
    );
  }

  // === TURN COUNTDOWN (3-second countdown before each turn) ===
  if (phase === "turn-countdown") {
    const nextPlayerId = gs.order?.[gs.seatPtr];
    const nextPlayerName = nextPlayerId ? playerMap[nextPlayerId]?.username ?? "Player" : "Player";
    const isNextMe = nextPlayerId === myId;

    return (
      <Shell>
        <View style={st.turnCountdownContainer}>
          <Text style={st.turnCountdownName}>
            {isNextMe ? "Your turn!" : `${nextPlayerName}'s turn!`}
          </Text>
          <Text style={st.turnCountdownNum}>{turnCountdown}</Text>
          <Text style={st.turnCountdownLabel}>Get ready...</Text>
        </View>
      </Shell>
    );
  }

  // === LIVE (active turn) ===
  if (phase === "live") {
    const q = gs.currentQuestion;
    const difficulty = q?.difficulty ?? "easy";
    const diffColor = DIFF_COLOR[difficulty];
    const diffLabel = DIFF_LABEL[difficulty];
    const atCap = gs.pot >= gs.potCap;
    const urgent = timeLeft <= 3;

    // Pot animation values
    const potSize = gs.pot;
    const potScale = 1 + Math.min(potSize, 7) * 0.06; // slightly smaller scale
    const potColor = potSize >= 5 ? "#EF4444" : potSize >= 3 ? "#F59E0B" : "#F0D78C";
    const potGlow = potSize >= 5 ? 16 : potSize >= 3 ? 10 : 4;

    // Sorted scores for scoreboard (show max 4)
    const sortedScores = Object.entries(gs.scores)
      .map(([uid, score]) => ({ uid, username: playerMap[uid]?.username ?? "?", score: score as number }))
      .sort((a, b) => b.score - a.score);
    const displayScores = sortedScores.slice(0, 4);
    const moreCount = sortedScores.length - 4;

    return (
      <SafeAreaView style={st.container} edges={["top", "left", "right"]}>
        <ScreenBackground />
        <GameHeader />
        <View style={st.liveBody}>
          {/* Floating scoreboard - top right */}
          <View style={st.liveScoreboardWrap}>
            <View style={st.scoreboard}>
              <Text style={st.scoreboardTitle}>Scores</Text>
              {displayScores.map((p) => (
                <View
                  key={p.uid}
                  style={[
                    st.scoreboardRow,
                    p.uid === currentActorId && st.scoreboardRowActive,
                  ]}
                >
                  <Text
                    style={[
                      st.scoreboardName,
                      p.uid === myId && st.scoreboardNameMe,
                    ]}
                    numberOfLines={1}
                  >
                    {p.uid === myId ? "You" : p.username}
                  </Text>
                  <Text style={[st.scoreboardScore, p.uid === currentActorId && st.scoreboardScoreActive]}>{p.score}</Text>
                </View>
              ))}
              {moreCount > 0 && (
                <Text style={st.scoreboardMore}>+{moreCount} more</Text>
              )}
            </View>
          </View>

          {/* Turn label */}
          <Text style={st.liveTurnLabel}>
            {isMyTurn ? "Your turn!" : `${currentActor}'s turn`}
          </Text>
          <Text style={st.liveTurnSub}>
            {isMyTurn
              ? actionSent
                ? "Locking in..."
                : `Answer for ${gs.pot} pt${gs.pot !== 1 ? "s" : ""} \u00B7 or skip`
              : turnsAway <= 0
                ? "You're up"
                : turnsAway === 1
                  ? "You're NEXT"
                  : `You're ${turnsAway} turns away`}
          </Text>

          {/* Compact pot display */}
          <View style={st.livePotRow}>
            <View style={[
              st.livePotCircle,
              {
                transform: [{ scale: potScale }],
                shadowColor: potColor,
                shadowRadius: potGlow,
                shadowOpacity: 0.7,
              },
            ]}>
              <Text style={[st.livePotValue, { color: potColor }]}>{gs.pot}</Text>
              <Text style={st.livePotLabel}>{atCap ? "MAX" : "POT"}</Text>
            </View>
            <View style={st.livePotDots}>
              {Array.from({ length: gs.potCap }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    st.potDot,
                    i < gs.pot && { backgroundColor: potColor },
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Question card - compact */}
          <View style={[st.liveQuestionCard]}>
            <View style={st.liveQHeader}>
              <View style={[st.diffChip, { backgroundColor: diffColor }]}>
                <Text style={st.diffText}>{diffLabel}</Text>
              </View>
              <Text style={st.diffPots}>starts at {q?.startingPot ?? 1}pt</Text>
            </View>
            <Text style={st.liveQText}>{q?.text ?? ""}</Text>
          </View>

          {/* Choices or spectate */}
          {isMyTurn ? (
            <View style={st.liveChoices}>
              {(q?.choices ?? []).map((choice, i) => (
                <Pressable
                  key={i}
                  onPress={() => handleAnswer(i)}
                  disabled={actionSent}
                  accessibilityRole="button"
                  style={({ pressed }) => [actionSent && st.choiceOff, pressed && st.pressed]}
                >
                  <View style={st.liveChoiceItem}>
                    <View style={st.liveChoiceLetter}>
                      <Text style={st.liveChoiceLetterText}>{String.fromCharCode(65 + i)}</Text>
                    </View>
                    <Text style={st.liveChoiceText} numberOfLines={2}>{choice}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.highlight} />
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={st.liveSpectate}>
              <PlayerAvatar username={currentActor ?? "?"} size={32} />
              <View style={st.flex1}>
                <Text style={st.liveSpectateName} numberOfLines={1}>{currentActor} is deciding...</Text>
              </View>
              <Text style={st.liveSpectateAway}>
                {turnsAway <= 0 ? "You're up" : turnsAway === 1 ? "Next" : `${turnsAway} away`}
              </Text>
            </View>
          )}

          {/* Timer at bottom */}
          <View style={st.liveTimerRow}>
            <Text style={[st.liveTimerNum, urgent && { color: colors.danger }]}>{timeLeft}s</Text>
            <View style={st.liveTimerBarWrap}>
              <ProgressBar progress={timeLeft / TIMER_SECONDS} />
            </View>
          </View>

          {/* Skip button or waiting */}
          <View style={st.liveFooter}>
            {isMyTurn ? (
              actionSent ? (
                <View style={st.liveWaiting}>
                  <ActivityIndicator size="small" color={colors.highlight} />
                  <Text style={st.liveWaitingText}>Locking in...</Text>
                </View>
              ) : (
                <Pressable onPress={handleSkip} style={st.liveSkipBtn}>
                  <Ionicons name="play-skip-forward" size={16} color={colors.white} />
                  <Text style={st.liveSkipText}>Skip</Text>
                </Pressable>
              )
            ) : (
              <View style={st.liveWaiting}>
                <ActivityIndicator size="small" color={colors.highlight} />
                <Text style={st.liveWaitingText}>{currentActor} is deciding...</Text>
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // === REVEAL ===
  if (phase === "reveal") {
    const sorted = Object.entries(gs.scores)
      .map(([uid, score]) => ({ uid, username: playerMap[uid]?.username ?? "Unknown", score }))
      .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
    const ranks = competitionRanks(sorted, (p) => p.score);

    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Next Question" icon="arrow-forward" onPress={handleNextQuestion} />
          ) : (
            <WaitingNote label="Waiting for host to continue..." />
          )
        }
      >
        <ScreenTitle
          title={gs.revealInfo?.scored ? `${gs.revealInfo.by} took the pot!` : "Pot voided"}
          subtitle={gs.revealInfo?.scored ? "Correct answer!" : "Everyone skipped \u2014 pot voided"}
        />
        <HeroGradient>
          <View style={st.answerHero}>
            <Eyebrow tone="dark">Answer</Eyebrow>
            <Text style={st.answerText}>{gs.revealInfo?.answer ?? "\u2014"}</Text>
          </View>
        </HeroGradient>

        <View style={st.sectionHead}>
          <Eyebrow>Standings</Eyebrow>
          <Pill tone="dark" label={`First to ${gs.target} wins`} />
        </View>
        <View style={st.list}>
          {sorted.map((p, i) => (
            <StandingRow key={p.uid} rank={ranks[i]} name={p.username} score={p.score} isMe={p.uid === myId} />
          ))}
        </View>
      </Shell>
    );
  }

  // === GAME OVER ===
  if (phase === "gameover") {
    const winnerId = gs.winnerId;
    const winnerName = winnerId ? playerMap[winnerId]?.username : "???";
    const iWon = winnerId === myId;
    const sorted = Object.entries(gs.scores)
      .map(([uid, score]) => ({ uid, username: playerMap[uid]?.username ?? "Unknown", score }))
      .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
    const ranks = competitionRanks(sorted, (p) => p.score);

    return (
      <Shell
        footer={
          isHost ? (
            <View style={st.footerStack}>
              <PrimaryAction
                label="Play Again"
                icon="refresh"
                iconPosition="left"
                onPress={() => startGame("potLuck")}
              />
              <PrimaryAction label="Back to Lobby" variant="dark" onPress={handleBackToLobby} />
            </View>
          ) : (
            <View style={st.centerRow}>
              <HostWaitingPill label="Waiting for host..." />
            </View>
          )
        }
      >
        <ScreenTitle
          title={iWon ? "YOU WIN!" : `${winnerName} WINS!`}
          subtitle="Final standings"
          pill="Final results"
        />
        <GradientCard fill={gradients.hero} borderColors={HERO_BORDER} contentStyle={st.winnerContent}>
          <View style={[st.numTile, st.numTileHero]}>
            <Text style={[st.numTileText, st.numTileTextHero]}>1</Text>
          </View>
          <PlayerAvatar username={winnerName ?? "?"} size={48} />
          <View style={st.flex1}>
            <Eyebrow tone="dark">Winner</Eyebrow>
            <Text style={st.winnerName} numberOfLines={1}>
              {winnerName}
            </Text>
          </View>
          <Ionicons name="trophy" size={30} color={colors.onPrimary} />
        </GradientCard>

        <Eyebrow style={st.sectionEyebrow}>Leaderboard</Eyebrow>
        <View style={st.list}>
          {sorted.map((p, i) => (
            <StandingRow key={p.uid} rank={ranks[i]} name={p.username} score={p.score} isMe={p.uid === myId} />
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

const HERO_BORDER = ["rgba(255,255,255,0.55)", "rgba(255,255,255,0.12)"] as const;
const DANGER_BORDER = ["rgba(239,68,68,0.6)", "rgba(239,68,68,0.1)"] as const;
const SELECTED_BORDER = [colors.highlight, colors.highlightGradientEnd] as const;
const SELECTED_FILL = ["rgba(184,174,232,0.20)", "rgba(184,174,232,0.05)"] as const;

/** Screen frame: background, room toolbar, scrolling body and pinned footer. */
function Shell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <SafeAreaView style={st.container} edges={["top", "left", "right"]}>
      <ScreenBackground />
      <GameHeader />
      <ScrollView
        contentContainerStyle={[st.scroll, !footer && st.scrollNoFooter]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? <PrimaryActionBar>{footer}</PrimaryActionBar> : null}
    </SafeAreaView>
  );
}

function ScreenTitle({ title, subtitle, pill }: { title: string; subtitle?: string; pill?: string }) {
  return (
    <View style={st.titleBlock}>
      <View style={st.eyebrowRow}>
        <Eyebrow tone="lavender">Smarty Pot</Eyebrow>
        {pill ? <Pill tone="peach" label={pill} /> : null}
      </View>
      <Text style={type.title}>{title}</Text>
      {subtitle ? <Text style={type.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function WaitingNote({ label }: { label: string }) {
  return (
    <View style={st.waiting}>
      <ActivityIndicator size="small" color={colors.highlight} />
      <Text style={st.waitingText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View style={st.progressTrack}>
      <LinearGradient
        colors={gradients.primaryButton}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[st.progressFill, { width: `${Math.min(1, Math.max(0, progress)) * 100}%` }]}
      />
    </View>
  );
}

function StandingRow({ rank, name, score, isMe }: { rank: number; name: string; score: number; isMe: boolean }) {
  const first = rank === 1;
  return (
    <GradientCard
      radius={radii.lg}
      borderColors={isMe ? SELECTED_BORDER : undefined}
      fill={isMe ? SELECTED_FILL : undefined}
      contentStyle={st.rankRow}
    >
      <View style={[st.numTile, first && st.numTileOn]}>
        <Text style={[st.numTileText, first && st.numTileTextOn]}>{rank}</Text>
      </View>
      <PlayerAvatar username={name} size={36} />
      <Text style={st.rankName} numberOfLines={1}>{name}</Text>
      <View style={st.scoreCol}>
        <Text style={[st.rankScore, first && { color: colors.goldLight }]}>{score}</Text>
        <Text style={st.rankScoreLabel}>PTS</Text>
      </View>
    </GradientCard>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPurple },
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
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },

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

  // Ranked rows / number tiles
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  rankName: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  numTile: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  numTileOn: { backgroundColor: colors.highlight },
  numTileHero: { backgroundColor: colors.onPrimary },
  numTileText: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.white },
  numTileTextOn: { color: colors.onPrimary },
  numTileTextHero: { color: colors.highlight },
  scoreCol: { alignItems: "flex-end" },
  rankScore: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.white, fontVariant: ["tabular-nums"] },
  rankScoreLabel: { ...type.eyebrow, fontSize: 9, letterSpacing: 1 },

  // Timer
  countdown: { alignItems: "center", gap: spacing.xs },
  countdownNumCompact: { fontSize: 52, lineHeight: 58 },
  countdownNum: {
    fontFamily: fonts.extrabold,
    fontSize: 72,
    lineHeight: 80,
    letterSpacing: -2,
    color: colors.white,
    fontVariant: ["tabular-nums"],
  },
  progressTrack: {
    alignSelf: "stretch",
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceLight,
    overflow: "hidden",
    marginTop: spacing.md,
  },
  progressFill: { height: "100%", borderRadius: radii.pill },

  // Stat cards (pot / score)
  statRow: { flexDirection: "row", gap: spacing.md },
  statContent: { padding: spacing.lg, gap: 4 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 34, color: colors.white, fontVariant: ["tabular-nums"] },
  statTarget: { fontFamily: fonts.semibold, fontSize: 16, color: colors.gray500 },
  deltaAnim: { fontFamily: fonts.extrabold, fontSize: 20, position: "absolute", right: spacing.lg, top: spacing.lg },
  potTrack: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 },
  potDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.surfaceLight },
  potDotOn: { backgroundColor: colors.highlight },
  potDotMax: { backgroundColor: colors.danger },

  // Question hero
  qHero: { padding: 22, gap: spacing.md },
  qHeroHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  diffChip: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(14,12,26,0.25)",
  },
  diffText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, color: colors.onPrimary },
  diffPots: { fontFamily: fonts.semibold, fontSize: 12, color: "rgba(14,12,26,0.65)" },
  qText: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 30, color: colors.onPrimary },

  // Choices
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  choiceOff: { opacity: 0.45 },
  choiceText: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.white },

  // Reveal
  answerHero: { padding: 24, gap: spacing.sm, minHeight: 120, justifyContent: "center" },
  answerText: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36, color: colors.onPrimary },

  // Game over
  winnerContent: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 20 },
  winnerName: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.onPrimary },

  // Target score selector
  targetRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  targetChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  targetChipActive: {
    backgroundColor: colors.highlight,
    borderColor: colors.highlight,
  },
  targetChipText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.gray400,
  },
  targetChipTextActive: {
    color: colors.onPrimary,
  },

  // Turn countdown
  turnCountdownContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingBottom: 60,
  },
  turnCountdownName: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    color: colors.white,
    textAlign: "center",
  },
  turnCountdownNum: {
    fontFamily: fonts.extrabold,
    fontSize: 120,
    lineHeight: 130,
    color: colors.highlight,
    letterSpacing: -4,
    fontVariant: ["tabular-nums"] as any,
  },
  turnCountdownLabel: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.gray400,
  },

  // Scoreboard (compact floating card)
  scoreboard: {
    backgroundColor: "rgba(26, 23, 48, 0.9)",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 120,
    maxWidth: 150,
  },
  scoreboardTitle: {
    fontFamily: fonts.bold,
    fontSize: 9,
    color: colors.gray500,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  scoreboardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 1,
    paddingHorizontal: 3,
    borderRadius: 4,
  },
  scoreboardRowActive: {
    backgroundColor: "rgba(184, 174, 232, 0.12)",
  },
  scoreboardName: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.gray300,
    flex: 1,
    marginRight: 6,
  },
  scoreboardNameMe: {
    fontFamily: fonts.bold,
    color: colors.highlight,
  },
  scoreboardScore: {
    fontFamily: fonts.extrabold,
    fontSize: 12,
    color: colors.white,
    fontVariant: ["tabular-nums"] as any,
  },
  scoreboardScoreActive: {
    color: colors.highlight,
  },
  scoreboardMore: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.gray500,
    textAlign: "center",
    marginTop: 2,
  },

  // Live phase layout (no scroll, single screen)
  liveBody: {
    flex: 1,
    paddingHorizontal: spacing.screen,
    paddingTop: 4,
    paddingBottom: 8,
    justifyContent: "space-between",
  },
  liveScoreboardWrap: {
    position: "absolute",
    top: 0,
    right: spacing.screen,
    zIndex: 10,
  },
  liveTurnLabel: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.white,
    marginTop: 2,
  },
  liveTurnSub: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.gray400,
    marginTop: 1,
  },
  livePotRow: {
    alignItems: "center",
    gap: 4,
    marginVertical: 2,
  },
  livePotCircle: {
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(26, 23, 48, 0.9)",
    borderWidth: 2,
    borderColor: "rgba(240, 215, 140, 0.3)",
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  livePotValue: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    lineHeight: 32,
    fontVariant: ["tabular-nums"] as any,
  },
  livePotLabel: {
    fontFamily: fonts.bold,
    fontSize: 8,
    letterSpacing: 1.2,
    color: colors.gray400,
    marginTop: -2,
  },
  livePotDots: {
    flexDirection: "row",
    gap: 4,
  },
  liveQuestionCard: {
    backgroundColor: "rgba(109, 90, 205, 0.15)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(109, 90, 205, 0.3)",
    padding: 12,
    gap: 6,
  },
  liveQHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  liveQText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.white,
  },
  liveChoices: {
    gap: 6,
  },
  liveChoiceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(26, 23, 48, 0.7)",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  liveChoiceLetter: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  liveChoiceLetterText: {
    fontFamily: fonts.extrabold,
    fontSize: 13,
    color: colors.highlight,
  },
  liveChoiceText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.white,
  },
  liveSpectate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(26, 23, 48, 0.7)",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  liveSpectateName: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.gray300,
  },
  liveSpectateAway: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.highlight,
  },
  liveTimerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  liveTimerNum: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.white,
    fontVariant: ["tabular-nums"] as any,
    minWidth: 36,
  },
  liveTimerBarWrap: {
    flex: 1,
  },
  liveFooter: {
    marginTop: 4,
    marginBottom: 4,
  },
  liveSkipBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surfaceLight,
    borderRadius: radii.pill,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  liveSkipText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.white,
  },
  liveWaiting: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  liveWaitingText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.gray300,
  },
});
