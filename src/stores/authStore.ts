import { create } from "zustand";
import { Session, User } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";

const EMAIL_KEY = "icebreaker_fallback_email";
const PASS_KEY = "icebreaker_fallback_pass";
const USERNAME_KEY = "icebreaker_username";

interface AuthState {
  session: Session | null;
  user: User | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  wins: number;
  gamesPlayed: number;
  trophies: number;
  perGameWins: Record<string, number>;
  loading: boolean;
  needsUsername: boolean;
  initialize: () => Promise<void>;
  setUsername: (username: string) => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  setAvatarUrl: (url: string) => Promise<void>;
  incrementWins: () => Promise<void>;
  incrementGamesPlayed: () => Promise<void>;
  addTrophies: (count: number) => Promise<void>;
  removeTrophy: () => Promise<void>;
  recordGameWin: (gameType: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  username: null,
  displayName: null,
  avatarUrl: null,
  wins: 0,
  gamesPlayed: 0,
  trophies: 0,
  perGameWins: {},
  loading: true,
  needsUsername: false,

  initialize: async () => {
    try {
      // 1. Try to restore session from Supabase's built-in persistence
      let { data: { session } } = await supabase.auth.getSession();
      console.log("[auth] getSession:", session?.user?.id ?? "NO SESSION");

      // 2. Session gone — sign back in with saved credentials
      if (!session?.user) {
        const savedEmail = await AsyncStorage.getItem(EMAIL_KEY);
        const savedPass = await AsyncStorage.getItem(PASS_KEY);
        console.log("[auth] saved creds:", savedEmail ? "YES" : "NO");

        if (savedEmail && savedPass) {
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email: savedEmail,
            password: savedPass,
          });
          if (!signInErr && signInData.session) {
            session = signInData.session;
            console.log("[auth] signed in with saved creds:", session.user.id);
          } else {
            console.warn("[auth] saved creds failed:", signInErr?.message);
            await AsyncStorage.multiRemove([EMAIL_KEY, PASS_KEY]);
          }
        }
      }

      // 3. Still no session — create a new account
      if (!session?.user) {
        const rand = Math.random().toString(36).slice(2, 10);
        const email = `player_${rand}@icebreaker.local`;
        const password = `pw_${Math.random().toString(36).slice(2, 18)}`;
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpErr) throw signUpErr;
        session = signUpData.session;
        console.log("[auth] created new account:", session?.user?.id);

        await AsyncStorage.setItem(EMAIL_KEY, email);
        await AsyncStorage.setItem(PASS_KEY, password);
      }

      if (!session?.user) throw new Error("No session after all attempts");

      // 4. Check if user has a profile
      const { data: profile, error: profileErr } = await supabase
        .from("users")
        .select("username, display_name, wins, games_played, avatar_url, trophies, per_game_wins")
        .eq("id", session.user.id)
        .maybeSingle();

      console.log("[auth] profile:", profile?.username ?? "NONE", profileErr?.message ?? "ok");

      let username = profile?.username ?? null;

      // 5. No profile but we have a locally saved username — restore it
      //    (covers the case where we lost the old account and created a new one)
      if (!username) {
        const savedUsername = await AsyncStorage.getItem(USERNAME_KEY);
        if (savedUsername) {
          console.log("[auth] restoring username from local:", savedUsername);
          // Try to claim it on the new account
          const { error: upsertErr } = await supabase.from("users").upsert({
            id: session.user.id,
            username: savedUsername,
            username_lower: savedUsername.toLowerCase(),
          });
          if (!upsertErr) {
            username = savedUsername;
          } else {
            // Username taken (by the old dead account) — append random suffix
            const fallback = savedUsername + Math.floor(Math.random() * 100);
            const { error: fallbackErr } = await supabase.from("users").upsert({
              id: session.user.id,
              username: fallback,
              username_lower: fallback.toLowerCase(),
            });
            if (!fallbackErr) {
              username = fallback;
              await AsyncStorage.setItem(USERNAME_KEY, fallback);
            }
            console.warn("[auth] username taken, used fallback:", fallback);
          }
        }
      }

      // Restore avatar: prefer DB, fall back to local backup
      let avatarUrl = profile?.avatar_url ?? null;
      if (!avatarUrl) {
        const localAvatar = await AsyncStorage.getItem("icebreaker_avatar_url");
        if (localAvatar) avatarUrl = localAvatar;
      }

      set({
        session,
        user: session.user,
        username,
        displayName: profile?.display_name ?? null,
        avatarUrl,
        wins: profile?.wins ?? 0,
        gamesPlayed: profile?.games_played ?? 0,
        trophies: profile?.trophies ?? 0,
        perGameWins: profile?.per_game_wins ?? {},
        needsUsername: !username,
        loading: false,
      });

      supabase.auth.onAuthStateChange((_event, session) => {
        set({ session, user: session?.user ?? null });
      });
    } catch (e: any) {
      console.error("[auth] init error:", e.message);
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

    // Always save locally so we survive account loss
    await AsyncStorage.setItem(USERNAME_KEY, username);
    set({ username, needsUsername: false });
  },

  setDisplayName: async (name: string) => {
    const user = get().user;
    if (!user) return;
    set({ displayName: name });
    await supabase
      .from("users")
      .update({ display_name: name })
      .eq("id", user.id)
      .then(({ error }) => {
        if (error) console.warn("[authStore] setDisplayName failed:", error.message);
      });
  },

  incrementWins: async () => {
    const user = get().user;
    if (!user) return;
    const newWins = get().wins + 1;
    set({ wins: newWins });
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
    // Only persist remote URLs to the DB (local file:// URIs won't survive app restart)
    if (url.startsWith("http")) {
      await supabase
        .from("users")
        .update({ avatar_url: url })
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) console.warn("[authStore] setAvatarUrl failed:", error.message);
        });
    }
    // Always save locally as backup
    await AsyncStorage.setItem("icebreaker_avatar_url", url);
  },

  addTrophies: async (count: number) => {
    const user = get().user;
    if (!user || count <= 0) return;
    const newTrophies = get().trophies + count;
    set({ trophies: newTrophies });
    await supabase
      .from("users")
      .update({ trophies: newTrophies })
      .eq("id", user.id)
      .then(({ error }) => {
        if (error) console.warn("[authStore] addTrophies failed:", error.message);
      });
  },

  removeTrophy: async () => {
    const user = get().user;
    if (!user) return;
    const newTrophies = Math.max(0, get().trophies - 1);
    set({ trophies: newTrophies });
    await supabase
      .from("users")
      .update({ trophies: newTrophies })
      .eq("id", user.id)
      .then(({ error }) => {
        if (error) console.warn("[authStore] removeTrophy failed:", error.message);
      });
  },

  recordGameWin: async (gameType: string) => {
    const user = get().user;
    if (!user) return;
    const current = { ...get().perGameWins };
    current[gameType] = (current[gameType] ?? 0) + 1;
    set({ perGameWins: current });
    await supabase
      .from("users")
      .update({ per_game_wins: current })
      .eq("id", user.id)
      .then(({ error }) => {
        if (error) console.warn("[authStore] recordGameWin failed:", error.message);
      });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    await AsyncStorage.multiRemove([EMAIL_KEY, PASS_KEY, USERNAME_KEY, "icebreaker_avatar_url"]);
    set({ session: null, user: null, username: null, displayName: null, avatarUrl: null, wins: 0, gamesPlayed: 0, trophies: 0, perGameWins: {}, needsUsername: false });
  },
}));
