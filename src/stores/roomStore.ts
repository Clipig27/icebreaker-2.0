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
  | "blindRanking"
  | "tenSecondTasks"
  | "auctionDraft";

export type Room = {
  id: string;
  code: string;
  host_id: string;
  status: "lobby" | "playing" | "finished";
  game_type: GameType | null;
  game_state: any;
  updated_at?: string;
};

interface RoomState {
  room: Room | null;
  players: Player[];
  isHost: boolean;
  loading: boolean;
  error: string | null;
  // True after the current user was removed from the room by the host
  kicked: boolean;
  // True while leaveRoom() is running, so our own removal isn't treated as a kick
  _leaving: boolean;

  // Channels for cleanup
  _roomChannel: RealtimeChannel | null;
  _playersChannel: RealtimeChannel | null;

  // Actions
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  startGame: (gameType: GameType) => Promise<boolean>;
  updateGameState: (gameState: any) => Promise<void>;
  /**
   * Atomically read-modify-write rooms.game_state using optimistic concurrency
   * on rooms.updated_at. The mutator receives the FRESH server game_state and
   * returns the next state, or null/undefined to abort. Returns true if written.
   */
  mutateGameState: (mutator: (current: any) => any | null, maxRetries?: number) => Promise<boolean>;
  updateScore: (userId: string, delta: number) => Promise<void>;
  kickPlayer: (userId: string) => Promise<void>;
  endGame: () => Promise<void>;
  cleanup: () => void;
  clearKicked: () => void;
  /** Refetch the current room row from the server and apply it (fallback for missed realtime UPDATEs). */
  refreshRoom: () => Promise<void>;
  _subscribe: (roomId: string) => void;
  _fetchPlayers: (roomId: string) => Promise<void>;
}

// Monotonic id for _fetchPlayers requests; only the newest response is applied.
let playersFetchSeq = 0;
// Bumped by every room fetch and every realtime room UPDATE, so a refetch that
// was in flight when a newer realtime UPDATE arrived can't overwrite it.
let roomFetchSeq = 0;
// Room id in which we've seen our own player row in a fetched list (this session).
// Kick detection only runs after that, so a snapshot predating our join can't kick us.
let selfSeenInRoomId: string | null = null;

