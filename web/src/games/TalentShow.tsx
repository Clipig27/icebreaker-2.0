import { useState, useEffect } from "react";
import { useRoomStore } from "../stores/roomStore";
import { useAuthStore } from "../stores/authStore";

export default function TalentShow() {
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);
  const mutate = useRoomStore((s) => s.mutateGameState);
  const userId = useAuthStore((s) => s.userId);
  const gs = room?.game_state;
  const phase = gs?.phase;
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [r2Selected, setR2Selected] = useState<string[]>([]);

  useEffect(() => {
    if (!gs?.timerEnd) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((gs.timerEnd - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [gs?.timerEnd]);

  const playerMap: Record<string, string> = {};
  players.forEach((p) => { playerMap[p.user_id] = p.username; });

  const currentPerformerId = gs?.performerQueue?.[gs?.currentPerformerIdx ?? 0];
  const currentPerformerName = currentPerformerId ? (playerMap[currentPerformerId] ?? "Player") : "...";
  const isPerformer = currentPerformerId === userId;

  if (!gs || phase === "starting" || phase === "intro" || phase === "round-intro") {
    return <Screen><p style={S.waiting}>Waiting for the game to begin...</p></Screen>;
  }

  // Performing phase — audience can buzz/golden
  if (phase === "performing" || phase === "tiebreak-performing") {
    const hasBuzzed = gs.buzzedPlayerIds?.includes(userId) || gs.goldenPlayerIds?.includes(userId);
    return (
      <Screen bg="#2A1520">
        <div style={S.eyebrow}>{isPerformer ? "YOU'RE PERFORMING" : "JUDGING"}</div>
        <h2 style={S.question}>{currentPerformerName} is performing</h2>
        <div style={S.timer}>{secondsLeft}s</div>
        <div style={{ ...S.taskCard, background: "#3A1F30", borderColor: "rgba(224,69,123,0.3)" }}>
          <p style={{ ...S.eyebrow, color: "#E0457B" }}>THE TASK</p>
          <p style={S.taskText}>{gs.prompt ?? "..."}</p>
        </div>
        {!isPerformer && gs.round === 1 && !hasBuzzed && (
          <div style={S.buzzRow}>
            <button style={{ ...S.buzzBtn, background: "#EF4444" }} onClick={() => handleBuzz()}>
              BUZZ
            </button>
            <button style={{ ...S.buzzBtn, background: "#F5C842", color: "#1A1420" }} onClick={() => handleGolden()}>
              GOLDEN
            </button>
          </div>
        )}
        {hasBuzzed && <p style={S.submitted}>Vote submitted!</p>}
        {isPerformer && (
          <button style={{ ...S.btn, background: "#E0457B" }} onClick={handleDoneEarly}>
            I'm done
          </button>
        )}
      </Screen>
    );
  }

  // Prep phase
  if (phase === "prep" || phase === "tiebreak-prep") {
    return (
      <Screen bg="#2A1520">
        <div style={S.eyebrow}>UP NEXT</div>
        <h2 style={S.question}>{isPerformer ? "You're up!" : `${currentPerformerName} is up`}</h2>
        <div style={{ ...S.taskCard, background: "#3A1F30", borderColor: "rgba(224,69,123,0.3)" }}>
          <p style={S.taskText}>{gs.prompt ?? "..."}</p>
        </div>
        {isPerformer ? (
          <button style={{ ...S.btn, background: "#E0457B" }} onClick={startPerforming}>Start!</button>
        ) : (
          <p style={S.waiting}>Waiting for {currentPerformerName} to start...</p>
        )}
      </Screen>
    );
  }

  // R2 voting
  if (phase === "r2-voting") {
    const hasVoted = gs.r2SubmittedVoterIds?.includes(userId);
    if (hasVoted) return <Screen bg="#2A1520"><p style={S.submitted}>Vote submitted! Waiting...</p></Screen>;
    const performers = (gs.r2Results ?? []).filter((p: any) => p.playerId !== userId);
    return (
      <Screen bg="#2A1520">
        <div style={S.eyebrow}>VOTE FOR TOP 2</div>
        <h2 style={S.question}>Pick your 2 favorites</h2>
        {performers.map((p: any) => {
          const sel = r2Selected.includes(p.playerId);
          return (
            <button
              key={p.playerId}
              style={{ ...S.voteBtn, borderColor: sel ? "#E0457B" : "rgba(224,69,123,0.2)", background: sel ? "rgba(224,69,123,0.15)" : "#3A1F30" }}
              onClick={() => setR2Selected((prev) =>
                prev.includes(p.playerId)
                  ? prev.filter((id) => id !== p.playerId)
                  : prev.length < 2 ? [...prev, p.playerId] : prev
              )}
            >
              {p.playerName}
            </button>
          );
        })}
        <button style={{ ...S.btn, background: "#E0457B", opacity: r2Selected.length !== 2 ? 0.4 : 1 }} disabled={r2Selected.length !== 2} onClick={handleR2Vote}>
          Submit Vote
        </button>
      </Screen>
    );
  }

  // R3 / tiebreak voting
  if (phase === "r3-voting" || phase === "tiebreak-vote") {
    const isR3 = phase === "r3-voting";
    const hasVoted = isR3 ? gs.r3SubmittedVoterIds?.includes(userId) : gs.tbSubmittedVoterIds?.includes(userId);
    const candidates = isR3 ? gs.r3FinalistIds : gs.tiebreakerCandidates;
    if (hasVoted || candidates?.includes(userId)) return <Screen bg="#2A1520"><p style={S.submitted}>Vote submitted! Waiting...</p></Screen>;
    return (
      <Screen bg="#2A1520">
        <div style={S.eyebrow}>{isR3 ? "FINAL VOTE" : "TIEBREAKER VOTE"}</div>
        <h2 style={S.question}>Who should win?</h2>
        {(candidates ?? []).filter((pid: string) => pid !== userId).map((pid: string) => (
          <button
            key={pid}
            style={{ ...S.voteBtn, borderColor: "rgba(224,69,123,0.3)", background: "#3A1F30" }}
            onClick={() => isR3 ? handleR3Vote(pid) : handleTBVote(pid)}
          >
            {playerMap[pid] ?? "Player"}
          </button>
        ))}
      </Screen>
    );
  }

  // Result / winner / other phases
  if (phase === "winner") {
    const winnerName = gs.winnerId ? (playerMap[gs.winnerId] ?? "?") : "?";
    return (
      <Screen bg="#2A1520">
        <h1 style={{ ...S.title, color: "#F5C842" }}>{winnerName} wins!</h1>
        <p style={S.waiting}>Waiting for host...</p>
      </Screen>
    );
  }

  return <Screen bg="#2A1520"><p style={S.waiting}>{phase}...</p></Screen>;

  // Handlers
  async function handleBuzz() {
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "performing" || cur.round !== 1) return null;
      if ([...cur.buzzedPlayerIds, ...cur.goldenPlayerIds].includes(userId)) return null;
      return { ...cur, buzzedPlayerIds: [...cur.buzzedPlayerIds, userId] };
    });
  }

  async function handleGolden() {
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "performing" || cur.round !== 1) return null;
      if ([...cur.buzzedPlayerIds, ...cur.goldenPlayerIds].includes(userId)) return null;
      return { ...cur, goldenPlayerIds: [...cur.goldenPlayerIds, userId] };
    });
  }

  async function handleDoneEarly() {
    await mutate((cur: any) => {
      if (!cur) return null;
      if (cur.performerQueue[cur.currentPerformerIdx] !== userId) return null;
      return { ...cur, timerEnd: Date.now() };
    });
  }

  async function startPerforming() {
    await mutate((cur: any) => {
      if (!cur || (cur.phase !== "prep" && cur.phase !== "tiebreak-prep")) return null;
      if (cur.performerQueue[cur.currentPerformerIdx] !== userId) return null;
      const duration = cur.timerDuration || 30000;
      const newPhase = cur.phase === "tiebreak-prep" ? "tiebreak-performing" : "performing";
      return { ...cur, phase: newPhase, timerEnd: Date.now() + duration };
    });
  }

  async function handleR2Vote() {
    if (r2Selected.length !== 2) return;
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "r2-voting") return null;
      if (cur.r2SubmittedVoterIds?.includes(userId)) return null;
      return {
        ...cur,
        r2Votes: [...cur.r2Votes, ...r2Selected.map((id) => ({ voterId: userId, voteFor: id }))],
        r2SubmittedVoterIds: [...cur.r2SubmittedVoterIds, userId],
      };
    });
  }

  async function handleR3Vote(voteFor: string) {
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "r3-voting") return null;
      if (cur.r3SubmittedVoterIds?.includes(userId)) return null;
      return {
        ...cur,
        r3Votes: [...cur.r3Votes, { voterId: userId, voteFor }],
        r3SubmittedVoterIds: [...cur.r3SubmittedVoterIds, userId],
      };
    });
  }

  async function handleTBVote(voteFor: string) {
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "tiebreak-vote") return null;
      if (cur.tbSubmittedVoterIds?.includes(userId)) return null;
      return {
        ...cur,
        tbVotes: [...cur.tbVotes, { voterId: userId, voteFor }],
        tbSubmittedVoterIds: [...cur.tbSubmittedVoterIds, userId],
      };
    });
  }
}

