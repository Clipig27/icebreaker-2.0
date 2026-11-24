import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { colors, fonts, gradients, radii, spacing, type } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { getAllTasks, Task } from "../../src/data/tenSecondTasks";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "intro" | "countdown" | "active" | "judging" | "resolve" | "game-over";
type StackItem = { id: string; text: string };

type GameState = {
  phase: Phase;
  game: "tenSecondTasks";
  turnNumber: number;
  stack: StackItem[];
  usedTaskIds: string[];
  activePlayerIds: string[];
  eliminatedPlayerIds: string[];
  eliminationOrder: string[];
  currentHolderId: string | null;
  previousHolderId: string | null;
  timerEnd: number | null;
  timerDuration: number;
  votes: Record<string, "pass" | "fail">;
  holderTappedDone: boolean;
  verdict: "pass" | "fail" | null;
  passCount: number;
  failCount: number;
  timerExpired: boolean;
  isSuddenDeath: boolean;
  winnerId: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STACK = 5;
const COUNTDOWN_MS = 3000;

function getTimerSeconds(turnNumber: number): number {
  if (turnNumber <= 3) return 10;
  if (turnNumber <= 6) return 15;
  if (turnNumber <= 9) return 20;
  return 25;
}

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

const TS_DECK_KEY = "ts";

// Prefers tasks not used this game AND not recently used on this device.
function pickTask(usedIds: string[]): Task {
  const all = getAllTasks();
  const [task] = pickFresh(all, 1, (t) => t.id, [...getRecent(TS_DECK_KEY), ...usedIds]);
  const picked = task ?? all[Math.floor(Math.random() * all.length)];
  markUsed(TS_DECK_KEY, [picked.id]);
  return picked;
}

function pickHolder(activeIds: string[], previousHolderId: string | null, isSuddenDeath: boolean): string {
  if (isSuddenDeath || activeIds.length <= 2) {
    const other = activeIds.filter((id) => id !== previousHolderId);
    return other.length > 0 ? other[Math.floor(Math.random() * other.length)] : activeIds[0];
  }
  const eligible = activeIds.filter((id) => id !== previousHolderId);
  return eligible[Math.floor(Math.random() * eligible.length)] ?? activeIds[0];
}

function useCountdown(timerEnd: number | null): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!timerEnd) return;
    const id = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [timerEnd]);
  if (!timerEnd) return 0;
  return Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
}

// ---------------------------------------------------------------------------
// Task List Component (reused in countdown + active)
// ---------------------------------------------------------------------------

