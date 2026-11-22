import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { DEFAULT_QUESTIONS, PotLuckQuestion } from "../../src/data/potLuck";
import HostWaitingPill from "../../src/components/HostWaitingPill";
import GameHeader from "../../src/components/GameHeader";
import { competitionRanks } from "../../src/utils/rank";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "intro" | "rolling" | "live" | "reveal" | "gameover";

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
const DEFAULT_TARGET = 10;
const DEFAULT_POT_CAP = 7;

const DIFF_COLOR = { easy: "#22C55E", medium: "#F59E0B", hard: "#EF4444" } as const;
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
  const available = DEFAULT_QUESTIONS.filter((q) => !usedIds.includes(q.id));
  if (available.length === 0) return DEFAULT_QUESTIONS[Math.floor(Math.random() * DEFAULT_QUESTIONS.length)];
  return available[Math.floor(Math.random() * available.length)];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PotLuckScreen() {
  const router = useRouter();
  const { room, players, isHost, mutateGameState, endGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const [actionSent, setActionSent] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // -----------------------------------------------------------------------
  // Host: initialise game on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || !room) return;
    if (gs && gs.game === "potLuck" && gs.phase && (gs.phase as string) !== "starting") return;

    const order = shuffleArray(players.map((p) => p.user_id));
    const question = pickQuestion([]);
    const initialState: GameState = {
      phase: "intro",
      game: "potLuck",
      order,
      seatPtr: 0,
      currentQuestion: question,
      usedQuestionIds: question ? [question.id] : [],
      pot: question?.startingPot ?? 1,
      potCap: DEFAULT_POT_CAP,
      consecutiveSkips: 0,
      scores: Object.fromEntries(players.map((p) => [p.user_id, 0])),
      target: DEFAULT_TARGET,
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
  }, [isHost, room?.id]);

  // -----------------------------------------------------------------------
  // Navigate away if room returns to lobby
  // -----------------------------------------------------------------------
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

  // Reset actionSent when turn changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    setActionSent(false);
  }, [gs?.seatPtr, gs?.phase]);

  // -----------------------------------------------------------------------
  // Timer for live phase
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "live") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    setTimeLeft(TIMER_SECONDS);
    let remaining = TIMER_SECONDS;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeLeft(0);
        return;
      }
      setTimeLeft(remaining);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, gs?.seatPtr]);

  // Auto-skip when timer expires (only the active player)
  useEffect(() => {
    if (timeLeft === 0 && isMyTurn && !actionSent) {
      handleSkip();
    }
  }, [timeLeft, isMyTurn, actionSent]);

  // -----------------------------------------------------------------------
  // Host: process turn actions
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || phase !== "live" || !gs) return;

    // Handle answer
    if (gs.turnAction) {
      const { playerId, choiceIdx } = gs.turnAction;
      const q = gs.currentQuestion;
      if (!q) return;

      const isCorrect = choiceIdx === q.correctIndex;
      const pot = gs.pot;
      const currentScore = gs.scores[playerId] ?? 0;
      const delta = isCorrect ? pot : -Math.min(pot, currentScore);
      const newScore = Math.max(0, currentScore + delta);
      const newScores = { ...gs.scores, [playerId]: newScore };
      const correctAnswer = q.choices[q.correctIndex];

      const result: LastResult = {
        playerId,
        kind: isCorrect ? "correct" : "wrong",
        delta,
        total: newScore,
        potAt: pot,
      };

      if (isCorrect) {
        // Correct: win pot, check for game win, go to reveal
        const winner = newScore >= gs.target ? playerId : null;
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "live" || !cur.turnAction) return null;
          return {
            ...cur,
            phase: winner ? ("gameover" as Phase) : ("reveal" as Phase),
            scores: newScores,
            turnAction: null,
            lastResult: result,
            revealInfo: { answer: correctAnswer, scored: true, by: playerMap[playerId]?.username ?? "Player" },
            winnerId: winner,
            consecutiveSkips: 0,
          };
        });
      } else {
        // Wrong: lose pot value, pot grows, pass to next player (stay in live)
        const newPot = Math.min(pot + 1, gs.potCap);
        const nextSeat = (gs.seatPtr + 1) % gs.order.length;
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "live" || !cur.turnAction) return null;
          return {
            ...cur,
            scores: newScores,
            turnAction: null,
            lastResult: result,
            pot: newPot,
            seatPtr: nextSeat,
            consecutiveSkips: 0,
          };
        });
      }
    }

    // Handle skip
    if (gs.turnSkip) {
      const playerId = gs.turnSkip;
      const newPot = Math.min(gs.pot + 1, gs.potCap);
      const nextSeat = (gs.seatPtr + 1) % gs.order.length;
      const newConsecutive = gs.consecutiveSkips + 1;

      const result: LastResult = {
        playerId,
        kind: "skip",
        delta: 0,
        total: gs.scores[playerId] ?? 0,
        potAt: gs.pot,
      };

      // If everyone skipped, void the pot and go to next question
      if (newConsecutive >= gs.order.length) {
        const q = pickQuestion(gs.usedQuestionIds);
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "live" || !cur.turnSkip) return null;
          return {
            ...cur,
            phase: "reveal" as Phase,
            turnSkip: null,
            lastResult: result,
            consecutiveSkips: 0,
            revealInfo: { answer: cur.currentQuestion?.choices[cur.currentQuestion.correctIndex] ?? "", scored: false, by: "" },
          };
        });
      } else {
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "live" || !cur.turnSkip) return null;
          return {
            ...cur,
            seatPtr: nextSeat,
            pot: newPot,
            consecutiveSkips: newConsecutive,
            turnSkip: null,
            lastResult: result,
          };
        });
      }
    }
  }, [gs?.turnAction, gs?.turnSkip, phase, isHost]);

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

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleAnswer = useCallback(async (choiceIdx: number) => {
    if (!isMyTurn || actionSent || !gs) return;
    setActionSent(true);
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "live") return null;
      if (cur.order[cur.seatPtr] !== myId) return null;
      if (cur.turnAction || cur.turnSkip) return null;
      return { ...cur, turnAction: { playerId: myId, choiceIdx } };
    });
  }, [isMyTurn, actionSent, gs, myId, mutateGameState]);

  const handleSkip = useCallback(async () => {
    if (!isMyTurn || actionSent || !gs) return;
    setActionSent(true);
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "live") return null;
      if (cur.order[cur.seatPtr] !== myId) return null;
      if (cur.turnAction || cur.turnSkip) return null;
      return { ...cur, turnSkip: myId };
    });
  }, [isMyTurn, actionSent, gs, myId, mutateGameState]);

  // Host: start from intro
  const startFromIntro = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "intro") return null;
      return { ...cur, phase: "rolling" as Phase };
    });
    // Auto-advance to live after a brief delay for the rolling animation
    setTimeout(async () => {
      await mutateGameState((cur) => {
        if (!cur || cur.phase !== "rolling") return null;
        return { ...cur, phase: "live" as Phase };
      });
    }, 3000);
  }, [mutateGameState]);

  // Host: next question from reveal
  const handleNextQuestion = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "reveal") return null;
      const q = pickQuestion(cur.usedQuestionIds);
      if (!q) return null;
      return {
        ...cur,
        phase: "live" as Phase,
        currentQuestion: q,
        usedQuestionIds: [...cur.usedQuestionIds, q.id],
        pot: q.startingPot,
        seatPtr: (cur.seatPtr + 1) % cur.order.length,
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
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <View style={st.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={st.loadingText}>Setting up the game...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // === INTRO ===
  if (phase === "intro") {
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.introScroll}>
          <Text style={st.bigEmoji}>{"\uD83E\uDDE0"}</Text>
          <Text style={st.title}>Smarty Pot</Text>
          <Text style={st.tagline}>Risk the growing pot or pass it on.</Text>
          <View style={st.rulesBox}>
            {[
              ["\uD83D\uDCDA", "Each question has a difficulty: Easy, Medium, or Hard. Harder = bigger starting pot."],
              ["\u23F1\uFE0F", "On your turn you have 15 seconds \u2014 answer or skip."],
              ["\u2705", "Answer correctly = win the pot. Wrong = lose points equal to the pot."],
              ["\u23ED\uFE0F", "Skip = pot grows by 1 and passes on. First to the target score wins!"],
            ].map(([icon, text], i) => (
              <View key={i} style={st.ruleCard}>
                <Text style={st.ruleText}>{icon}  {text}</Text>
              </View>
            ))}
          </View>
          {isHost ? (
            <TouchableOpacity style={st.primaryBtn} onPress={startFromIntro}>
              <Text style={st.primaryBtnText}>Start Game</Text>
            </TouchableOpacity>
          ) : (
            <Text style={st.wait}>Waiting for host to start...</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === ROLLING (turn order reveal) ===
  if (phase === "rolling") {
    const order = gs.order ?? [];
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <View style={st.rollingContainer}>
          <Text style={st.rollingHeader}>SMARTY POT</Text>
          <Text style={st.rollingSubHeader}>TURN ORDER</Text>
          <View style={{ gap: 8, width: "100%" }}>
            {order.map((pid, seat) => {
              const isMe = pid === myId;
              return (
                <View key={pid} style={[st.rollItem, isMe && st.rollItemMe]}>
                  <View style={[st.rollAvatar, isMe && { backgroundColor: colors.gold + "33" }]}>
                    <Text style={[st.rollAvatarLetter, isMe && { color: colors.gold }]}>
                      {(playerMap[pid]?.username ?? "?")[0].toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[st.rollSeat, isMe && { color: colors.gold }]}>{seat + 1}</Text>
                  <Text style={[st.rollName, isMe && { color: colors.white }]}>
                    {playerMap[pid]?.username ?? "Player"}
                  </Text>
                  {isMe && <Text style={st.rollYouTag}>YOU</Text>}
                </View>
              );
            })}
          </View>
          <Text style={st.rollHint}>Starting in a moment...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // === LIVE (active turn) ===
  if (phase === "live") {
    const q = gs.currentQuestion;
    const difficulty = q?.difficulty ?? "easy";
    const diffColor = DIFF_COLOR[difficulty];
    const diffLabel = DIFF_LABEL[difficulty];
    const atCap = gs.pot >= gs.potCap;
    const timerColor = timeLeft > 7 ? colors.success : timeLeft > 3 ? colors.warning : colors.danger;

    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.liveScroll}>
          {/* Turn banner */}
          <View style={[st.turnBanner, isMyTurn && st.turnBannerMe]}>
            <View style={[st.turnAvatar, isMyTurn && { backgroundColor: colors.gold + "28" }]}>
              <Text style={[st.turnAvatarLetter, isMyTurn && { color: colors.gold }]}>
                {(currentActor ?? "?")[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[st.turnName, isMyTurn && { color: colors.gold }]}>
                {isMyTurn ? "YOUR TURN" : `${currentActor}'s turn`}
              </Text>
              <View style={st.timerTrack}>
                <View style={[st.timerFill, { width: `${(timeLeft / TIMER_SECONDS) * 100}%`, backgroundColor: timerColor }]} />
              </View>
            </View>
            <View style={st.timerBubble}>
              <Text style={[st.timerNum, { color: timerColor }]}>{timeLeft}</Text>
              <Text style={[st.timerSec, { color: timerColor }]}>s</Text>
            </View>
          </View>

          {/* My score bar */}
          <View style={st.scoreBar}>
            <Text style={st.scoreLabel}>YOU</Text>
            <Text style={st.scoreNum}>{gs.scores[myId] ?? 0}<Text style={st.scoreTarget}>/{gs.target}</Text></Text>
            {deltaText && (
              <Animated.Text
                style={[
                  st.deltaAnim,
                  { color: deltaColor, opacity: deltaOpacity, transform: [{ translateY: deltaTranslateY }] },
                ]}
              >
                {deltaText}
              </Animated.Text>
            )}
          </View>

          {/* Pot meter */}
          <View style={[st.potMeter, atCap && st.potMax]}>
            <Text style={[st.potLabel, atCap && { color: colors.danger }]}>
              {atCap ? "MAX POT" : "POT"}
            </Text>
            <Text style={[st.potNum, atCap && { color: colors.danger }]}>{gs.pot}</Text>
            <View style={st.potTrack}>
              {Array.from({ length: gs.potCap }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    st.potDot,
                    i < gs.pot && (atCap ? st.potDotMax : st.potDotOn),
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Difficulty badge */}
          <View style={[st.diffBadge, { backgroundColor: diffColor + "1A", borderColor: diffColor + "55" }]}>
            <View style={[st.diffDot, { backgroundColor: diffColor }]} />
            <Text style={[st.diffText, { color: diffColor }]}>{diffLabel}</Text>
            <Text style={[st.diffPots, { color: diffColor + "AA" }]}>starts at {q?.startingPot ?? 1}pt</Text>
          </View>

          {/* Question */}
          <View style={st.qCard}>
            <Text style={st.qText}>{q?.text ?? ""}</Text>
          </View>

          {/* Choices / spectate */}
          {isMyTurn ? (
            <>
              <Text style={st.actionHint}>
                {actionSent ? "Locking in..." : `Answer for ${gs.pot} pt${gs.pot !== 1 ? "s" : ""} \u00B7 or skip`}
              </Text>
              <View style={st.choicesGrid}>
                {(q?.choices ?? []).map((choice, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[st.choiceBtn, actionSent && st.choiceBtnOff]}
                    onPress={() => handleAnswer(i)}
                    disabled={actionSent}
                    activeOpacity={0.65}
                  >
                    <View style={st.choiceLetterWrap}>
                      <Text style={st.choiceLetter}>{String.fromCharCode(65 + i)}</Text>
                    </View>
                    <Text style={st.choiceText} numberOfLines={2}>{choice}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!actionSent && (
                <TouchableOpacity style={st.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
                  <Text style={st.skipBtnText}>SKIP — pass to next player</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <View style={st.spectate}>
              <Text style={st.spectateText}>
                <Text style={{ color: colors.gold }}>{currentActor}</Text> is deciding
              </Text>
              <Text style={st.upNext}>
                {turnsAway <= 0 ? "you're up" : turnsAway === 1 ? "you're NEXT" : `${turnsAway} turns away`}
              </Text>
            </View>
          )}
        </ScrollView>
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
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.revealScroll}>
          <View style={st.revealCard}>
            <Text style={st.revealLabel}>ANSWER</Text>
            <Text style={st.revealAnswer}>{gs.revealInfo?.answer ?? "\u2014"}</Text>
            <Text style={st.revealNote}>
              {gs.revealInfo?.scored ? `${gs.revealInfo.by} took the pot!` : "Everyone skipped \u2014 pot voided"}
            </Text>
          </View>

          <View style={st.standingsCard}>
            <Text style={st.standingsHeader}>STANDINGS</Text>
            {sorted.map((p, i) => (
              <View key={p.uid} style={[st.standingRow, ranks[i] === 1 && st.standingRowFirst]}>
                <Text style={[st.standingRank, ranks[i] === 1 && { color: colors.gold }]}>#{ranks[i]}</Text>
                <Text style={st.standingName} numberOfLines={1}>{p.username}</Text>
                <Text style={[st.standingScore, ranks[i] === 1 && { color: colors.gold }]}>{p.score}</Text>
              </View>
            ))}
            <Text style={st.targetNote}>First to {gs.target} wins</Text>
          </View>

          {isHost ? (
            <TouchableOpacity style={st.primaryBtn} onPress={handleNextQuestion} activeOpacity={0.8}>
              <Text style={st.primaryBtnText}>NEXT QUESTION</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <Text style={st.wait}>Waiting for host to continue...</Text>
          )}
        </ScrollView>
      </SafeAreaView>
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
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.gameOverScroll}>
          <Ionicons name="trophy" size={48} color={colors.warning} />
          <Text style={st.gameOverTitle}>{iWon ? "YOU WIN!" : `${winnerName} WINS!`}</Text>

          <View style={[st.standingsCard, st.gameOverStandings]}>
            {sorted.map((p, i) => (
              <View key={p.uid} style={[st.standingRow, ranks[i] === 1 && st.standingRowFirst]}>
                <Text style={[st.standingRank, ranks[i] === 1 && { color: colors.gold }]}>{ranks[i]}</Text>
                <Text style={st.standingName} numberOfLines={1}>{p.username}</Text>
                <Text style={[st.standingScore, ranks[i] === 1 && { color: colors.gold }]}>{p.score}</Text>
              </View>
            ))}
          </View>

          {isHost ? (
            <TouchableOpacity style={st.primaryBtn} onPress={handleBackToLobby} activeOpacity={0.7}>
              <Text style={st.primaryBtnText}>Back to Lobby</Text>
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
    <SafeAreaView style={st.container}><GameHeader />
      <View style={st.centered}>
        <Text style={st.loadingText}>Unknown phase: {phase}</Text>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  loadingText: { fontFamily: fonts.medium, fontSize: 16, color: colors.gray400, marginTop: 16 },
  bigEmoji: { fontSize: 64, marginBottom: 16 },
  title: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white, marginBottom: 8 },
  tagline: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray400, marginBottom: 32, textAlign: "center" },
  wait: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray400, textAlign: "center" },

  introScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 24 },
  rulesBox: { width: "100%", marginBottom: 32 },
  ruleCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  ruleText: { fontFamily: fonts.regular, fontSize: 14, color: colors.white, lineHeight: 20 },

  // Rolling
  rollingContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 40, alignItems: "center", gap: 8 },
  rollingHeader: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.gold, letterSpacing: 2, textAlign: "center" },
  rollingSubHeader: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500, letterSpacing: 3, textAlign: "center", marginBottom: 16 },
  rollItem: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.surfaceLight, paddingHorizontal: 14, paddingVertical: 13,
  },
  rollItemMe: { borderColor: colors.gold, backgroundColor: "#1A1600" },
  rollAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceLight },
  rollAvatarLetter: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.gray400 },
  rollSeat: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.gray500, width: 22, textAlign: "center" },
  rollName: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.gray400 },
  rollYouTag: { fontFamily: fonts.extrabold, fontSize: 10, color: colors.gold, letterSpacing: 2 },
  rollHint: { fontFamily: fonts.regular, fontSize: 14, color: colors.gray500, marginTop: 24 },

  // Live
  liveScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 12 },
  turnBanner: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.surfaceLight, paddingHorizontal: 14, paddingVertical: 12,
  },
  turnBannerMe: { borderColor: colors.gold, backgroundColor: "#1E1A0A" },
  turnAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceLight },
  turnAvatarLetter: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.gray400 },
  turnName: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.white },
  timerTrack: { height: 4, backgroundColor: colors.surfaceLight, borderRadius: 2, overflow: "hidden" },
  timerFill: { height: "100%", borderRadius: 2 },
  timerBubble: { flexDirection: "row", alignItems: "baseline", gap: 1 },
  timerNum: { fontFamily: fonts.extrabold, fontSize: 22 },
  timerSec: { fontFamily: fonts.bold, fontSize: 11 },

  scoreBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, position: "relative" },
  deltaAnim: { fontFamily: fonts.extrabold, fontSize: 18, position: "absolute", right: 4 },
  scoreLabel: { fontFamily: fonts.extrabold, fontSize: 11, color: colors.gray500, letterSpacing: 2 },
  scoreNum: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.white },
  scoreTarget: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray500 },

  potMeter: {
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceLight,
    padding: 14, alignItems: "center", gap: 6,
  },
  potMax: { borderColor: colors.danger + "66" },
  potLabel: { fontFamily: fonts.extrabold, fontSize: 11, color: colors.gray500, letterSpacing: 2 },
  potNum: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white },
  potTrack: { flexDirection: "row", gap: 6 },
  potDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.surfaceLight },
  potDotOn: { backgroundColor: colors.primary },
  potDotMax: { backgroundColor: colors.danger },

  diffBadge: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
  },
  diffDot: { width: 6, height: 6, borderRadius: 3 },
  diffText: { fontFamily: fonts.extrabold, fontSize: 11, letterSpacing: 1 },
  diffPots: { fontFamily: fonts.medium, fontSize: 11 },

  qCard: {
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.surfaceLight,
    padding: 20,
  },
  qText: { fontFamily: fonts.bold, fontSize: 18, color: colors.white, textAlign: "center", lineHeight: 26 },
  actionHint: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray400, textAlign: "center" },

  choicesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  choiceBtn: {
    width: "47%", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1,
    borderColor: colors.surfaceLight, padding: 14, flexDirection: "row", alignItems: "center", gap: 10,
  },
  choiceBtnOff: { opacity: 0.4 },
  choiceLetterWrap: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceLight,
    alignItems: "center", justifyContent: "center",
  },
  choiceLetter: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.primaryLight },
  choiceText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.white },

  skipBtn: {
    alignItems: "center", paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: colors.surfaceLight,
  },
  skipBtnText: { fontFamily: fonts.bold, fontSize: 13, color: colors.gray400 },

  spectate: { alignItems: "center", gap: 8, paddingVertical: 20 },
  spectateText: { fontFamily: fonts.medium, fontSize: 16, color: colors.gray400 },
  upNext: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryLight },

  // Reveal
  revealScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 16 },
  revealCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.surfaceLight,
    padding: 24, alignItems: "center", gap: 8,
  },
  revealLabel: { fontFamily: fonts.extrabold, fontSize: 11, color: colors.gray500, letterSpacing: 2 },
  revealAnswer: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.white, textAlign: "center" },
  revealNote: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray400 },

  standingsCard: {
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.surfaceLight,
    padding: 16, gap: 8,
  },
  standingsHeader: { fontFamily: fonts.extrabold, fontSize: 11, color: colors.gray500, letterSpacing: 2, marginBottom: 4 },
  standingRow: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceLight,
  },
  standingRowFirst: { borderBottomColor: colors.gold + "33" },
  standingRank: { fontFamily: fonts.bold, fontSize: 14, color: colors.gray500, width: 28 },
  standingName: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  standingScore: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  targetNote: { fontFamily: fonts.regular, fontSize: 12, color: colors.gray500, textAlign: "center", marginTop: 4 },

  // Game over
  gameOverScroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 20, paddingTop: 40, paddingBottom: 40, gap: 16 },
  gameOverTitle: { fontFamily: fonts.extrabold, fontSize: 32, color: colors.white },
  // gameOverScroll centers its children, so without this the card shrinks to content and standingName (flex: 1) gets no width.
  gameOverStandings: { alignSelf: "stretch" },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, width: "100%",
  },
  primaryBtnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
});
