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
import { colors, fonts, gradients, radii, spacing, type } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import {
  TALENT_SHOW_PROMPTS,
  TALENT_SHOW_TIEBREAK_PROMPTS,
  TALENT_SHOW_FINAL_PROMPTS,
} from "../../src/data/talentShow";
import { getRecent, hashString, loadRecent, markUsed, pickFresh } from "../../src/utils/deck";
import { awardTrophies } from "../../src/utils/trophies";
import HostWaitingPill from "../../src/components/HostWaitingPill";
import GameHeader from "../../src/components/GameHeader";
import GameLoadingScreen from "../../src/components/GameLoadingScreen";
import ScreenBackground from "../../src/components/ScreenBackground";
import PrimaryAction, { PrimaryActionBar } from "../../src/components/PrimaryAction";
import Eyebrow from "../../src/components/Eyebrow";
import Pill from "../../src/components/Pill";
import GradientCard from "../../src/components/GradientCard";
import PlayerAvatar from "../../src/components/PlayerAvatar";
import GameLogo from "../../src/components/GameLogo";

// ---------------------------------------------------------------------------
// Game-specific color palette (dark maroon/pink)
// ---------------------------------------------------------------------------
const THEME = {
  bg: "#2A1520",
  card: "#3A1F30",
  accent: "#E0457B",
  gold: "#F5C842",
  accentSoft: "rgba(224,69,123,0.15)",
  accentBorder: "rgba(224,69,123,0.25)",
  cardBorder: "rgba(224,69,123,0.12)",
  surface: "#3A1F30",
  surfaceLight: "#4A2A3F",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase =
  | "intro"
  | "round-intro"
  | "prep"
  | "performing"
  | "r1-neutral-vote"
  | "r1-result"
  | "r2-voting"
  | "tiebreak-announce"
  | "tiebreak-prep"
  | "tiebreak-performing"
  | "tiebreak-vote"
  | "r3-voting"
  | "winner";

type PerformResult = {
  playerId: string;
  playerName: string;
  outcome: "advanced" | "eliminated" | "golden";
  buzzCount: number;
  goldenCount: number;
};

type GameState = {
  phase: Phase;
  game: "talentShow";
  round: 1 | 2 | 3;
  prompt: string;
  timerEnd: number | null; // ms timestamp when timer expires
  timerDuration: number; // ms

  performerQueue: string[];
  currentPerformerIdx: number;

  buzzedPlayerIds: string[];
  goldenPlayerIds: string[];
  totalVoters: number;

  r1Results: PerformResult[];
  eliminatedPlayerIds: string[];

  // R1 neutral vote
  r1NeutralVoterIds: string[];
  r1NeutralVotes: { voterId: string; decision: "advance" | "eliminate" }[];
  r1NeutralSubmittedIds: string[];

  // R2
  r2Results: { playerId: string; playerName: string }[];
  r2VoterIds: string[];
  r2Votes: { voterId: string; voteFor: string }[];
  r2SubmittedVoterIds: string[];

  // Tiebreaker
  tiebreakerCandidates: string[];
  tiebreakerSpotsNeeded: number;
  tiebreakerAlreadyAdvanced: string[];
  tbVotes: { voterId: string; voteFor: string }[];
  tbSubmittedVoterIds: string[];
  tbVoterIds: string[];

  // R3
  r3FinalistIds: string[];
  r3Results: { playerId: string; playerName: string }[];
  r3Votes: { voterId: string; voteFor: string }[];
  r3SubmittedVoterIds: string[];
  r3VoterIds: string[];

  // Tiebreak announce (vote tallies to show before tiebreaker)
  tiebreakerVoteTally: { id: string; name: string; count: number }[];

  winnerId: string | null;
  runnerUpId: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Device-level "recently used" bank key per prompt pool (no repeats across games).
const DECK_KEYS = new Map<readonly string[], string>([
  [TALENT_SHOW_PROMPTS, "ngt"],
  [TALENT_SHOW_TIEBREAK_PROMPTS, "ngt:tb"],
  [TALENT_SHOW_FINAL_PROMPTS, "ngt:final"],
]);
const promptId = (s: string) => hashString(s).toString(36);

function pickRandom<T>(arr: T[], exclude: Set<number>): { item: T; index: number } {
  const available = arr.map((_, i) => i).filter((i) => !exclude.has(i));
  const pool = available.length > 0 ? available : arr.map((_, i) => i);
  if (available.length === 0) exclude.clear();
  const key = DECK_KEYS.get(arr as unknown as string[]);
  if (!key) {
    const index = pool[Math.floor(Math.random() * pool.length)];
    return { item: arr[index], index };
  }
  const idOfIdx = (i: number) => promptId(String(arr[i]));
  const [index] = pickFresh(pool, 1, idOfIdx, getRecent(key));
  markUsed(key, [idOfIdx(index)]);
  return { item: arr[index], index };
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tallyVotes(votes: { voterId: string; voteFor: string }[]): { id: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const v of votes) map[v.voteFor] = (map[v.voteFor] ?? 0) + 1;
  return Object.entries(map).map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
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

export default function TalentShowScreen() {
  const router = useRouter();
  const { room, players, isHost, mutateGameState, endGame, startGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const usedR1R2Ref = useRef(new Set<number>());
  const usedTBRef = useRef(new Set<number>());
  const usedFinalRef = useRef(new Set<number>());

  // Hydrate the device's recently-used prompt lists so picks stay fresh across games.
  useEffect(() => {
    loadRecent("ngt");
    loadRecent("ngt:tb");
    loadRecent("ngt:final");
  }, []);

  // R2 multi-select
  const [r2Selected, setR2Selected] = useState<string[]>([]);
  const [trophyDelta, setTrophyDelta] = useState(0);

  const gs: GameState | null = room?.game_state ?? null;
  const phase = gs?.phase ?? null;
  const myId = user?.id ?? "";

  const secondsLeft = useCountdown(gs?.timerEnd ?? null);
  const isExpired = gs?.timerEnd ? Date.now() >= gs.timerEnd : false;

  // Reset r2 selection on phase change
  useEffect(() => {
    if (gs?.phase === "r2-voting") setR2Selected([]);
  }, [gs?.phase]);

  // Player map
  const playerMap: Record<string, string> = {};
  players.forEach((p) => { playerMap[p.user_id] = p.username; });

  const currentPerformerId = gs?.performerQueue?.[gs?.currentPerformerIdx ?? 0];
  const currentPerformerName = currentPerformerId ? (playerMap[currentPerformerId] ?? "Player") : "...";
  const isPerformer = currentPerformerId === myId;

  // -----------------------------------------------------------------------
  // Host: initialise
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || !room) return;
    if (gs && gs.game === "talentShow" && gs.phase && (gs.phase as string) !== "starting") return;

    const allIds = players.map((p) => p.user_id);
    const { item: prompt, index } = pickRandom(TALENT_SHOW_PROMPTS, usedR1R2Ref.current);
    usedR1R2Ref.current.add(index);

    const initialState: GameState = {
      phase: "intro",
      game: "talentShow",
      round: 1,
      prompt,
      timerEnd: null,
      timerDuration: 30000,
      performerQueue: shuffleArray(allIds),
      currentPerformerIdx: 0,
      buzzedPlayerIds: [],
      goldenPlayerIds: [],
      totalVoters: allIds.length - 1,
      r1Results: [],
      eliminatedPlayerIds: [],
      r1NeutralVoterIds: [],
      r1NeutralVotes: [],
      r1NeutralSubmittedIds: [],
      r2Results: [],
      r2VoterIds: [],
      r2Votes: [],
      r2SubmittedVoterIds: [],
      tiebreakerCandidates: [],
      tiebreakerSpotsNeeded: 0,
      tiebreakerAlreadyAdvanced: [],
      tbVotes: [],
      tbSubmittedVoterIds: [],
      tbVoterIds: [],
      r3FinalistIds: [],
      r3Results: [],
      r3Votes: [],
      r3SubmittedVoterIds: [],
      r3VoterIds: [],
      tiebreakerVoteTally: [],
      winnerId: null,
      runnerUpId: null,
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
    if (trackedGameRef.current || phase !== "winner" || !gs) return;
    trackedGameRef.current = true;
    useAuthStore.getState().incrementGamesPlayed();
    if (gs.winnerId === myId) useAuthStore.getState().incrementWins();
    if (gs.winnerId) awardTrophies(gs.winnerId, "talentShow").then((d) => setTrophyDelta(d));
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
  // Handlers
  // -----------------------------------------------------------------------

  const startFromIntro = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "intro") return null;
      return { ...cur, phase: "round-intro" as Phase };
    });
  }, [mutateGameState]);

  // Host: advance from round-intro -> prep
  const advanceToPrep = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "round-intro") return null;
      return { ...cur, phase: "prep" as Phase };
    });
  }, [mutateGameState]);

  // Performer: start performing (from prep)
  const startPerforming = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || (cur.phase !== "prep" && cur.phase !== "tiebreak-prep")) return null;
      if (cur.performerQueue[cur.currentPerformerIdx] !== myId) return null;
      const duration = cur.timerDuration || 30000;
      const newPhase = cur.phase === "tiebreak-prep" ? "tiebreak-performing" : "performing";
      return { ...cur, phase: newPhase as Phase, timerEnd: Date.now() + duration };
    });
  }, [myId, mutateGameState]);

  // Audience: buzz
  const handleBuzz = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "performing" || cur.round !== 1) return null;
      const alreadyUsed = [...cur.buzzedPlayerIds, ...cur.goldenPlayerIds];
      if (alreadyUsed.includes(myId)) return null;
      const newBuzzed = [...cur.buzzedPlayerIds, myId];
      const performerPid = cur.performerQueue[cur.currentPerformerIdx];
      const liveVoters = players.filter((p) => p.user_id !== performerPid).length;
      const threshold = Math.floor(liveVoters / 2) + 1; // strict majority (>50%)

      const totalVoted = newBuzzed.length + cur.goldenPlayerIds.length;
      const allVoted = totalVoted >= liveVoters;

      // Majority buzzes → eliminated
      if (newBuzzed.length >= threshold) {
        const result: PerformResult = {
          playerId: performerPid,
          playerName: playerMap[performerPid] ?? "Player",
          outcome: "eliminated",
          buzzCount: newBuzzed.length,
          goldenCount: cur.goldenPlayerIds.length,
        };
        return {
          ...cur,
          buzzedPlayerIds: newBuzzed,
          totalVoters: liveVoters,
          r1Results: [...cur.r1Results, result],
          eliminatedPlayerIds: [...cur.eliminatedPlayerIds, performerPid],
          phase: "r1-result" as Phase,
          timerEnd: null,
        };
      }
      // All voted and it's a tie or buzzes win → eliminated immediately (no waiting)
      if (allVoted && newBuzzed.length >= cur.goldenPlayerIds.length) {
        const result: PerformResult = {
          playerId: performerPid,
          playerName: playerMap[performerPid] ?? "Player",
          outcome: "eliminated",
          buzzCount: newBuzzed.length,
          goldenCount: cur.goldenPlayerIds.length,
        };
        return {
          ...cur,
          buzzedPlayerIds: newBuzzed,
          totalVoters: liveVoters,
          r1Results: [...cur.r1Results, result],
          eliminatedPlayerIds: [...cur.eliminatedPlayerIds, performerPid],
          phase: "r1-result" as Phase,
          timerEnd: null,
        };
      }
      return { ...cur, buzzedPlayerIds: newBuzzed, totalVoters: liveVoters };
    });
  }, [myId, players, playerMap, mutateGameState]);

  // Audience: golden buzzer
  const handleGolden = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "performing" || cur.round !== 1) return null;
      const alreadyUsed = [...cur.buzzedPlayerIds, ...cur.goldenPlayerIds];
      if (alreadyUsed.includes(myId)) return null;
      const newGolden = [...cur.goldenPlayerIds, myId];
      const performerPid = cur.performerQueue[cur.currentPerformerIdx];
      const liveVoters = players.filter((p) => p.user_id !== performerPid).length;
      const threshold = Math.floor(liveVoters / 2) + 1; // strict majority (>50%)

      const totalVoted = cur.buzzedPlayerIds.length + newGolden.length;
      const allVoted = totalVoted >= liveVoters;

      // Majority golden → advance
      if (newGolden.length >= threshold) {
        const result: PerformResult = {
          playerId: performerPid,
          playerName: playerMap[performerPid] ?? "Player",
          outcome: "golden",
          buzzCount: cur.buzzedPlayerIds.length,
          goldenCount: newGolden.length,
        };
        return {
          ...cur,
          goldenPlayerIds: newGolden,
          totalVoters: liveVoters,
          r1Results: [...cur.r1Results, result],
          phase: "r1-result" as Phase,
          timerEnd: null,
        };
      }
      // All voted and golden strictly wins → advance immediately
      if (allVoted && newGolden.length > cur.buzzedPlayerIds.length) {
        const result: PerformResult = {
          playerId: performerPid,
          playerName: playerMap[performerPid] ?? "Player",
          outcome: "advanced",
          buzzCount: cur.buzzedPlayerIds.length,
          goldenCount: newGolden.length,
        };
        return {
          ...cur,
          goldenPlayerIds: newGolden,
          totalVoters: liveVoters,
          r1Results: [...cur.r1Results, result],
          phase: "r1-result" as Phase,
          timerEnd: null,
        };
      }
      return { ...cur, goldenPlayerIds: newGolden, totalVoters: liveVoters };
    });
  }, [myId, players, playerMap, mutateGameState]);

  // Performer: done early (R2/R3)
  const handleDoneEarly = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || (cur.phase !== "performing" && cur.phase !== "tiebreak-performing")) return null;
      if (cur.performerQueue[cur.currentPerformerIdx] !== myId) return null;
      return { ...cur, timerEnd: Date.now() };
    });
  }, [myId, mutateGameState]);

  // Host: timer expired during performing -> handle transition
  useEffect(() => {
    if (!isHost || !gs) return;
    if ((gs.phase !== "performing" && gs.phase !== "tiebreak-performing") || !gs.timerEnd) return;
    if (Date.now() < gs.timerEnd) return;

    // Timer expired
    if (gs.round === 1 && gs.phase === "performing") {
      // Check if neutral vote needed
      const performerPid = gs.performerQueue[gs.currentPerformerIdx];
      const buzzCount = gs.buzzedPlayerIds.length;
      const goldenCount = gs.goldenPlayerIds.length;
      const liveVoters = players.filter((p) => p.user_id !== performerPid).length;
      const threshold = Math.floor(liveVoters / 2) + 1; // strict majority (>50%)

      if (buzzCount >= threshold) return; // already handled
      if (goldenCount >= threshold) return; // already handled

      // Neutral voters = those who didn't buzz or golden
      const usedIds = new Set([...gs.buzzedPlayerIds, ...gs.goldenPlayerIds]);
      const neutralIds = players.filter((p) => p.user_id !== performerPid && !usedIds.has(p.user_id)).map((p) => p.user_id);

      if (neutralIds.length === 0) {
        // All voted via buzz/golden — need strict majority (>50%) to advance
        const outcome = goldenCount > buzzCount ? "advanced" : "eliminated";
        const result: PerformResult = {
          playerId: performerPid,
          playerName: playerMap[performerPid] ?? "Player",
          outcome,
          buzzCount,
          goldenCount,
        };
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "performing" || !cur.timerEnd || Date.now() < cur.timerEnd) return null;
          return {
            ...cur,
            phase: "r1-result" as Phase,
            timerEnd: null,
            r1Results: [...cur.r1Results, result],
            eliminatedPlayerIds: outcome === "eliminated" ? [...cur.eliminatedPlayerIds, performerPid] : cur.eliminatedPlayerIds,
          };
        });
      } else {
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "performing" || !cur.timerEnd || Date.now() < cur.timerEnd) return null;
          return {
            ...cur,
            phase: "r1-neutral-vote" as Phase,
            timerEnd: null,
            r1NeutralVoterIds: neutralIds,
            r1NeutralVotes: [],
            r1NeutralSubmittedIds: [],
          };
        });
      }
    } else {
      // R2/R3/tiebreak: advance to next performer or voting
      const nextIdx = gs.currentPerformerIdx + 1;
      if (nextIdx < gs.performerQueue.length) {
        // Next performer
        const isTiebreak = gs.phase === "tiebreak-performing";
        const { item: prompt, index } = isTiebreak
          ? pickRandom(TALENT_SHOW_TIEBREAK_PROMPTS, usedTBRef.current)
          : pickRandom(gs.round === 3 ? TALENT_SHOW_FINAL_PROMPTS : TALENT_SHOW_PROMPTS, gs.round === 3 ? usedFinalRef.current : usedR1R2Ref.current);
        if (isTiebreak) usedTBRef.current.add(index);
        else if (gs.round === 3) usedFinalRef.current.add(index);
        else usedR1R2Ref.current.add(index);

        mutateGameState((cur) => {
          if (!cur || (cur.phase !== "performing" && cur.phase !== "tiebreak-performing")) return null;
          return {
            ...cur,
            phase: isTiebreak ? ("tiebreak-prep" as Phase) : ("prep" as Phase),
            currentPerformerIdx: nextIdx,
            prompt,
            timerEnd: null,
            buzzedPlayerIds: [],
            goldenPlayerIds: [],
          };
        });
      } else {
        // All performed — go to voting
        // Tiebreaks always happen in round 2 or 3, so check the tiebreak phase first.
        if (gs.phase === "tiebreak-performing") {
          mutateGameState((cur) => {
            if (!cur) return null;
            // Candidates cannot vote in their own tiebreaker
            const candidateSet = new Set(cur.tiebreakerCandidates ?? cur.performerQueue);
            const voterIds = players.map((p) => p.user_id).filter((id) => !candidateSet.has(id));
            return {
              ...cur,
              phase: "tiebreak-vote" as Phase,
              timerEnd: null,
              tbVoterIds: voterIds,
              tbVotes: [],
              tbSubmittedVoterIds: [],
            };
          });
        } else if (gs.round === 2) {
          mutateGameState((cur) => {
            if (!cur) return null;
            const voterIds = players.map((p) => p.user_id);
            return {
              ...cur,
              phase: "r2-voting" as Phase,
              timerEnd: null,
              r2VoterIds: voterIds,
              r2Votes: [],
              r2SubmittedVoterIds: [],
            };
          });
        } else if (gs.round === 3) {
          mutateGameState((cur) => {
            if (!cur) return null;
            const voterIds = players.map((p) => p.user_id);
            return {
              ...cur,
              phase: "r3-voting" as Phase,
              timerEnd: null,
              r3VoterIds: voterIds,
              r3Votes: [],
              r3SubmittedVoterIds: [],
            };
          });
        }
      }
    }
  }, [isExpired, gs?.phase, gs?.timerEnd, isHost]);

  // R1 neutral vote submit
  const handleNeutralVote = useCallback(async (decision: "advance" | "eliminate") => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "r1-neutral-vote") return null;
      if (cur.r1NeutralSubmittedIds.includes(myId)) return null;
      if (!cur.r1NeutralVoterIds.includes(myId)) return null;
      return {
        ...cur,
        r1NeutralVotes: [...cur.r1NeutralVotes, { voterId: myId, decision }],
        r1NeutralSubmittedIds: [...cur.r1NeutralSubmittedIds, myId],
      };
    });
  }, [myId, mutateGameState]);

  // Host: process neutral votes
  useEffect(() => {
    if (!isHost || gs?.phase !== "r1-neutral-vote" || !gs) return;
    if (gs.r1NeutralSubmittedIds.length < gs.r1NeutralVoterIds.length) return;

    const advanceVotes = gs.goldenPlayerIds.length + gs.r1NeutralVotes.filter((v) => v.decision === "advance").length;
    const eliminateVotes = gs.buzzedPlayerIds.length + gs.r1NeutralVotes.filter((v) => v.decision === "eliminate").length;
    // Strict majority: need MORE advance votes to survive (tie = eliminated)
    const outcome = advanceVotes > eliminateVotes ? "advanced" : "eliminated";
    const performerPid = gs.performerQueue[gs.currentPerformerIdx];

    const result: PerformResult = {
      playerId: performerPid,
      playerName: playerMap[performerPid] ?? "Player",
      outcome,
      buzzCount: gs.buzzedPlayerIds.length,
      goldenCount: gs.goldenPlayerIds.length,
    };

    mutateGameState((cur) => {
      if (!cur || cur.phase !== "r1-neutral-vote") return null;
      if (cur.r1NeutralSubmittedIds.length < cur.r1NeutralVoterIds.length) return null;
      return {
        ...cur,
        phase: "r1-result" as Phase,
        r1Results: [...cur.r1Results, result],
        eliminatedPlayerIds: outcome === "eliminated" ? [...cur.eliminatedPlayerIds, performerPid] : cur.eliminatedPlayerIds,
      };
    });
  }, [gs?.r1NeutralSubmittedIds?.length, gs?.phase, isHost]);

  // Host: advance from r1-result -> next performer or R2
  const advanceFromR1Result = useCallback(async () => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "r1-result") return null;
      const nextIdx = cur.currentPerformerIdx + 1;
      if (nextIdx < cur.performerQueue.length) {
        const { item: prompt, index } = pickRandom(TALENT_SHOW_PROMPTS, usedR1R2Ref.current);
        usedR1R2Ref.current.add(index);
        return {
          ...cur,
          phase: "prep" as Phase,
          currentPerformerIdx: nextIdx,
          prompt,
          buzzedPlayerIds: [],
          goldenPlayerIds: [],
          r1NeutralVoterIds: [],
          r1NeutralVotes: [],
          r1NeutralSubmittedIds: [],
        };
      }
      // R1 done — advance to R2 (or straight to R3 / winner when few survive)
      let survivorIds = cur.performerQueue.filter((id) => !cur.eliminatedPlayerIds.includes(id));
      // Nobody survived: bring everyone back so the show can continue
      if (survivorIds.length === 0) survivorIds = cur.performerQueue;
      // Exactly 1 survivor: they win outright
      if (survivorIds.length === 1) {
        return {
          ...cur,
          phase: "winner" as Phase,
          winnerId: survivorIds[0],
          runnerUpId: null,
          buzzedPlayerIds: [],
          goldenPlayerIds: [],
        };
      }
      // Exactly 2 survivors: skip the Semifinals, go straight to the Finals
      if (survivorIds.length === 2) {
        const { item: finalPrompt, index: finalIdx } = pickRandom(TALENT_SHOW_FINAL_PROMPTS, usedFinalRef.current);
        usedFinalRef.current.add(finalIdx);
        return {
          ...cur,
          phase: "round-intro" as Phase,
          round: 3 as 1 | 2 | 3,
          r3FinalistIds: survivorIds,
          performerQueue: survivorIds,
          currentPerformerIdx: 0,
          prompt: finalPrompt,
          timerDuration: 30000,
          timerEnd: null,
          buzzedPlayerIds: [],
          goldenPlayerIds: [],
        };
      }
      const { item: prompt, index } = pickRandom(TALENT_SHOW_PROMPTS, usedR1R2Ref.current);
      usedR1R2Ref.current.add(index);
      return {
        ...cur,
        phase: "round-intro" as Phase,
        round: 2 as 1 | 2 | 3,
        performerQueue: survivorIds,
        currentPerformerIdx: 0,
        prompt,
        timerDuration: 30000,
        r2Results: survivorIds.map((id) => ({ playerId: id, playerName: playerMap[id] ?? "Player" })),
        buzzedPlayerIds: [],
        goldenPlayerIds: [],
      };
    });
  }, [mutateGameState, playerMap]);

  // R2 vote submit (pick 2)
  const handleR2Vote = useCallback(async () => {
    if (r2Selected.length !== 2) return;
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "r2-voting") return null;
      if (cur.r2SubmittedVoterIds.includes(myId)) return null;
      const newVotes = [...cur.r2Votes, ...r2Selected.map((id) => ({ voterId: myId, voteFor: id }))];
      return {
        ...cur,
        r2Votes: newVotes,
        r2SubmittedVoterIds: [...cur.r2SubmittedVoterIds, myId],
      };
    });
  }, [r2Selected, myId, mutateGameState]);

  // Host: process R2 votes
  useEffect(() => {
    if (!isHost || gs?.phase !== "r2-voting" || !gs) return;
    if (gs.r2SubmittedVoterIds.length < gs.r2VoterIds.length) return;

    const tally = tallyVotes(gs.r2Votes);
    const performerIds = gs.r2Results.map((r) => r.playerId);
    const allCounts = performerIds
      .map((id) => ({ id, count: tally.find((t) => t.id === id)?.count ?? 0 }))
      .sort((a, b) => b.count - a.count);

    // Top 2 advance
    const top2Count = allCounts[1]?.count ?? 0;
    const clearAdvanced = allCounts.filter((p) => p.count > top2Count).map((p) => p.id);
    const atCutoff = allCounts.filter((p) => p.count === top2Count).map((p) => p.id);
    const spotsLeft = 2 - clearAdvanced.length;

    if (atCutoff.length <= spotsLeft) {
      // No tie — advance to R3
      const r3Ids = [...clearAdvanced, ...atCutoff].slice(0, 2);
      const { item: prompt, index } = pickRandom(TALENT_SHOW_FINAL_PROMPTS, usedFinalRef.current);
      usedFinalRef.current.add(index);
      mutateGameState((cur) => {
        if (!cur || cur.phase !== "r2-voting") return null;
        return {
          ...cur,
          phase: "round-intro" as Phase,
          round: 3 as 1 | 2 | 3,
          r3FinalistIds: r3Ids,
          performerQueue: r3Ids,
          currentPerformerIdx: 0,
          prompt,
          timerDuration: 30000,
          timerEnd: null,
          buzzedPlayerIds: [],
          goldenPlayerIds: [],
        };
      });
    } else {
      // Tiebreaker — show announce screen first with vote tallies
      // Only show the tied candidates, not players who already advanced
      const voteTally = allCounts
        .filter((p) => atCutoff.includes(p.id))
        .map((p) => ({
          id: p.id,
          name: playerMap[p.id] ?? "Player",
          count: p.count,
        }));
      mutateGameState((cur) => {
        if (!cur || cur.phase !== "r2-voting") return null;
        return {
          ...cur,
          phase: "tiebreak-announce" as Phase,
          tiebreakerCandidates: atCutoff,
          tiebreakerSpotsNeeded: spotsLeft,
          tiebreakerAlreadyAdvanced: clearAdvanced,
          tiebreakerVoteTally: voteTally,
        };
      });
    }
  }, [gs?.r2SubmittedVoterIds?.length, gs?.phase, isHost]);

  // Host: advance from tiebreak-announce to tiebreak-prep
  const advanceFromTBAnnote = useCallback(async () => {
    const { item: tbPrompt, index: tbIdx } = pickRandom(TALENT_SHOW_TIEBREAK_PROMPTS, usedTBRef.current);
    usedTBRef.current.add(tbIdx);
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "tiebreak-announce") return null;
      // Candidates cannot vote in their own tiebreaker
      const candidateSet = new Set(cur.tiebreakerCandidates);
      const voterIds = players.map((p) => p.user_id).filter((id) => !candidateSet.has(id));
      return {
        ...cur,
        phase: "tiebreak-prep" as Phase,
        performerQueue: cur.tiebreakerCandidates,
        currentPerformerIdx: 0,
        prompt: tbPrompt,
        timerDuration: 10000,
        timerEnd: null,
        tbVotes: [],
        tbSubmittedVoterIds: [],
        tbVoterIds: voterIds,
      };
    });
  }, [mutateGameState, players]);

  // Tiebreak vote (candidates cannot vote)
  const handleTBVote = useCallback(async (voteFor: string) => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "tiebreak-vote") return null;
      if (cur.tbSubmittedVoterIds.includes(myId)) return null;
      if (!cur.tbVoterIds.includes(myId)) return null; // candidate, can't vote
      return {
        ...cur,
        tbVotes: [...cur.tbVotes, { voterId: myId, voteFor }],
        tbSubmittedVoterIds: [...cur.tbSubmittedVoterIds, myId],
      };
    });
  }, [myId, mutateGameState]);

  // Host: process tiebreak votes
  useEffect(() => {
    if (!isHost || gs?.phase !== "tiebreak-vote" || !gs) return;
    if (gs.tbSubmittedVoterIds.length < gs.tbVoterIds.length) return;

    const tally = tallyVotes(gs.tbVotes);
    const sorted = gs.tiebreakerCandidates
      .map((id) => ({ id, count: tally.find((t) => t.id === id)?.count ?? 0 }))
      .sort((a, b) => b.count - a.count);

    const winners = sorted.slice(0, gs.tiebreakerSpotsNeeded).map((p) => p.id);
    const newAdvanced = [...gs.tiebreakerAlreadyAdvanced, ...winners];

    if (gs.round === 3 || (gs.round === 2 && newAdvanced.length >= 2)) {
      if (gs.round === 3) {
        // Declare winner
        const winnerId = newAdvanced[0] ?? gs.r3FinalistIds[0];
        const runnerUpId = gs.r3FinalistIds.find((id) => id !== winnerId) ?? null;
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "tiebreak-vote") return null;
          return { ...cur, phase: "winner" as Phase, winnerId, runnerUpId };
        });
      } else {
        // Advance to R3
        const r3Ids = newAdvanced.slice(0, 2);
        const { item: prompt, index } = pickRandom(TALENT_SHOW_FINAL_PROMPTS, usedFinalRef.current);
        usedFinalRef.current.add(index);
        mutateGameState((cur) => {
          if (!cur || cur.phase !== "tiebreak-vote") return null;
          return {
            ...cur,
            phase: "round-intro" as Phase,
            round: 3 as 1 | 2 | 3,
            r3FinalistIds: r3Ids,
            performerQueue: r3Ids,
            currentPerformerIdx: 0,
            prompt,
            timerDuration: 30000,
            timerEnd: null,
          };
        });
      }
    }
  }, [gs?.tbSubmittedVoterIds?.length, gs?.phase, isHost]);

  // R3 vote
  const handleR3Vote = useCallback(async (voteFor: string) => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "r3-voting") return null;
      if (cur.r3SubmittedVoterIds.includes(myId)) return null;
      return {
        ...cur,
        r3Votes: [...cur.r3Votes, { voterId: myId, voteFor }],
        r3SubmittedVoterIds: [...cur.r3SubmittedVoterIds, myId],
      };
    });
  }, [myId, mutateGameState]);

  // Host: process R3 votes
  useEffect(() => {
    if (!isHost || gs?.phase !== "r3-voting" || !gs) return;
    if (gs.r3SubmittedVoterIds.length < gs.r3VoterIds.length) return;

    const tally = tallyVotes(gs.r3Votes);
    const sorted = gs.r3FinalistIds
      .map((id) => ({ id, count: tally.find((t) => t.id === id)?.count ?? 0 }))
      .sort((a, b) => b.count - a.count);

    if (sorted.length >= 2 && sorted[0].count === sorted[1].count) {
      // Tie — show announce screen first
      const voteTally = sorted.map((p) => ({
        id: p.id,
        name: playerMap[p.id] ?? "Player",
        count: p.count,
      }));
      mutateGameState((cur) => {
        if (!cur || cur.phase !== "r3-voting") return null;
        return {
          ...cur,
          phase: "tiebreak-announce" as Phase,
          round: 3 as 1 | 2 | 3,
          tiebreakerCandidates: gs.r3FinalistIds,
          tiebreakerSpotsNeeded: 1,
          tiebreakerAlreadyAdvanced: [],
          tiebreakerVoteTally: voteTally,
        };
      });
    } else {
      const winnerId = sorted[0]?.id ?? gs.r3FinalistIds[0];
      const runnerUpId = gs.r3FinalistIds.find((id) => id !== winnerId) ?? null;
      mutateGameState((cur) => {
        if (!cur || cur.phase !== "r3-voting") return null;
        return { ...cur, phase: "winner" as Phase, winnerId, runnerUpId };
      });
    }
  }, [gs?.r3SubmittedVoterIds?.length, gs?.phase, isHost]);

  const handleBackToLobby = useCallback(async () => {
    await endGame();
  }, [endGame]);

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (!gs || (gs.game as string) !== "talentShow" || !phase || (phase as string) === "starting") {
    return <GameLoadingScreen name="Nobody's Got Talent" icon="star" color="#F59E0B" />;
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
        <ScreenTitle title="Nobody's Got Talent" subtitle="Perform, buzz, and vote your way to victory!" />
        <GradientCard fill={gradients.hero} borderColors={HERO_BORDER} contentStyle={st.heroContent}>
          <View style={st.heroCopy}>
            <Eyebrow tone="dark">3 rounds · 1 winner</Eyebrow>
            <Text style={st.heroTitle}>Auditions, Semifinals, The Finals.</Text>
          </View>
          <Text style={st.heroEmoji}>{"⭐"}</Text>
        </GradientCard>
        <Eyebrow style={st.sectionEyebrow}>How it works</Eyebrow>
        <View style={st.list}>
          {[
            ["🎭", "Round 1: Everyone performs a prompt. Audience buzzes or golden buzzes."],
            ["🔴", "If more than half buzz, you're out. If more than half golden, you advance!"],
            ["🏆", "Round 2: Survivors perform again. Vote for top 2 finalists."],
            ["🌟", "Round 3: Finals! 2 finalists perform. Everyone votes for the winner."],
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

  // === ROUND INTRO ===
  if (phase === "round-intro") {
    const roundNames = ROUND_NAMES;
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Continue" icon="arrow-forward" onPress={advanceToPrep} />
          ) : (
            <WaitingNote label="Waiting for host..." />
          )
        }
      >
        <ScreenTitle
          title={roundNames[gs.round] ?? `Round ${gs.round}`}
          subtitle={
            gs.round === 1
              ? `${gs.performerQueue.length} performers. Buzz or golden buzz!`
              : gs.round === 2
                ? `${gs.performerQueue.length} survivors. Vote for the top 2!`
                : "2 finalists. Vote for the winner!"
          }
          pill={`Round ${gs.round}`}
        />
        <GradientCard fill={gradients.hero} borderColors={HERO_BORDER} contentStyle={st.heroContent}>
          <View style={st.heroCopy}>
            <Eyebrow tone="dark">Round {gs.round}</Eyebrow>
            <Text style={st.heroTitle}>{roundNames[gs.round] ?? `Round ${gs.round}`}</Text>
          </View>
          <Text style={st.heroBig}>{String(gs.round).padStart(2, "0")}</Text>
        </GradientCard>
        <Eyebrow style={st.sectionEyebrow}>The line-up</Eyebrow>
        <View style={st.list}>
          {gs.performerQueue.map((pid, i) => (
            <GradientCard key={pid} radius={radii.lg} contentStyle={st.candidateRow}>
              <View style={st.lineupNumber}>
                <Text style={st.lineupNumberText}>{i + 1}</Text>
              </View>
              <PlayerAvatar username={playerMap[pid] ?? "Player"} size={36} />
              <Text style={st.candidateName} numberOfLines={1}>
                {playerMap[pid] ?? "Player"}
              </Text>
            </GradientCard>
          ))}
        </View>
        {gs.round >= 2 && gs.eliminatedPlayerIds.length > 0 && (
          <>
            <Eyebrow style={st.sectionEyebrow}>Eliminated</Eyebrow>
            <View style={st.list}>
              {gs.eliminatedPlayerIds.map((pid) => (
                <GradientCard key={pid} radius={radii.lg} borderColors={DANGER_BORDER} contentStyle={st.candidateRow}>
                  <Ionicons name="close-circle" size={20} color={colors.danger} />
                  <PlayerAvatar username={playerMap[pid] ?? "Player"} size={32} />
                  <Text style={[st.candidateName, { color: colors.gray400 }]} numberOfLines={1}>
                    {playerMap[pid] ?? "Player"}
                  </Text>
                </GradientCard>
              ))}
            </View>
          </>
        )}
      </Shell>
    );
  }

  // === PREP (performer sees prompt, presses start) ===
  if (phase === "prep" || phase === "tiebreak-prep") {
    const isTB = phase === "tiebreak-prep";
    const roundName = ROUND_NAMES[gs.round] ?? `Round ${gs.round}`;
    return (
      <Shell
        footer={
          isPerformer ? (
            <PrimaryAction label="Start!" icon="play" onPress={startPerforming} />
          ) : (
            <WaitingNote label={`Waiting for ${currentPerformerName} to start...`} />
          )
        }
      >
        <ScreenTitle
          title={isPerformer ? "You're up!" : `${currentPerformerName} is up`}
          subtitle={
            isTB
              ? `Tiebreaker · ${roundName}`
              : `Performer ${gs.currentPerformerIdx + 1} of ${gs.performerQueue.length} · ${roundName}`
          }
          pill={isTB ? "Tiebreaker" : undefined}
        />
        <GradientCard radius={radii.lg} contentStyle={st.candidateRow}>
          <PlayerAvatar username={currentPerformerName} size={44} />
          <View style={st.flex1}>
            <Eyebrow>{isTB ? "Tiebreaker" : `Performer ${gs.currentPerformerIdx + 1} of ${gs.performerQueue.length}`}</Eyebrow>
            <Text style={st.candidateName} numberOfLines={1}>
              {currentPerformerName}
            </Text>
          </View>
        </GradientCard>
        <GradientCard contentStyle={st.taskCard}>
          <Eyebrow tone="lavender">{isPerformer ? "Your task" : "The task"}</Eyebrow>
          <Text style={st.taskText}>{gs.prompt}</Text>
          <View style={st.taskMeta}>
            <Ionicons name="timer-outline" size={16} color={colors.gray400} />
            <Text style={st.taskMetaText}>{isTB ? "10" : "30"} seconds</Text>
          </View>
        </GradientCard>
      </Shell>
    );
  }

  // === PERFORMING ===
  if (phase === "performing" || phase === "tiebreak-performing") {
    const buzzCount = gs.buzzedPlayerIds.length;
    const goldenCount = gs.goldenPlayerIds.length;
    const hasUsedAction = gs.buzzedPlayerIds.includes(myId) || gs.goldenPlayerIds.includes(myId);
    const isR1 = gs.round === 1 && phase === "performing";
    const isTB = phase === "tiebreak-performing";
    const roundName = ROUND_NAMES[gs.round] ?? `Round ${gs.round}`;
    const progress =
      gs.timerDuration > 0 ? Math.min(1, Math.max(0, (secondsLeft * 1000) / gs.timerDuration)) : 0;

    let footer: React.ReactNode = null;
    if (isPerformer) {
      footer = (
        <>
          <Text style={st.footerHelper}>Your moment. Give it your best.</Text>
          <PrimaryAction label="I'm done" onPress={handleDoneEarly} />
        </>
      );
    } else if (isR1) {
      footer = hasUsedAction ? (
        <WaitingNote done label="Vote submitted! Watching the show..." />
      ) : (
        <View style={st.buzzerRow}>
          <View style={st.buzzerCol}>
            <Pressable
              onPress={handleBuzz}
              accessibilityRole="button"
              style={({ pressed }) => [st.buzzerCircle, st.buzzerRed, pressed && { transform: [{ scale: 0.92 }] }]}
            >
              <Ionicons name="close" size={44} color="#fff" />
            </Pressable>
            <Text style={st.buzzerLabel}>BUZZ ({buzzCount})</Text>
          </View>
          <View style={st.buzzerCol}>
            <Pressable
              onPress={handleGolden}
              accessibilityRole="button"
              style={({ pressed }) => [st.buzzerCircle, st.buzzerGold, pressed && { transform: [{ scale: 0.92 }] }]}
            >
              <Ionicons name="star" size={40} color={colors.onPrimary} />
            </Pressable>
            <Text style={st.buzzerLabel}>GOLDEN ({goldenCount})</Text>
          </View>
        </View>
      );
    } else {
      footer = <WaitingNote label="Watching the performance..." />;
    }

    return (
      <Shell footer={footer}>
        <ScreenTitle
          title={isPerformer ? "You're on!" : `${currentPerformerName} is on!`}
          subtitle={
            isTB
              ? `Tiebreaker · ${roundName}`
              : `Performer ${gs.currentPerformerIdx + 1} of ${gs.performerQueue.length} · ${roundName}`
          }
        />
        <View style={st.countdown}>
          <Text style={st.countdownNum}>{secondsLeft}</Text>
          <Eyebrow>Seconds left</Eyebrow>
          <View style={st.progressTrack}>
            <View style={[st.progressFill, st.progressFillLavender, { width: `${progress * 100}%` }]} />
          </View>
        </View>
        <GradientCard
          radius={radii.lg}
          contentStyle={st.taskCard}
          fill={gradients.taskCard}
          borderColors={TASK_CARD_EDGE}
        >
          <Eyebrow style={st.taskEyebrow}>{isPerformer ? "Your task" : "The task"}</Eyebrow>
          <Text style={st.taskText}>{gs.prompt}</Text>
        </GradientCard>
        {isPerformer ? (
          <View style={st.performerHelp}>
            <Text style={st.performerHelpTitle}>Everyone else is judging.</Text>
            <Text style={st.performerHelpBody}>
              {isR1
                ? "Keep going until the timer runs out."
                : "Keep going until the timer runs out, or finish early when you're done."}
            </Text>
          </View>
        ) : isR1 && !hasUsedAction ? (
          <Text style={st.helper}>Rate the performance!</Text>
        ) : null}
      </Shell>
    );
  }

  // === R1 NEUTRAL VOTE ===
  if (phase === "r1-neutral-vote") {
    const isVoter = gs.r1NeutralVoterIds.includes(myId);
    const hasVoted = gs.r1NeutralSubmittedIds.includes(myId);
    return (
      <Shell
        footer={
          isVoter && !hasVoted ? (
            <View style={st.buzzRow}>
              <GoldenButton label="Advance" icon="arrow-up-circle" onPress={() => handleNeutralVote("advance")} />
              <Pressable
                onPress={() => handleNeutralVote("eliminate")}
                accessibilityRole="button"
                style={({ pressed }) => [st.judgeBtn, st.buzzBtn, pressed && st.pressed]}
              >
                <Ionicons name="close-circle" size={18} color={colors.danger} />
                <Text style={st.buzzBtnText}>Eliminate</Text>
              </Pressable>
            </View>
          ) : (
            <WaitingNote done={hasVoted} label={hasVoted ? "Vote submitted!" : "Waiting for jury..."} />
          )
        }
      >
        <ScreenTitle
          title="Jury Vote"
          subtitle={`${currentPerformerName}'s performance was split. Cast your vote!`}
        />
        <GradientCard radius={radii.lg} contentStyle={st.candidateRow}>
          <PlayerAvatar username={currentPerformerName} size={44} />
          <Text style={st.candidateName} numberOfLines={1}>
            {currentPerformerName}
          </Text>
        </GradientCard>
        <View style={st.statRow}>
          <StatCard label="Buzzes" value={gs.buzzedPlayerIds.length} />
          <StatCard label="Golden" value={gs.goldenPlayerIds.length} gold />
        </View>
      </Shell>
    );
  }

  // === R1 RESULT ===
  if (phase === "r1-result") {
    const lastResult = gs.r1Results[gs.r1Results.length - 1];
    const outcome = lastResult?.outcome;
    const lightCard = outcome === "golden" || outcome === "advanced";
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Continue" icon="arrow-forward" onPress={advanceFromR1Result} />
          ) : (
            <WaitingNote label="Waiting for host..." />
          )
        }
      >
        <ScreenTitle title="The verdict" subtitle={`${ROUND_NAMES[gs.round] ?? `Round ${gs.round}`}`} />
        <GradientCard
          fill={outcome === "golden" ? gradients.gold : outcome === "advanced" ? gradients.hero : undefined}
          borderColors={outcome === "golden" ? GOLD_BORDER : outcome === "advanced" ? HERO_BORDER : DANGER_BORDER}
          contentStyle={st.resultCard}
        >
          <Text style={st.resultEmoji}>
            {lastResult?.outcome === "golden" ? "⭐" : lastResult?.outcome === "advanced" ? "✅" : "❌"}
          </Text>
          <Text style={[st.resultName, { color: lightCard ? colors.onPrimary : colors.white }]}>
            {lastResult?.playerName ?? "Player"}
          </Text>
          <Text style={[st.resultOutcome, { color: lightCard ? colors.onPrimary : colors.danger }]}>
            {lastResult?.outcome === "golden" ? "Golden Buzzer!" : lastResult?.outcome === "advanced" ? "ADVANCED!" : "ELIMINATED!"}
          </Text>
        </GradientCard>
        <View style={st.statRow}>
          <StatCard label="Buzzes" value={lastResult?.buzzCount ?? 0} />
          <StatCard label="Golden" value={lastResult?.goldenCount ?? 0} gold />
        </View>
      </Shell>
    );
  }

  // === R2 VOTING ===
  if (phase === "r2-voting") {
    const hasVoted = gs.r2SubmittedVoterIds.includes(myId);
    const performers = (gs.r2Results ?? []).filter((p) => p.playerId !== myId);
    if (hasVoted) {
      return <SubmittedScreen submitted={gs.r2SubmittedVoterIds.length} total={gs.r2VoterIds.length} />;
    }
    return (
      <Shell
        footer={
          <PrimaryAction label="Submit Vote" onPress={handleR2Vote} disabled={r2Selected.length !== 2} />
        }
      >
        <ScreenTitle
          title="Vote for Top 2"
          subtitle="Select exactly 2 performers to advance to the finals."
          pill={`${r2Selected.length}/2 picked`}
        />
        <View style={st.list}>
          {performers.map((p) => {
            const sel = r2Selected.includes(p.playerId);
            return (
              <CandidateRow
                key={p.playerId}
                name={p.playerName}
                selected={sel}
                onPress={() => {
                  setR2Selected((prev) =>
                    prev.includes(p.playerId)
                      ? prev.filter((id) => id !== p.playerId)
                      : prev.length < 2 ? [...prev, p.playerId] : prev
                  );
                }}
                trailing={
                  <View style={[st.check, sel && st.checkOn]}>
                    {sel ? <Ionicons name="checkmark" size={16} color={colors.onPrimary} /> : null}
                  </View>
                }
              />
            );
          })}
        </View>
      </Shell>
    );
  }

  // === TIEBREAK ANNOUNCE (show votes before tiebreaker) ===
  if (phase === "tiebreak-announce") {
    const tally = gs.tiebreakerVoteTally ?? [];
    return (
      <Shell
        footer={
          isHost ? (
            <PrimaryAction label="Start Tiebreaker" icon="flash" onPress={advanceFromTBAnnote} />
          ) : (
            <View style={st.centerRow}>
              <HostWaitingPill label="Waiting for host..." />
            </View>
          )
        }
      >
        <ScreenTitle title="It's a Tie!" subtitle="These players are tied and must break it." pill="Tiebreaker" />
        {gs.tiebreakerAlreadyAdvanced.length > 0 && (
          <>
            <Eyebrow style={st.sectionEyebrow}>Already advanced</Eyebrow>
            <View style={st.list}>
              {gs.tiebreakerAlreadyAdvanced.map((pid) => (
                <GradientCard key={pid} radius={radii.lg} contentStyle={st.candidateRow}>
                  <PlayerAvatar username={playerMap[pid] ?? "Player"} size={36} />
                  <Text style={st.candidateName} numberOfLines={1}>{playerMap[pid] ?? "Player"}</Text>
                  <Ionicons name="checkmark-circle" size={20} color={colors.joinedGreen} />
                </GradientCard>
              ))}
            </View>
          </>
        )}
        <Eyebrow style={st.sectionEyebrow}>Tied — need tiebreaker</Eyebrow>
        <View style={st.list}>
          {tally.map((entry) => (
            <GradientCard key={entry.id} radius={radii.lg} contentStyle={st.candidateRow}>
              <PlayerAvatar username={entry.name} size={40} />
              <View style={st.flex1}>
                <Text style={st.candidateName} numberOfLines={1}>{entry.name}</Text>
              </View>
              <View style={st.voteCountBadge}>
                <Text style={st.voteCountText}>{entry.count} {entry.count === 1 ? "vote" : "votes"}</Text>
              </View>
            </GradientCard>
          ))}
        </View>
      </Shell>
    );
  }

  // === TIEBREAK VOTE ===
  if (phase === "tiebreak-vote") {
    const isCandidate = gs.tiebreakerCandidates.includes(myId);
    const hasVoted = gs.tbSubmittedVoterIds.includes(myId);
    // Candidates can't vote — show waiting screen
    if (isCandidate || hasVoted) {
      return <SubmittedScreen submitted={gs.tbSubmittedVoterIds.length} total={gs.tbVoterIds.length} />;
    }
    return (
      <Shell>
        <ScreenTitle title="Tiebreaker Vote" subtitle="Pick who should advance." pill="Tiebreaker" />
        <View style={st.list}>
          {gs.tiebreakerCandidates.map((pid) => (
            <CandidateRow
              key={pid}
              name={playerMap[pid] ?? "Player"}
              onPress={() => handleTBVote(pid)}
              trailing={<VoteTag />}
            />
          ))}
        </View>
      </Shell>
    );
  }

  // === R3 VOTING ===
  if (phase === "r3-voting") {
    const hasVoted = gs.r3SubmittedVoterIds.includes(myId);
    if (hasVoted) {
      return <SubmittedScreen submitted={gs.r3SubmittedVoterIds.length} total={gs.r3VoterIds.length} />;
    }
    return (
      <Shell>
        <ScreenTitle title="The Final Vote" subtitle="Who should win?" pill="Finals" />
        <View style={st.list}>
          {gs.r3FinalistIds.filter((pid) => pid !== myId).map((pid) => (
            <CandidateRow
              key={pid}
              name={playerMap[pid] ?? "Player"}
              onPress={() => handleR3Vote(pid)}
              trailing={<VoteTag />}
            />
          ))}
        </View>
      </Shell>
    );
  }

  // === WINNER ===
  if (phase === "winner") {
    const winnerName = gs.winnerId ? playerMap[gs.winnerId] ?? "???" : "???";
    const iWon = gs.winnerId === myId;
    return (
      <Shell
        footer={
          isHost ? (
            <View style={st.footerStack}>
              <PrimaryAction
                label="Play Again"
                icon="refresh"
                iconPosition="left"
                onPress={() => startGame("talentShow")}
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
        <ScreenTitle title={iWon ? "YOU WIN!" : `${winnerName} WINS!`} subtitle="Final results" />
        <GradientCard fill={gradients.hero} borderColors={HERO_BORDER} contentStyle={st.winnerContent}>
          <View style={[st.rankTile, st.rankTileHero]}>
            <Text style={[st.rankText, st.rankTextHero]}>1</Text>
          </View>
          <PlayerAvatar username={winnerName} size={48} />
          <View style={st.flex1}>
            <Eyebrow tone="dark">Winner</Eyebrow>
            <Text style={st.winnerName} numberOfLines={1}>
              {winnerName}
            </Text>
          </View>
          <Ionicons name="trophy" size={30} color={colors.onPrimary} />
        </GradientCard>
        {trophyDelta !== 0 && (
          <Text style={trophyDelta > 0 ? st.trophyGain : st.trophyLoss}>
            {trophyDelta > 0 ? `\uD83C\uDFC6 +${trophyDelta} trophies!` : `\uD83C\uDFC6 -1 trophy`}
          </Text>
        )}
        {gs.runnerUpId && (
          <GradientCard radius={radii.lg} contentStyle={st.candidateRow}>
            <View style={st.rankTile}>
              <Text style={st.rankText}>2</Text>
            </View>
            <PlayerAvatar username={playerMap[gs.runnerUpId] ?? "?"} size={40} />
            <View style={st.flex1}>
              <Eyebrow>Runner-up</Eyebrow>
              <Text style={st.candidateName} numberOfLines={1}>
                {playerMap[gs.runnerUpId] ?? "?"}
              </Text>
            </View>
          </GradientCard>
        )}

        {/* Final vote counts */}
        {gs.r3Votes.length > 0 && (
          <>
            <Eyebrow style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>Final Votes</Eyebrow>
            {tallyVotes(gs.r3Votes)
              .sort((a, b) => b.count - a.count)
              .map((entry) => (
                <GradientCard key={entry.id} radius={radii.lg} contentStyle={st.candidateRow}>
                  <PlayerAvatar username={playerMap[entry.id] ?? "?"} size={36} />
                  <View style={st.flex1}>
                    <Text style={st.candidateName} numberOfLines={1}>
                      {playerMap[entry.id] ?? "?"}
                    </Text>
                  </View>
                  <Pill tone="lavender" label={`${entry.count} vote${entry.count !== 1 ? "s" : ""}`} />
                </GradientCard>
              ))}
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

const ROUND_NAMES: Record<number, string> = { 1: "Auditions", 2: "Semifinals", 3: "The Finals" };

const HERO_BORDER = ["rgba(255,255,255,0.55)", "rgba(255,255,255,0.12)"] as const;
const GOLD_BORDER = ["rgba(246,227,166,0.9)", "rgba(212,168,67,0.35)"] as const;
const DANGER_BORDER = ["rgba(239,68,68,0.6)", "rgba(239,68,68,0.1)"] as const;
const SELECTED_BORDER = [THEME.accent, THEME.accent] as const;
const TASK_CARD_EDGE = ["rgba(186,162,249,0.38)", "rgba(186,162,249,0.16)"] as const;
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
        <GameLogo gameId="talentShow" height={44} />
        {pill ? <Pill tone="peach" label={pill} /> : null}
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
      <Text style={st.waitingText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function GoldenButton({
  label,
  onPress,
  icon = "star",
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [st.judgeBtn, pressed && st.pressed]}
    >
      <LinearGradient
        colors={gradients.gold}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={[StyleSheet.absoluteFill, st.pillRadius]}
        pointerEvents="none"
      />
      <Ionicons name={icon} size={18} color={colors.onPrimary} />
      <Text style={st.goldenBtnText} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </Pressable>
  );
}

function StatCard({ label, value, gold = false }: { label: string; value: number; gold?: boolean }) {
  return (
    <GradientCard style={st.flex1} radius={radii.lg} contentStyle={st.statContent}>
      <Text style={[st.statValue, gold && { color: colors.goldLight }]}>{value}</Text>
      <Eyebrow>{label}</Eyebrow>
    </GradientCard>
  );
}

function CandidateRow({
  name,
  selected = false,
  onPress,
  trailing,
}: {
  name: string;
  selected?: boolean;
  onPress: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [pressed && st.pressed]}
    >
      <GradientCard
        radius={radii.lg}
        borderColors={selected ? SELECTED_BORDER : undefined}
        fill={selected ? SELECTED_FILL : undefined}
        contentStyle={st.candidateRow}
      >
        <PlayerAvatar username={name} size={40} />
        <Text style={st.candidateName} numberOfLines={1}>
          {name}
        </Text>
        {trailing}
      </GradientCard>
    </Pressable>
  );
}

function VoteTag() {
  return (
    <View style={st.voteTag}>
      <Text style={st.voteTagText}>VOTE</Text>
      <Ionicons name="chevron-forward" size={16} color={THEME.accent} />
    </View>
  );
}

function SubmittedScreen({ submitted, total }: { submitted: number; total: number }) {
  return (
    <Shell footer={<WaitingNote label={`${submitted} / ${total} voted`} />}>
      <ScreenTitle title="Vote submitted!" subtitle={`${submitted} / ${total} voted`} />
      <GradientCard contentStyle={st.submittedCard}>
        <View style={st.submittedIcon}>
          <Ionicons name="checkmark" size={36} color={THEME.accent} />
        </View>
        <Eyebrow>Votes in</Eyebrow>
        <View style={st.progressTrack}>
          <LinearGradient
            colors={gradients.primaryButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[st.progressFill, { width: `${total > 0 ? Math.min(100, (submitted / total) * 100) : 0}%` }]}
          />
        </View>
      </GradientCard>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Styles
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
  pillRadius: { borderRadius: radii.pill },
  loadingText: { fontFamily: fonts.medium, fontSize: 16, color: colors.gray400, marginTop: 16 },

  // Title block
  titleBlock: { gap: spacing.sm },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  sectionEyebrow: { marginTop: spacing.xs },
  helper: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray400, textAlign: "center" },

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

  // Hero (lavender) card
  heroContent: { flexDirection: "row", alignItems: "center", padding: 22, gap: spacing.md },
  heroCopy: { flex: 1, gap: 6 },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 29, color: colors.onPrimary },
  heroEmoji: { fontSize: 56 },
  heroBig: {
    fontFamily: fonts.extrabold,
    fontSize: 64,
    lineHeight: 70,
    letterSpacing: -2,
    color: colors.onPrimary,
    fontVariant: ["tabular-nums"],
  },

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

  // Line-up chips
  lineupNumber: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(186,162,249,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  lineupNumberText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.lavender,
  },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white, maxWidth: 140 },

  // Task card
  taskCard: { padding: 22, gap: spacing.md },
  taskText: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 31, color: colors.white },
  taskMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  taskMetaText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray400 },

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
  progressFillLavender: { backgroundColor: colors.lavender },
  taskEyebrow: { fontSize: 9, letterSpacing: 0.8, color: "rgba(255,255,255,0.6)" },
  performerHelp: { gap: 6 },
  performerHelpTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  performerHelpBody: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.gray400 },
  footerHelper: { fontFamily: fonts.regular, fontSize: 13, color: colors.gray400, textAlign: "center" },

  // Circular buzzer buttons
  buzzerRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 40,
    paddingVertical: 4,
  },
  buzzerCol: {
    alignItems: "center",
    gap: 8,
  },
  buzzerCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  buzzerRed: {
    backgroundColor: colors.danger,
    shadowColor: colors.danger,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.15)",
  },
  buzzerGold: {
    backgroundColor: "#F0D78C",
    shadowColor: "#D4A843",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
  },
  buzzerLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.gray400,
  },

  // Legacy judging buttons (neutral vote)
  buzzRow: { flexDirection: "row", gap: spacing.md },
  judgeBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: radii.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  buzzBtn: { backgroundColor: THEME.surface, borderWidth: 1.5, borderColor: colors.danger },
  buzzBtnText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  goldenBtnText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.onPrimary },

  // Stats
  statRow: { flexDirection: "row", gap: spacing.md },
  statContent: { padding: spacing.lg, gap: 4 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 30, color: colors.white, fontVariant: ["tabular-nums"] },

  // Result
  resultCard: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 20, gap: spacing.sm },
  resultEmoji: { fontSize: 56 },
  resultName: { fontFamily: fonts.extrabold, fontSize: 28, textAlign: "center" },
  resultOutcome: { fontFamily: fonts.bold, fontSize: 15, letterSpacing: 1.5, textTransform: "uppercase" },

  // Candidate rows
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  candidateName: { flex: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.white },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.gray600,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: THEME.accent, borderColor: THEME.accent },
  voteCountBadge: {
    backgroundColor: "rgba(184,174,232,0.18)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  voteCountText: { fontFamily: fonts.bold, fontSize: 13, color: colors.lavender },
  voteTag: { flexDirection: "row", alignItems: "center", gap: 2 },
  voteTagText: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2, color: THEME.accent },

  // Submitted
  submittedCard: { alignItems: "center", padding: 24, gap: spacing.md },
  submittedIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: THEME.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  // Winner
  winnerContent: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 20 },
  rankTile: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: THEME.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rankTileHero: { backgroundColor: colors.onPrimary },
  rankText: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.white },
  rankTextHero: { color: THEME.accent },
  winnerName: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.onPrimary },
  trophyGain: { fontFamily: fonts.bold, fontSize: 16, color: "#FFD700", textAlign: "center", marginTop: spacing.sm },
  trophyLoss: { fontFamily: fonts.bold, fontSize: 16, color: colors.gray400, textAlign: "center", marginTop: spacing.sm },
});