export const useRoomStore = create<RoomState>((set, get) => ({
  room: null,
  players: [],
  isHost: false,
  loading: false,
  error: null,
  kicked: false,
  _leaving: false,
  _roomChannel: null,
  _playersChannel: null,

  createRoom: async () => {
    const user = useAuthStore.getState().user;
    const username = useAuthStore.getState().username;
    if (!user) {
      console.error("[createRoom] No user");
      return set({ error: "Not authenticated" });
    }

    set({ loading: true, error: null, kicked: false });

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

    set({ loading: true, error: null, kicked: false });

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

    set({ _leaving: true });

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
    if (!room) {
      console.log("[tapdiag] startGame: no room in store, write skipped");
      return false;
    }

    const t0 = Date.now();
    const { data, error } = await supabase
      .from("rooms")
      .update({
        status: "playing",
        game_type: gameType,
        game_state: { phase: "starting", game: gameType },
        updated_at: new Date().toISOString(),
      })
      .eq("id", room.id)
      .select("id");

    const ms = Date.now() - t0;
    if (error) {
      console.log("[tapdiag] startGame FAILED", gameType, `${ms}ms`, error.message);
      return false;
    }
    if (!data || data.length === 0) {
      console.log("[tapdiag] startGame wrote 0 rows", gameType, `${ms}ms`);
      return false;
    }
    console.log("[tapdiag] startGame ok", gameType, `${ms}ms`);
    return true;
  },

  updateGameState: async (gameState: any) => {
    const { room } = get();
    if (!room) return;

    await supabase
      .from("rooms")
      .update({ game_state: gameState, updated_at: new Date().toISOString() })
      .eq("id", room.id);
  },

  mutateGameState: async (mutator, maxRetries = 8) => {
    const roomId = get().room?.id;
    if (!roomId) return false;

    const backoff = () =>
      new Promise<void>((resolve) => setTimeout(resolve, 20 + Math.random() * 100));

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await backoff();

      // 1. Read the fresh row from the server (never the cached store copy)
      const { data: fresh, error: readErr } = await supabase
        .from("rooms")
        .select("game_state, updated_at, status")
        .eq("id", roomId)
        .single();

      if (readErr || !fresh) {
        console.warn("[mutateGameState] read failed:", readErr?.message);
        continue;
      }
      if (fresh.status !== "playing") return false;

      // 2. Compute the next state from the fresh state
      const next = mutator(fresh.game_state ?? {});
      if (next === null || next === undefined) return false;

      // 3. New timestamp strictly greater than the one we read
      const prevMs = Date.parse(fresh.updated_at);
      const newUpdatedAt = new Date(
        Number.isNaN(prevMs) ? Date.now() : Math.max(Date.now(), prevMs + 1)
      ).toISOString();

      // 4. Compare-and-swap: only succeeds if nobody wrote since our read
      const { data: written, error: writeErr } = await supabase
        .from("rooms")
        .update({ game_state: next, updated_at: newUpdatedAt })
        .eq("id", roomId)
        .eq("updated_at", fresh.updated_at)
        .select("id");

      if (writeErr) {
        console.warn("[mutateGameState] write failed:", writeErr.message);
        continue;
      }
      if (!written || written.length === 0) {
        // Another client won the race; retry from a fresh read
        continue;
      }

      // Success: optimistically reflect our write locally (realtime will confirm)
      const current = get().room;
      if (current && current.id === roomId) {
        const curMs = current.updated_at ? Date.parse(current.updated_at) : NaN;
        if (Number.isNaN(curMs) || curMs <= Date.parse(newUpdatedAt)) {
          set({ room: { ...current, game_state: next, updated_at: newUpdatedAt } });
        }
      }
      return true;
    }

    console.warn("[mutateGameState] gave up after", maxRetries + 1, "attempts");
    return false;
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

    const { data, error } = await supabase
      .from("room_players")
      .delete()
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .select();

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error("The player could not be removed. You may not have permission to kick players.");
    }

    await get()._fetchPlayers(room.id);
  },

  endGame: async () => {
    const { room, isHost } = get();
    if (!room || !isHost) return;

    const updatedAt = new Date().toISOString();
    const { error } = await supabase
      .from("rooms")
      .update({
        status: "lobby",
        game_type: null,
        game_state: {},
        updated_at: updatedAt,
      })
      .eq("id", room.id);

    if (error) {
      console.warn("[endGame] failed to reset room:", error.message);
      return;
    }

    // Optimistically reflect the reset locally so screens don't act on a
    // stale "playing" status before the realtime UPDATE arrives.
    const current = get().room;
    if (current && current.id === room.id) {
      set({
        room: { ...current, status: "lobby", game_type: null, game_state: {}, updated_at: updatedAt },
      });
    }
  },

  cleanup: () => {
    const { _roomChannel, _playersChannel } = get();
    if (_roomChannel) supabase.removeChannel(_roomChannel);
    if (_playersChannel) supabase.removeChannel(_playersChannel);
    // Invalidate any in-flight player fetches and reset the per-session join marker
    playersFetchSeq++;
    selfSeenInRoomId = null;
    set({
      room: null,
      players: [],
      isHost: false,
      error: null,
      _leaving: false,
      _roomChannel: null,
      _playersChannel: null,
    });
  },

  clearKicked: () => set({ kicked: false }),

  refreshRoom: async () => {
    const roomId = get().room?.id;
    if (!roomId) return;
    const requestId = ++roomFetchSeq;

    const { data, error } = await supabase
      .from("rooms")
      .select()
      .eq("id", roomId)
      .single();

    // A newer fetch or realtime UPDATE superseded this response
    if (requestId !== roomFetchSeq) return;
    if (error || !data) {
      if (error) console.log("[rtdiag] refreshRoom failed:", error.message);
      return;
    }

    const current = get().room;
    // Ignore if we've left (or switched) rooms meanwhile
    if (!current || current.id !== roomId) return;

    // Never regress to an older row than what we already hold (e.g. an
    // optimistic local write from mutateGameState/endGame).
    const curMs = current.updated_at ? Date.parse(current.updated_at) : NaN;
    const freshMs = data.updated_at ? Date.parse(data.updated_at) : NaN;
    if (!Number.isNaN(curMs) && !Number.isNaN(freshMs) && freshMs < curMs) return;

    const fresh = data as Room;
    if (fresh.status !== current.status || fresh.game_type !== current.game_type) {
      console.log("[rtdiag] refreshRoom picked up change:", current.status, "->", fresh.status, fresh.game_type);
    }
    set({
      room: fresh,
      isHost: fresh.host_id === useAuthStore.getState().user?.id,
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
          // Ignore events for a room we've already left
          if (get().room?.id !== roomId) return;
          // Invalidate any in-flight refreshRoom so it can't overwrite this newer row
          roomFetchSeq++;
          set({
            room: updated,
            isHost: updated.host_id === user?.id,
          });
        }
      )
      .subscribe((status, err) => {
        console.log("[rtdiag] room channel", status, err ? String(err) : "");
        // Any rooms UPDATE emitted before the channel went live (or while it was
        // reconnecting) is never redelivered, so reconcile from the server on
        // every SUBSCRIBED (initial join and each reconnect).
        if (status === "SUBSCRIBED" && get().room?.id === roomId) {
          get().refreshRoom();
        }
      });

    // Player changes (join, leave, score updates)
    const playersChannel = supabase
      .channel(`room_players:${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        () => {
          // Refetch all players on score / host changes
          get()._fetchPlayers(roomId);
        }
      )
      // Column-filtered INSERT delivery proved unreliable (a simultaneous join was
      // missed), so listen for inserts unfiltered and refetch for our room.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_players" },
        (payload) => {
          const insertedRoomId = (payload.new as { room_id?: string } | null)?.room_id;
          if (!insertedRoomId || insertedRoomId === roomId) {
            get()._fetchPlayers(roomId);
          }
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
      .subscribe((status, err) => {
        console.log("[rtdiag] players channel", status, err ? String(err) : "");
        // Changes made between our initial fetch and the channel going live are
        // never delivered, so reconcile once the subscription is actually active
        // (also fires again after a reconnect).
        if (status === "SUBSCRIBED") {
          get()._fetchPlayers(roomId);
        }
      });

    set({ _roomChannel: roomChannel, _playersChannel: playersChannel });
  },

  // Internal: fetch current players
  _fetchPlayers: async (roomId: string) => {
    const requestId = ++playersFetchSeq;

    const { data, error } = await supabase
      .from("room_players")
      .select("id, user_id, username, score, is_host")
      .eq("room_id", roomId)
      .order("joined_at");

    // Concurrent fetches can resolve out of order; only the newest may apply,
    // otherwise an older snapshot could overwrite a newer one.
    if (requestId !== playersFetchSeq) return;

    if (error || !data) return;

    // Ignore stale results for a room we're no longer in
    if (get().room?.id !== roomId) return;

    // If we're still in this room but no longer in its player list, the host kicked us.
    // Skip while leaving voluntarily (leaveRoom deletes our row before cleaning up),
    // and only once our own join row has been observed in this session so an early
    // snapshot can never be mistaken for a kick.
    const userId = useAuthStore.getState().user?.id;
    const selfPresent = !!userId && data.some((p) => p.user_id === userId);
    if (selfPresent) selfSeenInRoomId = roomId;
    if (userId && !selfPresent) {
      if (!get()._leaving && selfSeenInRoomId === roomId) {
        get().cleanup();
        set({ kicked: true });
      }
      return;
    }

    set({ players: data });
  },
}));