function Screen({ children, bg = "#2A1520" }: { children: React.ReactNode; bg?: string }) {
  return (
    <div style={{ ...S.container, background: bg }}>
      <div style={S.card}>{children}</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  container: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#E0457B" },
  question: { fontSize: 20, fontWeight: 700, color: "#fff", textAlign: "center", margin: 0 },
  title: { fontSize: 28, fontWeight: 800, margin: 0 },
  timer: { fontSize: 40, fontWeight: 800, color: "#fff" },
  taskCard: { width: "100%", padding: 16, borderRadius: 16, border: "1px solid", display: "flex", flexDirection: "column", gap: 8 },
  taskText: { fontSize: 16, fontWeight: 600, color: "#fff", margin: 0, lineHeight: 1.4 },
  buzzRow: { display: "flex", gap: 12, width: "100%" },
  buzzBtn: { flex: 1, padding: "16px", fontSize: 16, fontWeight: 800, color: "#fff", border: "none", borderRadius: 14, cursor: "pointer" },
  btn: { width: "100%", padding: "14px", fontSize: 16, fontWeight: 700, color: "#fff", border: "none", borderRadius: 14, cursor: "pointer" },
  voteBtn: { width: "100%", padding: "14px 20px", fontSize: 16, fontWeight: 600, color: "#fff", border: "1px solid", borderRadius: 14, cursor: "pointer", textAlign: "left" as const },
  submitted: { fontSize: 15, color: "#E0457B", padding: "14px 20px", background: "rgba(224,69,123,0.1)", borderRadius: 14, textAlign: "center" },
  waiting: { fontSize: 14, color: "#6B7280", textAlign: "center" },
};
