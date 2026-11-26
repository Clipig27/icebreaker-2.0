import { useState, useEffect } from "react";
import { useRoomStore } from "../stores/roomStore";
import { useAuthStore } from "../stores/authStore";

export default function TenSecondTasks() {
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);
  const mutate = useRoomStore((s) => s.mutateGameState);
  const userId = useAuthStore((s) => s.userId);
  const gs = room?.game_state;
  const phase = gs?.phase;

  const [secondsLeft, setSecondsLeft] = useState(0);

  const playerMap: Record<string, string> = {};
  players.forEach((p) => { playerMap[p.user_id] = p.username; });

  const currentHolderId = gs?.currentHolderId;
  const holderName = currentHolderId ? (playerMap[currentHolderId] ?? "Player") : "...";
  const isHolder = !!userId && currentHolderId === userId &&
    (phase === "countdown" || phase === "active" || phase === "judging" || phase === "resolve");
  const isEliminated = (gs?.eliminatedPlayerIds ?? []).includes(userId ?? "");
  const stack: { id: string; text: string }[] = gs?.stack ?? [];

  // Timer
  useEffect(() => {
    if (!gs?.timerEnd) { setSecondsLeft(0); return; }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((gs.timerEnd - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [gs?.timerEnd]);

  const myVote = gs?.votes?.[userId ?? ""] ?? null;
  const passCount = Object.values(gs?.votes ?? {}).filter((v) => v === "pass").length;
  const failCount = Object.values(gs?.votes ?? {}).filter((v) => v === "fail").length;

  // --- Handlers ---
  async function handleDone() {
    if (!isHolder || gs?.holderTappedDone) return;
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "active" || cur.currentHolderId !== userId || cur.holderTappedDone) return null;
      return { ...cur, phase: "judging", holderTappedDone: true, timerEnd: null };
    });
  }

  async function handleVote(vote: "pass" | "fail") {
    if (isHolder) return;
    await mutate((cur: any) => {
      if (!cur || (cur.phase !== "active" && cur.phase !== "judging") || cur.currentHolderId === userId) return null;
      return { ...cur, votes: { ...cur.votes, [userId!]: vote } };
    });
  }

  // --- Waiting states ---
  if (!gs || phase === "starting" || phase === "intro") {
    return <Screen><p style={S.waiting}>Waiting for the game to begin...</p></Screen>;
  }

  // --- COUNTDOWN ---
  if (phase === "countdown") {
    return (
      <Screen>
        <div style={S.turnLabel}>
          {isHolder ? "Get ready!" : `${holderName} is up!`}
        </div>
        <div style={S.subtitle}>Turn {gs.turnNumber} {gs.isSuddenDeath ? "- SUDDEN DEATH" : ""}</div>
        <div style={S.countdownNum}>{secondsLeft}</div>
        <div style={S.eyebrow}>{isHolder ? "YOUR TASKS" : `${holderName}'S TASKS`}</div>
        <TaskList stack={stack} />
      </Screen>
    );
  }

  // --- ACTIVE ---
  if (phase === "active") {
    const urgent = secondsLeft <= 3;

    if (isHolder) {
      return (
        <Screen>
          <div style={S.turnLabel}>You're on!</div>
          <div style={S.subtitle}>Do every task, then tap Done</div>
          <div style={{ ...S.countdownNum, color: urgent ? "#EF4444" : "#F0A060" }}>{secondsLeft}s</div>
          <div style={S.eyebrow}>YOUR TASKS</div>
          <TaskList stack={stack} />
          <button style={S.doneBtn} onClick={handleDone}>DONE!</button>
        </Screen>
      );
    }

    return (
      <Screen>
        <div style={S.turnLabel}>{holderName} is performing!</div>
        <div style={S.subtitle}>
          {isEliminated ? "You're on the jury. Vote Pass or Fail." : "Vote Pass or Fail."}
        </div>
        <div style={{ ...S.countdownNum, color: urgent ? "#EF4444" : "#F0A060" }}>{secondsLeft}s</div>
        <div style={S.eyebrow}>TASKS</div>
        <TaskList stack={stack} />

        <div style={S.voteInfo}>{passCount} Pass / {failCount} Fail</div>
        <div style={S.voteRow}>
          <button
            style={{ ...S.voteBtn, ...(myVote === "pass" ? S.voteBtnPassOn : {}) }}
            onClick={() => handleVote("pass")}
          >
            PASS
          </button>
          <button
            style={{ ...S.voteBtnFail, ...(myVote === "fail" ? S.voteBtnFailOn : {}) }}
            onClick={() => handleVote("fail")}
          >
            FAIL
          </button>
        </div>
      </Screen>
    );
  }

  // --- JUDGING ---
  if (phase === "judging") {
    return (
      <Screen>
        <div style={S.turnLabel}>{gs.timerExpired ? "Time's up!" : `${holderName} is done!`}</div>
        <div style={S.subtitle}>Tallying votes...</div>
        <div style={S.statRow}>
          <div style={S.statCard}><div style={S.statValue}>{passCount}</div><div style={S.statLabel}>Pass</div></div>
          <div style={S.statCard}><div style={{ ...S.statValue, color: "#EF4444" }}>{failCount}</div><div style={S.statLabel}>Fail</div></div>
        </div>
      </Screen>
    );
  }

  // --- RESOLVE ---
  if (phase === "resolve") {
    const isPassed = gs.verdict === "pass";
    return (
      <Screen>
        <div style={S.eyebrow}>THE VERDICT</div>
        <div style={{ ...S.verdictBig, color: isPassed ? "#F0A060" : "#EF4444" }}>
          {isPassed ? "PASS!" : "OUT!"}
        </div>
        <div style={S.verdictName}>{holderName}</div>
        <div style={S.statRow}>
          <div style={S.statCard}><div style={S.statValue}>{gs.passCount}</div><div style={S.statLabel}>Pass</div></div>
          <div style={S.statCard}><div style={{ ...S.statValue, color: "#EF4444" }}>{gs.failCount}</div><div style={S.statLabel}>Fail</div></div>
        </div>
      </Screen>
    );
  }

  // --- GAME OVER ---
  if (phase === "game-over") {
    const winnerId = gs.winnerId;
    const winnerName = winnerId ? (playerMap[winnerId] ?? "???") : "???";
    const iWon = winnerId === userId;
    const elimOrder: string[] = gs.eliminationOrder ?? [];

    return (
      <Screen>
        <div style={S.bigText}>{iWon ? "YOU WIN!" : `${winnerName} WINS!`}</div>
        <div style={S.subtitle}>{gs.turnNumber} turns played</div>

        <div style={S.winnerCard}>
          <span style={S.winnerEmoji}>1</span>
          <span style={S.winnerName}>{winnerName}</span>
        </div>

        {elimOrder.length > 0 && (
          <>
            <div style={S.eyebrow}>ELIMINATION ORDER</div>
            <div style={S.list}>
              {elimOrder.map((uid, i) => (
                <div key={uid} style={S.elimRow}>
                  <span style={S.slotNum}>{elimOrder.length - i}</span>
                  <span style={S.elimName}>{playerMap[uid] ?? "?"}</span>
                  <span style={S.outTag}>OUT</span>
                </div>
              ))}
            </div>
          </>
        )}
        <p style={S.waiting}>Waiting for host...</p>
      </Screen>
    );
  }

  return <Screen><p style={S.waiting}>{phase}...</p></Screen>;
}

