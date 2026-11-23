import { create } from "zustand";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthState {
  session: Session | null;
  user: User | null;
  username: string | null;
  avatarUrl: string | null;
  wins: number;
  gamesPlayed: number;
  loading: boolean;
  needsUsername: boolean;
  initialize: () => Promise<void>;
  setUsername: (username: string) => Promise<void>;
  setAvatarUrl: (url: string) => Promise<void>;
  incrementWins: () => Promise<void>;
  incrementGamesPlayed: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  username: null,
  avatarUrl: null,
  wins: 0,
  gamesPlayed: 0,
  loading: true,
  needsUsername: false,

  initialize: async () => {
    try {
      // 1. Try to restore session
      let { data: { session } } = await supabase.auth.getSession();

      // 2. No session -> try anonymous, fall back to email sign-up
      if (!session?.user) {
        // Try anonymous first
        const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously();
        if (!anonErr && anonData.session) {
          session = anonData.session;
        } else {
          // Anonymous disabled -- create a random email account instead
          const rand = Math.random().toString(36).slice(2, 10);
          const email = `player_${rand}@icebreaker.local`;
          const password = `pw_${Math.random().toString(36).slice(2, 18)}`;
          const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
            email,
            password,
          });
          if (signUpErr) throw signUpErr;
          session = signUpData.session;
        }
      }

      if (!session?.user) throw new Error("No session");

      // 3. Check if user has a profile with username + stats
      const { data: profile } = await supabase
        .from("users")
        .select("username, wins, games_played, avatar_url")
        .eq("id", session.user.id)
        .maybeSingle();

      set({
        session,
        user: session.user,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        wins: profile?.wins ?? 0,
        gamesPlayed: profile?.games_played ?? 0,
        needsUsername: !profile?.username,
        loading: false,
      });

      supabase.auth.onAuthStateChange((_event, session) => {
        set({ session, user: session?.user ?? null });
      });
    } catch (e: any) {
      console.error("Auth init error:", e.message);
      set({ loading: false });
    }
  },

  setUsername: async (username: string) => {
    const user = get().user;
    if (!user) return;

    const { error } = await supabase.from("users").upsert({
      id: user.id,
      username,
      username_lower: username.toLowerCase(),
    });

    if (error) throw error;
    set({ username, needsUsername: false });
  },

  incrementWins: async () => {
    const user = get().user;
    if (!user) return;
    const newWins = get().wins + 1;
    set({ wins: newWins });
    // Update in DB -- ignore errors silently (optimistic)
    await supabase
      .from("users")
      .update({ wins: newWins })
      .eq("id", user.id)
      .then(({ error }) => {
        if (error) console.warn("[authStore] incrementWins failed:", error.message);
      });
  },

  incrementGamesPlayed: async () => {
    const user = get().user;
    if (!user) return;
    const newCount = get().gamesPlayed + 1;
    set({ gamesPlayed: newCount });
    await supabase
      .from("users")
      .update({ games_played: newCount })
      .eq("id", user.id)
      .then(({ error }) => {
        if (error) console.warn("[authStore] incrementGamesPlayed failed:", error.message);
      });
  },

  setAvatarUrl: async (url: string) => {
    const user = get().user;
    if (!user) return;
    set({ avatarUrl: url });
    await supabase
      .from("users")
      .update({ avatar_url: url })
      .eq("id", user.id)
      .then(({ error }) => {
        if (error) console.warn("[authStore] setAvatarUrl failed:", error.message);
      });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, username: null, avatarUrl: null, wins: 0, gamesPlayed: 0, needsUsername: false });
  },
}));
