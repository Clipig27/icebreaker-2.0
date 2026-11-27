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
import { colors, fonts, radii, spacing, type } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { BLIND_SPOT_TASKS } from "../../src/data/blindSpot";
import { awardTrophies } from "../../src/utils/trophies";
import HostWaitingPill from "../../src/components/HostWaitingPill";
import GameHeader from "../../src/components/GameHeader";
import GameLoadingScreen from "../../src/components/GameLoadingScreen";
import PrimaryAction, { PrimaryActionBar } from "../../src/components/PrimaryAction";
import Eyebrow from "../../src/components/Eyebrow";
import Pill from "../../src/components/Pill";
import GradientCard from "../../src/components/GradientCard";
import PlayerAvatar from "../../src/components/PlayerAvatar";
// GameLogo not used yet — no PNG for blindSpot. Using text fallback.

// ---------------------------------------------------------------------------
// Game-specific color palette (dark teal/emerald — mysterious, spy-like)
// ---------------------------------------------------------------------------
const THEME = {
  bg: "#0F1A1A",
  card: "#162626",
  accent: "#4ECDC4",
  gold: "#F0C66A",
  accentSoft: "rgba(78,205,196,0.15)",
  accentBorder: "rgba(78,205,196,0.25)",
  cardBorder: "rgba(78,205,196,0.12)",
  surface: "#1A3030",
  surfaceLight: "#1F3838",
  danger: "#FF6B6B",
};

