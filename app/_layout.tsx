import { useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, Animated, Easing, StyleSheet } from "react-native";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../src/stores/authStore";
import { colors, fonts } from "../src/theme";

// Intro is always on screen at least this long, then fades out.
const INTRO_MIN_MS = 2200;
const INTRO_FADE_MS = 350;

function IntroSplash({ fontsLoaded }: { fontsLoaded: boolean }) {
  const boltScale = useRef(new Animated.Value(0.2)).current;
  const boltOpacity = useRef(new Animated.Value(0)).current;
  const boltRotate = useRef(new Animated.Value(-1)).current;
  const boltPulse = useRef(new Animated.Value(1)).current;
  const shockScale = useRef(new Animated.Value(0.8)).current;
  const shockOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.6)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslate = useRef(new Animated.Value(18)).current;
  const dotsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 0–600ms: bolt pops in with a slight twist; shockwave ring bursts out.
    Animated.parallel([
      Animated.spring(boltScale, { toValue: 1, tension: 45, friction: 6, useNativeDriver: true }),
      Animated.timing(boltOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(boltRotate, { toValue: 0, duration: 550, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(150),
        Animated.parallel([
          Animated.timing(shockOpacity, { toValue: 0.7, duration: 80, useNativeDriver: true }),
          Animated.timing(shockScale, { toValue: 2.6, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(150),
            Animated.timing(shockOpacity, { toValue: 0, duration: 750, useNativeDriver: true }),
          ]),
        ]),
      ]),
    ]).start();

    // ~650ms: wordmark rises in; ~1050ms: dots fade in.
    Animated.sequence([
      Animated.delay(650),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(titleTranslate, { toValue: 0, tension: 70, friction: 9, useNativeDriver: true }),
      ]),
      Animated.timing(dotsOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    // Continuous soft glow breathing behind the bolt.
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowScale, { toValue: 1.7, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0.35, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowScale, { toValue: 1.1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0.15, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    ).start();

    // Bolt heartbeat pulse after it lands.
    Animated.sequence([
      Animated.delay(700),
      Animated.loop(
        Animated.sequence([
          Animated.timing(boltPulse, { toValue: 1.12, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(boltPulse, { toValue: 1, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay(500),
        ])
      ),
    ]).start();
  }, []);

  const rotate = boltRotate.interpolate({ inputRange: [-1, 0], outputRange: ["-25deg", "0deg"] });

  return (
    <View style={splash.container}>
      <View style={splash.stage}>
        <Animated.View style={[splash.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
        <Animated.View style={[splash.shock, { opacity: shockOpacity, transform: [{ scale: shockScale }] }]} />
        <Animated.View
          style={[
            splash.iconWrap,
            { opacity: boltOpacity, transform: [{ scale: Animated.multiply(boltScale, boltPulse) }, { rotate }] },
          ]}
        >
          <Ionicons name="flash" size={56} color={colors.primaryLight} />
        </Animated.View>
      </View>
      <Animated.Text
        style={[
          splash.title,
          fontsLoaded ? { fontFamily: fonts.extrabold } : { fontWeight: "800" },
          { opacity: titleOpacity, transform: [{ translateY: titleTranslate }] },
        ]}
      >
        Icebreaker
      </Animated.Text>
      <Animated.View style={[splash.dotsRow, { opacity: dotsOpacity }]}>
        <PulsingDot delay={0} />
        <PulsingDot delay={200} />
        <PulsingDot delay={400} />
      </Animated.View>
    </View>
  );
}

function PulsingDot({ delay }: { delay: number }) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.4, duration: 400, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return <Animated.View style={[splash.dot, { opacity, transform: [{ scale }] }]} />;
}

const splash = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  stage: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  glow: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.primary,
  },
  shock: {
    position: "absolute",
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: colors.highlight,
  },
  iconWrap: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.primary + "33",
    borderWidth: 2,
    borderColor: colors.primary + "AA",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 34,
    color: colors.white,
    letterSpacing: -0.5,
    marginBottom: 28,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryLight,
  },
});

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
  const introOpacity = useRef(new Animated.Value(1)).current;
  const introScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    initialize();
    const t = setTimeout(() => setMinElapsed(true), INTRO_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  const appReady = fontsLoaded && !loading;

  useEffect(() => {
    if (!appReady || !minElapsed || !introVisible) return;
    Animated.parallel([
      Animated.timing(introOpacity, { toValue: 0, duration: INTRO_FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(introScale, { toValue: 1.08, duration: INTRO_FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => setIntroVisible(false));
  }, [appReady, minElapsed, introVisible]);

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
          pointerEvents={appReady && minElapsed ? "none" : "auto"}
          style={[StyleSheet.absoluteFill, { opacity: introOpacity, transform: [{ scale: introScale }] }]}
        >
          <IntroSplash fontsLoaded={fontsLoaded} />
        </Animated.View>
      )}
    </View>
  );
}
