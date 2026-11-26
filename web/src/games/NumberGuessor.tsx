import { useState, useEffect } from "react";
import { useRoomStore } from "../stores/roomStore";
import { useAuthStore } from "../stores/authStore";

export default function NumberGuessor() {
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);
  const mutate = useRoomStore((s) => s.mutateGameState);
  const userId = useAuthStore((s) => s.userId);
  const username = useAuthStore((s) => s.username);
  const gs = room?.game_state;
  const phase = gs?.phase;

  const [guess, setGuess] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [guessStartTime] = useState(Date.now());

  // Timer — native uses roundStartedAt + a fixed duration, not timerEnd
  // We show a countdown based on roundStartedAt (30s default guessing window)
  useEffect(() => {
    if (!gs?.roundStartedAt) return;
    const GUESS_DURATION = 30000; // 30s — matches native default
    const end = gs.roundStartedAt + GUESS_DURATION;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [gs?.roundStartedAt]);

  const hasGuessed = gs?.guesses?.some((g: any) => g.userId === userId);

  const submitGuess = async () => {
    const num = parseInt(guess);
    if (isNaN(num) || num < 0 || num > 100) return;
    const myUsername = players.find((p) => p.user_id === userId)?.username ?? username ?? "Player";
    const elapsed = Date.now() - (gs?.roundStartedAt || guessStartTime);
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "guessing") return null;
      if (cur.guesses?.some((g: any) => g.userId === userId)) return null;
      return {
        ...cur,
        guesses: [...(cur.guesses ?? []), { userId, username: myUsername, value: num, timeMs: elapsed, timedOut: false }],
      };
    });
    setGuess("");
  };

  if (!gs || phase === "starting" || phase === "intro" || phase === "setup") {
    return <Screen><p style={S.waiting}>Waiting for the host to start...</p></Screen>;
  }

  if (phase === "guessing") {
    const prompt = gs.currentPrompt;
    return (
      <Screen>
        <div style={S.eyebrow}>{prompt?.category?.toUpperCase() ?? "TRIVIA"}</div>
        <h2 style={S.question}>{prompt?.text ?? "..."}</h2>
        <div style={S.timer}>{secondsLeft}s</div>
        {hasGuessed ? (
          <div style={S.submitted}>Guess submitted! Waiting for others...</div>
        ) : (
          <div style={S.inputArea}>
            <input
              style={S.input}
              type="number"
              inputMode="numeric"
              placeholder="0 – 100"
              value={guess}
              onChange={(e) => setGuess(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
              autoFocus
            />
            <button style={S.btn} onClick={submitGuess} disabled={!guess}>
              Submit
            </button>
          </div>
        )}
      </Screen>
    );
  }

  if (phase === "reveal" || phase === "round-end") {
    const answer = gs.currentPrompt?.correctAnswer;
    return (
      <Screen>
        <div style={S.eyebrow}>CORRECT ANSWER</div>
        <h1 style={{ ...S.bigNum, color: "#7FE0D6" }}>{answer ?? "?"}</h1>
        <p style={S.waiting}>Waiting for host to continue...</p>
      </Screen>
    );
  }

  if (phase === "game-over") {
    // penalties is Record<string, number> — userId -> cumulative penalty
    const penaltyMap: Record<string, number> = gs.penalties ?? {};
    const playerMap: Record<string, string> = {};
    players.forEach((p) => { playerMap[p.user_id] = p.username; });
    const sorted = Object.entries(penaltyMap)
      .map(([uid, penalty]) => ({ userId: uid, username: playerMap[uid] ?? "Player", penalty: penalty as number }))
      .sort((a, b) => a.penalty - b.penalty);
    const winner = sorted[0];
    return (
      <Screen>
        <h2 style={S.title}>{winner?.username ?? "?"} wins!</h2>
        <div style={S.results}>
          {sorted.map((p, i: number) => (
            <div key={p.userId} style={{ ...S.resultRow, background: i === 0 ? "rgba(127,224,214,0.15)" : "transparent" }}>
              <span style={S.rank}>#{i + 1}</span>
              <span style={S.pName}>{p.username}{p.userId === userId ? " (You)" : ""}</span>
              <span style={S.penalty}>+{p.penalty}</span>
            </div>
          ))}
        </div>
        <p style={S.waiting}>Waiting for host...</p>
      </Screen>
    );
  }

  return <Screen><p style={S.waiting}>Phase: {phase}</p></Screen>;
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={S.container}>
      <div style={S.card}>{children}</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background: "#0F1E2D",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: "#7FE0D6",
  },
  question: {
    fontSize: 20,
    fontWeight: 700,
    color: "#fff",
    textAlign: "center",
    margin: 0,
    lineHeight: 1.4,
  },
  timer: {
    fontSize: 36,
    fontWeight: 800,
    color: "#fff",
  },
  inputArea: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  input: {
    width: "100%",
    padding: "16px 20px",
    fontSize: 32,
    fontWeight: 800,
    color: "#fff",
    background: "#1A3348",
    border: "2px solid rgba(127,224,214,0.3)",
    borderRadius: 16,
    textAlign: "center",
    outline: "none",
  },
  btn: {
    width: "100%",
    padding: "14px 24px",
    fontSize: 16,
    fontWeight: 700,
    color: "#0F1E2D",
    background: "#7FE0D6",
    border: "none",
    borderRadius: 14,
    cursor: "pointer",
  },
  submitted: {
    fontSize: 15,
    color: "#7FE0D6",
    padding: "16px 24px",
    background: "rgba(127,224,214,0.1)",
    borderRadius: 14,
    textAlign: "center",
  },
  waiting: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: 800,
    color: "#fff",
    margin: 0,
  },
  bigNum: {
    fontSize: 64,
    fontWeight: 800,
    margin: 0,
  },
  results: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  resultRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(127,224,214,0.1)",
  },
  rank: { fontSize: 14, fontWeight: 700, color: "#7FE0D6", width: 30 },
  pName: { flex: 1, fontSize: 15, fontWeight: 600, color: "#fff" },
  penalty: { fontSize: 14, fontWeight: 700, color: "#E8C872" },
};
