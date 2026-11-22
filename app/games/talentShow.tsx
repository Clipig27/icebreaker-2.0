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
import { colors, fonts } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import { useAuthStore } from "../../src/stores/authStore";
import {
  TALENT_SHOW_PROMPTS,
  TALENT_SHOW_TIEBREAK_PROMPTS,
  TALENT_SHOW_FINAL_PROMPTS,
} from "../../src/data/talentShow";
import HostWaitingPill from "../../src/components/HostWaitingPill";
import GameHeader from "../../src/components/GameHeader";

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

  winnerId: string | null;
  runnerUpId: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRandom<T>(arr: T[], exclude: Set<number>): { item: T; index: number } {
  const available = arr.map((_, i) => i).filter((i) => !exclude.has(i));
  const pool = available.length > 0 ? available : arr.map((_, i) => i);
  if (available.length === 0) exclude.clear();
  const index = pool[Math.floor(Math.random() * pool.length)];
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
  const { room, players, isHost, mutateGameState, endGame } = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const usedR1R2Ref = useRef(new Set<number>());
  const usedTBRef = useRef(new Set<number>());
  const usedFinalRef = useRef(new Set<number>());

  // R2 multi-select
  const [r2Selected, setR2Selected] = useState<string[]>([]);

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
      winnerId: null,
      runnerUpId: null,
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
      const threshold = Math.ceil(liveVoters / 2);

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
      const threshold = Math.ceil(liveVoters / 2);

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
      const threshold = Math.ceil(liveVoters / 2);

      if (buzzCount >= threshold) return; // already handled
      if (goldenCount >= threshold) return; // already handled

      // Neutral voters = those who didn't buzz or golden
      const usedIds = new Set([...gs.buzzedPlayerIds, ...gs.goldenPlayerIds]);
      const neutralIds = players.filter((p) => p.user_id !== performerPid && !usedIds.has(p.user_id)).map((p) => p.user_id);

      if (neutralIds.length === 0) {
        // All voted via buzz/golden, determine by majority
        const outcome = goldenCount >= buzzCount ? "advanced" : "eliminated";
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
            const voterIds = players.map((p) => p.user_id);
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
    const outcome = advanceVotes >= eliminateVotes ? "advanced" : "eliminated";
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
      // Tiebreaker
      const { item: tbPrompt, index: tbIdx } = pickRandom(TALENT_SHOW_TIEBREAK_PROMPTS, usedTBRef.current);
      usedTBRef.current.add(tbIdx);
      mutateGameState((cur) => {
        if (!cur || cur.phase !== "r2-voting") return null;
        return {
          ...cur,
          phase: "tiebreak-prep" as Phase,
          tiebreakerCandidates: atCutoff,
          tiebreakerSpotsNeeded: spotsLeft,
          tiebreakerAlreadyAdvanced: clearAdvanced,
          performerQueue: atCutoff,
          currentPerformerIdx: 0,
          prompt: tbPrompt,
          timerDuration: 10000,
          timerEnd: null,
          tbVotes: [],
          tbSubmittedVoterIds: [],
          tbVoterIds: players.map((p) => p.user_id),
        };
      });
    }
  }, [gs?.r2SubmittedVoterIds?.length, gs?.phase, isHost]);

  // Tiebreak vote
  const handleTBVote = useCallback(async (voteFor: string) => {
    await mutateGameState((cur) => {
      if (!cur || cur.phase !== "tiebreak-vote") return null;
      if (cur.tbSubmittedVoterIds.includes(myId)) return null;
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
      // Tie — tiebreaker
      const { item: tbPrompt, index: tbIdx } = pickRandom(TALENT_SHOW_TIEBREAK_PROMPTS, usedTBRef.current);
      usedTBRef.current.add(tbIdx);
      mutateGameState((cur) => {
        if (!cur || cur.phase !== "r3-voting") return null;
        return {
          ...cur,
          phase: "tiebreak-prep" as Phase,
          round: 3 as 1 | 2 | 3,
          tiebreakerCandidates: gs.r3FinalistIds,
          tiebreakerSpotsNeeded: 1,
          tiebreakerAlreadyAdvanced: [],
          performerQueue: gs.r3FinalistIds,
          currentPerformerIdx: 0,
          prompt: tbPrompt,
          timerDuration: 10000,
          timerEnd: null,
          tbVotes: [],
          tbSubmittedVoterIds: [],
          tbVoterIds: players.map((p) => p.user_id),
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
          <Text style={st.bigEmoji}>{"\u2B50"}</Text>
          <Text style={st.title}>Nobody's Got Talent</Text>
          <Text style={st.tagline}>Perform, buzz, and vote your way to victory!</Text>
          <View style={st.rulesBox}>
            {[
              ["\uD83C\uDFAD", "Round 1: Everyone performs a prompt. Audience buzzes or golden buzzes."],
              ["\uD83D\uDD34", "If majority buzzes, you're eliminated. Golden = you advance!"],
              ["\uD83C\uDFC6", "Round 2: Survivors perform again. Vote for top 2 finalists."],
              ["\uD83C\uDF1F", "Round 3: Finals! 2 finalists perform. Everyone votes for the winner."],
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

  // === ROUND INTRO ===
  if (phase === "round-intro") {
    const roundNames = { 1: "Auditions", 2: "Semifinals", 3: "The Finals" };
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <View style={st.centered}>
          <Text style={st.roundBadge}>ROUND {gs.round}</Text>
          <Text style={st.roundTitle}>{roundNames[gs.round] ?? `Round ${gs.round}`}</Text>
          <Text style={st.roundSub}>
            {gs.round === 1 && `${gs.performerQueue.length} performers. Buzz or golden buzz!`}
            {gs.round === 2 && `${gs.performerQueue.length} survivors. Vote for the top 2!`}
            {gs.round === 3 && "2 finalists. Vote for the winner!"}
          </Text>
          {isHost ? (
            <TouchableOpacity style={st.primaryBtn} onPress={advanceToPrep}>
              <Text style={st.primaryBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <Text style={st.wait}>Waiting for host...</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // === PREP (performer sees prompt, presses start) ===
  if (phase === "prep" || phase === "tiebreak-prep") {
    const isTB = phase === "tiebreak-prep";
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <View style={st.centered}>
          <Text style={st.prepLabel}>{isTB ? "TIEBREAKER" : `PERFORMER ${gs.currentPerformerIdx + 1} of ${gs.performerQueue.length}`}</Text>
          <Text style={st.prepName}>{currentPerformerName}</Text>
          <View style={st.promptCard}>
            <Text style={st.promptText}>{gs.prompt}</Text>
          </View>
          <Text style={st.prepTimer}>{isTB ? "10" : "30"} seconds</Text>
          {isPerformer ? (
            <TouchableOpacity style={st.primaryBtn} onPress={startPerforming}>
              <Text style={st.primaryBtnText}>Start!</Text>
            </TouchableOpacity>
          ) : (
            <Text style={st.wait}>Waiting for {currentPerformerName} to start...</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // === PERFORMING ===
  if (phase === "performing" || phase === "tiebreak-performing") {
    const buzzCount = gs.buzzedPlayerIds.length;
    const goldenCount = gs.goldenPlayerIds.length;
    const hasUsedAction = gs.buzzedPlayerIds.includes(myId) || gs.goldenPlayerIds.includes(myId);
    const isR1 = gs.round === 1 && phase === "performing";

    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.perfScroll}>
          <Text style={st.perfLabel}>{currentPerformerName} is performing!</Text>
          <View style={st.timerCircle}>
            <Text style={st.timerBig}>{secondsLeft}</Text>
          </View>
          <View style={st.promptCard}>
            <Text style={st.promptText}>{gs.prompt}</Text>
          </View>

          {isPerformer ? (
            <View style={{ gap: 12 }}>
              <Text style={st.perfHint}>You're performing! Go!</Text>
              {!isR1 && (
                <TouchableOpacity style={st.secondaryBtn} onPress={handleDoneEarly}>
                  <Text style={st.secondaryBtnText}>I'm Done</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : isR1 ? (
            <View style={{ gap: 12, alignSelf: "stretch" }}>
              {hasUsedAction ? (
                <Text style={st.wait}>Vote submitted! Watching the show...</Text>
              ) : (
                <>
                  <Text style={st.perfHint}>Rate the performance!</Text>
                  <View style={st.buzzRow}>
                    <TouchableOpacity style={st.buzzBtn} onPress={handleBuzz}>
                      <Text style={st.buzzBtnText} numberOfLines={1} adjustsFontSizeToFit>BUZZ ({buzzCount})</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={st.goldenBtn} onPress={handleGolden}>
                      <Text style={st.goldenBtnText} numberOfLines={1} adjustsFontSizeToFit>GOLDEN ({goldenCount})</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          ) : (
            <Text style={st.wait}>Watching the performance...</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === R1 NEUTRAL VOTE ===
  if (phase === "r1-neutral-vote") {
    const isVoter = gs.r1NeutralVoterIds.includes(myId);
    const hasVoted = gs.r1NeutralSubmittedIds.includes(myId);
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <View style={st.centered}>
          <Text style={st.voteTitle}>Jury Vote</Text>
          <Text style={st.voteSub}>{currentPerformerName}'s performance was split. Cast your vote!</Text>
          <Text style={st.voteSub}>Buzzes: {gs.buzzedPlayerIds.length} | Golden: {gs.goldenPlayerIds.length}</Text>
          {isVoter && !hasVoted ? (
            <View style={st.buzzRow}>
              <TouchableOpacity style={st.goldenBtn} onPress={() => handleNeutralVote("advance")}>
                <Text style={st.goldenBtnText}>ADVANCE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.buzzBtn} onPress={() => handleNeutralVote("eliminate")}>
                <Text style={st.buzzBtnText}>ELIMINATE</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={st.wait}>{hasVoted ? "Vote submitted!" : "Waiting for jury..."}</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // === R1 RESULT ===
  if (phase === "r1-result") {
    const lastResult = gs.r1Results[gs.r1Results.length - 1];
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <View style={st.centered}>
          <Text style={st.resultEmoji}>
            {lastResult?.outcome === "golden" ? "\u2B50" : lastResult?.outcome === "advanced" ? "\u2705" : "\u274C"}
          </Text>
          <Text style={st.resultName}>{lastResult?.playerName ?? "Player"}</Text>
          <Text style={st.resultOutcome}>
            {lastResult?.outcome === "golden" ? "Golden Buzzer!" : lastResult?.outcome === "advanced" ? "ADVANCED!" : "ELIMINATED!"}
          </Text>
          <Text style={st.resultDetail}>
            Buzzes: {lastResult?.buzzCount ?? 0} | Golden: {lastResult?.goldenCount ?? 0}
          </Text>
          {isHost && (
            <TouchableOpacity style={st.primaryBtn} onPress={advanceFromR1Result}>
              <Text style={st.primaryBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </TouchableOpacity>
          )}
          {!isHost && <Text style={st.wait}>Waiting for host...</Text>}
        </View>
      </SafeAreaView>
    );
  }

  // === R2 VOTING ===
  if (phase === "r2-voting") {
    const hasVoted = gs.r2SubmittedVoterIds.includes(myId);
    const performers = gs.r2Results ?? [];
    if (hasVoted) {
      return (
        <SafeAreaView style={st.container}><GameHeader />
          <View style={st.centered}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Text style={st.title}>Vote submitted!</Text>
            <Text style={st.wait}>{gs.r2SubmittedVoterIds.length} / {gs.r2VoterIds.length} voted</Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.voteScroll}>
          <Text style={st.voteTitle}>Vote for Top 2</Text>
          <Text style={st.voteSub}>Select exactly 2 performers to advance to the finals.</Text>
          {performers.map((p) => {
            const sel = r2Selected.includes(p.playerId);
            return (
              <TouchableOpacity
                key={p.playerId}
                style={[st.voteOption, sel && st.voteOptionSel]}
                onPress={() => {
                  setR2Selected((prev) =>
                    prev.includes(p.playerId)
                      ? prev.filter((id) => id !== p.playerId)
                      : prev.length < 2 ? [...prev, p.playerId] : prev
                  );
                }}
              >
                <Ionicons name={sel ? "checkbox" : "square-outline"} size={22} color={sel ? colors.primary : colors.gray500} />
                <Text style={st.voteOptionText}>{p.playerName}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[st.primaryBtn, r2Selected.length !== 2 && { opacity: 0.4 }]}
            onPress={handleR2Vote}
            disabled={r2Selected.length !== 2}
          >
            <Text style={st.primaryBtnText}>Submit Vote</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === TIEBREAK VOTE ===
  if (phase === "tiebreak-vote") {
    const hasVoted = gs.tbSubmittedVoterIds.includes(myId);
    if (hasVoted) {
      return (
        <SafeAreaView style={st.container}><GameHeader />
          <View style={st.centered}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Text style={st.title}>Vote submitted!</Text>
            <Text style={st.wait}>{gs.tbSubmittedVoterIds.length} / {gs.tbVoterIds.length} voted</Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.voteScroll}>
          <Text style={st.voteTitle}>Tiebreaker Vote</Text>
          <Text style={st.voteSub}>Pick who should advance.</Text>
          {gs.tiebreakerCandidates.map((pid) => (
            <TouchableOpacity key={pid} style={st.voteOption} onPress={() => handleTBVote(pid)}>
              <Text style={st.voteOptionText}>{playerMap[pid] ?? "Player"}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.gray400} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === R3 VOTING ===
  if (phase === "r3-voting") {
    const hasVoted = gs.r3SubmittedVoterIds.includes(myId);
    if (hasVoted) {
      return (
        <SafeAreaView style={st.container}><GameHeader />
          <View style={st.centered}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Text style={st.title}>Vote submitted!</Text>
            <Text style={st.wait}>{gs.r3SubmittedVoterIds.length} / {gs.r3VoterIds.length} voted</Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <ScrollView contentContainerStyle={st.voteScroll}>
          <Text style={st.voteTitle}>The Final Vote</Text>
          <Text style={st.voteSub}>Who should win?</Text>
          {gs.r3FinalistIds.map((pid) => (
            <TouchableOpacity key={pid} style={st.voteOption} onPress={() => handleR3Vote(pid)}>
              <Text style={st.voteOptionText}>{playerMap[pid] ?? "Player"}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.gray400} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === WINNER ===
  if (phase === "winner") {
    const winnerName = gs.winnerId ? playerMap[gs.winnerId] ?? "???" : "???";
    const iWon = gs.winnerId === myId;
    return (
      <SafeAreaView style={st.container}><GameHeader />
        <View style={st.centered}>
          <Ionicons name="trophy" size={56} color={colors.warning} />
          <Text style={st.winnerTitle}>{iWon ? "YOU WIN!" : `${winnerName} WINS!`}</Text>
          {gs.runnerUpId && (
            <Text style={st.runnerUp}>Runner-up: {playerMap[gs.runnerUpId] ?? "?"}</Text>
          )}
          {isHost ? (
            <TouchableOpacity style={st.primaryBtn} onPress={handleBackToLobby} activeOpacity={0.7}>
              <Text style={st.primaryBtnText}>Back to Lobby</Text>
              <Ionicons name="arrow-back" size={20} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <HostWaitingPill label="Waiting for host to return to lobby..." />
          )}
        </View>
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

  // Round intro
  roundBadge: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.primaryLight, letterSpacing: 3 },
  roundTitle: { fontFamily: fonts.extrabold, fontSize: 32, color: colors.white },
  roundSub: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray400, textAlign: "center", marginBottom: 16 },

  // Prep
  prepLabel: { fontFamily: fonts.extrabold, fontSize: 11, color: colors.gray500, letterSpacing: 2 },
  prepName: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white },
  promptCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.surfaceLight,
    padding: 20, width: "100%",
  },
  promptText: { fontFamily: fonts.bold, fontSize: 18, color: colors.white, textAlign: "center", lineHeight: 26 },
  prepTimer: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray400 },

  // Performing
  perfScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 16, alignItems: "center" },
  perfLabel: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.white },
  timerCircle: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  timerBig: { fontFamily: fonts.extrabold, fontSize: 36, color: colors.white },
  perfHint: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray400, textAlign: "center" },
  buzzRow: { flexDirection: "row", gap: 12, justifyContent: "center", alignSelf: "stretch" },
  buzzBtn: {
    flex: 1, backgroundColor: colors.danger + "22", borderWidth: 1.5, borderColor: colors.danger,
    borderRadius: 14, paddingVertical: 16, alignItems: "center",
  },
  buzzBtnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.danger },
  goldenBtn: {
    flex: 1, backgroundColor: colors.warning + "22", borderWidth: 1.5, borderColor: colors.warning,
    borderRadius: 14, paddingVertical: 16, alignItems: "center",
  },
  goldenBtnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.warning },

  // Result
  resultEmoji: { fontSize: 56 },
  resultName: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white },
  resultOutcome: { fontFamily: fonts.bold, fontSize: 18, color: colors.primaryLight },
  resultDetail: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray400 },

  // Voting
  voteScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 12 },
  voteTitle: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.white },
  voteSub: { fontFamily: fonts.regular, fontSize: 14, color: colors.gray400 },
  voteOption: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceLight, paddingHorizontal: 16, paddingVertical: 14,
  },
  voteOptionSel: { borderColor: colors.primary },
  voteOptionText: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.white },

  // Winner
  winnerTitle: { fontFamily: fonts.extrabold, fontSize: 36, color: colors.warning },
  runnerUp: { fontFamily: fonts.medium, fontSize: 16, color: colors.gray400 },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, width: "100%",
  },
  primaryBtnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  secondaryBtn: {
    alignItems: "center", paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: colors.surfaceLight,
  },
  secondaryBtnText: { fontFamily: fonts.bold, fontSize: 14, color: colors.gray400 },
});
