import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = "https://wmifnqroaruqygrwuqav.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtaWZucXJvYXJ1cXlncnd1cWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NjAyODksImV4cCI6MjExMDIzNjI4OX0.veYnXUzqhx6LDGeROVfW6xIMygvyQ6MZ9Gbb8cDyANM";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