const HERO_GRADIENT = ["#4ECDC4", "#2E9E97", "#1A6B66"] as const;
const BTN_GRADIENT = ["#4ECDC4", "#3DBCB5", "#2E9E97"] as const;
const DANGER_GRADIENT = ["#FF6B6B", "#E05A5A", "#C74A4A"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase =
  | "intro"
  | "role-reveal"
  | "task-reveal"
  | "guiding"
  | "result-check"
  | "accusation"
  | "vote-reveal"
  | "scores"
  | "game-over";

type GameState = {
  phase: Phase;
  game: "blindSpot";
  round: number;
  totalRounds: number;
  blindPlayerId: string;
  saboteurId: string;
  taskText: string;
  guidingOrder: string[]; // speaking order (excludes blind player)
  currentGuideIdx: number;
  guideTimerEnd: number | null;
  guidingRound: number; // how many times around the circle (target: 2)
  taskSucceeded: boolean | null;
  blindPlayerGuess: string | null;
  scores: Record<string, number>;
  usedBlindPlayerIds: string[];
};

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

function pickRandomTask(): string {
  const idx = Math.floor(Math.random() * BLIND_SPOT_TASKS.length);
  return BLIND_SPOT_TASKS[idx].text;
}

// ---------------------------------------------------------------------------
// Timer hook
// ---------------------------------------------------------------------------

function useCountdown(timerEnd: number | null): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!timerEnd) return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [timerEnd]);
  if (!timerEnd) return 0;
  return Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BlindSpotScreen() {
  const router = useRouter();
  const { room, players, isHost, mutateGameState, endGame, startGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const [trophyDelta, setTrophyDelta] = useState(0);

  const gs: GameState | null = room?.game_state ?? null;
  const phase = gs?.phase ?? null;
  const myId = user?.id ?? "";

  const secondsLeft = useCountdown(gs?.guideTimerEnd ?? null);

  // Player map
  const playerMap: Record<string, string> = {};
  players.forEach((p) => { playerMap[p.user_id] = p.username; });

  const isBlind = gs?.blindPlayerId === myId;
  const isSaboteur = gs?.saboteurId === myId;
  const currentGuideId = gs?.guidingOrder?.[gs?.currentGuideIdx ?? 0];
  const currentGuideName = currentGuideId ? (playerMap[currentGuideId] ?? "Player") : "...";
  const isMyTurnToGuide = currentGuideId === myId;

  // -----------------------------------------------------------------------
  // Host: initialise
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || !room) return;
    if (gs && gs.game === "blindSpot" && gs.phase && (gs.phase as string) !== "starting") return;

    const allIds = players.map((p) => p.user_id);
    const totalRounds = Math.min(allIds.length, 5); // everyone gets a chance to be blind, max 5
    const blindPlayerId = allIds[Math.floor(Math.random() * allIds.length)];
    const otherIds = allIds.filter((id) => id !== blindPlayerId);
    const saboteurId = otherIds[Math.floor(Math.random() * otherIds.length)];
    const guidingOrder = shuffleArray(otherIds);

    const scores: Record<string, number> = {};
    allIds.forEach((id) => { scores[id] = 0; });

    const initialState: GameState = {
      phase: "intro",
      game: "blindSpot",
      round: 1,
      totalRounds,
      blindPlayerId,
      saboteurId,
      taskText: pickRandomTask(),
      guidingOrder,
      currentGuideIdx: 0,
      guideTimerEnd: null,
      guidingRound: 1,
      taskSucceeded: null,
      blindPlayerGuess: null,
      scores,
      usedBlindPlayerIds: [blindPlayerId],
    };
    mutateGameState((cur) => {
      if (cur?.phase && cur.phase !== "starting") return null;
      return initialState;
    });
  }, [isHost, room?.id, gs?.phase === "starting"]);

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
    // Find winner
    const sortedScores = Object.entries(gs.scores).sort((a, b) => b[1] - a[1]);
    const winnerId = sortedScores.length > 0 ? sortedScores[0][0] : null;
    if (winnerId === myId) useAuthStore.getState().incrementWins();
    if (winnerId) awardTrophies(winnerId, "blindSpot").then((d) => setTrophyDelta(d));
  }, [phase]);

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

  // -----------------------------------------------------------------------
  // Host: auto-advance guide timer
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || !gs || gs.phase !== "guiding" || !gs.guideTimerEnd) return;
    if (Date.now() < gs.guideTimerEnd) return;

    // Timer expired — advance to next guide
    advanceGuide();
  }, [isHost, gs?.phase, gs?.guideTimerEnd, secondsLeft]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const startFromIntro = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "intro") return null;
      return { ...cur, phase: "role-reveal" as Phase };
    });
  }, [mutateGameState]);

  const advanceFromRoleReveal = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "role-reveal") return null;
      return { ...cur, phase: "task-reveal" as Phase };
    });
  }, [mutateGameState]);

  const advanceFromTaskReveal = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "task-reveal") return null;
      return {
        ...cur,
        phase: "guiding" as Phase,
        currentGuideIdx: 0,
        guidingRound: 1,
        guideTimerEnd: Date.now() + 10000,
      };
    });
  }, [mutateGameState]);

  const handleDoneSpeaking = useCallback(async () => {
    await advanceGuide();
  }, []);

  const advanceGuide = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "guiding") return null;
      const nextIdx = cur.currentGuideIdx + 1;
      if (nextIdx < cur.guidingOrder.length) {
        // Next person in this round
        return {
          ...cur,
          currentGuideIdx: nextIdx,
          guideTimerEnd: Date.now() + 10000,
        };
      }
      // End of this round of guiding
      const nextGuidingRound = cur.guidingRound + 1;
      if (nextGuidingRound <= 2) {
        // Start another round
        return {
          ...cur,
          currentGuideIdx: 0,
          guidingRound: nextGuidingRound,
          guideTimerEnd: Date.now() + 10000,
        };
      }
      // All guiding done — go to result-check
      return {
        ...cur,
        phase: "result-check" as Phase,
        guideTimerEnd: null,
      };
    });
  }, [mutateGameState]);

  const handleResultCheck = useCallback(async (succeeded: boolean) => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "result-check") return null;
      return {
        ...cur,
        phase: "accusation" as Phase,
        taskSucceeded: succeeded,
      };
    });
  }, [mutateGameState]);

  const handleAccusation = useCallback(async (accusedId: string) => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "accusation") return null;
      if (cur.blindPlayerId !== myId) return null; // only blind player
      return {
        ...cur,
        blindPlayerGuess: accusedId,
        phase: "vote-reveal" as Phase,
      };
    });
  }, [myId, mutateGameState]);

  const advanceFromVoteReveal = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "vote-reveal") return null;
      const newScores = { ...cur.scores };
      const correctGuess = cur.blindPlayerGuess === cur.saboteurId;

      if (correctGuess) {
        // Blind player gets 3 points
        newScores[cur.blindPlayerId] = (newScores[cur.blindPlayerId] ?? 0) + 3;
      } else {
        // Saboteur gets 3 points (or 5 if task failed too)
        const sabBonus = cur.taskSucceeded ? 3 : 5;
        newScores[cur.saboteurId] = (newScores[cur.saboteurId] ?? 0) + sabBonus;
      }

      // If task succeeded despite sabotage, all guides get 1 bonus
      if (cur.taskSucceeded) {
        for (const gId of cur.guidingOrder) {
          if (gId !== cur.saboteurId) {
            newScores[gId] = (newScores[gId] ?? 0) + 1;
          }
        }
      }

      return {
        ...cur,
        scores: newScores,
        phase: "scores" as Phase,
      };
    });
  }, [mutateGameState]);

  const advanceToNextRound = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "scores") return null;
      if (cur.round >= cur.totalRounds) {
        return { ...cur, phase: "game-over" as Phase };
      }
      // Pick new blind player (hasn't been blind yet)
      const allIds = Object.keys(cur.scores);
      const available = allIds.filter((id) => !cur.usedBlindPlayerIds.includes(id));
      const pool = available.length > 0 ? available : allIds;
      const blindPlayerId = pool[Math.floor(Math.random() * pool.length)];
      const otherIds = allIds.filter((id) => id !== blindPlayerId);
      const saboteurId = otherIds[Math.floor(Math.random() * otherIds.length)];

      return {
        ...cur,
        phase: "role-reveal" as Phase,
        round: cur.round + 1,
        blindPlayerId,
        saboteurId,
        taskText: pickRandomTask(),
        guidingOrder: shuffleArray(otherIds),
        currentGuideIdx: 0,
        guideTimerEnd: null,
        guidingRound: 1,
        taskSucceeded: null,
        blindPlayerGuess: null,
        usedBlindPlayerIds: [...cur.usedBlindPlayerIds, blindPlayerId],
      };
    });
  }, [mutateGameState]);

  const handleBackToLobby = useCallback(async () => {
    await endGame();
  }, [endGame]);

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (!gs || (gs.game as string) !== "blindSpot" || !phase || (phase as string) === "starting") {
    return <GameLoadingScreen name="Blind Spot" icon="eye-off" color="#4ECDC4" />;
  }

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------
  const sortedScores = Object.entries(gs.scores)
    .map(([id, score]) => ({ id, name: playerMap[id] ?? "?", score }))
    .sort((a, b) => b.score - a.score);
  const winnerId = sortedScores.length > 0 ? sortedScores[0].id : null;

  // === INTRO ===
  if (phase === "intro") {
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Start Game" icon="play" onPress={startFromIntro} accentColor={THEME.accent} />
          ) : (
            <WaitingNote label="Waiting for host to start..." />
          )
        }
      >
        <ScreenTitle title="Blind Spot" subtitle="Find the saboteur among your guides" />
        <GradientCard fill={HERO_GRADIENT} borderColors={HERO_BORDER} contentStyle={st.heroContent}>
          <View style={st.heroCopy}>
            <Eyebrow tone="dark">deception + teamwork</Eyebrow>
            <Text style={st.heroTitle}>One is blind. One is lying.</Text>
          </View>
          <Text style={st.heroEmoji}>{"\uD83D\uDD75\uFE0F"}</Text>
        </GradientCard>

        <View style={st.list}>
          <RuleRow emoji={"\uD83D\uDE48"} text="One player closes their eyes — they're the Blind player." />
          <RuleRow emoji={"\uD83D\uDDE3\uFE0F"} text="Everyone else gives voice instructions to help them complete a task." />
          <RuleRow emoji={"\uD83E\uDDB9"} text="But ONE person is secretly the Saboteur, giving bad instructions." />
          <RuleRow emoji={"\uD83D\uDD0D"} text="The Blind player guesses who the Saboteur was." />
          <RuleRow emoji={"\uD83C\uDFC6"} text="Correct guess = 3 points. Fooled = Saboteur scores big." />
        </View>

        <View style={st.metaRow}>
          <Pill color={THEME.accent} label={`${gs.totalRounds} rounds`} />
          <Pill color={THEME.accent} label={`${players.length} players`} />
        </View>
      </Shell>
    );
  }

  // === ROLE REVEAL ===
  const [roleRevealed, setRoleRevealed] = useState(false);

  // Reset reveal state when phase changes
  useEffect(() => {
    if (phase === "role-reveal") setRoleRevealed(false);
  }, [phase]);

  if (phase === "role-reveal") {
    let roleTitle = "";
    let roleDesc = "";
    let roleColor = THEME.accent;
    let roleEmoji = "";

    if (isBlind) {
      roleTitle = "YOU'RE BLIND";
      roleDesc = "Close your eyes and put your phone face down. Listen for instructions.";
      roleColor = THEME.gold;
      roleEmoji = "\uD83D\uDE48";
    } else if (isSaboteur) {
      roleTitle = "YOU'RE THE SABOTEUR";
      roleDesc = "Give bad instructions — but be subtle! Don't get caught.";
      roleColor = THEME.danger;
      roleEmoji = "\uD83E\uDDB9";
    } else {
      const saboteurName = playerMap[gs.saboteurId] ?? "???";
      roleTitle = "YOU'RE A GUIDE";
      roleDesc = `Help them complete the task! The saboteur is: ${saboteurName}`;
      roleColor = THEME.accent;
      roleEmoji = "\uD83D\uDDE3\uFE0F";
    }

    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Everyone Ready" icon="arrow-forward" onPress={advanceFromRoleReveal} accentColor={THEME.accent} />
          ) : (
            <WaitingNote label="Waiting for host..." />
          )
        }
      >
        <ScreenTitle title="Your Role" subtitle={`Round ${gs.round} of ${gs.totalRounds}`} />

        {!roleRevealed ? (
          <>
            <GradientCard radius={radii.lg} contentStyle={st.hiddenRoleCard}>
              <Ionicons name="lock-closed" size={36} color={THEME.accent} />
              <Text style={st.hiddenRoleText}>Your role is hidden</Text>
              <Text style={st.hiddenRoleSub}>Make sure no one else can see your screen</Text>
            </GradientCard>
            <Pressable
              style={({ pressed }) => [st.revealBtn, pressed && { opacity: 0.8 }]}
              onPress={() => setRoleRevealed(true)}
            >
              <Ionicons name="eye" size={18} color={THEME.bg} />
              <Text style={st.revealBtnText}>Reveal My Role</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={st.roleCard}>
              <Text style={st.roleEmoji}>{roleEmoji}</Text>
              <Text style={[st.roleTitle, { color: roleColor }]}>{roleTitle}</Text>
              <Text style={st.roleDesc}>{roleDesc}</Text>
            </View>

            {!isBlind && (
              <>
                <GradientCard radius={radii.lg} contentStyle={st.infoRow}>
                  <Ionicons name="eye-off" size={20} color={THEME.accent} />
                  <Text style={st.infoText}>
                    {playerMap[gs.blindPlayerId] ?? "?"} is the Blind player this round.
                  </Text>
                </GradientCard>

                <GradientCard radius={radii.lg} borderColors={[THEME.danger + "60", THEME.danger + "20"]} contentStyle={st.warningRow}>
                  <Ionicons name="warning" size={20} color={THEME.danger} />
                  <Text style={st.warningText}>
                    DO NOT say what the task is! Only give step-by-step instructions.
                  </Text>
                </GradientCard>
              </>
            )}
          </>
        )}
      </Shell>
    );
  }

  // === TASK REVEAL ===
  if (phase === "task-reveal") {
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Start Guiding" icon="mic" onPress={advanceFromTaskReveal} accentColor={THEME.accent} />
          ) : (
            <WaitingNote label="Waiting for host..." />
          )
        }
      >
        <ScreenTitle title="The Task" subtitle={`Round ${gs.round} of ${gs.totalRounds}`} />

        {isBlind ? (
          <View style={st.blindCard}>
            <Text style={st.blindEmoji}>{"\uD83D\uDE48"}</Text>
            <Text style={st.blindTitle}>Keep your eyes closed!</Text>
            <Text style={st.blindSubtitle}>Listen for instructions from your guides.</Text>
          </View>
        ) : (
          <>
            <GradientCard fill={HERO_GRADIENT} borderColors={HERO_BORDER} contentStyle={st.taskCard}>
              <Eyebrow tone="dark">THE TASK</Eyebrow>
              <Text style={st.taskText}>{gs.taskText}</Text>
            </GradientCard>
            <GradientCard radius={radii.lg} contentStyle={st.infoRow}>
              <Ionicons name="alert-circle" size={20} color={THEME.gold} />
              <Text style={st.infoText}>
                {isSaboteur
                  ? "Give WRONG instructions. Be subtle!"
                  : "Help them complete this task with your voice."}
              </Text>
            </GradientCard>

            <GradientCard radius={radii.lg} borderColors={[THEME.danger + "60", THEME.danger + "20"]} contentStyle={st.warningRow}>
              <Ionicons name="warning" size={20} color={THEME.danger} />
              <Text style={st.warningText}>
                DO NOT say what the task is! Only give step-by-step instructions. Never reveal the goal.
              </Text>
            </GradientCard>
          </>
        )}
      </Shell>
    );
  }

  // === GUIDING ===
  if (phase === "guiding") {
    const totalGuides = gs.guidingOrder.length;
    const currentGuideNumber = gs.currentGuideIdx + 1;
    const progressText = `Guide ${currentGuideNumber}/${totalGuides} (Round ${gs.guidingRound}/2)`;

    return (
      <Shell
        footer={
          isMyTurnToGuide ? (
            <PrimaryAction label="Done Speaking" icon="checkmark" onPress={handleDoneSpeaking} accentColor={THEME.accent} />
          ) : isHost && !isMyTurnToGuide ? (
            <PrimaryAction label="Skip (Host)" icon="play-skip-forward" variant="ghost" onPress={handleDoneSpeaking} />
          ) : null
        }
      >
        <ScreenTitle title="Guiding Phase" subtitle={progressText} />

        {/* Timer */}
        <View style={st.countdown}>
          <Text style={st.countdownNum}>{secondsLeft}</Text>
          <View style={st.progressTrack}>
            <View
              style={[
                st.progressFill,
                st.progressFillAccent,
                { width: `${Math.min(100, (secondsLeft / 10) * 100)}%` },
              ]}
            />
          </View>
        </View>

        {/* Who's speaking */}
        {isBlind ? (
          <View style={st.blindCard}>
            <Text style={st.blindEmoji}>{"\uD83D\uDC42"}</Text>
            <Text style={st.blindTitle}>Listening...</Text>
            <Text style={st.blindSubtitle}>{currentGuideName} is giving an instruction</Text>
          </View>
        ) : isMyTurnToGuide ? (
          <GradientCard fill={HERO_GRADIENT} borderColors={HERO_BORDER} contentStyle={st.speakCard}>
            <Ionicons name="mic" size={32} color="#fff" />
            <Text style={st.speakTitle}>YOUR TURN</Text>
            <Text style={st.speakSubtitle}>Speak now! Give your instruction.</Text>
            {isSaboteur && (
              <View style={st.saboteurHint}>
                <Ionicons name="warning" size={14} color={THEME.danger} />
                <Text style={st.saboteurHintText}>Remember: give BAD instructions subtly!</Text>
              </View>
            )}
          </GradientCard>
        ) : (
          <GradientCard radius={radii.lg} contentStyle={st.listeningCard}>
            <PlayerAvatar username={currentGuideName} size={48} />
            <View style={{ flex: 1 }}>
              <Eyebrow>SPEAKING NOW</Eyebrow>
              <Text style={st.listeningName}>{currentGuideName}</Text>
            </View>
          </GradientCard>
        )}

        {/* Speaking order */}
        <Eyebrow style={{ marginTop: spacing.lg }}>SPEAKING ORDER</Eyebrow>
        <View style={st.list}>
          {gs.guidingOrder.map((id, i) => {
            const isCurrent = i === gs.currentGuideIdx;
            const isDone = i < gs.currentGuideIdx || (gs.guidingRound > 1 && i < gs.currentGuideIdx);
            return (
              <GradientCard
                key={id}
                radius={radii.lg}
                contentStyle={[st.orderRow, isCurrent && st.orderRowActive]}
              >
                <View style={[st.orderNumber, isCurrent && st.orderNumberActive]}>
                  <Text style={[st.orderNumberText, isCurrent && st.orderNumberTextActive]}>
                    {i + 1}
                  </Text>
                </View>
                <Text style={[st.orderName, isCurrent && st.orderNameActive]} numberOfLines={1}>
                  {playerMap[id] ?? "?"}
                </Text>
                {isCurrent && <Ionicons name="mic" size={18} color={THEME.accent} />}
                {isDone && gs.guidingRound === 1 && i < gs.currentGuideIdx && (
                  <Ionicons name="checkmark-circle" size={18} color={THEME.accent} />
                )}
              </GradientCard>
            );
          })}
        </View>
      </Shell>
    );
  }

  // === RESULT CHECK ===
  if (phase === "result-check") {
    return (
      <Shell
        footer={
          isHost ? (
            <View style={st.footerStack}>
              <PrimaryAction label="Yes, they did it!" icon="checkmark-circle" onPress={() => handleResultCheck(true)} accentColor={THEME.accent} />
              <PrimaryAction label="No, they failed" icon="close-circle" variant="ghost" onPress={() => handleResultCheck(false)} />
            </View>
          ) : (
            <WaitingNote label="Checking the result..." />
          )
        }
      >
        <ScreenTitle title="Result Check" subtitle={`Round ${gs.round}`} />
        {isHost ? (
          <GradientCard fill={HERO_GRADIENT} borderColors={HERO_BORDER} contentStyle={st.taskCard}>
            <Eyebrow tone="dark">THE TASK WAS</Eyebrow>
            <Text style={st.taskText}>{gs.taskText}</Text>
            <Text style={st.taskMeta}>Did {playerMap[gs.blindPlayerId] ?? "?"} complete it?</Text>
          </GradientCard>
        ) : (
          <View style={st.blindCard}>
            <Text style={st.blindEmoji}>{"\uD83E\uDD14"}</Text>
            <Text style={st.blindTitle}>Checking the result...</Text>
            <Text style={st.blindSubtitle}>The host is deciding if the task was completed.</Text>
          </View>
        )}
      </Shell>
    );
  }

  // === ACCUSATION ===
  if (phase === "accusation") {
    const otherPlayers = players.filter((p) => p.user_id !== gs.blindPlayerId);

    if (isBlind) {
      return (
        <Shell>
          <ScreenTitle title="Who's the Saboteur?" subtitle="Open your eyes! Make your accusation." />
          <GradientCard radius={radii.lg} contentStyle={st.accuseInfo}>
            <Ionicons name="eye" size={24} color={THEME.accent} />
            <Text style={st.accuseInfoText}>
              {gs.taskSucceeded ? "The task was completed!" : "The task was NOT completed."}
              {" "}Tap the person you think was the Saboteur.
            </Text>
          </GradientCard>
          <View style={st.list}>
            {otherPlayers.map((p) => (
              <Pressable
                key={p.user_id}
                onPress={() => handleAccusation(p.user_id)}
                style={({ pressed }) => [pressed && st.pressed]}
              >
                <GradientCard radius={radii.lg} contentStyle={st.accuseRow}>
                  <PlayerAvatar username={p.username} size={40} />
                  <Text style={st.accuseName} numberOfLines={1}>{p.username}</Text>
                  <Ionicons name="alert-circle" size={22} color={THEME.danger} />
                </GradientCard>
              </Pressable>
            ))}
          </View>
        </Shell>
      );
    }

    return (
      <Shell>
        <ScreenTitle title="Accusation Time" subtitle="The blind player is choosing..." />
        <View style={st.blindCard}>
          <Text style={st.blindEmoji}>{"\uD83D\uDD0D"}</Text>
          <Text style={st.blindTitle}>{playerMap[gs.blindPlayerId] ?? "?"} is making their accusation...</Text>
          <Text style={st.blindSubtitle}>
            {isSaboteur ? "Will they catch you?" : "Did you help enough?"}
          </Text>
        </View>
      </Shell>
    );
  }

  // === VOTE REVEAL ===
  if (phase === "vote-reveal") {
    const accusedName = gs.blindPlayerGuess ? (playerMap[gs.blindPlayerGuess] ?? "?") : "?";
    const saboteurName = playerMap[gs.saboteurId] ?? "?";
    const blindName = playerMap[gs.blindPlayerId] ?? "?";
    const correctGuess = gs.blindPlayerGuess === gs.saboteurId;

    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="See Scores" icon="podium" onPress={advanceFromVoteReveal} accentColor={THEME.accent} />
          ) : (
            <WaitingNote label="Waiting for host..." />
          )
        }
      >
        <ScreenTitle
          title={correctGuess ? "CAUGHT!" : "FOOLED!"}
          subtitle={correctGuess
            ? `${blindName} found the Saboteur!`
            : `${saboteurName} got away with it!`
          }
        />

        {/* Accusation */}
        <GradientCard radius={radii.lg} contentStyle={st.revealRow}>
          <PlayerAvatar username={blindName} size={40} />
          <View style={{ flex: 1 }}>
            <Eyebrow>{blindName} accused</Eyebrow>
            <Text style={st.revealName}>{accusedName}</Text>
          </View>
          {correctGuess ? (
            <Ionicons name="checkmark-circle" size={28} color={THEME.accent} />
          ) : (
            <Ionicons name="close-circle" size={28} color={THEME.danger} />
          )}
        </GradientCard>

        {/* Actual Saboteur */}
        <GradientCard
          fill={correctGuess ? HERO_GRADIENT : DANGER_GRADIENT}
          borderColors={HERO_BORDER}
          contentStyle={st.revealRow}
        >
          <PlayerAvatar username={saboteurName} size={40} />
          <View style={{ flex: 1 }}>
            <Eyebrow tone="dark">THE SABOTEUR WAS</Eyebrow>
            <Text style={[st.revealName, { color: "#fff" }]}>{saboteurName}</Text>
          </View>
          <Text style={{ fontSize: 32 }}>{"\uD83E\uDDB9"}</Text>
        </GradientCard>

        {/* Task result */}
        <GradientCard radius={radii.lg} contentStyle={st.infoRow}>
          <Ionicons
            name={gs.taskSucceeded ? "checkmark-circle" : "close-circle"}
            size={22}
            color={gs.taskSucceeded ? THEME.accent : THEME.danger}
          />
          <Text style={st.infoText}>
            Task {gs.taskSucceeded ? "completed" : "failed"}!
            {gs.taskSucceeded && !correctGuess && " Saboteur still scored!"}
            {gs.taskSucceeded && correctGuess && " Guides earn a bonus point."}
            {!gs.taskSucceeded && !correctGuess && " Saboteur earns 5 points!"}
          </Text>
        </GradientCard>
      </Shell>
    );
  }

  // === SCORES ===
  if (phase === "scores") {
    const isLastRound = gs.round >= gs.totalRounds;
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction
              label={isLastRound ? "Final Results" : "Next Round"}
              icon={isLastRound ? "trophy" : "arrow-forward"}
              onPress={isLastRound ? advanceToNextRound : advanceToNextRound}
              accentColor={THEME.accent}
            />
          ) : (
            <WaitingNote label="Waiting for host..." />
          )
        }
      >
        <ScreenTitle title="Leaderboard" subtitle={`After round ${gs.round} of ${gs.totalRounds}`} />
        <View style={st.list}>
          {sortedScores.map((entry, i) => (
            <GradientCard
              key={entry.id}
              radius={radii.lg}
              contentStyle={st.scoreRow}
              {...(i === 0 ? { fill: HERO_GRADIENT, borderColors: HERO_BORDER } : {})}
            >
              <View style={[st.rankTile, i === 0 && st.rankTileHero]}>
                <Text style={[st.rankText, i === 0 && st.rankTextHero]}>{i + 1}</Text>
              </View>
              <PlayerAvatar username={entry.name} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[st.scoreName, i === 0 && { color: "#fff" }]} numberOfLines={1}>
                  {entry.name}
                </Text>
              </View>
              <Pill
                tone={i === 0 ? "peach" : "peach"}
                label={`${entry.score} pts`}
              />
            </GradientCard>
          ))}
        </View>
      </Shell>
    );
  }

  // === GAME OVER ===
  if (phase === "game-over") {
    const winner = sortedScores[0];
    const iWon = winner?.id === myId;

    return (
      <Shell
        footer={
          isHost ? (
            <View style={st.footerStack}>
              <PrimaryAction
                label="Play Again"
                icon="refresh"
                iconPosition="left"
                onPress={() => startGame("blindSpot")}
                accentColor={THEME.accent}
              />
              <PrimaryAction label="Back to Lobby" variant="ghost" onPress={handleBackToLobby} />
            </View>
          ) : (
            <View style={st.centerRow}>
              <HostWaitingPill label="Waiting for host..." />
            </View>
          )
        }
      >
        <ScreenTitle title={iWon ? "YOU WIN!" : `${winner?.name ?? "?"} WINS!`} subtitle="Final results" />
        {winner && (
          <GradientCard fill={HERO_GRADIENT} borderColors={HERO_BORDER} contentStyle={st.winnerContent}>
            <View style={[st.rankTile, st.rankTileHero]}>
              <Text style={[st.rankText, st.rankTextHero]}>1</Text>
            </View>
            <PlayerAvatar username={winner.name} size={48} />
            <View style={{ flex: 1 }}>
              <Eyebrow tone="dark">Winner</Eyebrow>
              <Text style={st.winnerName} numberOfLines={1}>{winner.name}</Text>
            </View>
            <Ionicons name="trophy" size={30} color={colors.onPrimary} />
          </GradientCard>
        )}
        {trophyDelta !== 0 && (
          <Text style={trophyDelta > 0 ? st.trophyGain : st.trophyLoss}>
            {trophyDelta > 0 ? `\uD83C\uDFC6 +${trophyDelta} trophies!` : `\uD83C\uDFC6 -1 trophy`}
          </Text>
        )}

        <Eyebrow style={{ marginTop: spacing.lg }}>FINAL STANDINGS</Eyebrow>
        <View style={st.list}>
          {sortedScores.map((entry, i) => (
            <GradientCard key={entry.id} radius={radii.lg} contentStyle={st.scoreRow}>
              <View style={st.rankTile}>
                <Text style={st.rankText}>{i + 1}</Text>
              </View>
              <PlayerAvatar username={entry.name} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={st.scoreName} numberOfLines={1}>{entry.name}</Text>
              </View>
              <Pill color={THEME.accent} label={`${entry.score} pts`} />
            </GradientCard>
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

/** Screen frame: background, room toolbar, scrolling body and pinned footer. */
function Shell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <SafeAreaView style={st.container} edges={["top", "left", "right"]}>
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
        <Text style={st.fallbackTitle}>{title}</Text>
        {pill ? <Pill color={THEME.accent} label={pill} /> : null}
      </View>
      {subtitle ? <Text style={type.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function WaitingNote({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <View style={st.waiting}>
      {done ? (
        <Ionicons name="checkmark-circle" size={18} color={THEME.accent} />
      ) : (
        <ActivityIndicator size="small" color={THEME.accent} />
      )}
      <Text style={st.waitingText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function RuleRow({ emoji, text }: { emoji: string; text: string }) {
  return (
    <GradientCard radius={radii.lg} contentStyle={st.ruleRow}>
      <View style={st.ruleIcon}>
        <Text style={st.ruleEmoji}>{emoji}</Text>
      </View>
      <Text style={st.ruleText}>{text}</Text>
    </GradientCard>
  );
}

// ---------------------------------------------------------------------------
// StyleSheet
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
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
  metaRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },

  // Title block
  titleBlock: { gap: spacing.sm },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  fallbackTitle: { fontFamily: fonts.extrabold, fontSize: 28, color: THEME.accent },

  // Waiting note (footer)
  waiting: {
    minHeight: 56,
    borderRadius: radii.pill,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  waitingText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.gray300 },

  // Hero card
  heroContent: { flexDirection: "row", alignItems: "center", padding: 22, gap: spacing.md },
  heroCopy: { flex: 1, gap: 6 },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 29, color: colors.onPrimary },
  heroEmoji: { fontSize: 56 },

  // Rules
  ruleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  ruleIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: THEME.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  ruleEmoji: { fontSize: 20 },
  ruleText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.white },

  // Role reveal
  roleCard: {
    backgroundColor: THEME.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 32,
    alignItems: "center",
    gap: 16,
  },
  roleEmoji: { fontSize: 64 },
  roleTitle: { fontFamily: fonts.extrabold, fontSize: 28, textAlign: "center" },
  roleDesc: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: colors.gray300, textAlign: "center" },

  // Hidden role
  hiddenRoleCard: {
    padding: 40,
    alignItems: "center",
    gap: 14,
  },
  hiddenRoleText: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.white,
  },
  hiddenRoleSub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray400,
    textAlign: "center",
  },
  revealBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radii.lg,
    alignSelf: "stretch",
  },
  revealBtnText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: THEME.bg,
  },

  // Warning row
  warningRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg },
  warningText: { flex: 1, fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: THEME.danger },

  // Info row
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg },
  infoText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.gray300 },

  // Task card
  taskCard: { padding: 22, gap: spacing.md },
  taskText: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 31, color: colors.onPrimary },
  taskMeta: { fontFamily: fonts.medium, fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 4 },

  // Blind card
  blindCard: {
    backgroundColor: THEME.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  blindEmoji: { fontSize: 56 },
  blindTitle: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.white, textAlign: "center" },
  blindSubtitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.gray400, textAlign: "center" },

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
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginTop: spacing.md,
  },
  progressFill: { height: "100%", borderRadius: radii.pill },
  progressFillAccent: { backgroundColor: THEME.accent },

  // Speaking card
  speakCard: { padding: 24, alignItems: "center", gap: 12 },
  speakTitle: { fontFamily: fonts.extrabold, fontSize: 28, color: "#fff" },
  speakSubtitle: { fontFamily: fonts.medium, fontSize: 16, color: "rgba(255,255,255,0.8)" },
  saboteurHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,107,107,0.15)",
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  saboteurHintText: { fontFamily: fonts.semibold, fontSize: 13, color: THEME.danger },

  // Listening card
  listeningCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: spacing.lg },
  listeningName: { fontFamily: fonts.bold, fontSize: 18, color: colors.white },

  // Order row
  orderRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  orderRowActive: { borderColor: THEME.accent, borderWidth: 1 },
  orderNumber: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: THEME.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  orderNumberActive: { backgroundColor: THEME.accent },
  orderNumberText: { fontFamily: fonts.bold, fontSize: 13, color: THEME.accent },
  orderNumberTextActive: { color: "#fff" },
  orderName: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.gray300 },
  orderNameActive: { color: colors.white },

  // Accusation
  accuseInfo: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg },
  accuseInfoText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.gray300 },
  accuseRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: spacing.lg },
  accuseName: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.white },

  // Reveal
  revealRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: spacing.lg },
  revealName: { fontFamily: fonts.bold, fontSize: 18, color: colors.white },

  // Scores
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  scoreName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  rankTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: THEME.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rankTileHero: { backgroundColor: "rgba(255,255,255,0.2)" },
  rankText: { fontFamily: fonts.bold, fontSize: 14, color: THEME.accent },
  rankTextHero: { color: "#fff" },

  // Winner
  winnerContent: { flexDirection: "row", alignItems: "center", padding: 22, gap: spacing.md },
  winnerName: { fontFamily: fonts.extrabold, fontSize: 20, color: "#fff" },
  trophyGain: { fontFamily: fonts.bold, fontSize: 16, color: THEME.gold, textAlign: "center" },
  trophyLoss: { fontFamily: fonts.bold, fontSize: 16, color: THEME.danger, textAlign: "center" },
});
