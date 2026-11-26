import { create } from "zustand";
import { supabase } from "../lib/supabase";

interface AuthState {
  userId: string | null;
  username: string | null;
  loading: boolean;
  ensureAuth: (username: string) => Promise<string>;
}

const EMAIL_KEY = "icebreaker_web_email";
const PASS_KEY = "icebreaker_web_pass";

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  username: null,
  loading: false,

  ensureAuth: async (username: string) => {
    set({ loading: true });

    // Try restoring session
    let { data: { session } } = await supabase.auth.getSession();

    // Try saved credentials
    if (!session?.user) {
      const savedEmail = localStorage.getItem(EMAIL_KEY);
      const savedPass = localStorage.getItem(PASS_KEY);
      if (savedEmail && savedPass) {
        const { data } = await supabase.auth.signInWithPassword({
          email: savedEmail,
          password: savedPass,
        });
        if (data.session) session = data.session;
      }
    }

    // Create new account
    if (!session?.user) {
      const rand = Math.random().toString(36).slice(2, 10);
      const email = `web_${rand}@icebreaker.local`;
      const password = `pw_${Math.random().toString(36).slice(2, 18)}`;
      const { data } = await supabase.auth.signUp({ email, password });
      session = data.session;
      if (session) {
        localStorage.setItem(EMAIL_KEY, email);
        localStorage.setItem(PASS_KEY, password);
      }
    }

    if (!session?.user) throw new Error("Auth failed");

    // Upsert username
    await supabase.from("users").upsert({
      id: session.user.id,
      username,
      username_lower: username.toLowerCase(),
    });

    set({ userId: session.user.id, username, loading: false });
    return session.user.id;
  },
}));
