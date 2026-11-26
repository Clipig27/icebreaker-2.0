import { useState, useEffect } from "react";
import { useRoomStore } from "../stores/roomStore";
import { useAuthStore } from "../stores/authStore";

export default function AuctionDraft() {
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);
  const mutate = useRoomStore((s) => s.mutateGameState);
  const userId = useAuthStore((s) => s.userId);
  const gs = room?.game_state;
  const phase = gs?.phase;
  const auction = gs?.auction;

  const [bidAmount, setBidAmount] = useState(1);
  const [acting, setActing] = useState(false);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const playerMap: Record<string, string> = {};
  players.forEach((p) => { playerMap[p.user_id] = p.username; });
  // Also use names snapshot from game state for players who left
  const nameOf = (id: string | null | undefined): string => {
    if (!id) return "?";
    return playerMap[id] ?? gs?.names?.[id] ?? "Player";
  };

  // Timer for auction deadline
  useEffect(() => {
    if (!auction?.deadline) { setSecondsLeft(0); return; }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((auction.deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [auction?.deadline, auction?.seq]);

  // Reset bid amount when item/turn changes
  useEffect(() => {
    if (!auction || auction.status !== "bidding") return;
    const myMoney = auction.players?.[userId ?? ""]?.money ?? 0;
    const minBid = (auction.highBid ?? 0) + 1;
    setBidAmount(Math.max(1, Math.min(minBid, myMoney)));
    setActing(false);
  }, [auction?.itemIndex, auction?.highBid, auction?.turn]);

  // Reset vote on phase change
  useEffect(() => {
    if (phase !== "voting") { setMyVote(null); }
  }, [phase]);

  // --- Handlers ---
  async function handleBid() {
    if (acting || !userId) return;
    setActing(true);
    const ok = await mutate((cur: any) => {
      if (!cur || cur.phase !== "auction" || !cur.auction) return null;
      const a = cur.auction;
      if (a.status !== "bidding" || a.turn !== userId) return null;
      const myMoney = a.players?.[userId]?.money ?? 0;
      if (bidAmount < (a.highBid ?? 0) + 1 || bidAmount > myMoney) return null;
      // Apply bid: update highBid, highBidder, advance turn
      const order = a.order as string[];
      const passed = a.passed as string[];
      const departed = a.departed as string[];
      const active = order.filter((id: string) => !passed.includes(id) && !departed.includes(id));
      let nextTurn: string | null = null;
      if (active.length > 1) {
        const idx = active.indexOf(userId);
        for (let step = 1; step < active.length; step++) {
          const candidate = active[(idx + step) % active.length];
          if (candidate !== userId) { nextTurn = candidate; break; }
        }
      }
      return {
        ...cur,
        auction: {
          ...a,
          highBid: bidAmount,
          highBidder: userId,
          turn: nextTurn ?? a.turn,
          seq: a.seq + 1,
          deadline: Date.now() + 15000,
        },
      };
    });
    if (!ok) setActing(false);
  }

  async function handlePass() {
    if (acting || !userId) return;
    setActing(true);
    const ok = await mutate((cur: any) => {
      if (!cur || cur.phase !== "auction" || !cur.auction) return null;
      const a = cur.auction;
      if (a.status !== "bidding" || a.turn !== userId) return null;
      const newPassed = [...(a.passed ?? []), userId];
      const order = a.order as string[];
      const departed = a.departed as string[];
      const active = order.filter((id: string) => !newPassed.includes(id) && !departed.includes(id));

      // If only one active left (or none), that person wins the item
      if (active.length <= 1) {
        const winnerId = a.highBidder ?? active[0] ?? userId;
        const price = a.highBid ?? 0;
        const item = a.pool?.[a.itemIndex];
        const playerState = { ...a.players };
        if (winnerId && playerState[winnerId]) {
          playerState[winnerId] = {
            ...playerState[winnerId],
            money: playerState[winnerId].money - price,
            items: [...playerState[winnerId].items, item],
          };
        }
        const result = { itemIndex: a.itemIndex, item, playerId: winnerId, price, kind: price > 0 ? "sold" : "free" };
        const nextIdx = a.itemIndex + 1;
        const isDone = nextIdx >= (a.pool?.length ?? 0);
        return {
          ...cur,
          auction: {
            ...a,
            passed: newPassed,
            players: playerState,
            status: isDone ? "done" : "result",
            lastResults: [result],
            log: [...(a.log ?? []), result],
            seq: a.seq + 1,
            deadline: Date.now() + 2500,
          },
          phase: isDone ? "reveal" : cur.phase,
        };
      }

      // Find next turn
      const idx = order.indexOf(userId);
      let nextTurn = a.turn;
      for (let step = 1; step <= order.length; step++) {
        const candidate = order[(idx + step) % order.length];
        if (!newPassed.includes(candidate) && !departed.includes(candidate)) {
          nextTurn = candidate;
          break;
        }
      }

      return {
        ...cur,
        auction: {
          ...a,
          passed: newPassed,
          turn: nextTurn,
          seq: a.seq + 1,
          deadline: Date.now() + 15000,
        },
      };
    });
    if (!ok) setActing(false);
  }

  async function handleVote(voteeId: string) {
    if (!userId || myVote || voteeId === userId) return;
    setMyVote(voteeId);
    await mutate((cur: any) => {
      if (!cur || cur.phase !== "voting") return null;
      if ((cur.votedPlayerIds ?? []).includes(userId)) return null;
      return {
        ...cur,
        votes: { ...(cur.votes ?? {}), [userId]: voteeId },
        votedPlayerIds: [...(cur.votedPlayerIds ?? []), userId],
      };
    });
  }

  // --- Waiting states ---
  if (!gs || phase === "starting" || phase === "intro" || phase === "setup") {
    return <Screen><p style={S.waiting}>Waiting for the game to begin...</p></Screen>;
  }

  // --- AUCTION ---
  if (phase === "auction" && auction) {
    const status = auction.status;
    const currentItem = auction.pool?.[auction.itemIndex];
    const myPlayer = auction.players?.[userId ?? ""];
    const myMoney = myPlayer?.money ?? 0;
    const myItems = myPlayer?.items ?? [];
    const isMyTurn = auction.turn === userId;
    const highBid = auction.highBid ?? 0;
    const highBidder = auction.highBidder;
    const hasPassed = (auction.passed ?? []).includes(userId ?? "");
    const totalItems = auction.pool?.length ?? 0;
    const itemNum = (auction.itemIndex ?? 0) + 1;

    // Result card
    if (status === "result") {
      const result = auction.lastResults?.[0];
      return (
        <Screen>
          <div style={S.eyebrow}>
            {result?.kind === "sold" ? "SOLD!" : result?.kind === "free" ? "FREE!" : "LEFTOVER"}
          </div>
          <div style={S.auctionItemBig}>
            {result?.item?.emoji ?? ""} {result?.item?.name ?? "Item"}
          </div>
          <p style={S.resultInfo}>
            {result?.kind === "sold"
              ? `${nameOf(result?.playerId)} for $${result?.price}`
              : `Goes to ${nameOf(result?.playerId)}`}
          </p>
          <p style={S.waiting}>Next item coming...</p>
        </Screen>
      );
    }

    if (status === "done") {
      return <Screen><p style={S.waiting}>Auction complete! Results incoming...</p></Screen>;
    }

    // Bidding
    return (
      <Screen>
        {/* Item info */}
        <div style={S.eyebrow}>ITEM {itemNum} of {totalItems}</div>
        <div style={S.auctionItemBig}>
          {currentItem?.emoji ?? ""} {currentItem?.name ?? "Item"}
        </div>

        {/* Current bid */}
        <div style={S.bidInfo}>
          {highBid > 0
            ? <span>High bid: <strong>${highBid}</strong> by {nameOf(highBidder)}</span>
            : <span>No bids yet - opens at $1</span>}
        </div>

        {/* Timer */}
        <div style={{ ...S.timer, color: secondsLeft <= 3 ? "#EF4444" : "#9CA3AF" }}>
          {secondsLeft}s
        </div>

        {/* My status */}
        <div style={S.myStatus}>
          <span>Your budget: <strong>${myMoney}</strong></span>
          <span>Your items: <strong>{myItems.length}</strong></span>
        </div>

        {/* Actions */}
        {isMyTurn && !hasPassed ? (
          <div style={S.bidActions}>
            <div style={S.bidRow}>
              <button
                style={S.bidMinus}
                onClick={() => setBidAmount(Math.max(highBid + 1, bidAmount - 1))}
                disabled={bidAmount <= highBid + 1}
              >
                -
              </button>
              <div style={S.bidDisplay}>${bidAmount}</div>
              <button
                style={S.bidPlus}
                onClick={() => setBidAmount(Math.min(myMoney, bidAmount + 1))}
                disabled={bidAmount >= myMoney}
              >
                +
              </button>
            </div>
            <button
              style={{ ...S.bidBtn, opacity: acting ? 0.5 : 1 }}
              onClick={handleBid}
              disabled={acting || bidAmount < highBid + 1 || bidAmount > myMoney}
            >
              BID ${bidAmount}
            </button>
            <button
              style={{ ...S.passBtn, opacity: acting ? 0.5 : 1 }}
              onClick={handlePass}
              disabled={acting}
            >
              PASS
            </button>
          </div>
        ) : hasPassed ? (
          <div style={S.passedNote}>You passed on this item</div>
        ) : (
          <div style={S.waitingTurn}>
            {nameOf(auction.turn)} is deciding...
          </div>
        )}

        {/* My collection */}
        {myItems.length > 0 && (
          <>
            <div style={S.eyebrow}>YOUR ITEMS</div>
            <div style={S.itemChips}>
              {myItems.map((item: any, i: number) => (
                <span key={i} style={S.itemChip}>{item.emoji} {item.name}</span>
              ))}
            </div>
          </>
        )}
      </Screen>
    );
  }

  // --- REVEAL ---
  if (phase === "reveal" && auction) {
    const auctionPlayers = auction.players ?? {};
    const order = auction.order ?? [];
    return (
      <Screen>
        <div style={S.bigText}>Auction Complete!</div>
        <div style={S.eyebrow}>EVERYONE'S COLLECTIONS</div>
        <div style={S.list}>
          {order.map((pid: string) => {
            const p = auctionPlayers[pid];
            const items = p?.items ?? [];
            const spent = (auction.startingMoney ?? 20) - (p?.money ?? 0);
            return (
              <div key={pid} style={S.collectionCard}>
                <div style={S.collectionHeader}>
                  <span style={S.collectionName}>{nameOf(pid)}{pid === userId ? " (You)" : ""}</span>
                  <span style={S.collectionSpent}>${spent} spent</span>
                </div>
                <div style={S.itemChips}>
                  {items.map((item: any, i: number) => (
                    <span key={i} style={S.itemChip}>{item.emoji} {item.name}</span>
                  ))}
                  {items.length === 0 && <span style={S.noItems}>No items</span>}
                </div>
              </div>
            );
          })}
        </div>
        <p style={S.waiting}>Waiting for host to start voting...</p>
      </Screen>
    );
  }

  // --- VOTING ---
  if (phase === "voting") {
    const auctionOrder = auction?.order ?? [];
    const hasVoted = myVote || (gs.votedPlayerIds ?? []).includes(userId);

    if (hasVoted) {
      return <Screen><p style={S.submitted}>Vote locked! Waiting for everyone...</p></Screen>;
    }

    return (
      <Screen>
        <div style={S.eyebrow}>VOTE FOR THE BEST COLLECTION</div>
        <p style={S.hint}>Whose draft is the most impressive?</p>
        {auctionOrder.filter((id: string) => id !== userId).map((pid: string) => {
          const items = auction?.players?.[pid]?.items ?? [];
          return (
            <button key={pid} style={S.voteCard} onClick={() => handleVote(pid)}>
              <div style={S.voteCardName}>{nameOf(pid)}</div>
              <div style={S.voteCardItems}>
                {items.map((item: any, i: number) => (
                  <span key={i}>{item.emoji} {item.name}{i < items.length - 1 ? ", " : ""}</span>
                ))}
              </div>
            </button>
          );
        })}
      </Screen>
    );
  }

  // --- VOTE RESULTS / GAME OVER ---
  if (phase === "vote-results" || phase === "game-over") {
    const winners = gs.winners ?? [];
    return (
      <Screen>
        <div style={S.bigText}>{phase === "game-over" ? "GAME OVER" : "VOTE RESULTS"}</div>
        {winners.length > 0 && (
          <div style={S.winnerCard}>
            <span style={S.winnerLabel}>WINNER</span>
            <span style={S.winnerName}>{winners.map((w: string) => nameOf(w)).join(", ")}</span>
          </div>
        )}
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
  container: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#1A2E1A" },
  card: { width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#5ABF9C", textTransform: "uppercase" as const },
  bigText: { fontSize: 24, fontWeight: 800, color: "#fff", textAlign: "center" },
  waiting: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  hint: { fontSize: 13, color: "#9CA3AF", textAlign: "center", margin: 0 },
  submitted: { fontSize: 15, color: "#5ABF9C", padding: "14px 20px", background: "rgba(90,191,156,0.1)", borderRadius: 14, textAlign: "center" },
  list: { width: "100%", display: "flex", flexDirection: "column", gap: 10 },

  // Auction item
  auctionItemBig: { fontSize: 24, fontWeight: 800, color: "#fff", textAlign: "center", padding: "20px", background: "linear-gradient(135deg, #5ABF9C, #358870)", borderRadius: 16, width: "100%" },

  // Bid info
  bidInfo: { fontSize: 15, color: "#D1D5DB", textAlign: "center" },
  timer: { fontSize: 18, fontWeight: 700 },

  // My status
  myStatus: { width: "100%", display: "flex", justifyContent: "space-between", padding: "10px 16px", background: "#243824", borderRadius: 12, border: "1px solid rgba(90,191,156,0.12)", fontSize: 14, color: "#D1D5DB" },

  // Bid actions
  bidActions: { width: "100%", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" },
  bidRow: { display: "flex", alignItems: "center", gap: 16 },
  bidMinus: { width: 44, height: 44, borderRadius: 22, background: "#243824", border: "1px solid #5ABF9C", color: "#5ABF9C", fontSize: 20, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  bidPlus: { width: 44, height: 44, borderRadius: 22, background: "#243824", border: "1px solid #5ABF9C", color: "#5ABF9C", fontSize: 20, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  bidDisplay: { fontSize: 32, fontWeight: 800, color: "#fff", minWidth: 80, textAlign: "center" as const },
  bidBtn: { width: "100%", padding: "14px", fontSize: 16, fontWeight: 800, color: "#fff", background: "linear-gradient(135deg, #5ABF9C, #358870)", border: "none", borderRadius: 50, cursor: "pointer", letterSpacing: 0.5 },
  passBtn: { width: "100%", padding: "14px", fontSize: 16, fontWeight: 700, color: "#9CA3AF", background: "transparent", border: "1px dashed rgba(90,191,156,0.3)", borderRadius: 50, cursor: "pointer" },

  passedNote: { fontSize: 15, color: "#9CA3AF", padding: "14px 20px", background: "rgba(90,191,156,0.05)", borderRadius: 14, textAlign: "center" },
  waitingTurn: { fontSize: 15, color: "#D1D5DB", padding: "14px 20px", background: "#243824", borderRadius: 14, textAlign: "center", border: "1px solid rgba(90,191,156,0.12)" },

  // Items
  itemChips: { width: "100%", display: "flex", flexWrap: "wrap" as const, gap: 6 },
  itemChip: { padding: "6px 12px", background: "#243824", borderRadius: 20, fontSize: 13, fontWeight: 600, color: "#D1D5DB", border: "1px solid rgba(90,191,156,0.15)" },
  noItems: { fontSize: 13, color: "#6B7280", fontStyle: "italic" },

  // Result
  resultInfo: { fontSize: 16, fontWeight: 600, color: "#D1D5DB", textAlign: "center" },

  // Collections
  collectionCard: { width: "100%", padding: "14px 16px", background: "#243824", borderRadius: 14, border: "1px solid rgba(90,191,156,0.12)", display: "flex", flexDirection: "column", gap: 8 },
  collectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  collectionName: { fontWeight: 700, fontSize: 15, color: "#fff" },
  collectionSpent: { fontSize: 13, fontWeight: 600, color: "#5ABF9C" },

  // Voting
  voteCard: { width: "100%", padding: "14px 16px", background: "#243824", border: "1px solid rgba(90,191,156,0.2)", borderRadius: 14, cursor: "pointer", textAlign: "left" as const, display: "flex", flexDirection: "column", gap: 6 },
  voteCardName: { fontWeight: 700, fontSize: 16, color: "#fff" },
  voteCardItems: { fontSize: 13, color: "#9CA3AF", lineHeight: "1.4" },

  // Winner
  winnerCard: { width: "100%", padding: "16px 20px", background: "linear-gradient(135deg, #5ABF9C, #358870)", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  winnerLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.7)" },
  winnerName: { fontSize: 22, fontWeight: 800, color: "#fff" },
};
