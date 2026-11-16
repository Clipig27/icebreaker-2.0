import { create } from "zustand";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthState {
  session: Session | null;
  user: User | null;
  username: string | null;
  loading: boolean;
  needsUsername: boolean;
  initialize: () => Promise<void>;
  setUsername: (username: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  username: null,
  loading: true,
  needsUsername: false,

  initialize: async () => {
    try {
      // 1. Try to restore session
      let { data: { session } } = await supabase.auth.getSession();

      // 2. No session → try anonymous, fall back to email sign-up
      if (!session?.user) {
        // Try anonymous first
        const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously();
        if (!anonErr && anonData.session) {
          session = anonData.session;
        } else {
          // Anonymous disabled — create a random email account instead
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

      // 3. Check if user has a profile with username
      const { data: profile } = await supabase
        .from("users")
        .select("username")
        .eq("id", session.user.id)
        .maybeSingle();

      set({
        session,
        user: session.user,
        username: profile?.username ?? null,
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

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, username: null, needsUsername: false });
  },
}));
