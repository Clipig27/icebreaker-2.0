import { useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Easing, Image } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { colors, fonts } from "../src/theme";
import SkiaBackground from "../src/components/SkiaBackground";

export default function Welcome() {
  const router = useRouter();

  // Animated values
  const titleAnim = useRef(new Animated.Value(0)).current;
  const subtitleAnim = useRef(new Animated.Value(0)).current;
  const buttonsAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.05)).current;

  useEffect(() => {
    // Staggered entrance animations
    Animated.stagger(200, [
      Animated.timing(titleAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(subtitleAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(buttonsAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();

    // Pulsing glow behind title
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.15,
          duration: 2000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        Animated.timing(glowAnim, {
          toValue: 0.05,
          duration: 2000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
      ])
    ).start();
  }, []);

  const handleGetStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/sign-up");
  };

  const handleSignIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/sign-in");
  };

  return (
    <LinearGradient
      colors={["#0E0C1A", "#12101F"]}
      style={s.gradientBg}
    >
      <SkiaBackground />
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          {/* Pulsing glow behind title */}
          <Animated.View
            style={[
              s.glow,
              { opacity: glowAnim },
            ]}
          />

          <Animated.Image
            source={require("../assets/icon.png")}
            style={[
              s.logo,
              {
                opacity: titleAnim,
                transform: [
                  {
                    translateY: titleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [30, 0],
                    }),
                  },
                  {
                    scale: titleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ],
              },
            ]}
          />

          <Animated.Text
            style={[
              s.title,
              {
                opacity: titleAnim,
                transform: [
                  {
                    translateY: titleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [30, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            Icebreaker
          </Animated.Text>

          <Animated.Text
            style={[
              s.subtitle,
              {
                opacity: subtitleAnim,
                transform: [
                  {
                    translateY: subtitleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            The party game app
          </Animated.Text>

          <Animated.View
            style={[
              s.buttons,
              {
                opacity: buttonsAnim,
                transform: [
                  {
                    translateY: buttonsAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              onPress={handleGetStarted}
              style={s.primaryBtn}
            >
              <Text style={s.primaryBtnText}>Get Started</Text>
            </Pressable>

            <Pressable
              onPress={handleSignIn}
              style={s.outlineBtn}
            >
              <Text style={s.outlineBtnText}>I have an account</Text>
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  gradientBg: { flex: 1 },
  safe: { flex: 1 },
  glow: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.primary,
    top: "50%",
    left: "50%",
    marginTop: -130,
    marginLeft: -80,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  logo: { width: 100, height: 100, borderRadius: 24, marginBottom: 20 },
  title: { fontFamily: fonts.extrabold, fontSize: 42, color: colors.white, marginBottom: 4 },
  subtitle: { fontFamily: fonts.regular, fontSize: 18, color: colors.primaryLight, marginBottom: 48 },
  buttons: { width: "100%", gap: 16 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  primaryBtnText: { fontFamily: fonts.bold, fontSize: 18, color: colors.white },
  outlineBtn: {
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
  },
  outlineBtnText: { fontFamily: fonts.semibold, fontSize: 18, color: colors.white },
});