function TaskList({ stack }: { stack: { id: string; text: string }[] }) {
  return (
    <div style={S.taskList}>
      {stack.map((item, i) => {
        const isNewest = i === stack.length - 1;
        return (
          <div key={item.id} style={isNewest ? S.taskHero : S.taskRow}>
            <span style={isNewest ? S.taskNumHero : S.taskNum}>{i + 1}</span>
            <span style={isNewest ? S.taskTextHero : S.taskText}>{item.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={S.container}>
      <div style={S.card}>{children}</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  container: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#2A2010" },
  card: { width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#F0A060", textTransform: "uppercase" as const },
  bigText: { fontSize: 28, fontWeight: 800, color: "#fff", textAlign: "center" },
  waiting: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  turnLabel: { fontSize: 22, fontWeight: 800, color: "#fff", textAlign: "center" },
  subtitle: { fontSize: 14, fontWeight: 500, color: "#9CA3AF", textAlign: "center" },
  list: { width: "100%", display: "flex", flexDirection: "column", gap: 8 },

  // Countdown
  countdownNum: { fontSize: 72, fontWeight: 800, color: "#F0A060", lineHeight: "1" },

  // Task list
  taskList: { width: "100%", display: "flex", flexDirection: "column", gap: 8 },
  taskRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#362A18", borderRadius: 12, border: "1px solid rgba(240,160,96,0.12)" },
  taskHero: { display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 20px", background: "linear-gradient(135deg, #F0A060, #D06830)", borderRadius: 14 },
  taskNum: { width: 28, height: 28, borderRadius: 6, background: "#453520", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff", flexShrink: 0 },
  taskNumHero: { width: 28, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.9)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#D06830", flexShrink: 0 },
  taskText: { flex: 1, fontWeight: 600, fontSize: 15, color: "#D1D5DB", lineHeight: "1.4" },
  taskTextHero: { flex: 1, fontWeight: 800, fontSize: 17, color: "#fff", lineHeight: "1.4" },

  // Done button
  doneBtn: { width: "100%", padding: "16px", fontSize: 18, fontWeight: 800, color: "#fff", background: "linear-gradient(135deg, #F0A060, #D06830)", border: "none", borderRadius: 50, cursor: "pointer", letterSpacing: 0.5 },

  // Vote
  voteInfo: { fontSize: 13, fontWeight: 500, color: "#9CA3AF" },
  voteRow: { width: "100%", display: "flex", gap: 12 },
  voteBtn: { flex: 1, padding: "14px", fontSize: 16, fontWeight: 700, color: "#F0A060", background: "#362A18", border: "2px solid #F0A060", borderRadius: 50, cursor: "pointer", textAlign: "center" as const },
  voteBtnPassOn: { background: "linear-gradient(135deg, #F0A060, #D06830)", color: "#fff", border: "2px solid #F0A060" },
  voteBtnFail: { flex: 1, padding: "14px", fontSize: 16, fontWeight: 700, color: "#EF4444", background: "#362A18", border: "2px solid #EF4444", borderRadius: 50, cursor: "pointer", textAlign: "center" as const },
  voteBtnFailOn: { background: "#EF4444", color: "#fff" },

  // Stats
  statRow: { width: "100%", display: "flex", gap: 12 },
  statCard: { flex: 1, padding: "16px", background: "#362A18", borderRadius: 12, border: "1px solid rgba(240,160,96,0.12)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  statValue: { fontSize: 30, fontWeight: 800, color: "#fff" },
  statLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#9CA3AF", textTransform: "uppercase" as const },

  // Verdict
  verdictBig: { fontSize: 48, fontWeight: 800, lineHeight: "1" },
  verdictName: { fontSize: 20, fontWeight: 700, color: "#fff" },

  // Game over
  winnerCard: { display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: "linear-gradient(135deg, #F0A060, #D06830)", borderRadius: 16, width: "100%" },
  winnerEmoji: { width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.9)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: "#D06830" },
  winnerName: { flex: 1, fontSize: 20, fontWeight: 800, color: "#fff" },

  // Elimination
  elimRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#362A18", borderRadius: 12, border: "1px solid rgba(240,160,96,0.12)" },
  slotNum: { width: 28, height: 28, borderRadius: 6, background: "#453520", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#F0A060", flexShrink: 0 },
  elimName: { flex: 1, fontWeight: 600, fontSize: 15, color: "#fff" },
  outTag: { fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#EF4444" },
};