function TaskStack({ stack, large, isPerformer = false }: { stack: StackItem[]; large?: boolean; isPerformer?: boolean }) {
  return (
    <View style={st.list}>
      {stack.map((item, i) => {
        const isNewest = i === stack.length - 1;
        if (isNewest) {
          // Newest task is the hero moment
          return (
            <HeroGradient key={item.id} radius={radii.lg}>
              <View style={st.taskHero}>
                <View style={st.taskHeroHead}>
                  <View style={[st.numTile, st.numTileHero]}>
                    <Text style={[st.numTileText, st.numTileTextHero]}>{i + 1}</Text>
                  </View>
                  <Eyebrow tone="dark">{stack.length > 1 ? "New task" : isPerformer ? "Your task" : "Task"}</Eyebrow>
                </View>
                <Text style={[st.taskHeroText, large && st.taskHeroTextLg]}>{item.text}</Text>
              </View>
            </HeroGradient>
          );
        }
        return (
          <GradientCard key={item.id} radius={radii.lg} contentStyle={st.taskRow}>
            <View style={st.numTile}>
              <Text style={st.numTileText}>{i + 1}</Text>
            </View>
            <Text style={[st.taskText, large && st.taskTextLg]}>{item.text}</Text>
          </GradientCard>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TenSecondTasksScreen() {
  const router = useRouter();
  const { room, players, isHost, mutateGameState, endGame, startGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const gs: GameState | null = room?.game_state ?? null;
  const phase = gs?.phase ?? null;
  const myId = user?.id ?? "";

  const secondsLeft = useCountdown(gs?.timerEnd ?? null);
  const isTimerExpired = gs?.timerEnd ? Date.now() >= gs.timerEnd : false;

  // Strict performer check: only when we know who we are, a holder is actually
  // assigned, and it's a phase where a performer exists. Prevents the performer
  // UI ("You're on!" / "Your task") from flashing for anyone else during turn
  // transitions or before auth/holder state is populated.
  const isHolder =
    !!myId &&
    !!gs?.currentHolderId &&
    gs.currentHolderId === myId &&
    (phase === "countdown" || phase === "active" || phase === "judging" || phase === "resolve");
  const isEliminated = (gs?.eliminatedPlayerIds ?? []).includes(myId);

  const playerMap: Record<string, string> = {};
  players.forEach((p) => { playerMap[p.user_id] = p.username; });

  const holderName = gs?.currentHolderId ? (playerMap[gs.currentHolderId] ?? "Player") : "...";
  const countdownLeft = useCountdown(phase === "countdown" ? (gs?.timerEnd ?? null) : null);

  // Hydrate this device's recently-used task ids (keeps games fresh).
  useEffect(() => {
    loadRecent(TS_DECK_KEY);
  }, []);

  // Haptic at 3 seconds
  const buzzedRef = useRef(false);
  useEffect(() => {
    if (phase === "active" && secondsLeft === 3 && !buzzedRef.current) {
      buzzedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    if (phase !== "active") buzzedRef.current = false;
  }, [secondsLeft, phase]);

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
    if (gs.winnerId === myId) useAuthStore.getState().incrementWins();
  }, [phase]);

  // Host: initialise
  useEffect(() => {
    if (!isHost || !room) return;
    if (gs && gs.game === "tenSecondTasks" && gs.phase && (gs.phase as string) !== "starting") return;
    const activeIds = players.map((p) => p.user_id);
    const initialState: GameState = {
      phase: "intro",
      game: "tenSecondTasks",
      turnNumber: 0,
      stack: [],
      usedTaskIds: [],
      activePlayerIds: activeIds,
      eliminatedPlayerIds: [],
      eliminationOrder: [],
      currentHolderId: null,
      previousHolderId: null,
      timerEnd: null,
      timerDuration: 10000,
      votes: {},
      holderTappedDone: false,
      verdict: null,
      passCount: 0,
      failCount: 0,
      timerExpired: false,
      isSuddenDeath: activeIds.length <= 2,
      winnerId: null,
    };
    mutateGameState((cur) => {
      if (cur?.phase && cur.phase !== "starting") return null;
      return initialState;
    });
  }, [isHost, room?.id, gs?.phase === "starting"]);

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

  // Host: countdown -> active
  useEffect(() => {
    if (!isHost || phase !== "countdown" || !gs?.timerEnd) return;
    if (Date.now() < gs.timerEnd) {
      const delay = gs.timerEnd - Date.now();
      const t = setTimeout(() => {
        const timerSecs = getTimerSeconds(gs.turnNumber);
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "countdown") return null;
          return { ...cur, phase: "active" as Phase, timerEnd: Date.now() + timerSecs * 1000, timerDuration: timerSecs * 1000 };
        });
      }, delay);
      return () => clearTimeout(t);
    }
  }, [phase, gs?.timerEnd, isHost]);

  // Host: timer expired
  useEffect(() => {
    if (!isHost || phase !== "active" || !gs?.timerEnd || !isTimerExpired) return;
    mutateGameState((cur) => {
      if (!cur || cur.phase !== "active" || cur.holderTappedDone) return null;
      return { ...cur, phase: "judging" as Phase, timerExpired: true, holderTappedDone: false };
    });
  }, [isTimerExpired, phase, isHost]);

  // Host: resolve judging
  useEffect(() => {
    if (!isHost || phase !== "judging" || !gs) return;
    const t = setTimeout(() => {
      mutateGameState((cur) => {
        if (!cur || cur.phase !== "judging") return null;
        const votes = cur.votes ?? {};
        const validVotes = Object.entries(votes).filter(([vid]) => players.some((p) => p.user_id === vid));
        const passVotes = validVotes.filter(([, v]) => v === "pass").length;
        const failVotes = validVotes.filter(([, v]) => v === "fail").length;
        let verdict: "pass" | "fail";
        if (cur.timerExpired) verdict = "fail";
        else if (validVotes.length === 0) verdict = cur.holderTappedDone ? "pass" : "fail";
        else verdict = failVotes > passVotes ? "fail" : "pass";
        return { ...cur, phase: "resolve" as Phase, verdict, passCount: passVotes, failCount: failVotes };
      });
    }, 500);
    return () => clearTimeout(t);
  }, [phase, isHost]);

  // Host: resolve -> next turn or game-over
  useEffect(() => {
    if (!isHost || phase !== "resolve" || !gs) return;
    const t = setTimeout(() => {
      mutateGameState((cur) => {
        if (!cur || cur.phase !== "resolve") return null;
        const holderId = cur.currentHolderId!;
        let newActive = [...cur.activePlayerIds];
        let newEliminated = [...cur.eliminatedPlayerIds];
        let newOrder = [...cur.eliminationOrder];
        if (cur.verdict === "fail") {
          newActive = newActive.filter((id) => id !== holderId);
          newEliminated = [...newEliminated, holderId];
          newOrder = [...newOrder, holderId];
        }
        if (newActive.length <= 1) {
          return {
            ...cur, phase: "game-over" as Phase,
            activePlayerIds: newActive, eliminatedPlayerIds: newEliminated,
            eliminationOrder: newOrder, winnerId: newActive[0] ?? holderId,
          };
        }
        const isSuddenDeath = newActive.length === 2;
        const nextTurn = cur.turnNumber + 1;
        const task = pickTask(cur.usedTaskIds);
        let newStack = [...cur.stack, { id: task.id, text: task.text }];
        if (newStack.length > MAX_STACK) newStack = newStack.slice(newStack.length - MAX_STACK);
        const nextHolder = pickHolder(newActive, holderId, isSuddenDeath);
        return {
          ...cur, phase: "countdown" as Phase, turnNumber: nextTurn,
          stack: newStack, usedTaskIds: [...cur.usedTaskIds, task.id],
          activePlayerIds: newActive, eliminatedPlayerIds: newEliminated, eliminationOrder: newOrder,
          currentHolderId: nextHolder, previousHolderId: holderId,
          timerEnd: Date.now() + COUNTDOWN_MS, timerDuration: COUNTDOWN_MS,
          votes: {}, holderTappedDone: false, verdict: null, passCount: 0, failCount: 0, timerExpired: false, isSuddenDeath,
        };
      });
    }, 2500);
    return () => clearTimeout(t);
  }, [phase, isHost]);

  // Handlers
  const handleStartGame = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "intro") return null;
      const task = pickTask([]);
      const firstHolder = pickHolder(cur.activePlayerIds, null, cur.isSuddenDeath);
      return {
        ...cur, phase: "countdown" as Phase, turnNumber: 1,
        stack: [{ id: task.id, text: task.text }], usedTaskIds: [task.id],
        currentHolderId: firstHolder, timerEnd: Date.now() + COUNTDOWN_MS, timerDuration: COUNTDOWN_MS,
      };
    });
  }, [mutateGameState]);

  const handleDone = useCallback(async () => {
    if (!isHolder || gs?.holderTappedDone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "active" || cur.currentHolderId !== myId || cur.holderTappedDone) return null;
      return { ...cur, phase: "judging" as Phase, holderTappedDone: true, timerEnd: null };
    });
  }, [isHolder, gs, myId, mutateGameState]);

  const handleVote = useCallback(async (vote: "pass" | "fail") => {
    if (isHolder) return;
    await mutateGameState((cur) => {
      if (!cur || (cur.phase !== "active" && cur.phase !== "judging") || cur.currentHolderId === myId) return null;
      return { ...cur, votes: { ...cur.votes, [myId]: vote } };
    });
  }, [isHolder, myId, mutateGameState]);

  const handleBackToLobby = useCallback(async () => { await endGame(); }, [endGame]);

  // Derived
  const myVote = gs?.votes?.[myId] ?? null;
  const passCount = Object.values(gs?.votes ?? {}).filter((v) => v === "pass").length;
  const failCount = Object.values(gs?.votes ?? {}).filter((v) => v === "fail").length;

  // Loading
  if (!gs || (gs.game as string) !== "tenSecondTasks" || !phase || (phase as string) === "starting") {
    return <GameLoadingScreen name="10 Second Tasks" icon="timer" color="#F97316" />;
  }

  // === INTRO ===
  if (phase === "intro") {
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Start Game" icon="play" onPress={handleStartGame} />
          ) : (
            <WaitingNote label="Waiting for host to start..." />
          )
        }
      >
        <ScreenTitle
          title="10 Second Tasks"
          subtitle="Stack tasks. Beat the timer. Don't get buzzed."
          pill={gs.isSuddenDeath ? "Sudden death" : undefined}
        />
        <HeroGradient>
          <View style={st.heroRow}>
            <View style={st.heroCopy}>
              <Eyebrow tone="dark">{"Up to 5 tasks \u00B7 1 survivor"}</Eyebrow>
              <Text style={st.heroTitle}>Do it all before the clock hits zero.</Text>
            </View>
            <Text style={st.heroEmoji}>{"\u23F1\uFE0F"}</Text>
          </View>
        </HeroGradient>
        <Eyebrow style={st.sectionEyebrow}>How it works</Eyebrow>
        <View style={st.list}>
          {[
            ["\uD83C\uDFAF", "One player performs a stack of tasks before time runs out."],
            ["\u2795", "Each turn adds a new task. Max 5 at once."],
            ["\uD83D\uDC4D", "Judges vote Pass or Fail. Majority Fail = you're out."],
            ["\uD83C\uDFC6", "Last player standing wins!"],
          ].map(([icon, text], i) => (
            <GradientCard key={i} radius={radii.lg} contentStyle={st.ruleRow}>
              <View style={st.ruleIcon}>
                <Text style={st.ruleEmoji}>{icon}</Text>
              </View>
              <Text style={st.ruleText}>{text}</Text>
            </GradientCard>
          ))}
          {gs.isSuddenDeath && (
            <GradientCard radius={radii.lg} borderColors={PEACH_BORDER} contentStyle={st.ruleRow}>
              <View style={st.ruleIcon}>
                <Text style={st.ruleEmoji}>{"⚠️"}</Text>
              </View>
              <Text style={st.warningText}>Only 2 players — Sudden Death!</Text>
            </GradientCard>
          )}
        </View>
      </Shell>
    );
  }

  // === COUNTDOWN (shows tasks!) ===
  if (phase === "countdown") {
    return (
      <Shell>
        <ScreenTitle
          title={isHolder ? "Get ready!" : `${holderName} is up!`}
          subtitle={`Turn ${gs.turnNumber} \u00B7 ${getTimerSeconds(gs.turnNumber)}s timer`}
          pill={gs.isSuddenDeath ? "Sudden death" : `Turn ${gs.turnNumber}`}
        />
        <Countdown
          value={countdownLeft}
          label="Starting in"
          progress={gs.timerDuration > 0 ? (countdownLeft * 1000) / gs.timerDuration : 0}
        />
        <Eyebrow style={st.sectionEyebrow}>{isHolder ? "Tasks to complete" : `${holderName}'s tasks`}</Eyebrow>
        <TaskStack stack={gs.stack} large isPerformer={isHolder} />
      </Shell>
    );
  }

  // === ACTIVE ===
  if (phase === "active") {
    const urgent = secondsLeft <= 3;
    const progress = gs.timerDuration > 0 ? (secondsLeft * 1000) / gs.timerDuration : 0;

    if (isHolder) {
      return (
        <Shell footer={<PrimaryAction label="DONE!" icon="checkmark" onPress={handleDone} />}>
          <ScreenTitle
            title="You're on!"
            subtitle={`Turn ${gs.turnNumber} \u00B7 Do every task, then tap Done`}
            pill={gs.isSuddenDeath ? "Sudden death" : `Turn ${gs.turnNumber}`}
          />
          <Countdown value={secondsLeft} label="Seconds left" progress={progress} urgent={urgent} />
          <Eyebrow style={st.sectionEyebrow}>Your tasks</Eyebrow>
          <TaskStack stack={gs.stack} large isPerformer />
        </Shell>
      );
    }

    return (
      <Shell
        footer={
          <View style={st.footerStack}>
            <Text style={st.voteCount}>{passCount} Pass {"\u00B7"} {failCount} Fail</Text>
            <View style={st.voteRow}>
              <Pressable
                style={({ pressed }) => [st.voteBtn, myVote === "pass" && st.voteBtnPassOn, pressed && st.pressed]}
                onPress={() => handleVote("pass")}
                accessibilityRole="button"
                accessibilityState={{ selected: myVote === "pass" }}
              >
                {myVote === "pass" ? (
                  <LinearGradient
                    colors={gradients.primaryButton}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.6, y: 1 }}
                    style={[StyleSheet.absoluteFill, st.pillRadius]}
                    pointerEvents="none"
                  />
                ) : null}
                <Ionicons name="thumbs-up" size={20} color={myVote === "pass" ? colors.onPrimary : colors.highlight} />
                <Text style={[st.voteBtnText, myVote === "pass" && { color: colors.onPrimary }]}>PASS</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [st.voteBtn, st.voteBtnFail, myVote === "fail" && st.voteBtnFailOn, pressed && st.pressed]}
                onPress={() => handleVote("fail")}
                accessibilityRole="button"
                accessibilityState={{ selected: myVote === "fail" }}
              >
                <Ionicons name="thumbs-down" size={20} color={myVote === "fail" ? colors.white : colors.danger} />
                <Text style={st.voteBtnText}>FAIL</Text>
              </Pressable>
            </View>
          </View>
        }
      >
        <ScreenTitle
          title={`${holderName} is performing!`}
          subtitle={isEliminated ? "You're on the jury. Vote Pass or Fail." : "Vote Pass or Fail."}
          pill={isEliminated ? "Jury" : gs.isSuddenDeath ? "Sudden death" : `Turn ${gs.turnNumber}`}
        />
        <Countdown value={secondsLeft} label="Seconds left" progress={progress} urgent={urgent} />
        <Eyebrow style={st.sectionEyebrow}>Tasks</Eyebrow>
        <TaskStack stack={gs.stack} large />
      </Shell>
    );
  }

  // === JUDGING ===
  if (phase === "judging") {
    return (
      <Shell footer={<WaitingNote label="Tallying votes..." />}>
        <ScreenTitle
          title={gs.timerExpired ? "Time's up!" : `${holderName} is done!`}
          subtitle="Tallying votes..."
        />
        <View style={st.statRow}>
          <StatCard label="Pass" value={passCount} />
          <StatCard label="Fail" value={failCount} danger />
        </View>
      </Shell>
    );
  }

  // === RESOLVE ===
  if (phase === "resolve") {
    const isPassed = gs.verdict === "pass";
    return (
      <Shell>
        <ScreenTitle
          title="The verdict"
          subtitle={`Turn ${gs.turnNumber}`}
          pill={gs.timerExpired ? "Timer expired" : undefined}
        />
        <GradientCard
          fill={isPassed ? gradients.hero : undefined}
          borderColors={isPassed ? HERO_BORDER : DANGER_BORDER}
          contentStyle={st.resultCard}
        >
          <Ionicons
            name={isPassed ? "checkmark-circle" : "close-circle"}
            size={64}
            color={isPassed ? colors.onPrimary : colors.danger}
          />
          <Text style={[st.resultOutcome, { color: isPassed ? colors.onPrimary : colors.danger }]}>
            {isPassed ? "PASS!" : "OUT!"}
          </Text>
          <View style={st.resultNameRow}>
            <PlayerAvatar username={holderName} size={32} />
            <Text style={[st.resultName, { color: isPassed ? colors.onPrimary : colors.white }]} numberOfLines={1}>
              {holderName}
            </Text>
          </View>
        </GradientCard>
        <View style={st.statRow}>
          <StatCard label="Pass" value={gs.passCount} />
          <StatCard label="Fail" value={gs.failCount} danger />
        </View>
      </Shell>
    );
  }

  // === GAME OVER ===
  if (phase === "game-over") {
    const winnerId = gs.winnerId;
    const winnerName = winnerId ? (playerMap[winnerId] ?? "???") : "???";
    const iWon = winnerId === myId;

    return (
      <Shell
        footer={
          isHost ? (
            <View style={st.footerStack}>
              <PrimaryAction
                label="Play Again"
                icon="refresh"
                iconPosition="left"
                onPress={() => startGame("tenSecondTasks")}
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
          subtitle={`${gs.turnNumber} turns played`}
          pill="Final results"
        />
        <GradientCard fill={gradients.hero} borderColors={HERO_BORDER} contentStyle={st.winnerContent}>
          <View style={[st.numTile, st.numTileHero]}>
            <Text style={[st.numTileText, st.numTileTextHero]}>1</Text>
          </View>
          <PlayerAvatar username={winnerName} size={48} />
          <View style={st.flex1}>
            <Eyebrow tone="dark">Last one standing</Eyebrow>
            <Text style={st.winnerName} numberOfLines={1}>
              {winnerName}
            </Text>
          </View>
          <Ionicons name="trophy" size={30} color={colors.onPrimary} />
        </GradientCard>

        {gs.eliminationOrder.length > 0 && (
          <>
            <Eyebrow style={st.sectionEyebrow}>Elimination order</Eyebrow>
            <View style={st.list}>
              {gs.eliminationOrder.map((uid, i) => (
                <GradientCard key={uid} radius={radii.lg} contentStyle={st.rankRow}>
                  <View style={st.numTile}>
                    <Text style={st.numTileText}>{gs.eliminationOrder.length - i}</Text>
                  </View>
                  <PlayerAvatar username={playerMap[uid] ?? "?"} size={36} />
                  <Text style={st.rankName} numberOfLines={1}>{playerMap[uid] ?? "?"}</Text>
                  <Text style={st.outTag}>OUT</Text>
                </GradientCard>
              ))}
            </View>
          </>
        )}
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
const PEACH_BORDER = ["rgba(246,201,168,0.8)", "rgba(246,201,168,0.15)"] as const;

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
        <Eyebrow tone="lavender">10 Second Tasks</Eyebrow>
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

function Countdown({
  value,
  label,
  progress,
  urgent = false,
}: {
  value: number;
  label: string;
  progress: number;
  urgent?: boolean;
}) {
  return (
    <View style={st.countdown}>
      <Text style={[st.countdownNum, urgent && { color: colors.danger }]}>{value}</Text>
      <Eyebrow>{label}</Eyebrow>
      <View style={st.progressTrack}>
        <LinearGradient
          colors={gradients.primaryButton}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[st.progressFill, { width: `${Math.min(1, Math.max(0, progress)) * 100}%` }]}
        />
      </View>
    </View>
  );
}

function StatCard({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <GradientCard style={st.flex1} radius={radii.lg} contentStyle={st.statContent}>
      <Text style={[st.statValue, danger && { color: colors.danger }]}>{value}</Text>
      <Eyebrow>{label}</Eyebrow>
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
  pillRadius: { borderRadius: radii.pill },
  loadingText: { fontFamily: fonts.medium, fontSize: 16, color: colors.gray400, marginTop: 16 },

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
  warningText: { flex: 1, fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.peach },

  // Countdown
  countdown: { alignItems: "center", gap: spacing.xs, paddingTop: spacing.sm },
  countdownNum: {
    fontFamily: fonts.extrabold,
    fontSize: 96,
    lineHeight: 104,
    letterSpacing: -3,
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

  // Task stack
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  taskText: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.gray300 },
  taskTextLg: { fontSize: 17, lineHeight: 23 },
  taskHero: { padding: 20, gap: spacing.md },
  taskHeroHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  taskHeroText: { fontFamily: fonts.extrabold, fontSize: 22, lineHeight: 28, color: colors.onPrimary },
  taskHeroTextLg: { fontSize: 24, lineHeight: 31 },
  numTile: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  numTileHero: { backgroundColor: colors.onPrimary },
  numTileText: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.white },
  numTileTextHero: { color: colors.highlight },

  // Voting (spectators)
  voteRow: { flexDirection: "row", gap: spacing.md },
  voteBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: radii.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.highlight,
  },
  voteBtnPassOn: { borderColor: colors.highlight },
  voteBtnFail: { borderColor: colors.danger },
  voteBtnFailOn: { backgroundColor: colors.danger },
  voteBtnText: { fontFamily: fonts.bold, fontSize: 16, letterSpacing: 0.5, color: colors.white },
  voteCount: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray400, textAlign: "center" },

  // Stats
  statRow: { flexDirection: "row", gap: spacing.md },
  statContent: { padding: spacing.lg, gap: 4 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 30, color: colors.white, fontVariant: ["tabular-nums"] },

  // Resolve
  resultCard: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 20, gap: spacing.sm },
  resultOutcome: { fontFamily: fonts.extrabold, fontSize: 40, letterSpacing: -1 },
  resultNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, maxWidth: "100%" },
  resultName: { flexShrink: 1, fontFamily: fonts.extrabold, fontSize: 22 },

  // Game over
  winnerContent: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 20 },
  winnerName: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.onPrimary },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  rankName: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  outTag: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2, color: colors.danger },
});
