import { useState, useEffect } from "react";
import { useRoomStore } from "../stores/roomStore";
import { useAuthStore } from "../stores/authStore";

export default function BlindRanking() {
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);
  const mutate = useRoomStore((s) => s.mutateGameState);
  const userId = useAuthStore((s) => s.userId);
  const gs = room?.game_state;
  const phase = gs?.phase;

  const [hasPlacedThisRound, setHasPlacedThisRound] = useState(false);
  const [myVote, setMyVote] = useState<string | null>(null);

  const playerMap: Record<string, string> = {};
  players.forEach((p) => { playerMap[p.user_id] = p.username; });

  // Reset placed flag when round advances
  useEffect(() => {
    if (!gs || gs.phase !== "playing") return;
    setHasPlacedThisRound((gs.roundSubmitted ?? []).includes(userId));
  }, [gs?.currentRound, gs?.roundSubmitted?.length, gs?.phase]);

  // Reset vote on phase change
  useEffect(() => {
    if (phase !== "voting") setMyVote(null);
  }, [phase]);

  // --- Handlers ---
  async function handlePlaceItem(slotIndex: number) {
    if (!gs || gs.phase !== "playing" || hasPlacedThisRound) return;
    const currentItem = gs.draw?.[gs.currentRound];
    if (!currentItem) return;
    const mySlots = gs.placements?.[userId ?? ""];
    if (!mySlots || mySlots[slotIndex] !== null) return;

    setHasPlacedThisRound(true);
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "playing") return null;
      if ((cur.roundSubmitted ?? []).includes(userId)) return null;
      const item = cur.draw[cur.currentRound];
      const curSlots = cur.placements?.[userId ?? ""];
      if (!curSlots || curSlots[slotIndex] !== null) return null;
      const newSlots = [...curSlots];
      newSlots[slotIndex] = item;
      return {
        ...cur,
        placements: { ...cur.placements, [userId!]: newSlots },
        roundSubmitted: [...(cur.roundSubmitted ?? []), userId],
      };
    });
  }

  async function handleVote(voteeId: string) {
    if (!gs || myVote) return;
    setMyVote(voteeId);
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "voting") return null;
      if ((cur.votedPlayerIds ?? []).includes(userId)) return null;
      return {
        ...cur,
        votes: { ...(cur.votes ?? {}), [userId!]: voteeId },
        votedPlayerIds: [...(cur.votedPlayerIds ?? []), userId],
      };
    });
  }

  // --- Waiting states ---
  if (!gs || phase === "starting" || phase === "intro" || phase === "setup") {
    return <Screen><p style={S.waiting}>Waiting for the game to begin...</p></Screen>;
  }

  // --- PLAYING ---
  if (phase === "playing") {
    const currentRound = gs.currentRound ?? 0;
    const size = gs.size ?? 5;
    const currentItem = gs.draw?.[currentRound];
    const mySlots: (string | null)[] = gs.placements?.[userId ?? ""] ?? new Array(size).fill(null);
    const category = gs.categoryLabel ?? "Category";
    const emoji = gs.categoryEmoji ?? "";

    if (hasPlacedThisRound) {
      const placed = mySlots.filter(Boolean).length;
      return (
        <Screen>
          <div style={S.eyebrow}>{emoji} {category}</div>
          <p style={S.submitted}>Placed! Waiting for everyone...</p>
          <p style={S.waiting}>{placed}/{size} items placed</p>
          <div style={S.slotList}>
            {mySlots.map((item, i) => (
              <div key={i} style={item ? S.slotFilled : S.slotEmpty}>
                <span style={S.slotNum}>{size - i}</span>
                <span style={S.slotText}>{item ?? "---"}</span>
              </div>
            ))}
          </div>
        </Screen>
      );
    }

    return (
      <Screen>
        <div style={S.eyebrow}>{emoji} {category} - ITEM {currentRound + 1} of {size}</div>
        <div style={S.currentItem}>{currentItem ?? "..."}</div>
        <p style={S.hint}>Tap a slot to place this item (no take-backs!)</p>
        <div style={S.slotList}>
          {mySlots.map((item, i) => (
            <button
              key={i}
              style={item ? S.slotFilled : S.slotOpen}
              onClick={() => !item && handlePlaceItem(i)}
              disabled={!!item}
            >
              <span style={S.slotNum}>{size - i}</span>
              <span style={S.slotText}>{item ?? "(empty)"}</span>
            </button>
          ))}
        </div>
      </Screen>
    );
  }

  // --- REVEAL ---
  if (phase === "reveal") {
    const size = gs.size ?? 5;
    const mySlots: (string | null)[] = gs.placements?.[userId ?? ""] ?? [];
    return (
      <Screen>
        <div style={S.eyebrow}>YOUR RANKING</div>
        <div style={S.slotList}>
          {mySlots.map((item, i) => (
            <div key={i} style={S.slotFilled}>
              <span style={S.slotNum}>{size - i}</span>
              <span style={S.slotText}>{item ?? "---"}</span>
            </div>
          ))}
        </div>
        <p style={S.waiting}>Results are on the host's screen!</p>
      </Screen>
    );
  }

  // --- VOTING ---
  if (phase === "voting") {
    if (myVote || (gs.votedPlayerIds ?? []).includes(userId)) {
      return (
        <Screen>
          <p style={S.submitted}>Vote locked! Waiting for everyone...</p>
        </Screen>
      );
    }

    return (
      <Screen>
        <div style={S.eyebrow}>VOTE FOR THE BEST LIST</div>
        <p style={S.hint}>Whose ranking do you think is the best?</p>
        {players.filter((p) => p.user_id !== userId).map((p) => (
          <button
            key={p.user_id}
            style={S.voteBtn}
            onClick={() => handleVote(p.user_id)}
          >
            {p.username}
          </button>
        ))}
      </Screen>
    );
  }

  // --- VOTE RESULTS / GAME OVER ---
  if (phase === "vote-results" || phase === "game-over") {
    const brScores = gs.brScores ?? {};
    const sorted = Object.entries(brScores)
      .map(([uid, score]) => ({ uid, name: playerMap[uid] ?? "?", score: score as number }))
      .sort((a, b) => b.score - a.score);

    return (
      <Screen>
        <div style={S.bigText}>{phase === "game-over" ? "FINAL RESULTS" : "ROUND RESULTS"}</div>
        <div style={S.list}>
          {sorted.map((p, i) => (
            <div key={p.uid} style={{ ...S.scoreRow, ...(i === 0 ? S.scoreRowWinner : {}) }}>
              <span style={S.slotNum}>{i + 1}</span>
              <span style={S.scoreName}>{p.uid === userId ? "You" : p.name}</span>
              <span style={S.scoreVal}>{p.score} pt{p.score !== 1 ? "s" : ""}</span>
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
  container: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#1A1830" },
  card: { width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#A88BFA", textTransform: "uppercase" as const },
  bigText: { fontSize: 24, fontWeight: 800, color: "#fff", textAlign: "center" },
  waiting: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  hint: { fontSize: 13, color: "#9CA3AF", textAlign: "center", margin: 0 },
  submitted: { fontSize: 15, color: "#A88BFA", padding: "14px 20px", background: "rgba(168,139,250,0.1)", borderRadius: 14, textAlign: "center" },
  list: { width: "100%", display: "flex", flexDirection: "column", gap: 8 },

  // Current item to place
  currentItem: { fontSize: 26, fontWeight: 800, color: "#fff", textAlign: "center", padding: "20px", background: "linear-gradient(135deg, #A88BFA, #7C5CE0)", borderRadius: 16, width: "100%" },

  // Slot list
  slotList: { width: "100%", display: "flex", flexDirection: "column", gap: 6 },
  slotEmpty: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#242040", borderRadius: 12, border: "1px solid rgba(168,139,250,0.12)" },
  slotFilled: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#242040", borderRadius: 12, border: "1px solid rgba(168,139,250,0.25)" },
  slotOpen: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#242040", borderRadius: 12, border: "2px dashed rgba(168,139,250,0.4)", cursor: "pointer", color: "#fff", fontSize: 15, fontWeight: 500, width: "100%", textAlign: "left" as const },
  slotNum: { width: 28, height: 28, borderRadius: 6, background: "#2E2A50", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#A88BFA", flexShrink: 0 },
  slotText: { flex: 1, fontWeight: 600, fontSize: 15, color: "#fff" },

  // Scores
  scoreRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#242040", borderRadius: 12, border: "1px solid rgba(168,139,250,0.12)" },
  scoreRowWinner: { border: "1px solid #A88BFA", background: "rgba(168,139,250,0.15)" },
  scoreName: { flex: 1, fontWeight: 600, fontSize: 15, color: "#D1D5DB" },
  scoreVal: { fontWeight: 800, fontSize: 16, color: "#fff" },

  // Vote
  voteBtn: { width: "100%", padding: "14px 20px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#242040", border: "1px solid rgba(168,139,250,0.2)", borderRadius: 14, cursor: "pointer", textAlign: "left" as const },
};
