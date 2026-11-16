import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { TALENT_SHOW_PROMPTS } from "../../src/data/talentShow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "intro" | "answering" | "reveal" | "round-end" | "game-over";

type GameState = {
  phase: Phase;
  game: "talentShow";
  round: number;
  totalRounds: number;
  prompt: string;
  promptIndices: number[]; // pre-selected prompt indices for all rounds
  answers: Record<string, string>; // userId -> answer
  scores: Record<string, number>; // cumulative userId -> score
  duplicates: string[]; // userIds whose answer was a duplicate this round
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOTAL_ROUNDS = 5;
const TIMER_SECONDS = 30;

/** Pick N unique random indices from the prompt list */
function pickRandomIndices(count: number, max: number): number[] {
  const indices = new Set<number>();
  while (indices.size < count && indices.size < max) {
    indices.add(Math.floor(Math.random() * max));
  }
  return Array.from(indices);
}

/** Detect which userIds submitted duplicate answers */
function findDuplicateUserIds(answers: Record<string, string>): string[] {
  const normalized: Record<string, string[]> = {};
  for (const [userId, answer] of Object.entries(answers)) {
    const key = answer.trim().toLowerCase();
    if (!key) continue;
    if (!normalized[key]) normalized[key] = [];
    normalized[key].push(userId);
  }
  const dupes: string[] = [];
  for (const userIds of Object.values(normalized)) {
    if (userIds.length > 1) dupes.push(...userIds);
  }
  return dupes;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TalentShowScreen() {
  const router = useRouter();
  const { room, players, isHost, updateGameState, mutateGameState, endGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const gs: GameState | null = room?.game_state ?? null;
  const phase = gs?.phase ?? null;
  const myId = user?.id ?? "";

  // -----------------------------------------------------------------------
  // Host: initialise game on mount if no state yet
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || !room) return;
    if (gs && gs.game === "talentShow" && gs.phase && (gs.phase as string) !== "starting") return; // already initialised

    const indices = pickRandomIndices(TOTAL_ROUNDS, TALENT_SHOW_PROMPTS.length);
    const initialState: GameState = {
      phase: "intro",
      game: "talentShow",
      round: 1,
      totalRounds: TOTAL_ROUNDS,
      prompt: TALENT_SHOW_PROMPTS[indices[0]],
      promptIndices: indices,
      answers: {},
      scores: Object.fromEntries(players.map((p) => [p.user_id, 0])),
      duplicates: [],
    };
    updateGameState(initialState);
  }, [isHost, room?.id]);

  // -----------------------------------------------------------------------
  // Reset local state when round / phase changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase === "answering") {
      setAnswer("");
      setSubmitted(false);
      setTimeLeft(TIMER_SECONDS);
    }
  }, [phase, gs?.round]);

  // -----------------------------------------------------------------------
  // Timer (local countdown during answering phase)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "answering") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Auto-submit empty if not yet submitted
          if (!submitted) {
            handleSubmit("");
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, gs?.round]);

  // -----------------------------------------------------------------------
  // Host: auto-advance from answering -> reveal when all answered
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || phase !== "answering" || !gs) return;
    const totalPlayers = players.length;
    const totalAnswered = Object.keys(gs.answers).length;
    if (totalPlayers > 0 && totalAnswered >= totalPlayers) {
      advanceToReveal();
    }
  }, [gs?.answers, players.length, phase, isHost]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (overrideAnswer?: string) => {
      if (submitted || !gs || !myId) return;
      setSubmitted(true);

      const finalAnswer = (overrideAnswer ?? answer).trim();
      const answerRound = gs.round;
      // Merge only our own answer into the fresh server state (no lost updates)
      await mutateGameState((cur) => {
        if (!cur || cur.phase !== "answering" || cur.round !== answerRound) return null;
        const curAnswers = cur.answers ?? {};
        if (curAnswers[myId] !== undefined) return null;
        return { ...cur, answers: { ...curAnswers, [myId]: finalAnswer } };
      });
    },
    [submitted, gs, myId, answer, mutateGameState]
  );

  /** Host: move from answering -> reveal */
  const advanceToReveal = useCallback(async () => {
    if (!gs) return;
    const dupes = findDuplicateUserIds(gs.answers);
    // Calculate round scores
    const roundScores: Record<string, number> = {};
    for (const uid of Object.keys(gs.answers)) {
      roundScores[uid] = dupes.includes(uid) ? 0 : 1;
    }
    // Add to cumulative
    const newScores = { ...gs.scores };
    for (const [uid, pts] of Object.entries(roundScores)) {
      newScores[uid] = (newScores[uid] ?? 0) + pts;
    }
    await updateGameState({
      ...gs,
      phase: "reveal" as Phase,
      duplicates: dupes,
      scores: newScores,
    });
  }, [gs, updateGameState]);

  /** Host: move from reveal -> round-end */
  const advanceToRoundEnd = useCallback(async () => {
    if (!gs) return;
    await updateGameState({ ...gs, phase: "round-end" as Phase });
  }, [gs, updateGameState]);

  /** Host: move from round-end -> next round or game-over */
  const advanceToNextRound = useCallback(async () => {
    if (!gs) return;
    if (gs.round >= gs.totalRounds) {
      await updateGameState({ ...gs, phase: "game-over" as Phase });
      return;
    }
    const nextRound = gs.round + 1;
    const nextPromptIndex = gs.promptIndices[nextRound - 1];
    await updateGameState({
      ...gs,
      phase: "answering" as Phase,
      round: nextRound,
      prompt: TALENT_SHOW_PROMPTS[nextPromptIndex],
      answers: {},
      duplicates: [],
    });
  }, [gs, updateGameState]);

  /** Host: force end timer (skip to reveal) */
  const forceEndTimer = useCallback(async () => {
    if (!gs || !isHost) return;
    // Fill in empty answers for players who haven't answered
    const newAnswers = { ...gs.answers };
    for (const p of players) {
      if (!(p.user_id in newAnswers)) {
        newAnswers[p.user_id] = "";
      }
    }
    const dupes = findDuplicateUserIds(newAnswers);
    const roundScores: Record<string, number> = {};
    for (const uid of Object.keys(newAnswers)) {
      roundScores[uid] = dupes.includes(uid) ? 0 : 1;
    }
    const newScores = { ...gs.scores };
    for (const [uid, pts] of Object.entries(roundScores)) {
      newScores[uid] = (newScores[uid] ?? 0) + pts;
    }
    await updateGameState({
      ...gs,
      phase: "reveal" as Phase,
      answers: newAnswers,
      duplicates: dupes,
      scores: newScores,
    });
  }, [gs, isHost, players, updateGameState]);

  const handleBackToLobby = useCallback(async () => {
    await endGame();
    router.replace("/room" as any);
  }, [endGame, router]);

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const playerMap = Object.fromEntries(players.map((p) => [p.user_id, p]));

  const sortedLeaderboard = gs?.scores
    ? Object.entries(gs.scores)
        .map(([uid, score]) => ({
          uid,
          username: playerMap[uid]?.username ?? "Unknown",
          score: score as number,
        }))
        .sort((a, b) => b.score - a.score)
    : [];

  const answeredCount = gs ? Object.keys(gs.answers).length : 0;
  const totalPlayers = players.length;

  // -----------------------------------------------------------------------
  // Start from intro callback
  // -----------------------------------------------------------------------

  const startFromIntro = useCallback(async () => {
    if (!gs) return;
    await updateGameState({ ...gs, phase: "answering" as Phase });
  }, [gs, updateGameState]);

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (!gs || !gs.phase) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Setting up the game...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // -----------------------------------------------------------------------
  // RENDER: Intro Phase
  // -----------------------------------------------------------------------

  if (phase === "intro") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.introContainer}>
          <Text style={styles.introEmoji}>{"\u2B50"}</Text>
          <Text style={styles.introTitle}>Nobody's Got Talent</Text>
          <Text style={styles.introTagline}>Write something nobody else will.</Text>

          <View style={styles.introRulesContainer}>
            <View style={styles.introRuleCard}>
              <Text style={styles.introRuleText}>{"\u270F\uFE0F"}  Each round shows a creative prompt</Text>
            </View>
            <View style={styles.introRuleCard}>
              <Text style={styles.introRuleText}>{"\u23F1\uFE0F"}  You have 30 seconds to type your answer</Text>
            </View>
            <View style={styles.introRuleCard}>
              <Text style={styles.introRuleText}>{"\uD83D\uDEAB"}  If someone else writes the same answer, you both score 0</Text>
            </View>
            <View style={styles.introRuleCard}>
              <Text style={styles.introRuleText}>{"\u2705"}  Unique answers score 1 point</Text>
            </View>
            <View style={styles.introRuleCard}>
              <Text style={styles.introRuleText}>{"\uD83C\uDFC6"}  Most points after 5 rounds wins!</Text>
            </View>
          </View>

          {isHost ? (
            <TouchableOpacity style={styles.introStartButton} onPress={startFromIntro}>
              <Text style={styles.introStartButtonText}>Start Game</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.introWaitingText}>Waiting for host to start...</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // -----------------------------------------------------------------------
  // RENDER: Answering Phase
  // -----------------------------------------------------------------------

  if (phase === "answering") {
    const timerColor =
      timeLeft <= 5 ? colors.danger : timeLeft <= 10 ? colors.warning : colors.primaryLight;

    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.roundLabel}>
              Round {gs.round} of {gs.totalRounds}
            </Text>
            <View style={styles.timerRow}>
              <Ionicons name="timer-outline" size={22} color={timerColor} />
              <Text style={[styles.timerText, { color: timerColor }]}>{timeLeft}s</Text>
            </View>
          </View>

          {/* Prompt */}
          <View style={styles.promptCard}>
            <Text style={styles.promptText}>{gs.prompt}</Text>
          </View>

          {/* Input */}
          <View style={styles.inputSection}>
            {submitted ? (
              <View style={styles.submittedBox}>
                <Ionicons name="checkmark-circle" size={28} color={colors.success} />
                <Text style={styles.submittedText}>Answer submitted!</Text>
                <Text style={styles.waitingText}>
                  Waiting for others ({answeredCount}/{totalPlayers})
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.inputLabel}>Your unique answer:</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Type something creative..."
                  placeholderTextColor={colors.gray500}
                  value={answer}
                  onChangeText={setAnswer}
                  maxLength={100}
                  autoFocus
                  returnKeyType="send"
                  onSubmitEditing={() => handleSubmit()}
                />
                <TouchableOpacity
                  style={[styles.submitBtn, !answer.trim() && styles.submitBtnDisabled]}
                  onPress={() => handleSubmit()}
                  disabled={!answer.trim()}
                  activeOpacity={0.7}
                >
                  <Text style={styles.submitBtnText}>Submit</Text>
                  <Ionicons name="send" size={18} color={colors.white} />
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Host skip */}
          {isHost && (
            <TouchableOpacity style={styles.hostBtn} onPress={forceEndTimer} activeOpacity={0.7}>
              <Ionicons name="play-skip-forward" size={18} color={colors.primaryLight} />
              <Text style={styles.hostBtnText}>Skip Timer</Text>
            </TouchableOpacity>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // -----------------------------------------------------------------------
  // RENDER: Reveal Phase
  // -----------------------------------------------------------------------

  if (phase === "reveal") {
    const answerEntries = Object.entries(gs.answers).map(([uid, ans]) => ({
      uid,
      username: playerMap[uid]?.username ?? "Unknown",
      answer: (ans as string) || "(no answer)",
      isDuplicate: gs.duplicates.includes(uid),
    }));

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.roundLabel}>
            Round {gs.round} of {gs.totalRounds}
          </Text>
          <Text style={styles.phaseLabel}>Results</Text>
        </View>

        <View style={styles.promptCardSmall}>
          <Text style={styles.promptTextSmall}>{gs.prompt}</Text>
        </View>

        <FlatList
          data={answerEntries}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View
              style={[
                styles.answerRow,
                item.isDuplicate ? styles.answerRowDup : styles.answerRowUnique,
              ]}
            >
              <View style={styles.answerLeft}>
                <Ionicons
                  name={item.isDuplicate ? "close-circle" : "checkmark-circle"}
                  size={22}
                  color={item.isDuplicate ? colors.danger : colors.success}
                />
                <View style={styles.answerTextCol}>
                  <Text style={styles.answerUsername}>{item.username}</Text>
                  <Text style={styles.answerText}>{item.answer}</Text>
                </View>
              </View>
              <Text
                style={[
                  styles.answerPoints,
                  { color: item.isDuplicate ? colors.danger : colors.success },
                ]}
              >
                {item.isDuplicate ? "+0" : "+1"}
              </Text>
            </View>
          )}
        />

        {isHost && (
          <TouchableOpacity style={styles.primaryBtn} onPress={advanceToRoundEnd} activeOpacity={0.7}>
            <Text style={styles.primaryBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.white} />
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  // -----------------------------------------------------------------------
  // RENDER: Round-End Phase (Leaderboard)
  // -----------------------------------------------------------------------

  if (phase === "round-end") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.roundLabel}>
            Round {gs.round} of {gs.totalRounds}
          </Text>
          <Text style={styles.phaseLabel}>Leaderboard</Text>
        </View>

        <FlatList
          data={sortedLeaderboard}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => {
            const isMe = item.uid === myId;
            const medal =
              index === 0 ? "trophy" : index === 1 ? "medal" : index === 2 ? "ribbon" : null;
            const medalColor =
              index === 0 ? colors.warning : index === 1 ? colors.gray400 : "#CD7F32";
            return (
              <View style={[styles.leaderRow, isMe && styles.leaderRowMe]}>
                <View style={styles.leaderLeft}>
                  <Text style={styles.leaderRank}>#{index + 1}</Text>
                  {medal && (
                    <Ionicons name={medal as any} size={20} color={medalColor} style={{ marginRight: 8 }} />
                  )}
                  <Text style={[styles.leaderName, isMe && styles.leaderNameMe]}>
                    {item.username}
                    {isMe ? " (You)" : ""}
                  </Text>
                </View>
                <Text style={styles.leaderScore}>{item.score} pts</Text>
              </View>
            );
          }}
        />

        {isHost && (
          <TouchableOpacity style={styles.primaryBtn} onPress={advanceToNextRound} activeOpacity={0.7}>
            <Text style={styles.primaryBtnText}>
              {gs.round >= gs.totalRounds ? "See Final Results" : "Next Round"}
            </Text>
            <Ionicons
              name={gs.round >= gs.totalRounds ? "trophy" : "arrow-forward"}
              size={20}
              color={colors.white}
            />
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  // -----------------------------------------------------------------------
  // RENDER: Game Over
  // -----------------------------------------------------------------------

  if (phase === "game-over") {
    const winner = sortedLeaderboard[0];
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.gameOverHeader}>
          <Ionicons name="trophy" size={48} color={colors.warning} />
          <Text style={styles.gameOverTitle}>Game Over!</Text>
          {winner && (
            <Text style={styles.gameOverWinner}>
              {winner.uid === myId ? "You win!" : `${winner.username} wins!`}
            </Text>
          )}
          {winner && <Text style={styles.gameOverScore}>{winner.score} points</Text>}
        </View>

        <FlatList
          data={sortedLeaderboard}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => {
            const isMe = item.uid === myId;
            const medal =
              index === 0 ? "trophy" : index === 1 ? "medal" : index === 2 ? "ribbon" : null;
            const medalColor =
              index === 0 ? colors.warning : index === 1 ? colors.gray400 : "#CD7F32";
            return (
              <View style={[styles.leaderRow, isMe && styles.leaderRowMe]}>
                <View style={styles.leaderLeft}>
                  <Text style={styles.leaderRank}>#{index + 1}</Text>
                  {medal && (
                    <Ionicons name={medal as any} size={20} color={medalColor} style={{ marginRight: 8 }} />
                  )}
                  <Text style={[styles.leaderName, isMe && styles.leaderNameMe]}>
                    {item.username}
                    {isMe ? " (You)" : ""}
                  </Text>
                </View>
                <Text style={styles.leaderScore}>{item.score} pts</Text>
              </View>
            );
          }}
        />

        {isHost && (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleBackToLobby} activeOpacity={0.7}>
            <Text style={styles.primaryBtnText}>Back to Lobby</Text>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </TouchableOpacity>
        )}

        {!isHost && (
          <View style={styles.waitingFooter}>
            <Text style={styles.waitingText}>Waiting for host to return to lobby...</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Fallback
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Unknown phase: {phase}</Text>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.gray400,
    marginTop: 16,
  },

  // ---- Intro ----
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

  // ---- Header ----
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  roundLabel: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.primaryLight,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timerText: {
    fontFamily: fonts.bold,
    fontSize: 20,
  },
  phaseLabel: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.gray400,
  },

  // ---- Prompt ----
  promptCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 24,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.surfaceLight,
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
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.surfaceLight,
  },
  promptTextSmall: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.gray400,
    textAlign: "center",
  },

  // ---- Input ----
  inputSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  inputLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.gray400,
    marginBottom: 10,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.white,
    borderWidth: 1,
    borderColor: colors.surfaceLight,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
  },
  submittedBox: {
    alignItems: "center",
    gap: 8,
    paddingTop: 24,
  },
  submittedText: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.success,
  },
  waitingText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray400,
    textAlign: "center",
  },

  // ---- Host buttons ----
  hostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  hostBtnText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.primaryLight,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  primaryBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
  },

  // ---- Answer list (reveal) ----
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  answerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  answerRowDup: {
    borderColor: colors.danger,
  },
  answerRowUnique: {
    borderColor: colors.success,
  },
  answerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  answerTextCol: {
    flex: 1,
  },
  answerUsername: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.gray400,
    marginBottom: 2,
  },
  answerText: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.white,
  },
  answerPoints: {
    fontFamily: fonts.bold,
    fontSize: 18,
    marginLeft: 8,
  },

  // ---- Leaderboard ----
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.surfaceLight,
  },
  leaderRowMe: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceLight,
  },
  leaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  leaderRank: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.gray500,
    width: 36,
  },
  leaderName: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
  },
  leaderNameMe: {
    color: colors.primaryLight,
  },
  leaderScore: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.white,
  },

  // ---- Game Over ----
  gameOverHeader: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 20,
    gap: 8,
  },
  gameOverTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    color: colors.white,
  },
  gameOverWinner: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.warning,
  },
  gameOverScore: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.gray400,
  },

  // ---- Footer ----
  waitingFooter: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
});
