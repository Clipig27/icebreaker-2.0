import { useCallback, useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { useAuthStore } from "../src/stores/authStore";
import { colors } from "../src/theme";
import IntroSplash from "../src/components/IntroSplash";

/** The intro's own onComplete gates the handoff; if it hasn't even started by
 *  this long after mount, stop waiting for it. */
const INTRO_START_FALLBACK_MS = 4000;
/** Overlay fade-out (with a slight 1 → 1.06 scale-up of the splash content). */
const INTRO_FADE_MS = 420;
/** Hard stop: force-unmount the intro this long after the app is ready. */
const INTRO_SAFETY_MS = 6000;
/** Overlay background — matches the intro's top gradient color, so no flash. */
const INTRO_BG = "#0E0C1A";

// ---------------------------------------------------------------------------
// Root Layout
// ---------------------------------------------------------------------------

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const loading = useAuthStore((s) => s.loading);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const [minElapsed, setMinElapsed] = useState(false);
  const [introVisible, setIntroVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const fade = useSharedValue(0); // 0 = splash fully visible, 1 = gone

  /** Date.now() when the splash's clock actually started (null = not yet). */
  const [introStartedAt, setIntroStartedAt] = useState<number | null>(null);
  const appReadyAtRef = useRef<number | null>(null);

  const handleIntroStart = useCallback(() => setIntroStartedAt(Date.now()), []);
  const handleIntroComplete = useCallback(() => setMinElapsed(true), []);

  useEffect(() => {
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback: if the splash never manages to start, never block the app.
  useEffect(() => {
    if (introStartedAt !== null) return;
    const t = setTimeout(() => setMinElapsed(true), INTRO_START_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [introStartedAt]);

  const appReady = fontsLoaded && !loading;

  // Handoff: once the app is ready AND the intro has played, fade out + unmount.
  useEffect(() => {
    if (!appReady || !minElapsed || !introVisible || fading) return;
    setFading(true);
    fade.value = withTiming(
      1,
      { duration: INTRO_FADE_MS, easing: Easing.out(Easing.cubic) },
      () => {
        // Unmount whether or not the animation finished.
        scheduleOnRN(setIntroVisible, false);
      },
    );
  }, [appReady, minElapsed, introVisible, fading, fade]);

  // Safety net: never let the intro linger. Measured from the later of
  // "app ready" and "splash started".
  useEffect(() => {
    if (!appReady) return;
    if (appReadyAtRef.current === null) appReadyAtRef.current = Date.now();
    const anchor = Math.max(appReadyAtRef.current, introStartedAt ?? 0);
    const delay = Math.max(0, anchor + INTRO_SAFETY_MS - Date.now());
    const t = setTimeout(() => setIntroVisible(false), delay);
    return () => clearTimeout(t);
  }, [appReady, introStartedAt]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.06 * fade.value }] }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      {appReady && (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: "slide_from_right",
          }}
        />
      )}
      {introVisible && (
        <Animated.View
          pointerEvents={fading ? "none" : "auto"}
          style={[StyleSheet.absoluteFill, { backgroundColor: INTRO_BG }, overlayStyle]}
        >
          <Animated.View style={[StyleSheet.absoluteFill, contentStyle]}>
            <IntroSplash canStart={appReady} onStart={handleIntroStart} onComplete={handleIntroComplete} />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}
