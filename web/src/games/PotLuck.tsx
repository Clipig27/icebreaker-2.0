import { useState, useEffect, useRef } from "react";
import { useRoomStore } from "../stores/roomStore";
import { useAuthStore } from "../stores/authStore";

const TIMER_SECONDS = 15;

export default function PotLuck() {
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);
  const mutate = useRoomStore((s) => s.mutateGameState);
  const userId = useAuthStore((s) => s.userId);
  const gs = room?.game_state;
  const phase = gs?.phase;

  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [actionSent, setActionSent] = useState(false);
  const actionSentRef = useRef(false);

  const playerMap: Record<string, string> = {};
  players.forEach((p) => { playerMap[p.user_id] = p.username; });

  const order: string[] = gs?.order ?? [];
  const seatPtr: number = gs?.seatPtr ?? 0;
  const currentPlayerId = order[seatPtr];
  const currentPlayerName = currentPlayerId ? (playerMap[currentPlayerId] ?? "Player") : "...";
  const isMyTurn = phase === "live" && currentPlayerId === userId;
  const turnSeq = gs?.turnSeq ?? 0;
  const turnKey = `${phase}:${turnSeq}:${seatPtr}`;

  // Reset action state on turn change
  useEffect(() => {
    actionSentRef.current = false;
    setActionSent(false);
  }, [turnKey]);

  // Timer for live phase
  useEffect(() => {
    if (phase !== "live") return;
    setTimeLeft(TIMER_SECONDS);
    const start = Date.now();
    const id = setInterval(() => {
      const remaining = Math.max(0, TIMER_SECONDS - Math.floor((Date.now() - start) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(id);
        // Auto-skip if it's my turn and I haven't acted
        if (!actionSentRef.current && currentPlayerId === userId) {
          actionSentRef.current = true;
          setActionSent(true);
          mutate((cur: any) => {
            if (!cur || cur.phase !== "live") return null;
            if ((cur.turnSeq ?? 0) !== turnSeq) return null;
            if (cur.order[cur.seatPtr] !== userId) return null;
            if (cur.turnAction || cur.turnSkip) return null;
            return { ...cur, turnSkip: userId };
          });
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, [turnKey]);

  // Scores sorted
  const scores = gs?.scores ?? {};
  const sortedScores = Object.entries(scores)
    .map(([uid, score]) => ({ uid, name: playerMap[uid] ?? "?", score: score as number }))
    .sort((a, b) => b.score - a.score);

  // My position in turn order
  const mySeat = order.indexOf(userId ?? "");
  const turnsAway = mySeat === -1 ? -1 : (mySeat - seatPtr + order.length) % order.length;

  // --- Handlers ---
  async function handleAnswer(choiceIdx: number) {
    if (!isMyTurn || actionSentRef.current) return;
    actionSentRef.current = true;
    setActionSent(true);
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "live") return null;
      if ((cur.turnSeq ?? 0) !== turnSeq) return null;
      if (cur.order[cur.seatPtr] !== userId) return null;
      if (cur.turnAction || cur.turnSkip) return null;
      return { ...cur, turnAction: { playerId: userId, choiceIdx } };
    });
  }

  async function handleSkip() {
    if (!isMyTurn || actionSentRef.current) return;
    actionSentRef.current = true;
    setActionSent(true);
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "live") return null;
      if ((cur.turnSeq ?? 0) !== turnSeq) return null;
      if (cur.order[cur.seatPtr] !== userId) return null;
      if (cur.turnAction || cur.turnSkip) return null;
      return { ...cur, turnSkip: userId };
    });
  }

  // --- Waiting states ---
  if (!gs || phase === "starting" || phase === "intro") {
    return <Screen><p style={S.waiting}>Waiting for the game to begin...</p></Screen>;
  }

  if (phase === "rolling") {
    return (
      <Screen>
        <div style={S.eyebrow}>TURN ORDER</div>
        <div style={S.list}>
          {order.map((pid, i) => (
            <div key={pid} style={{ ...S.orderRow, ...(pid === userId ? S.orderRowMe : {}) }}>
              <span style={S.orderNum}>{i + 1}</span>
              <span style={S.orderName}>{playerMap[pid] ?? "Player"}{pid === userId ? " (You)" : ""}</span>
            </div>
          ))}
        </div>
        <p style={S.waiting}>Starting soon...</p>
      </Screen>
    );
  }

  if (phase === "turn-countdown") {
    const nextPlayerId2 = order[seatPtr];
    const isNextMe = nextPlayerId2 === userId;
    return (
      <Screen>
        <div style={S.bigText}>{isNextMe ? "Your turn!" : `${playerMap[nextPlayerId2] ?? "Player"}'s turn!`}</div>
        <p style={S.waiting}>Get ready...</p>
      </Screen>
    );
  }

  // --- LIVE (active turn) ---
  if (phase === "live") {
    const q = gs.currentQuestion;
    const pot = gs.pot ?? 0;
    const target = gs.target ?? 10;
    const difficulty = q?.difficulty ?? "easy";
    const diffColors: Record<string, string> = { easy: "#C4F04D", medium: "#F6C9A8", hard: "#F5A3A3" };

    return (
      <Screen>
        {/* Scoreboard */}
        <div style={S.scoreboard}>
          <div style={S.eyebrow}>SCORES (first to {target})</div>
          {sortedScores.slice(0, 5).map((p) => (
            <div key={p.uid} style={{ ...S.scoreRow, ...(p.uid === currentPlayerId ? S.scoreRowActive : {}) }}>
              <span style={S.scoreName}>{p.uid === userId ? "You" : p.name}</span>
              <span style={S.scoreVal}>{p.score}</span>
            </div>
          ))}
        </div>

        {/* Turn info */}
        <div style={S.turnLabel}>
          {isMyTurn ? "Your turn!" : `${currentPlayerName}'s turn`}
        </div>

        {/* Pot */}
        <div style={S.potCircle}>
          <div style={S.potValue}>{pot}</div>
          <div style={S.potLabel}>{pot >= (gs.potCap ?? 7) ? "MAX" : "POT"}</div>
        </div>

        {/* Timer */}
        <div style={{ ...S.timer, color: timeLeft <= 3 ? "#EF4444" : "#9CA3AF" }}>
          {timeLeft}s
        </div>

        {/* Question */}
        <div style={S.questionCard}>
          <span style={{ ...S.diffChip, backgroundColor: diffColors[difficulty] ?? diffColors.easy }}>
            {difficulty.toUpperCase()}
          </span>
          <p style={S.questionText}>{q?.text ?? "..."}</p>
        </div>

        {/* Choices or spectate */}
        {isMyTurn ? (
          <div style={S.choiceList}>
            {(q?.choices ?? []).map((choice: string, i: number) => (
              <button
                key={i}
                style={{ ...S.choiceBtn, opacity: actionSent ? 0.5 : 1 }}
                onClick={() => handleAnswer(i)}
                disabled={actionSent}
              >
                <span style={S.choiceLetter}>{String.fromCharCode(65 + i)}</span>
                {choice}
              </button>
            ))}
            <button
              style={{ ...S.skipBtn, opacity: actionSent ? 0.5 : 1 }}
              onClick={handleSkip}
              disabled={actionSent}
            >
              SKIP (pot grows to {Math.min(pot + 1, gs.potCap ?? 7)})
            </button>
          </div>
        ) : (
          <div style={S.spectate}>
            <p style={S.spectateName}>{currentPlayerName} is deciding...</p>
            <p style={S.spectateAway}>
              {turnsAway <= 0 ? "You're up" : turnsAway === 1 ? "You're NEXT" : `${turnsAway} turns away`}
            </p>
          </div>
        )}
      </Screen>
    );
  }

  // --- REVEAL ---
  if (phase === "reveal") {
    const info = gs.revealInfo;
    const lr = gs.lastResult;
    return (
      <Screen>
        <div style={S.eyebrow}>ANSWER REVEALED</div>
        <div style={S.revealAnswer}>{info?.answer ?? "..."}</div>
        {lr && (
          <div style={S.revealResult}>
            <span>{playerMap[lr.playerId] ?? "Player"}</span>
            <span style={{ color: lr.kind === "correct" ? "#5ABF6A" : lr.kind === "wrong" ? "#EF4444" : "#9CA3AF" }}>
              {lr.kind === "correct" ? ` +${lr.delta}` : lr.kind === "wrong" ? ` ${lr.delta}` : " skipped"}
            </span>
          </div>
        )}
        <p style={S.waiting}>Next question coming...</p>

        {/* Scores */}
        <div style={S.scoreboard}>
          {sortedScores.map((p) => (
            <div key={p.uid} style={S.scoreRow}>
              <span style={S.scoreName}>{p.uid === userId ? "You" : p.name}</span>
              <span style={S.scoreVal}>{p.score}</span>
            </div>
          ))}
        </div>
      </Screen>
    );
  }

  // --- GAMEOVER ---
  if (phase === "gameover") {
    const winnerId = gs.winnerId;
    const winnerName = winnerId ? (playerMap[winnerId] ?? "???") : "???";
    const iWon = winnerId === userId;
    return (
      <Screen>
        <div style={S.bigText}>{iWon ? "YOU WIN!" : `${winnerName} WINS!`}</div>
        <div style={S.eyebrow}>FINAL SCORES</div>
        <div style={S.list}>
          {sortedScores.map((p, i) => (
            <div key={p.uid} style={{ ...S.scoreRow, ...(i === 0 ? S.scoreRowActive : {}) }}>
              <span style={S.orderNum}>{i + 1}</span>
              <span style={S.scoreName}>{p.uid === userId ? "You" : p.name}</span>
              <span style={S.scoreVal}>{p.score}</span>
            </div>
          ))}
        </div>
        <p style={S.waiting}>Waiting for host...</p>
      </Screen>
    );
  }

  return <Screen><p style={S.waiting}>{phase}...</p></Screen>;
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={S.container}>
      <div style={S.card}>{children}</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  container: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#1A2A1A" },
  card: { width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#5ABF6A", textTransform: "uppercase" as const },
  bigText: { fontSize: 28, fontWeight: 800, color: "#fff", textAlign: "center" },
  waiting: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  list: { width: "100%", display: "flex", flexDirection: "column", gap: 8 },

  // Turn order
  orderRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#243024", borderRadius: 12, border: "1px solid rgba(90,191,106,0.12)" },
  orderRowMe: { border: "1px solid #5ABF6A", background: "rgba(90,191,106,0.1)" },
  orderNum: { width: 28, height: 28, borderRadius: 6, background: "#2E3B2E", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff" },
  orderName: { flex: 1, fontWeight: 600, fontSize: 15, color: "#fff" },

  // Scores
  scoreboard: { width: "100%", display: "flex", flexDirection: "column", gap: 6, padding: "12px 16px", background: "#243024", borderRadius: 12, border: "1px solid rgba(90,191,106,0.12)" },
  scoreRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" },
  scoreRowActive: { background: "rgba(90,191,106,0.1)", borderRadius: 8, padding: "4px 8px" },
  scoreName: { flex: 1, fontWeight: 600, fontSize: 14, color: "#D1D5DB" },
  scoreVal: { fontWeight: 800, fontSize: 16, color: "#fff", fontVariantNumeric: "tabular-nums" },

  // Turn
  turnLabel: { fontSize: 20, fontWeight: 800, color: "#fff", textAlign: "center" },

  // Pot
  potCircle: { width: 80, height: 80, borderRadius: 40, background: "#243024", border: "2px solid #5ABF6A", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  potValue: { fontSize: 32, fontWeight: 800, color: "#F0C66A" },
  potLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#9CA3AF" },

  // Timer
  timer: { fontSize: 18, fontWeight: 700 },

  // Question
  questionCard: { width: "100%", padding: "16px 20px", background: "#243024", borderRadius: 14, border: "1px solid rgba(90,191,106,0.12)", display: "flex", flexDirection: "column", gap: 8 },
  diffChip: { alignSelf: "flex-start", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, color: "#1A2A1A", letterSpacing: 0.5 },
  questionText: { fontSize: 17, fontWeight: 700, color: "#fff", lineHeight: 1.4, margin: 0 },

  // Choices
  choiceList: { width: "100%", display: "flex", flexDirection: "column", gap: 8 },
  choiceBtn: { width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#243024", border: "1px solid rgba(90,191,106,0.2)", borderRadius: 14, cursor: "pointer", textAlign: "left" as const },
  choiceLetter: { width: 28, height: 28, borderRadius: 6, background: "#2E3B2E", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: "#5ABF6A", flexShrink: 0 },
  skipBtn: { width: "100%", padding: "14px 16px", fontSize: 14, fontWeight: 700, color: "#9CA3AF", background: "transparent", border: "1px dashed rgba(90,191,106,0.25)", borderRadius: 14, cursor: "pointer", textAlign: "center" as const },

  // Spectate
  spectate: { width: "100%", padding: "20px", background: "#243024", borderRadius: 14, border: "1px solid rgba(90,191,106,0.12)", textAlign: "center" as const },
  spectateName: { fontSize: 15, fontWeight: 600, color: "#D1D5DB", margin: 0 },
  spectateAway: { fontSize: 13, fontWeight: 600, color: "#5ABF6A", margin: "4px 0 0" },

  // Reveal
  revealAnswer: { fontSize: 22, fontWeight: 800, color: "#5ABF6A", textAlign: "center" },
  revealResult: { fontSize: 16, fontWeight: 700, color: "#fff", display: "flex", gap: 8, alignItems: "center" },
};
