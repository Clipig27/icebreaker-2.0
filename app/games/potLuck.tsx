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
import { DEFAULT_QUESTIONS, PotLuckQuestion } from "../../src/data/potLuck";
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
  const available = DEFAULT_QUESTIONS.filter((q) => !usedIds.includes(q.id));
  if (available.length === 0) return DEFAULT_QUESTIONS[Math.floor(Math.random() * DEFAULT_QUESTIONS.length)];
  return available[Math.floor(Math.random() * available.length)];
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
              <Eyebrow tone="dark">{`First to ${gs.target ?? DEFAULT_TARGET} wins`}</Eyebrow>
              <Text style={st.heroTitle}>Answer to win the pot. Skip to grow it.</Text>
            </View>
            <Text style={st.heroEmoji}>{"\uD83E\uDDE0"}</Text>
          </View>
        </HeroGradient>
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

  // === LIVE (active turn) ===
  if (phase === "live") {
    const q = gs.currentQuestion;
    const difficulty = q?.difficulty ?? "easy";
    const diffColor = DIFF_COLOR[difficulty];
    const diffLabel = DIFF_LABEL[difficulty];
    const atCap = gs.pot >= gs.potCap;
    const urgent = timeLeft <= 3;

    return (
      <Shell
        footer={
          isMyTurn ? (
            actionSent ? (
              <WaitingNote label="Locking in..." />
            ) : (
              <PrimaryAction
                label={"Skip \u2014 pass to next player"}
                icon="play-skip-forward"
                variant="dark"
                onPress={handleSkip}
              />
            )
          ) : (
            <WaitingNote label={`${currentActor} is deciding...`} />
          )
        }
      >
        <ScreenTitle
          title={isMyTurn ? "Your turn!" : `${currentActor}'s turn`}
          subtitle={
            isMyTurn
              ? actionSent
                ? "Locking in..."
                : `Answer for ${gs.pot} pt${gs.pot !== 1 ? "s" : ""} \u00B7 or skip`
              : turnsAway <= 0
                ? "You're up"
                : turnsAway === 1
                  ? "You're NEXT"
                  : `You're ${turnsAway} turns away`
          }
          pill={isMyTurn ? "Your turn" : undefined}
        />

        {/* Timer */}
        <View style={st.countdown}>
          <Text style={[st.countdownNum, urgent && { color: colors.danger }]}>{timeLeft}</Text>
          <Eyebrow>Seconds left</Eyebrow>
          <ProgressBar progress={timeLeft / TIMER_SECONDS} />
        </View>

        {/* Pot + my score */}
        <View style={st.statRow}>
          <GradientCard
            style={st.flex1}
            radius={radii.lg}
            borderColors={atCap ? DANGER_BORDER : undefined}
            contentStyle={st.statContent}
          >
            <Text style={[st.statValue, atCap && { color: colors.danger }]}>{gs.pot}</Text>
            <Eyebrow style={atCap ? { color: colors.danger } : undefined}>{atCap ? "Max pot" : "Pot"}</Eyebrow>
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
          </GradientCard>
          <GradientCard style={st.flex1} radius={radii.lg} contentStyle={st.statContent}>
            <Text style={st.statValue}>
              {gs.scores[myId] ?? 0}
              <Text style={st.statTarget}>/{gs.target}</Text>
            </Text>
            <Eyebrow>Your score</Eyebrow>
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
          </GradientCard>
        </View>

        {/* Question */}
        <HeroGradient>
          <View style={st.qHero}>
            <View style={st.qHeroHead}>
              <View style={[st.diffChip, { backgroundColor: diffColor }]}>
                <Text style={st.diffText}>{diffLabel}</Text>
              </View>
              <Text style={st.diffPots}>starts at {q?.startingPot ?? 1}pt</Text>
            </View>
            <Text style={st.qText}>{q?.text ?? ""}</Text>
          </View>
        </HeroGradient>

        {/* Choices / spectate */}
        {isMyTurn ? (
          <>
            <Eyebrow style={st.sectionEyebrow}>Pick your answer</Eyebrow>
            <View style={st.list}>
              {(q?.choices ?? []).map((choice, i) => (
                <Pressable
                  key={i}
                  onPress={() => handleAnswer(i)}
                  disabled={actionSent}
                  accessibilityRole="button"
                  style={({ pressed }) => [actionSent && st.choiceOff, pressed && st.pressed]}
                >
                  <GradientCard radius={radii.lg} contentStyle={st.choiceRow}>
                    <View style={st.numTile}>
                      <Text style={[st.numTileText, { color: colors.highlight }]}>{String.fromCharCode(65 + i)}</Text>
                    </View>
                    <Text style={st.choiceText} numberOfLines={2}>{choice}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.highlight} />
                  </GradientCard>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <GradientCard radius={radii.lg} contentStyle={st.rankRow}>
            <PlayerAvatar username={currentActor ?? "?"} size={40} />
            <View style={st.flex1}>
              <Eyebrow>Now deciding</Eyebrow>
              <Text style={st.rankName} numberOfLines={1}>{currentActor}</Text>
            </View>
            <Pill
              tone={turnsAway === 1 ? "lavender" : "dark"}
              label={turnsAway <= 0 ? "You're up" : turnsAway === 1 ? "You're next" : `${turnsAway} turns away`}
            />
          </GradientCard>
        )}
      </Shell>
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
});
