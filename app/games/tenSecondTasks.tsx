import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, fonts } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { TASKS, Task } from "../../src/data/tenSecondTasks";
import HostWaitingPill from "../../src/components/HostWaitingPill";
import GameHeader from "../../src/components/GameHeader";
import GameLoadingScreen from "../../src/components/GameLoadingScreen";

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
const TASK_COLORS = ["#F97316", "#06B6D4", "#A78BFA", "#EF4444", "#10B981"];

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

function pickTask(usedIds: string[]): Task {
  let available = TASKS.filter((t) => !usedIds.includes(t.id));
  if (available.length === 0) available = [...TASKS];
  return available[Math.floor(Math.random() * available.length)];
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

function TaskStack({ stack, large }: { stack: StackItem[]; large?: boolean }) {
  return (
    <View style={{ gap: large ? 10 : 8, width: "100%" }}>
      {stack.map((item, i) => {
        const color = TASK_COLORS[i % TASK_COLORS.length];
        const isNewest = i === stack.length - 1;
        return (
          <View
            key={item.id}
            style={[
              st.taskCard,
              { borderColor: color + "88", backgroundColor: color + "14" },
              isNewest && { borderColor: color, backgroundColor: color + "22" },
            ]}
          >
            <View style={[st.taskNumBadge, { backgroundColor: color }]}>
              <Text style={st.taskNumText}>{i + 1}</Text>
            </View>
            <Text style={[st.taskText, large && st.taskTextLg, { color: isNewest ? colors.white : colors.gray300 }]}>
              {item.text}
            </Text>
          </View>
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

  const isHolder = gs?.currentHolderId === myId;
  const isEliminated = (gs?.eliminatedPlayerIds ?? []).includes(myId);

  const playerMap: Record<string, string> = {};
  players.forEach((p) => { playerMap[p.user_id] = p.username; });

  const holderName = gs?.currentHolderId ? (playerMap[gs.currentHolderId] ?? "Player") : "...";
  const countdownLeft = useCountdown(phase === "countdown" ? (gs?.timerEnd ?? null) : null);

  // Haptic at 3 seconds
  const buzzedRef = useRef(false);
  useEffect(() => {
    if (phase === "active" && secondsLeft === 3 && !buzzedRef.current) {
      buzzedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    if (phase !== "active") buzzedRef.current = false;
  }, [secondsLeft, phase]);

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
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.introScroll}>
          <Text style={st.bigEmoji}>{"\u23F1\uFE0F"}</Text>
          <Text style={st.title}>10 Second Tasks</Text>
          <Text style={st.tagline}>Stack tasks. Beat the timer. Don't get buzzed.</Text>
          <View style={st.rulesBox}>
            {[
              ["\uD83C\uDFAF", "One player performs a stack of tasks before time runs out."],
              ["\u2795", "Each turn adds a new task. Max 5 at once."],
              ["\uD83D\uDC4D", "Judges vote Pass or Fail. Majority Fail = you're out."],
              ["\uD83C\uDFC6", "Last player standing wins!"],
            ].map(([icon, text], i) => (
              <View key={i} style={st.ruleCard}>
                <Text style={st.ruleText}>{icon}  {text}</Text>
              </View>
            ))}
          </View>
          {gs.isSuddenDeath && (
            <View style={st.warningCard}>
              <Text style={st.warningText}>Only 2 players — Sudden Death!</Text>
            </View>
          )}
          {isHost ? (
            <TouchableOpacity style={st.primaryBtn} onPress={handleStartGame}>
              <Text style={st.primaryBtnText}>Start Game</Text>
            </TouchableOpacity>
          ) : (
            <Text style={st.wait}>Waiting for host to start...</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === COUNTDOWN (shows tasks!) ===
  if (phase === "countdown") {
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.countdownScroll}>
          <Text style={st.countdownLabel}>{isHolder ? "GET READY!" : `${holderName} is up!`}</Text>
          <Text style={st.countdownNum}>{countdownLeft}</Text>
          <Text style={st.turnInfo}>Turn {gs.turnNumber} {"\u00B7"} {getTimerSeconds(gs.turnNumber)}s timer</Text>
          {gs.isSuddenDeath && <Text style={st.suddenDeathBadge}>SUDDEN DEATH</Text>}
          <Text style={st.stackLabelLg}>TASKS TO COMPLETE</Text>
          <TaskStack stack={gs.stack} large />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === ACTIVE ===
  if (phase === "active") {
    const timerColor = secondsLeft <= 3 ? colors.danger : secondsLeft <= 5 ? colors.warning : colors.success;

    if (isHolder) {
      return (
        <SafeAreaView style={st.container}><GameHeader />
          <ScrollView contentContainerStyle={st.activeScroll}>
            <View style={[st.timerCircle, { borderColor: timerColor }]}>
              <Text style={[st.timerBig, { color: timerColor }]}>{secondsLeft}</Text>
            </View>
            <Text style={st.stackLabelLg}>YOUR TASKS</Text>
            <TaskStack stack={gs.stack} large />
            <TouchableOpacity style={st.doneBtn} onPress={handleDone} activeOpacity={0.7}>
              <Text style={st.doneBtnText}>DONE!</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.activeScroll}>
          <Text style={st.spectLabel}>{holderName} is performing!</Text>
          {isEliminated && <Text style={st.juryBadge}>JURY</Text>}
          <View style={[st.timerCircle, { borderColor: timerColor }]}>
            <Text style={[st.timerBig, { color: timerColor }]}>{secondsLeft}</Text>
          </View>
          <Text style={st.stackLabelLg}>TASKS</Text>
          <TaskStack stack={gs.stack} large />
          <Text style={st.voteLabel}>VOTE</Text>
          <View style={st.voteRow}>
            <TouchableOpacity
              style={[st.passBtn, myVote === "pass" && st.voteBtnActive]}
              onPress={() => handleVote("pass")} activeOpacity={0.7}
            >
              <Ionicons name="thumbs-up" size={24} color={myVote === "pass" ? colors.white : colors.success} />
              <Text style={[st.passBtnText, myVote === "pass" && { color: colors.white }]}>PASS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.failBtn, myVote === "fail" && st.voteBtnActiveFail]}
              onPress={() => handleVote("fail")} activeOpacity={0.7}
            >
              <Ionicons name="thumbs-down" size={24} color={myVote === "fail" ? colors.white : colors.danger} />
              <Text style={[st.failBtnText, myVote === "fail" && { color: colors.white }]}>FAIL</Text>
            </TouchableOpacity>
          </View>
          <Text style={st.voteCount}>{passCount} Pass {"\u00B7"} {failCount} Fail</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === JUDGING ===
  if (phase === "judging") {
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <View style={st.centered}>
          <Text style={st.judgingLabel}>{gs.timerExpired ? "TIME'S UP!" : `${holderName} is done!`}</Text>
          <Text style={st.judgingSubtext}>Tallying votes...</Text>
          <Text style={st.voteCount}>{passCount} Pass {"\u00B7"} {failCount} Fail</Text>
        </View>
      </SafeAreaView>
    );
  }

  // === RESOLVE ===
  if (phase === "resolve") {
    const isPassed = gs.verdict === "pass";
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <View style={st.centered}>
          <Ionicons name={isPassed ? "checkmark-circle" : "close-circle"} size={64} color={isPassed ? colors.success : colors.danger} />
          <Text style={st.resolveTitle}>{isPassed ? "PASS!" : "OUT!"}</Text>
          <Text style={st.resolveName}>{holderName}</Text>
          <Text style={st.resolveVotes}>
            {gs.passCount} Pass {"\u00B7"} {gs.failCount} Fail
            {gs.timerExpired ? " \u00B7 Timer expired" : ""}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // === GAME OVER ===
  if (phase === "game-over") {
    const winnerId = gs.winnerId;
    const winnerName = winnerId ? (playerMap[winnerId] ?? "???") : "???";
    const iWon = winnerId === myId;

    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.gameOverScroll}>
          <Ionicons name="trophy" size={56} color={colors.warning} />
          <Text style={st.gameOverTitle}>{iWon ? "YOU WIN!" : `${winnerName} WINS!`}</Text>
          <Text style={st.gameOverSub}>{gs.turnNumber} turns played</Text>

          <View style={st.eliminationCard}>
            <Text style={st.eliminationTitle}>ELIMINATION ORDER</Text>
            {gs.eliminationOrder.map((uid, i) => (
              <View key={uid} style={st.eliminationRow}>
                <Text style={st.eliminationNum}>#{gs.eliminationOrder.length - i}</Text>
                <Text style={st.eliminationName}>{playerMap[uid] ?? "?"}</Text>
                <Text style={st.eliminationTag}>OUT</Text>
              </View>
            ))}
            <View style={st.eliminationRow}>
              <Text style={[st.eliminationNum, { color: colors.gold }]}>#1</Text>
              <Text style={[st.eliminationName, { color: colors.gold }]}>{winnerName}</Text>
              <Ionicons name="trophy" size={16} color={colors.gold} />
            </View>
          </View>

          {isHost ? (
            <View style={{ gap: 10, width: "100%" }}>
              <TouchableOpacity style={st.primaryBtn} onPress={() => startGame("tenSecondTasks")} activeOpacity={0.7}>
                <Ionicons name="refresh" size={20} color={colors.white} />
                <Text style={st.primaryBtnText}>Play Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.secondaryBtn} onPress={handleBackToLobby} activeOpacity={0.7}>
                <Text style={st.secondaryBtnText}>Back to Lobby</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <HostWaitingPill label="Waiting for host..." />
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

const ORANGE = "#F97316";

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  loadingText: { fontFamily: fonts.medium, fontSize: 16, color: colors.gray400, marginTop: 16 },
  bigEmoji: { fontSize: 64, marginBottom: 16 },
  title: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white, marginBottom: 8 },
  tagline: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray400, marginBottom: 32, textAlign: "center" },
  wait: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray400, textAlign: "center" },

  introScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 24 },
  rulesBox: { width: "100%", marginBottom: 24 },
  ruleCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  ruleText: { fontFamily: fonts.regular, fontSize: 14, color: colors.white, lineHeight: 20 },
  warningCard: { backgroundColor: ORANGE + "22", borderRadius: 12, borderWidth: 1, borderColor: ORANGE, padding: 12, marginBottom: 16 },
  warningText: { fontFamily: fonts.bold, fontSize: 14, color: ORANGE, textAlign: "center" },

  // Countdown
  countdownScroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 12 },
  countdownLabel: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white },
  countdownNum: { fontFamily: fonts.extrabold, fontSize: 80, color: ORANGE },
  turnInfo: { fontFamily: fonts.medium, fontSize: 15, color: colors.gray400 },
  suddenDeathBadge: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.danger, letterSpacing: 3 },

  // Task stack
  stackLabelLg: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.gray400, letterSpacing: 1.5, alignSelf: "flex-start", marginTop: 4 },
  taskCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 14, width: "100%",
  },
  taskNumBadge: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  taskNumText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.white },
  taskText: { flex: 1, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  taskTextLg: { fontSize: 19, lineHeight: 26 },

  // Active
  activeScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 12, alignItems: "center" },
  spectLabel: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.white },
  juryBadge: { fontFamily: fonts.extrabold, fontSize: 11, color: colors.gray400, letterSpacing: 2, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  timerCircle: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, alignItems: "center", justifyContent: "center" },
  timerBig: { fontFamily: fonts.extrabold, fontSize: 36 },

  // Done
  doneBtn: { backgroundColor: colors.success, borderRadius: 16, paddingVertical: 20, width: "100%", alignItems: "center", marginTop: 8 },
  doneBtnText: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.white },

  // Voting
  voteLabel: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.gray500, letterSpacing: 2 },
  voteRow: { flexDirection: "row", gap: 12, width: "100%" },
  passBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.success + "18", borderWidth: 1.5, borderColor: colors.success, borderRadius: 14, paddingVertical: 18,
  },
  failBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.danger + "18", borderWidth: 1.5, borderColor: colors.danger, borderRadius: 14, paddingVertical: 18,
  },
  voteBtnActive: { backgroundColor: colors.success },
  voteBtnActiveFail: { backgroundColor: colors.danger },
  passBtnText: { fontFamily: fonts.bold, fontSize: 18, color: colors.success },
  failBtnText: { fontFamily: fonts.bold, fontSize: 18, color: colors.danger },
  voteCount: { fontFamily: fonts.medium, fontSize: 15, color: colors.gray400, textAlign: "center" },

  // Judging
  judgingLabel: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white },
  judgingSubtext: { fontFamily: fonts.medium, fontSize: 16, color: colors.gray400 },

  // Resolve
  resolveTitle: { fontFamily: fonts.extrabold, fontSize: 40, color: colors.white },
  resolveName: { fontFamily: fonts.bold, fontSize: 22, color: colors.gray400 },
  resolveVotes: { fontFamily: fonts.medium, fontSize: 15, color: colors.gray400 },

  // Game over
  gameOverScroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 20, paddingTop: 32, paddingBottom: 40, gap: 16 },
  gameOverTitle: { fontFamily: fonts.extrabold, fontSize: 32, color: colors.white },
  gameOverSub: { fontFamily: fonts.medium, fontSize: 16, color: colors.gray400 },
  eliminationCard: {
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.surfaceLight,
    padding: 16, gap: 8, width: "100%",
  },
  eliminationTitle: { fontFamily: fonts.extrabold, fontSize: 11, color: colors.gray500, letterSpacing: 2, marginBottom: 4 },
  eliminationRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  eliminationNum: { fontFamily: fonts.bold, fontSize: 14, color: colors.gray500, width: 28 },
  eliminationName: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  eliminationTag: { fontFamily: fonts.bold, fontSize: 11, color: colors.danger },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, width: "100%",
  },
  primaryBtnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  secondaryBtn: { alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.surfaceLight, width: "100%" },
  secondaryBtnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.gray400 },
});
