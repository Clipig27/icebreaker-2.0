import { useState, useEffect } from "react";
import { useRoomStore } from "../stores/roomStore";
import { useAuthStore } from "../stores/authStore";

export default function BlindSpot() {
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);
  const mutate = useRoomStore((s) => s.mutateGameState);
  const userId = useAuthStore((s) => s.userId);
  const gs = room?.game_state;
  const phase = gs?.phase;
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!gs?.guideTimerEnd) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((gs.guideTimerEnd - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [gs?.guideTimerEnd]);

  const playerMap: Record<string, string> = {};
  players.forEach((p: any) => { playerMap[p.user_id] = p.username; });

  const isBlind = gs?.blindPlayerId === userId;
  const isSaboteur = gs?.saboteurId === userId;
  const currentGuideId = gs?.guidingOrder?.[gs?.currentGuideIdx ?? 0];
  const currentGuideName = currentGuideId ? (playerMap[currentGuideId] ?? "Player") : "...";
  const isMyTurnToGuide = currentGuideId === userId;

  // Waiting / intro / role-reveal
  if (!gs || phase === "starting" || phase === "intro") {
    return <Screen><p style={S.waiting}>Waiting for the game to begin...</p></Screen>;
  }

  // Role reveal
  if (phase === "role-reveal") {
    let roleTitle = "";
    let roleDesc = "";
    let roleColor = "#4ECDC4";

    if (isBlind) {
      roleTitle = "YOU'RE BLIND";
      roleDesc = "Close your eyes and put your phone face down. Listen for instructions.";
      roleColor = "#F0C66A";
    } else if (isSaboteur) {
      roleTitle = "YOU'RE THE SABOTEUR";
      roleDesc = "Give bad instructions — but be subtle! Don't get caught.";
      roleColor = "#FF6B6B";
    } else {
      const saboteurName = playerMap[gs.saboteurId] ?? "???";
      roleTitle = "YOU'RE A GUIDE";
      roleDesc = `Help them complete the task! The saboteur is: ${saboteurName}`;
      roleColor = "#4ECDC4";
    }

    return (
      <Screen>
        <div style={S.eyebrow}>YOUR ROLE</div>
        <h2 style={{ ...S.title, color: roleColor }}>{roleTitle}</h2>
        <p style={S.taskText}>{roleDesc}</p>
        {!isBlind && (
          <p style={S.hint}>{playerMap[gs.blindPlayerId] ?? "?"} is the Blind player.</p>
        )}
        <p style={S.waiting}>Waiting for host...</p>
      </Screen>
    );
  }

  // Task reveal
  if (phase === "task-reveal") {
    return (
      <Screen>
        <div style={S.eyebrow}>THE TASK</div>
        {isBlind ? (
          <>
            <h2 style={S.question}>Keep your eyes closed!</h2>
            <p style={S.waiting}>Listen for instructions from your guides.</p>
          </>
        ) : (
          <>
            <div style={{ ...S.taskCard, background: "#162626", borderColor: "rgba(78,205,196,0.3)" }}>
              <p style={S.taskText}>{gs.taskText}</p>
            </div>
            <p style={S.hint}>
              {isSaboteur ? "Give WRONG instructions. Be subtle!" : "Help them complete this task."}
            </p>
          </>
        )}
        <p style={S.waiting}>Waiting for host...</p>
      </Screen>
    );
  }

  // Guiding
  if (phase === "guiding") {
    return (
      <Screen>
        <div style={S.eyebrow}>
          GUIDING — Round {gs.guidingRound}/2
        </div>
        <div style={S.timer}>{secondsLeft}s</div>

        {isBlind ? (
          <>
            <h2 style={S.question}>Listening...</h2>
            <p style={S.taskText}>{currentGuideName} is giving an instruction</p>
          </>
        ) : isMyTurnToGuide ? (
          <>
            <h2 style={{ ...S.title, color: "#4ECDC4" }}>YOUR TURN</h2>
            <p style={S.taskText}>Speak now! Give your instruction.</p>
            {isSaboteur && (
              <p style={{ ...S.hint, color: "#FF6B6B" }}>Remember: give BAD instructions subtly!</p>
            )}
            <button style={{ ...S.btn, background: "#4ECDC4", color: "#0F1A1A" }} onClick={handleDoneSpeaking}>
              Done Speaking
            </button>
          </>
        ) : (
          <>
            <h2 style={S.question}>{currentGuideName} is speaking</h2>
            <p style={S.waiting}>Wait for your turn...</p>
          </>
        )}

        <div style={S.orderList}>
          {(gs.guidingOrder ?? []).map((id: string, i: number) => (
            <div key={id} style={{
              ...S.orderItem,
              borderColor: i === gs.currentGuideIdx ? "#4ECDC4" : "rgba(78,205,196,0.15)",
              background: i === gs.currentGuideIdx ? "rgba(78,205,196,0.1)" : "#162626",
            }}>
              <span style={{ fontWeight: 700, color: i === gs.currentGuideIdx ? "#4ECDC4" : "#6B7280" }}>{i + 1}</span>
              <span style={{ color: "#fff", fontWeight: 600 }}>{playerMap[id] ?? "?"}</span>
              {i === gs.currentGuideIdx && <span style={{ color: "#4ECDC4" }}>speaking</span>}
            </div>
          ))}
        </div>
      </Screen>
    );
  }

  // Result check
  if (phase === "result-check") {
    return (
      <Screen>
        <div style={S.eyebrow}>RESULT CHECK</div>
        <h2 style={S.question}>Checking the result...</h2>
        <p style={S.waiting}>The host is deciding if the task was completed.</p>
      </Screen>
    );
  }

  // Accusation
  if (phase === "accusation") {
    if (isBlind) {
      const otherPlayers = players.filter((p: any) => p.user_id !== gs.blindPlayerId);
      return (
        <Screen>
          <div style={S.eyebrow}>WHO'S THE SABOTEUR?</div>
          <h2 style={S.question}>Open your eyes! Make your accusation.</h2>
          <p style={S.hint}>
            Task was {gs.taskSucceeded ? "completed" : "NOT completed"}.
          </p>
          {otherPlayers.map((p: any) => (
            <button
              key={p.user_id}
              style={{ ...S.voteBtn, borderColor: "rgba(78,205,196,0.3)", background: "#162626" }}
              onClick={() => handleAccusation(p.user_id)}
            >
              {p.username}
            </button>
          ))}
        </Screen>
      );
    }
    return (
      <Screen>
        <div style={S.eyebrow}>ACCUSATION</div>
        <h2 style={S.question}>{playerMap[gs.blindPlayerId] ?? "?"} is making their accusation...</h2>
        <p style={S.waiting}>{isSaboteur ? "Will they catch you?" : "Did you help enough?"}</p>
      </Screen>
    );
  }

  // Vote reveal
  if (phase === "vote-reveal") {
    const accusedName = gs.blindPlayerGuess ? (playerMap[gs.blindPlayerGuess] ?? "?") : "?";
    const saboteurName = playerMap[gs.saboteurId] ?? "?";
    const correctGuess = gs.blindPlayerGuess === gs.saboteurId;

    return (
      <Screen>
        <h1 style={{ ...S.title, color: correctGuess ? "#4ECDC4" : "#FF6B6B" }}>
          {correctGuess ? "CAUGHT!" : "FOOLED!"}
        </h1>
        <p style={S.taskText}>
          {correctGuess
            ? `${playerMap[gs.blindPlayerId] ?? "?"} found the Saboteur!`
            : `${saboteurName} got away with it!`}
        </p>
        <div style={{ ...S.taskCard, background: "#162626", borderColor: correctGuess ? "rgba(78,205,196,0.4)" : "rgba(255,107,107,0.4)" }}>
          <p style={S.hint}>Accused: {accusedName}</p>
          <p style={{ ...S.hint, color: "#4ECDC4" }}>Saboteur was: {saboteurName}</p>
        </div>
        <p style={S.waiting}>Waiting for host...</p>
      </Screen>
    );
  }

  // Scores
  if (phase === "scores") {
    const sorted = Object.entries(gs.scores ?? {})
      .map(([id, score]) => ({ id, name: playerMap[id] ?? "?", score: score as number }))
      .sort((a, b) => b.score - a.score);

    return (
      <Screen>
        <div style={S.eyebrow}>LEADERBOARD</div>
        <h2 style={S.question}>Round {gs.round} of {gs.totalRounds}</h2>
        {sorted.map((entry, i) => (
          <div key={entry.id} style={{ ...S.scoreRow, borderColor: i === 0 ? "#4ECDC4" : "rgba(78,205,196,0.15)" }}>
            <span style={{ fontWeight: 800, color: i === 0 ? "#4ECDC4" : "#6B7280", width: 24 }}>{i + 1}</span>
            <span style={{ flex: 1, fontWeight: 600, color: "#fff" }}>{entry.name}</span>
            <span style={{ fontWeight: 700, color: "#4ECDC4" }}>{entry.score} pts</span>
          </div>
        ))}
        <p style={S.waiting}>Waiting for host...</p>
      </Screen>
    );
  }

  // Game over
  if (phase === "game-over") {
    const sorted = Object.entries(gs.scores ?? {})
      .map(([id, score]) => ({ id, name: playerMap[id] ?? "?", score: score as number }))
      .sort((a, b) => b.score - a.score);
    const winner = sorted[0];

    return (
      <Screen>
        <h1 style={{ ...S.title, color: "#F0C66A" }}>{winner?.name ?? "?"} wins!</h1>
        {sorted.map((entry, i) => (
          <div key={entry.id} style={{ ...S.scoreRow, borderColor: i === 0 ? "#4ECDC4" : "rgba(78,205,196,0.15)" }}>
            <span style={{ fontWeight: 800, color: i === 0 ? "#F0C66A" : "#6B7280", width: 24 }}>{i + 1}</span>
            <span style={{ flex: 1, fontWeight: 600, color: "#fff" }}>{entry.name}</span>
            <span style={{ fontWeight: 700, color: "#4ECDC4" }}>{entry.score} pts</span>
          </div>
        ))}
        <p style={S.waiting}>Waiting for host...</p>
      </Screen>
    );
  }

  return <Screen><p style={S.waiting}>{phase}...</p></Screen>;

  // Handlers
  async function handleDoneSpeaking() {
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "guiding") return null;
      if (cur.guidingOrder[cur.currentGuideIdx] !== userId) return null;
      const nextIdx = cur.currentGuideIdx + 1;
      if (nextIdx < cur.guidingOrder.length) {
        return { ...cur, currentGuideIdx: nextIdx, guideTimerEnd: Date.now() + 10000 };
      }
      const nextRound = cur.guidingRound + 1;
      if (nextRound <= 2) {
        return { ...cur, currentGuideIdx: 0, guidingRound: nextRound, guideTimerEnd: Date.now() + 10000 };
      }
      return { ...cur, phase: "result-check", guideTimerEnd: null };
    });
  }

  async function handleAccusation(accusedId: string) {
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "accusation") return null;
      if (cur.blindPlayerId !== userId) return null;
      return { ...cur, blindPlayerGuess: accusedId, phase: "vote-reveal" };
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
  container: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0F1A1A" },
  card: { width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#4ECDC4" },
  question: { fontSize: 20, fontWeight: 700, color: "#fff", textAlign: "center", margin: 0 },
  title: { fontSize: 28, fontWeight: 800, margin: 0 },
  timer: { fontSize: 40, fontWeight: 800, color: "#fff" },
  taskCard: { width: "100%", padding: 16, borderRadius: 16, border: "1px solid", display: "flex", flexDirection: "column", gap: 8 },
  taskText: { fontSize: 16, fontWeight: 600, color: "#fff", margin: 0, lineHeight: 1.4, textAlign: "center" },
  hint: { fontSize: 14, fontWeight: 500, color: "#6B7280", textAlign: "center", margin: 0 },
  btn: { width: "100%", padding: "14px", fontSize: 16, fontWeight: 700, border: "none", borderRadius: 14, cursor: "pointer" },
  voteBtn: { width: "100%", padding: "14px 20px", fontSize: 16, fontWeight: 600, color: "#fff", border: "1px solid", borderRadius: 14, cursor: "pointer", textAlign: "left" as const },
  waiting: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  orderList: { width: "100%", display: "flex", flexDirection: "column", gap: 6 },
  orderItem: { display: "flex", gap: 10, padding: "10px 14px", borderRadius: 12, border: "1px solid", alignItems: "center" },
  scoreRow: { width: "100%", display: "flex", gap: 10, padding: "12px 14px", borderRadius: 12, border: "1px solid", borderColor: "rgba(78,205,196,0.15)", alignItems: "center" },
};
