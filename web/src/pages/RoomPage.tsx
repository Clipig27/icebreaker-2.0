import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRoomStore } from "../stores/roomStore";
import { useAuthStore } from "../stores/authStore";
import NumberGuessor from "../games/NumberGuessor";
import TalentShow from "../games/TalentShow";
import PieCharts from "../games/PieCharts";
import PotLuck from "../games/PotLuck";
import BlindRanking from "../games/BlindRanking";
import TenSecondTasks from "../games/TenSecondTasks";
import AuctionDraft from "../games/AuctionDraft";

const GAME_COMPONENTS: Record<string, React.FC> = {
  numberGuessor: NumberGuessor,
  talentShow: TalentShow,
  pieCharts: PieCharts,
  potLuck: PotLuck,
  blindRanking: BlindRanking,
  tenSecondTasks: TenSecondTasks,
  auctionDraft: AuctionDraft,
};

export default function RoomPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);
  const userId = useAuthStore((s) => s.userId);
  const username = useAuthStore((s) => s.username);

  // If no room in store, redirect to join
  useEffect(() => {
    if (!room && !useRoomStore.getState().loading) {
      navigate(`/join/${code}`);
    }
  }, [room]);

  // Room finished
  useEffect(() => {
    if (room?.status === "finished") {
      useRoomStore.getState().cleanup();
      navigate(`/join/${code}`);
    }
  }, [room?.status]);

  if (!room) {
    return (
      <div style={styles.container}>
        <div style={styles.spinner}>Loading...</div>
      </div>
    );
  }

  // Playing — render game component
  if (room.status === "playing" && room.game_type) {
    const GameComponent = GAME_COMPONENTS[room.game_type];
    if (GameComponent) {
      return <GameComponent />;
    }
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.title}>{room.game_type}</h2>
          <p style={styles.subtitle}>This game isn't available in the browser yet. Ask the host to pick a different game.</p>
        </div>
      </div>
    );
  }

  // Lobby
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.bolt}>⚡</div>
        <h1 style={styles.title}>Waiting for host</h1>
        <p style={styles.subtitle}>You're in! The host will start the game.</p>

        <div style={styles.codeBox}>
          <span style={styles.codeLabel}>ROOM CODE</span>
          <span style={styles.codeValue}>{room.code}</span>
        </div>

        <div style={styles.section}>
          <span style={styles.sectionLabel}>PLAYERS ({players.length})</span>
          {players.map((p) => (
            <div key={p.id} style={styles.playerRow}>
              <div style={{
                ...styles.avatar,
                background: p.user_id === userId ? "#BAA2F9" : "#6B7280",
              }}>
                {p.username.charAt(0).toUpperCase()}
              </div>
              <span style={styles.playerName}>
                {p.username}{p.user_id === userId ? " (You)" : ""}
              </span>
              {p.is_host && <span style={styles.hostBadge}>HOST</span>}
            </div>
          ))}
        </div>

        <div style={styles.waitingPill}>
          <div style={styles.pulseDot} />
          <span style={styles.waitingText}>Waiting for host to start...</span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100dvh",
    padding: 24,
    background: "linear-gradient(180deg, #221A35 0%, #1D182D 50%, #1A1527 100%)",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  bolt: { fontSize: 36 },
  title: { fontSize: 24, fontWeight: 800, color: "#fff", margin: 0 },
  subtitle: { fontSize: 14, color: "#9CA3AF", margin: 0, textAlign: "center" },
  spinner: { color: "#9CA3AF", fontSize: 16 },
  codeBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "12px 32px",
    background: "rgba(186,162,249,0.08)",
    borderRadius: 14,
    border: "1px solid rgba(186,162,249,0.15)",
  },
  codeLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#6B7280" },
  codeValue: { fontSize: 24, fontWeight: 800, color: "#BAA2F9", letterSpacing: 3 },
  section: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: "#6B7280",
    marginBottom: 4,
  },
  playerRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    background: "#231C31",
    borderRadius: 12,
    border: "1px solid rgba(186,162,249,0.1)",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 700,
    color: "#fff",
  },
  playerName: { flex: 1, fontSize: 15, fontWeight: 600, color: "#fff" },
  hostBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: "#BAA2F9",
    background: "rgba(186,162,249,0.15)",
    padding: "3px 8px",
    borderRadius: 6,
    letterSpacing: 0.5,
  },
  waitingPill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 20px",
    background: "#231C31",
    borderRadius: 999,
    border: "1px solid rgba(186,162,249,0.1)",
    marginTop: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    background: "#BAA2F9",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  waitingText: { fontSize: 13, color: "#9CA3AF" },
};
