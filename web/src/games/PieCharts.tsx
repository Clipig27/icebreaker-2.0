import { useRoomStore } from "../stores/roomStore";
import { useAuthStore } from "../stores/authStore";

export default function PieCharts() {
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);
  const mutate = useRoomStore((s) => s.mutateGameState);
  const userId = useAuthStore((s) => s.userId);
  const gs = room?.game_state;
  const phase = gs?.phase;

  const playerMap: Record<string, string> = {};
  players.forEach((p) => { playerMap[p.user_id] = p.username; });

  if (!gs || phase === "starting" || phase === "intro" || phase === "setup") {
    return <Screen><p style={S.waiting}>Waiting for the game to begin...</p></Screen>;
  }

  if (phase === "voting") {
    const qIdx = gs.currentQuestionIdx ?? 0;
    const question = gs.questions?.[qIdx];
    const hasVoted = gs.allVotes?.some((v: any) => v.voterId === userId && v.questionIdx === qIdx);

    if (hasVoted) {
      return <Screen><p style={S.submitted}>Vote locked! Waiting for everyone...</p></Screen>;
    }

    return (
      <Screen>
        <div style={S.eyebrow}>WHO'S MOST LIKELY TO...</div>
        <h2 style={S.question}>{question?.text ?? "..."}</h2>
        <p style={{ fontSize: 13, color: "#9CA3AF" }}>Choose one player</p>
        {players.map((p) => (
          <button
            key={p.user_id}
            style={S.voteBtn}
            onClick={() => handleVote(p.user_id, qIdx)}
          >
            {p.username}{p.user_id === userId ? " (You)" : ""}
          </button>
        ))}
      </Screen>
    );
  }

  if (phase === "reveal" || phase === "final-results") {
    return (
      <Screen>
        <p style={S.submitted}>Results are on the host's screen!</p>
        <p style={S.waiting}>Watch the big reveal together.</p>
      </Screen>
    );
  }

  return <Screen><p style={S.waiting}>{phase}...</p></Screen>;

  async function handleVote(voteFor: string, questionIdx: number) {
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "voting") return null;
      if (cur.allVotes?.some((v: any) => v.voterId === userId && v.questionIdx === questionIdx)) return null;
      return {
        ...cur,
        allVotes: [...(cur.allVotes ?? []), { voterId: userId, voteFor, questionIdx }],
      };
    });
  }
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={S.container}>
      <div style={S.card}>{children}</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  container: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#1E1A20" },
  card: { width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#E8A0B8" },
  question: { fontSize: 20, fontWeight: 700, color: "#fff", textAlign: "center", margin: 0, lineHeight: 1.4 },
  voteBtn: { width: "100%", padding: "14px 20px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#2A2530", border: "1px solid rgba(232,160,184,0.2)", borderRadius: 14, cursor: "pointer", textAlign: "left" as const },
  submitted: { fontSize: 15, color: "#E8A0B8", padding: "14px 20px", background: "rgba(232,160,184,0.1)", borderRadius: 14, textAlign: "center" },
  waiting: { fontSize: 14, color: "#6B7280", textAlign: "center" },
};
