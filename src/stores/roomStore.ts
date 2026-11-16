import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "./authStore";
import { RealtimeChannel } from "@supabase/supabase-js";

export type Player = {
  id: string;
  user_id: string;
  username: string;
  score: number;
  is_host: boolean;
};

export type GameType =
  | "talentShow"
  | "numberGuessor"
  | "pieCharts"
  | "potLuck"
  | "blindRanking";

export type Room = {
  id: string;
  code: string;
  host_id: string;
  status: "lobby" | "playing" | "finished";
  game_type: GameType | null;
  game_state: any;
};

interface RoomState {
  room: Room | null;
  players: Player[];
  isHost: boolean;
  loading: boolean;
  error: string | null;

  // Channels for cleanup
  _roomChannel: RealtimeChannel | null;
  _playersChannel: RealtimeChannel | null;

  // Actions
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  startGame: (gameType: GameType) => Promise<void>;
  updateGameState: (gameState: any) => Promise<void>;
  updateScore: (userId: string, delta: number) => Promise<void>;
  kickPlayer: (userId: string) => Promise<void>;
  endGame: () => Promise<void>;
  cleanup: () => void;
  _subscribe: (roomId: string) => void;
  _fetchPlayers: (roomId: string) => Promise<void>;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  room: null,
  players: [],
  isHost: false,
  loading: false,
  error: null,
  _roomChannel: null,
  _playersChannel: null,

  createRoom: async () => {
    const user = useAuthStore.getState().user;
    const username = useAuthStore.getState().username;
    if (!user) {
      console.error("[createRoom] No user");
      return set({ error: "Not authenticated" });
    }

    set({ loading: true, error: null });

    // Generate room code client-side
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    const playerName = username ?? "Player";
    console.log("[createRoom] code:", code, "user:", user.id, "name:", playerName);

    // Create room
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .insert({ code, host_id: user.id })
      .select()
      .single();

    if (roomErr || !room) {
      console.error("[createRoom] room error:", roomErr?.message);
      return set({ loading: false, error: roomErr?.message ?? "Failed to create room" });
    }

    console.log("[createRoom] room created:", room.id);

    // Add self as player
    const { error: playerErr } = await supabase
      .from("room_players")
      .insert({ room_id: room.id, user_id: user.id, username: playerName, is_host: true });

    if (playerErr) {
      console.error("[createRoom] player error:", playerErr.message);
      return set({ loading: false, error: playerErr.message });
    }

    console.log("[createRoom] success!");
    set({ room, isHost: true, loading: false });
    get()._subscribe(room.id);
    get()._fetchPlayers(room.id);
  },

  joinRoom: async (code: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return set({ error: "Not authenticated" });

    set({ loading: true, error: null });

    // Get username
    const { data: profile } = await supabase
      .from("users")
      .select("username")
      .eq("id", user.id)
      .single();

    const username = profile?.username ?? user.user_metadata?.username ?? "Player";

    // Find room
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select()
      .eq("code", code.toUpperCase())
      .neq("status", "finished")
      .single();

    if (roomErr || !room) {
      return set({ loading: false, error: "Room not found" });
    }

    // Add self as player
    const { error: playerErr } = await supabase
      .from("room_players")
      .insert({ room_id: room.id, user_id: user.id, username, is_host: false });

    if (playerErr) {
      const msg = playerErr.message.includes("uq_room_player")
        ? "You're already in this room"
        : playerErr.message;
      return set({ loading: false, error: msg });
    }

    set({ room, isHost: room.host_id === user.id, loading: false });
    get()._subscribe(room.id);
    get()._fetchPlayers(room.id);
  },

  leaveRoom: async () => {
    const { room } = get();
    const user = useAuthStore.getState().user;
    if (!room || !user) return;

    // Remove self from players
    await supabase
      .from("room_players")
      .delete()
      .eq("room_id", room.id)
      .eq("user_id", user.id);

    // If host, either transfer or close
    if (room.host_id === user.id) {
      const { data: remaining } = await supabase
        .from("room_players")
        .select("user_id")
        .eq("room_id", room.id)
        .limit(1);

      if (remaining && remaining.length > 0) {
        // Transfer host
        const newHostId = remaining[0].user_id;
        await supabase
          .from("rooms")
          .update({ host_id: newHostId })
          .eq("id", room.id);
        await supabase
          .from("room_players")
          .update({ is_host: true })
          .eq("room_id", room.id)
          .eq("user_id", newHostId);
      } else {
        // No one left, close room
        await supabase
          .from("rooms")
          .update({ status: "finished" })
          .eq("id", room.id);
      }
    }

    get().cleanup();
  },

  startGame: async (gameType: GameType) => {
    const { room } = get();
    if (!room) return;

    await supabase
      .from("rooms")
      .update({
        status: "playing",
        game_type: gameType,
        game_state: { phase: "starting", game: gameType },
        updated_at: new Date().toISOString(),
      })
      .eq("id", room.id);
  },

  updateGameState: async (gameState: any) => {
    const { room } = get();
    if (!room) return;

    await supabase
      .from("rooms")
      .update({ game_state: gameState, updated_at: new Date().toISOString() })
      .eq("id", room.id);
  },

  updateScore: async (userId: string, delta: number) => {
    const { room, players } = get();
    if (!room) return;

    const player = players.find((p) => p.user_id === userId);
    if (!player) return;

    await supabase
      .from("room_players")
      .update({ score: player.score + delta })
      .eq("room_id", room.id)
      .eq("user_id", userId);
  },

  kickPlayer: async (userId: string) => {
    const { room, isHost } = get();
    if (!room || !isHost) return;

    await supabase
      .from("room_players")
      .delete()
      .eq("room_id", room.id)
      .eq("user_id", userId);
  },

  endGame: async () => {
    const { room, isHost } = get();
    if (!room || !isHost) return;

    await supabase
      .from("rooms")
      .update({
        status: "lobby",
        game_type: null,
        game_state: {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", room.id);
  },

  cleanup: () => {
    const { _roomChannel, _playersChannel } = get();
    if (_roomChannel) supabase.removeChannel(_roomChannel);
    if (_playersChannel) supabase.removeChannel(_playersChannel);
    set({
      room: null,
      players: [],
      isHost: false,
      error: null,
      _roomChannel: null,
      _playersChannel: null,
    });
  },

  // Internal: subscribe to realtime changes
  _subscribe: (roomId: string) => {
    const user = useAuthStore.getState().user;

    // Room changes (game state, status, host)
    const roomChannel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const updated = payload.new as Room;
          set({
            room: updated,
            isHost: updated.host_id === user?.id,
          });
        }
      )
      .subscribe();

    // Player changes (join, leave, score updates)
    const playersChannel = supabase
      .channel(`room_players:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        () => {
          // Refetch all players on any change
          get()._fetchPlayers(roomId);
        }
      )
      // Realtime doesn't deliver DELETE events for column-filtered listeners,
      // so listen for deletes unfiltered and refetch (handles players leaving).
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "room_players" },
        () => {
          get()._fetchPlayers(roomId);
        }
      )
      .subscribe();

    set({ _roomChannel: roomChannel, _playersChannel: playersChannel });
  },

  // Internal: fetch current players
  _fetchPlayers: async (roomId: string) => {
    const { data } = await supabase
      .from("room_players")
      .select("id, user_id, username, score, is_host")
      .eq("room_id", roomId)
      .order("joined_at");

    if (data) set({ players: data });
  },
}));
