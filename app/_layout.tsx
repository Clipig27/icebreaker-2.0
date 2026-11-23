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

const INTRO_MIN_MS = 2400;
const INTRO_FADE_MS = 350;

function IntroSplash({ fontsLoaded }: { fontsLoaded: boolean }) {
  // Bolt zooms in
  const boltScale = useRef(new Animated.Value(0.05)).current;
  const boltOpacity = useRef(new Animated.Value(0)).current;
  // Green bolt (visible first)
  const greenOpacity = useRef(new Animated.Value(1)).current;
  // Purple bolt (fades in on color change)
  const purpleOpacity = useRef(new Animated.Value(0)).current;
  // Title
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslate = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    // Phase 1: Green bolt zooms in from tiny
    Animated.parallel([
      Animated.timing(boltOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(boltScale, { toValue: 1, tension: 40, friction: 6, useNativeDriver: true }),
    ]).start();

    // Phase 2: Color shift green -> purple with a slight "comes at you" pop
    Animated.sequence([
      Animated.delay(800),
      Animated.parallel([
        Animated.timing(greenOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(purpleOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        // Pop toward you then settle
        Animated.sequence([
          Animated.timing(boltScale, { toValue: 1.2, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(boltScale, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
        ]),
      ]),
    ]).start();

    // Phase 3: "Icebreaker" appears
    Animated.sequence([
      Animated.delay(1300),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(titleTranslate, { toValue: 0, tension: 65, friction: 9, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={sp.container}>
      {/* Bolt — two layers for color transition, no circle/ring */}
      <Animated.View style={[sp.boltWrap, { opacity: boltOpacity, transform: [{ scale: boltScale }] }]}>
        <Animated.View style={[sp.boltLayer, { opacity: greenOpacity }]}>
          <Ionicons name="flash" size={72} color={colors.lime} />
        </Animated.View>
        <Animated.View style={[sp.boltLayer, { opacity: purpleOpacity }]}>
          <Ionicons name="flash" size={72} color={colors.primaryLight} />
        </Animated.View>
      </Animated.View>

      {/* Title */}
      <Animated.Text
        style={[
          sp.title,
          fontsLoaded ? { fontFamily: fonts.extrabold } : { fontWeight: "800" },
          { opacity: titleOpacity, transform: [{ translateY: titleTranslate }] },
        ]}
      >
        Icebreaker
      </Animated.Text>
    </View>
  );
}

const sp = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  boltWrap: {
    marginBottom: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  boltLayer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 34,
    color: colors.white,
    letterSpacing: -0.5,
  },
});

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
  const introOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    initialize();
    const t = setTimeout(() => setMinElapsed(true), INTRO_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  const appReady = fontsLoaded && !loading;

  useEffect(() => {
    if (!appReady || !minElapsed || !introVisible) return;
    Animated.timing(introOpacity, {
      toValue: 0,
      duration: INTRO_FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setIntroVisible(false));
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
          style={[StyleSheet.absoluteFill, { opacity: introOpacity }]}
        >
          <IntroSplash fontsLoaded={fontsLoaded} />
        </Animated.View>
      )}
    </View>
  );
}
