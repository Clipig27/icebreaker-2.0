import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type Player = {
  id: string;
  user_id: string;
  username: string;
  score: number;
  is_host: boolean;
};

export type Room = {
  id: string;
  code: string;
  host_id: string;
  status: "lobby" | "playing" | "finished";
  game_type: string | null;
  game_state: any;
  updated_at?: string;
};

interface RoomState {
  room: Room | null;
  players: Player[];
  loading: boolean;
  error: string | null;
  _channel: RealtimeChannel | null;
  _playersChannel: RealtimeChannel | null;

  joinRoom: (code: string, userId: string, username: string) => Promise<void>;
  mutateGameState: (mutator: (current: any) => any | null) => Promise<boolean>;
  cleanup: () => void;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  room: null,
  players: [],
  loading: false,
  error: null,
  _channel: null,
  _playersChannel: null,

  joinRoom: async (code, userId, username) => {
    set({ loading: true, error: null });

    // Find room
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select()
      .eq("code", code.toUpperCase())
      .neq("status", "finished")
      .maybeSingle();

    if (roomErr || !room) {
      set({ loading: false, error: "Room not found" });
      return;
    }

    // Join as player
    const { error: joinErr } = await supabase.from("room_players").insert({
      room_id: room.id,
      user_id: userId,
      username,
      is_host: false,
    });

    if (joinErr && !joinErr.message.includes("uq_room_player")) {
      set({ loading: false, error: joinErr.message });
      return;
    }

    set({ room, loading: false });

    // Subscribe to room changes
    const channel = supabase
      .channel(`web-room:${room.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        (payload) => {
          const updated = payload.new as Room;
          set({ room: updated });
        }
      )
      .subscribe();

    // Subscribe to player changes
    const playersChannel = supabase
      .channel(`web-players:${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players" },
        () => {
          // Refetch all players
          supabase
            .from("room_players")
            .select("id, user_id, username, score, is_host")
            .eq("room_id", room.id)
            .order("joined_at")
            .then(({ data }) => {
              if (data) set({ players: data });
            });
        }
      )
      .subscribe();

    set({ _channel: channel, _playersChannel: playersChannel });

    // Initial fetch
    const { data: players } = await supabase
      .from("room_players")
      .select("id, user_id, username, score, is_host")
      .eq("room_id", room.id)
      .order("joined_at");
    if (players) set({ players });
  },

  mutateGameState: async (mutator) => {
    const roomId = get().room?.id;
    if (!roomId) return false;

    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: fresh } = await supabase
        .from("rooms")
        .select("game_state, updated_at")
        .eq("id", roomId)
        .single();

      if (!fresh) return false;

      const next = mutator(fresh.game_state);
      if (next === null || next === undefined) return false;

      const now = new Date().toISOString();
      const { error } = await supabase
        .from("rooms")
        .update({ game_state: next, updated_at: now })
        .eq("id", roomId)
        .eq("updated_at", fresh.updated_at);

      if (!error) return true;
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 80));
    }
    return false;
  },

  cleanup: () => {
    const { _channel, _playersChannel } = get();
    if (_channel) supabase.removeChannel(_channel);
    if (_playersChannel) supabase.removeChannel(_playersChannel);
    set({ room: null, players: [], _channel: null, _playersChannel: null });
  },
}));
