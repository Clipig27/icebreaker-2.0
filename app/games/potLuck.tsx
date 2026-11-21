import { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import { DEFAULT_QUESTIONS, PotLuckQuestion } from "../../src/data/potLuck";
import { competitionRanks, joinNames } from "../../src/utils/rank";
import HostWaitingPill from "../../src/components/HostWaitingPill";

// ─── Constants ──────────────────────────────────────────────────────────────
const TOTAL_ROUNDS = 10;
const QUESTION_TIME = 15; // seconds
const REVEAL_DURATION = 4000; // ms before auto-advancing from reveal

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Shuffle an array (Fisher-Yates) and return a new copy */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick `count` questions with a balanced difficulty spread */
function pickQuestions(count: number): PotLuckQuestion[] {
  const easy = shuffle(DEFAULT_QUESTIONS.filter((q) => q.difficulty === "easy"));
  const med = shuffle(DEFAULT_QUESTIONS.filter((q) => q.difficulty === "medium"));
  const hard = shuffle(DEFAULT_QUESTIONS.filter((q) => q.difficulty === "hard"));

  // 4 easy, 3 medium, 3 hard (or fill as available)
  const picked: PotLuckQuestion[] = [
    ...easy.slice(0, 4),
    ...med.slice(0, 3),
    ...hard.slice(0, 3),
  ];

  // If we somehow don't have enough, pad from the full pool
  if (picked.length < count) {
    const ids = new Set(picked.map((q) => q.id));
    const remaining = shuffle(DEFAULT_QUESTIONS.filter((q) => !ids.has(q.id)));
    picked.push(...remaining.slice(0, count - picked.length));
  }

  return shuffle(picked).slice(0, count);
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Phase = "intro" | "question" | "reveal" | "game-over";

interface GameState {
  phase: Phase;
  game: "potLuck";
  round: number; // 0-indexed
  questionIds: string[]; // ids for all rounds
  answers: Record<string, number>; // userId -> choiceIndex
  scores: Record<string, number>; // userId -> cumulative score
  timerEnd: number; // unix ms when timer expires
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PotLuckScreen() {
  const router = useRouter();
  const { room, players, isHost, mutateGameState, endGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const gs: GameState | null = room?.game_state?.game === "potLuck" ? room.game_state : null;
  const rawPhase: string = gs?.phase ?? "intro";
  const phase = rawPhase === "starting" ? "intro" : rawPhase;
  const round = gs?.round ?? 0;
  const answers = gs?.answers ?? {};
  const scores = gs?.scores ?? {};

  // Resolve question for current round
  const currentQuestion: PotLuckQuestion | null =
    gs && gs.questionIds
      ? DEFAULT_QUESTIONS.find((q) => q.id === gs.questionIds[round]) ?? null
      : null;

  // Local timer state
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Round for which the host already requested question -> reveal (avoids
  // re-firing every 250ms tick while remaining <= 0)
  const revealRequestedRoundRef = useRef<number | null>(null);

  // Fade anim for question card
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // ── Initialize game (host only, once) ──────────────────────────────────
  useEffect(() => {
    if (!isHost) return;
    if (gs && gs.questionIds && gs.questionIds.length > 0) return; // already initialized

    const questions = pickQuestions(TOTAL_ROUNDS);
    const initialScores: Record<string, number> = {};
    players.forEach((p) => {
      initialScores[p.user_id] = 0;
    });

    const initialState: GameState = {
      phase: "intro",
      game: "potLuck",
      round: 0,
      questionIds: questions.map((q) => q.id),
      answers: {},
      scores: initialScores,
      timerEnd: Date.now() + QUESTION_TIME * 1000,
    };

    // CAS on the fresh state so a late init can never clobber a newer phase.
    mutateGameState((cur) => {
      if (cur && cur.game === "potLuck" && cur.questionIds && cur.questionIds.length > 0) return null;
      if (cur?.phase && cur.phase !== "starting" && cur.phase !== "intro") return null;
      return initialState;
    }).then((ok) => console.log("[tapdiag] potLuck host init write:", ok));
  }, [isHost]);

  // ── Timer countdown ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "question" || !gs?.timerEnd) {
      setTimeLeft(QUESTION_TIME);
      return;
    }

    const timerEnd = gs.timerEnd;
    const tickRound = gs.round;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0 && useRoomStore.getState().isHost) {
        // Time's up — force reveal (at most once per round)
        requestReveal(tickRound);
      }
    };

    tick(); // run immediately
    timerRef.current = setInterval(tick, 250);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, gs?.timerEnd, gs?.round]);

  // ── Auto-advance when all players answered ────────────────────────────
  useEffect(() => {
    if (phase !== "question" || !isHost || !gs) return;
    const answered = Object.keys(answers).length;
    if (answered >= players.length && players.length > 0) {
      requestReveal(round);
    }
  }, [Object.keys(answers).length, players.length, phase]);

  // ── Auto-advance from reveal after delay ──────────────────────────────
  useEffect(() => {
    if (phase !== "reveal" || !isHost) return;

    const revealRound = round;
    revealTimerRef.current = setTimeout(() => {
      if (useRoomStore.getState().isHost) advanceFromReveal(revealRound);
    }, REVEAL_DURATION);

    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, [phase, gs?.round]);

  // ── Fade animation on new round ───────────────────────────────────────
  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [round, phase]);

  // ── Navigate back if room goes to lobby ───────────────────────────────
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

  // ── Actions ───────────────────────────────────────────────────────────

  const submitAnswer = useCallback(
    async (choiceIndex: number) => {
      if (!gs || !user || phase !== "question") return;
      if (answers[user.id] !== undefined) return; // already answered

      const answerRound = round;
      // Merge only our own answer into the fresh server state (no lost updates)
      await mutateGameState((cur) => {
        if (!cur || cur.game !== "potLuck" || cur.phase !== "question" || cur.round !== answerRound) {
          return null;
        }
        const curAnswers = cur.answers ?? {};
        if (curAnswers[user.id] !== undefined) return null;
        return { ...cur, answers: { ...curAnswers, [user.id]: choiceIndex } };
      });
    },
    [gs, user, phase, round, answers, mutateGameState]
  );

  // Host transition question -> reveal for `forRound`. Scores are computed from
  // the FRESH server state; idempotent (no-op if already revealed).
  const advanceToReveal = useCallback(
    async (forRound: number) => {
      await mutateGameState((cur) => {
        if (!cur || cur.game !== "potLuck" || cur.phase !== "question" || cur.round !== forRound) {
          return null;
        }
        const question = DEFAULT_QUESTIONS.find(
          (q) => q.id === (cur.questionIds ?? [])[forRound]
        );
        if (!question) return null;

        // Calculate new scores
        const newScores: Record<string, number> = { ...(cur.scores ?? {}) };
        const pot = question.startingPot;

        Object.entries((cur.answers ?? {}) as Record<string, number>).forEach(([uid, choice]) => {
          if (choice === question.correctIndex) {
            newScores[uid] = (newScores[uid] ?? 0) + pot;
          }
        });

        // Also make sure players who didn't answer get 0 added (keep their score)
        useRoomStore.getState().players.forEach((p) => {
          if (newScores[p.user_id] === undefined) {
            newScores[p.user_id] = 0;
          }
        });

        return { ...cur, phase: "reveal" as Phase, scores: newScores };
      });
    },
    [mutateGameState]
  );

  const requestReveal = (forRound: number) => {
    if (revealRequestedRoundRef.current === forRound) return;
    revealRequestedRoundRef.current = forRound;
    advanceToReveal(forRound);
  };

  // Host transition reveal -> next question / game-over for `forRound`. Idempotent.
  const advanceFromReveal = useCallback(
    async (forRound: number) => {
      await mutateGameState((cur) => {
        if (!cur || cur.game !== "potLuck" || cur.phase !== "reveal" || cur.round !== forRound) {
          return null;
        }
        const nextRound = forRound + 1;
        if (nextRound >= TOTAL_ROUNDS || nextRound >= (cur.questionIds ?? []).length) {
          // Game over
          return { ...cur, phase: "game-over" as Phase };
        }
        return {
          ...cur,
          phase: "question" as Phase,
          round: nextRound,
          answers: {},
          timerEnd: Date.now() + QUESTION_TIME * 1000,
        };
      });
    },
    [mutateGameState]
  );

  const handleBackToLobby = async () => {
    // Sync scores to room_players before ending
    if (isHost && gs) {
      for (const p of players) {
        const gameScore = scores[p.user_id] ?? 0;
        if (gameScore !== p.score) {
          await useRoomStore.getState().updateScore(p.user_id, gameScore - p.score);
        }
      }
    }
    // Navigation happens in the room-status effect above once status is "lobby".
    await endGame();
  };

  const startFromIntro = useCallback(async () => {
    console.log("[tapdiag] potLuck Start onPress fired, local phase:", rawPhase);
    const t0 = Date.now();
    const ok = await mutateGameState((cur) => {
      if (!cur || cur.game !== "potLuck") return null;
      if (cur.phase !== "intro" && cur.phase !== "starting") return null;
      return {
        ...cur,
        phase: "question" as Phase,
        timerEnd: Date.now() + QUESTION_TIME * 1000,
      };
    });
    console.log("[tapdiag] potLuck Start mutateGameState:", ok, `${Date.now() - t0}ms`);
  }, [mutateGameState, rawPhase]);

  // ── Derived state ─────────────────────────────────────────────────────

  const myAnswer = user ? answers[user.id] : undefined;
  const hasAnswered = myAnswer !== undefined;

  // Sorted leaderboard
  const leaderboard = [...players]
    .map((p) => ({
      ...p,
      gameScore: scores[p.user_id] ?? 0,
    }))
    .sort((a, b) => b.gameScore - a.gameScore);
  const leaderboardRanks = competitionRanks(leaderboard, (p) => p.gameScore);

  // ── Render: Intro Phase ──────────────────────────────────────────────

  const renderIntro = () => (
    <ScrollView contentContainerStyle={s.introContainer}>
      <Text style={s.introEmoji}>{"\uD83C\uDF40"}</Text>
      <Text style={s.introTitle}>Pot Luck</Text>
      <Text style={s.introTagline}>Trivia with a twist.</Text>

      <View style={s.introRulesContainer}>
        <View style={s.introRuleCard}>
          <Text style={s.introRuleText}>{"\u2753"}  Each round shows a multiple choice trivia question</Text>
        </View>
        <View style={s.introRuleCard}>
          <Text style={s.introRuleText}>{"\u23F1\uFE0F"}  15 seconds to pick your answer</Text>
        </View>
        <View style={s.introRuleCard}>
          <Text style={s.introRuleText}>{"\uD83D\uDCB0"}  Correct answers earn the pot value (1-3 points based on difficulty)</Text>
        </View>
        <View style={s.introRuleCard}>
          <Text style={s.introRuleText}>{"\u274C"}  Wrong answers earn nothing</Text>
        </View>
        <View style={s.introRuleCard}>
          <Text style={s.introRuleText}>{"\uD83C\uDFC6"}  Highest score after 10 rounds wins!</Text>
        </View>
      </View>

      {isHost ? (
        <Pressable
          style={s.introStartButton}
          onPressIn={() => console.log("[tapdiag] potLuck Start onPressIn")}
          onPress={startFromIntro}
        >
          <Text style={s.introStartButtonText}>Start Game</Text>
        </Pressable>
      ) : (
        <Text style={s.introWaitingText}>Waiting for host to start...</Text>
      )}
    </ScrollView>
  );

  // ── Render: Question Phase ────────────────────────────────────────────

  const renderQuestion = () => {
    if (!currentQuestion) return null;

    const timerColor =
      timeLeft <= 3 ? colors.danger : timeLeft <= 7 ? colors.warning : colors.primary;
    const timerTextColor =
      timeLeft <= 3 ? colors.danger : timeLeft <= 7 ? colors.warning : colors.primaryLight;

    const timerProgress = timeLeft / QUESTION_TIME;

    return (
      <Animated.View style={[s.content, { opacity: fadeAnim }]}>
        {/* Round + Timer Header */}
        <View style={s.roundHeader}>
          <View style={s.roundBadge}>
            <Text style={s.roundBadgeText}>
              Round {round + 1}/{TOTAL_ROUNDS}
            </Text>
          </View>
          <View style={s.potBadge}>
            <Ionicons name="trophy" size={16} color={colors.warning} />
            <Text style={s.potText}>
              {currentQuestion.startingPot} {currentQuestion.startingPot === 1 ? "pt" : "pts"}
            </Text>
          </View>
        </View>

        {/* Timer Bar */}
        <View style={s.timerBarOuter}>
          <View
            style={[
              s.timerBarInner,
              {
                width: `${timerProgress * 100}%`,
                backgroundColor: timerColor,
              },
            ]}
          />
        </View>
        <Text style={[s.timerText, { color: timerTextColor }]}>{timeLeft}s</Text>

        {/* Difficulty Indicator */}
        <View style={s.difficultyRow}>
          <View
            style={[
              s.difficultyDot,
              {
                backgroundColor:
                  currentQuestion.difficulty === "easy"
                    ? colors.success
                    : currentQuestion.difficulty === "medium"
                    ? colors.warning
                    : colors.danger,
              },
            ]}
          />
          <Text style={s.difficultyLabel}>
            {currentQuestion.difficulty.charAt(0).toUpperCase() +
              currentQuestion.difficulty.slice(1)}
          </Text>
        </View>

        {/* Question Card */}
        <View style={s.questionCard}>
          <Text style={s.questionText}>{currentQuestion.text}</Text>
        </View>

        {/* Choices */}
        <View style={s.choicesContainer}>
          {currentQuestion.choices.map((choice, idx) => {
            const isSelected = myAnswer === idx;
            return (
              <Pressable
                key={idx}
                style={[
                  s.choiceBtn,
                  isSelected && s.choiceBtnSelected,
                  hasAnswered && !isSelected && s.choiceBtnDisabled,
                ]}
                onPress={() => submitAnswer(idx)}
                disabled={hasAnswered}
              >
                <View style={[s.choiceLetter, isSelected && s.choiceLetterSelected]}>
                  <Text
                    style={[s.choiceLetterText, isSelected && s.choiceLetterTextSelected]}
                  >
                    {String.fromCharCode(65 + idx)}
                  </Text>
                </View>
                <Text
                  style={[s.choiceText, isSelected && s.choiceTextSelected]}
                  numberOfLines={2}
                >
                  {choice}
                </Text>
                {isSelected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={colors.primary}
                    style={{ marginLeft: "auto" }}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        {hasAnswered && (
          <Text style={s.waitingText}>Waiting for others...</Text>
        )}

        {/* Answer count */}
        <Text style={s.answeredCount}>
          {Object.keys(answers).length}/{players.length} answered
        </Text>
      </Animated.View>
    );
  };

  // ── Render: Reveal Phase ──────────────────────────────────────────────

  const renderReveal = () => {
    if (!currentQuestion) return null;

    const pot = currentQuestion.startingPot;

    return (
      <Animated.View style={[s.content, { opacity: fadeAnim }]}>
        <View style={s.roundHeader}>
          <View style={s.roundBadge}>
            <Text style={s.roundBadgeText}>
              Round {round + 1}/{TOTAL_ROUNDS}
            </Text>
          </View>
          <Text style={s.revealLabel}>Results</Text>
        </View>

        {/* Question recap */}
        <View style={s.questionCard}>
          <Text style={s.questionText}>{currentQuestion.text}</Text>
        </View>

        {/* Choices with correct/incorrect highlighting */}
        <View style={s.choicesContainer}>
          {currentQuestion.choices.map((choice, idx) => {
            const isCorrect = idx === currentQuestion.correctIndex;
            const wasMyChoice = myAnswer === idx;

            return (
              <View
                key={idx}
                style={[
                  s.choiceBtn,
                  isCorrect && s.choiceBtnCorrect,
                  !isCorrect && wasMyChoice && s.choiceBtnWrong,
                ]}
              >
                <View
                  style={[
                    s.choiceLetter,
                    isCorrect && s.choiceLetterCorrect,
                    !isCorrect && wasMyChoice && s.choiceLetterWrong,
                  ]}
                >
                  <Text
                    style={[
                      s.choiceLetterText,
                      (isCorrect || wasMyChoice) && s.choiceLetterTextSelected,
                    ]}
                  >
                    {isCorrect ? (
                      <Ionicons name="checkmark" size={14} color={colors.white} />
                    ) : wasMyChoice ? (
                      <Ionicons name="close" size={14} color={colors.white} />
                    ) : (
                      String.fromCharCode(65 + idx)
                    )}
                  </Text>
                </View>
                <Text
                  style={[
                    s.choiceText,
                    isCorrect && { color: colors.success },
                    !isCorrect && wasMyChoice && { color: colors.danger },
                  ]}
                  numberOfLines={2}
                >
                  {choice}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Player results */}
        <View style={s.resultsCard}>
          <Text style={s.resultsTitle}>Round Results</Text>
          {players.map((p) => {
            const pAnswer = answers[p.user_id];
            const gotIt = pAnswer === currentQuestion.correctIndex;
            const didntAnswer = pAnswer === undefined;

            return (
              <View key={p.user_id} style={s.resultRow}>
                <View style={s.resultLeft}>
                  <Ionicons
                    name={didntAnswer ? "time-outline" : gotIt ? "checkmark-circle" : "close-circle"}
                    size={20}
                    color={didntAnswer ? colors.gray500 : gotIt ? colors.success : colors.danger}
                  />
                  <Text style={s.resultName}>{p.username}</Text>
                </View>
                <Text
                  style={[
                    s.resultPoints,
                    {
                      color: didntAnswer
                        ? colors.gray500
                        : gotIt
                        ? colors.success
                        : colors.danger,
                    },
                  ]}
                >
                  {didntAnswer ? "No answer" : gotIt ? `+${pot}` : "+0"}
                </Text>
              </View>
            );
          })}
        </View>
      </Animated.View>
    );
  };

  // ── Render: Game Over ─────────────────────────────────────────────────

  const renderGameOver = () => {
    const winner = leaderboard[0];
    const coWinners = leaderboard.filter((_, i) => leaderboardRanks[i] === 1);

    return (
      <Animated.View style={[s.content, { opacity: fadeAnim }]}>
        <View style={s.gameOverHeader}>
          <Ionicons name="trophy" size={48} color={colors.warning} />
          <Text style={s.gameOverTitle}>Game Over!</Text>
          {winner && (
            <Text style={s.winnerText}>
              {coWinners.length > 1
                ? `${joinNames(coWinners.map((p) => p.username))} tie with ${winner.gameScore} pts!`
                : `${winner.username} wins with ${winner.gameScore} pts!`}
            </Text>
          )}
        </View>

        <View style={s.leaderboardCard}>
          <Text style={s.leaderboardTitle}>Final Standings</Text>
          {leaderboard.map((p, idx) => {
            const rank = leaderboardRanks[idx] ?? idx + 1;
            const isFirst = rank === 1;
            return (
            <View
              key={p.user_id}
              style={[s.leaderboardRow, isFirst && s.leaderboardRowFirst]}
            >
              <View style={s.rankContainer}>
                {rank <= 3 ? (
                  <Ionicons
                    name="medal"
                    size={22}
                    color={
                      rank === 1
                        ? "#FFD700"
                        : rank === 2
                        ? "#C0C0C0"
                        : "#CD7F32"
                    }
                  />
                ) : (
                  <Text style={s.rankNumber}>{rank}</Text>
                )}
              </View>
              <Text style={[s.leaderboardName, isFirst && s.leaderboardNameFirst]}>
                {p.username}
                {p.user_id === user?.id ? " (You)" : ""}
              </Text>
              <Text style={[s.leaderboardScore, isFirst && s.leaderboardScoreFirst]}>
                {p.gameScore} pts
              </Text>
            </View>
            );
          })}
        </View>

        {isHost && (
          <Pressable style={s.lobbyBtn} onPress={handleBackToLobby}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
            <Text style={s.lobbyBtnText}>Back to Lobby</Text>
          </Pressable>
        )}

        {!isHost && (
          <HostWaitingPill
            label="Waiting for host to return to lobby..."
            style={{ marginTop: 8 }}
          />
        )}
      </Animated.View>
    );
  };

  // ── Main Render ───────────────────────────────────────────────────────

  if (phase === "intro") {
    return (
      <SafeAreaView style={s.safe}>
        {renderIntro()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <View style={s.topBarLeft}>
          <View style={s.gameIconBox}>
            <Ionicons name="trophy" size={22} color={colors.success} />
          </View>
          <Text style={s.topBarTitle}>Pot Luck</Text>
        </View>
        {phase !== "game-over" && (
          <View style={s.miniScoreboard}>
            <Ionicons name="people" size={16} color={colors.gray400} />
            <Text style={s.miniScoreText}>{players.length}</Text>
          </View>
        )}
      </View>

      {/* Score ticker (during gameplay) */}
      {phase !== "game-over" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.scoreTicker}
          contentContainerStyle={s.scoreTickerContent}
        >
          {leaderboard.map((p) => (
            <View
              key={p.user_id}
              style={[
                s.scoreChip,
                p.user_id === user?.id && s.scoreChipMe,
              ]}
            >
              <Text
                style={[
                  s.scoreChipName,
                  p.user_id === user?.id && s.scoreChipNameMe,
                ]}
                numberOfLines={1}
              >
                {p.user_id === user?.id ? "You" : p.username}
              </Text>
              <Text
                style={[
                  s.scoreChipScore,
                  p.user_id === user?.id && s.scoreChipScoreMe,
                ]}
              >
                {p.gameScore}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Phase content */}
      <ScrollView
        style={s.scrollBody}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {phase === "question" && renderQuestion()}
        {phase === "reveal" && renderReveal()}
        {phase === "game-over" && renderGameOver()}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Intro ──
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

  // ── Top Bar ──
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  gameIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.success + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.white,
  },
  miniScoreboard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  miniScoreText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.gray400,
  },

  // ── Score Ticker ──
  scoreTicker: {
    maxHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  scoreTickerContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row",
  },
  scoreChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
  },
  scoreChipMe: {
    backgroundColor: colors.primary + "30",
    borderWidth: 1,
    borderColor: colors.primary + "50",
  },
  scoreChipName: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.gray400,
    maxWidth: 80,
  },
  scoreChipNameMe: {
    color: colors.primaryLight,
  },
  scoreChipScore: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
  },
  scoreChipScoreMe: {
    color: colors.primaryLight,
  },

  // ── Scroll Body ──
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  content: {
    gap: 16,
  },

  // ── Round Header ──
  roundHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roundBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roundBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.gray400,
  },
  potBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.warning + "15",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.warning + "30",
  },
  potText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.warning,
  },

  // ── Timer ──
  timerBarOuter: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  timerBarInner: {
    height: "100%",
    borderRadius: 3,
  },
  timerText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    textAlign: "center",
  },

  // ── Difficulty ──
  difficultyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
  },
  difficultyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  difficultyLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.gray400,
  },

  // ── Question Card ──
  questionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  questionText: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.white,
    textAlign: "center",
    lineHeight: 26,
  },

  // ── Choices ──
  choicesContainer: {
    gap: 10,
  },
  choiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  choiceBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "15",
  },
  choiceBtnDisabled: {
    opacity: 0.5,
  },
  choiceBtnCorrect: {
    borderColor: colors.success,
    backgroundColor: colors.success + "15",
  },
  choiceBtnWrong: {
    borderColor: colors.danger,
    backgroundColor: colors.danger + "15",
  },
  choiceLetter: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceLetterSelected: {
    backgroundColor: colors.primary,
  },
  choiceLetterCorrect: {
    backgroundColor: colors.success,
  },
  choiceLetterWrong: {
    backgroundColor: colors.danger,
  },
  choiceLetterText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.gray400,
  },
  choiceLetterTextSelected: {
    color: colors.white,
  },
  choiceText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.white,
    flex: 1,
  },
  choiceTextSelected: {
    color: colors.primaryLight,
  },

  // ── Waiting / Count ──
  waitingText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.primaryLight,
    textAlign: "center",
  },
  answeredCount: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray500,
    textAlign: "center",
  },

  // ── Reveal ──
  revealLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.warning,
  },
  resultsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  resultsTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultName: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.white,
  },
  resultPoints: {
    fontFamily: fonts.bold,
    fontSize: 15,
  },

  // ── Game Over ──
  gameOverHeader: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  gameOverTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    color: colors.white,
  },
  winnerText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.warning,
  },

  // ── Leaderboard ──
  leaderboardCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  leaderboardTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.white,
    marginBottom: 4,
  },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceLight + "40",
  },
  leaderboardRowFirst: {
    backgroundColor: colors.warning + "15",
    borderWidth: 1,
    borderColor: colors.warning + "30",
  },
  rankContainer: {
    width: 30,
    alignItems: "center",
  },
  rankNumber: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.gray500,
  },
  leaderboardName: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
    marginLeft: 10,
  },
  leaderboardNameFirst: {
    color: colors.warning,
  },
  leaderboardScore: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.primaryLight,
  },
  leaderboardScoreFirst: {
    color: colors.warning,
  },

  // ── Lobby Button ──
  lobbyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 8,
  },
  lobbyBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
  },
});
