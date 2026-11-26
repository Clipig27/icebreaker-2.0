import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useRoomStore } from "../stores/roomStore";

export default function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState(code ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async () => {
    if (!name.trim() || !roomCode.trim()) return;
    setLoading(true);
    setError("");

    try {
      const userId = await useAuthStore.getState().ensureAuth(name.trim());
      await useRoomStore.getState().joinRoom(roomCode.trim().toUpperCase(), userId, name.trim());

      const state = useRoomStore.getState();
      if (state.error) {
        setError(state.error);
        setLoading(false);
      } else {
        navigate(`/room/${roomCode.trim().toUpperCase()}`);
      }
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.bolt}>⚡</div>
        <h1 style={styles.title}>Icebreaker</h1>
        <p style={styles.subtitle}>Join a game — no download needed</p>

        {!code && (
          <input
            style={styles.input}
            placeholder="Room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
        )}
        {code && (
          <div style={styles.codeDisplay}>
            <span style={styles.codeLabel}>ROOM CODE</span>
            <span style={styles.codeValue}>{code.toUpperCase()}</span>
          </div>
        )}

        <input
          style={styles.input}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          autoFocus
        />

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{
            ...styles.button,
            opacity: !name.trim() || !roomCode.trim() || loading ? 0.5 : 1,
          }}
          onClick={handleJoin}
          disabled={!name.trim() || !roomCode.trim() || loading}
        >
          {loading ? "Joining..." : "Join Game"}
        </button>
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
    maxWidth: 380,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  bolt: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 800,
    color: "#fff",
    margin: 0,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#9CA3AF",
    margin: 0,
    marginBottom: 16,
  },
  codeDisplay: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "12px 24px",
    background: "rgba(186,162,249,0.1)",
    borderRadius: 14,
    border: "1px solid rgba(186,162,249,0.2)",
    width: "100%",
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: "#9CA3AF",
  },
  codeValue: {
    fontSize: 28,
    fontWeight: 800,
    color: "#BAA2F9",
    letterSpacing: 4,
  },
  input: {
    width: "100%",
    padding: "16px 20px",
    fontSize: 18,
    fontWeight: 600,
    color: "#fff",
    background: "#231C31",
    border: "1px solid rgba(186,162,249,0.14)",
    borderRadius: 14,
    outline: "none",
    textAlign: "center",
  },
  button: {
    width: "100%",
    padding: "16px 24px",
    fontSize: 17,
    fontWeight: 700,
    color: "#1A1427",
    background: "linear-gradient(135deg, #C4AFFA, #B19CF9, #A68EF3)",
    border: "none",
    borderRadius: 14,
    cursor: "pointer",
    marginTop: 8,
  },
  error: {
    color: "#EF4444",
    fontSize: 14,
    margin: 0,
  },
};
