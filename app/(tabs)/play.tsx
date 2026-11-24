import { useState, useRef, useEffect, type ComponentRef } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, gradients, radii, type } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";
import AppHeader from "../../src/components/AppHeader";
import Eyebrow from "../../src/components/Eyebrow";
import Pill from "../../src/components/Pill";
import ScreenBackground from "../../src/components/ScreenBackground";
import GradientCard from "../../src/components/GradientCard";
import HeroGradient from "../../src/components/HeroGradient";

export default function Play() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const { createRoom, joinRoom, loading, error, room } = useRoomStore();
  const canJoin = roomCode.length >= 4;

  const headingOpacity = useRef(new Animated.Value(0)).current;
  const headingTranslateY = useRef(new Animated.Value(16)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(20)).current;
  const hostBtnScale = useRef(new Animated.Value(1)).current;
  const joinBtnScale = useRef(new Animated.Value(1)).current;

  // Keyboard handling (visual only): keep the invite card in view while typing.
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const inviteYRef = useRef(0);
  const scrollInviteIntoView = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, inviteYRef.current - 16), animated: true });
    }, 250);
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headingOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(headingTranslateY, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(heroTranslateY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const onPressInHost = () => {
    Animated.spring(hostBtnScale, { toValue: 0.96, useNativeDriver: true }).start();
  };
  const onPressOutHost = () => {
    Animated.spring(hostBtnScale, { toValue: 1, useNativeDriver: true }).start();
  };
  const onPressInJoin = () => {
    Animated.spring(joinBtnScale, { toValue: 0.96, useNativeDriver: true }).start();
  };
  const onPressOutJoin = () => {
    Animated.spring(joinBtnScale, { toValue: 1, useNativeDriver: true }).start();
  };

  const handleHost = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await createRoom();
    const state = useRoomStore.getState();
    if (state.error) {
      Alert.alert("Error", state.error);
    } else if (state.room) {
      router.push("/lobby");
    }
  };

  const handleJoin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await joinRoom(roomCode);
    const state = useRoomStore.getState();
    if (state.error) {
      Alert.alert("Error", state.error);
    } else if (state.room) {
      router.push("/lobby");
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenBackground />
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Top bar */}
        <AppHeader />

        {/* Heading with GAME NIGHT badge */}
        <Animated.View
          style={{
            opacity: headingOpacity,
            transform: [{ translateY: headingTranslateY }],
          }}
        >
          <View style={s.headingRow}>
            <Text style={s.heading}>Let's play!</Text>
            <Pill tone="peach" tilt label="GAME NIGHT" style={s.gameNightPill} />
          </View>
          <Text style={s.subheading}>Less small talk. More good times.</Text>
        </Animated.View>

        {/* Hero card */}
        <Animated.View
          style={[
            s.heroCard,
            {
              opacity: heroOpacity,
              transform: [{ translateY: heroTranslateY }],
            },
          ]}
        >
          <HeroGradient style={s.heroGradient}>
            <View style={s.heroMainRow}>
              <View style={{ flex: 1 }}>
                <Eyebrow tone="dark" style={s.heroLabel}>
                  THE GROUP CHAT, BUT BETTER
                </Eyebrow>
                <Text style={s.heroMainText}>
                  {"Your people.\nYour game night."}
                </Text>
              </View>
              <View style={s.heroArt}>
                <Text style={s.heroDiceBack}>{"🎲"}</Text>
                <Text style={s.heroDice}>{"🎲"}</Text>
                <Text style={s.heroBubble}>{"💬"}</Text>
                <Text style={s.heroSparkle}>{"✦"}</Text>
                <Text style={s.heroSparkleSmall}>{"✦"}</Text>
              </View>
            </View>
            <Animated.View style={{ transform: [{ scale: hostBtnScale }] }}>
              <Pressable
                style={s.hostBar}
                onPress={handleHost}
                onPressIn={onPressInHost}
                onPressOut={onPressOutHost}
                disabled={loading}
              >
                <LinearGradient
                  colors={gradients.heroDarkButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                {loading ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <View style={s.hostBarInner}>
                    <Text style={s.hostBarText}>Host a game</Text>
                    <Ionicons name="arrow-up-outline" size={18} color={colors.white} style={s.hostBarArrow} />
                  </View>
                )}
              </Pressable>
            </Animated.View>
          </HeroGradient>
        </Animated.View>

        {/* Got an invite? */}
        <View
          onLayout={(e) => {
            inviteYRef.current = e.nativeEvent.layout.y;
          }}
        >
        <GradientCard
          style={s.inviteSection}
          contentStyle={s.inviteContent}
          fill={gradients.inviteCard}
        >
          <View style={s.inviteHeader}>
            <Text style={s.inviteTitle}>Got an invite?</Text>
            <Text style={s.inviteSub}>Join with your 5-letter room code.</Text>
          </View>
          <View style={s.inviteRow}>
            <TextInput
              placeholder="5-letter code"
              placeholderTextColor={colors.gray500}
              value={roomCode}
              onChangeText={(t) => setRoomCode(t.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              maxLength={6}
              onFocus={scrollInviteIntoView}
              style={s.codeInput}
            />
            <Animated.View style={{ transform: [{ scale: joinBtnScale }] }}>
              <Pressable
                disabled={!canJoin || loading}
                style={[s.joinBtn, !canJoin && s.joinBtnDisabled]}
                onPress={handleJoin}
                onPressIn={onPressInJoin}
                onPressOut={onPressOutJoin}
              >
                <LinearGradient
                  colors={gradients.primaryButton}
                  locations={[0, 0.5, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0.6, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                {loading ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <View style={s.joinBtnInner}>
                    <Text style={s.joinBtnText}>Join</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.onPrimary} />
                  </View>
                )}
              </Pressable>
            </Animated.View>
          </View>
        </GradientCard>
        </View>

        {/* Bottom section */}
        <View style={s.bottomSection}>
          <Eyebrow style={s.bottomLabel}>GOOD TIMES, THREE SIMPLE STEPS</Eyebrow>
          <View style={s.stepsRow}>
            {[
              { n: "01", t: "Get together", color: colors.lavender },
              { n: "02", t: "Pick a game", color: colors.peachSticker },
              { n: "03", t: "Break the ice", color: colors.lavender },
            ].map((step) => (
              <GradientCard
                key={step.n}
                radius={radii.md}
                style={s.stepCard}
                contentStyle={s.stepContent}
              >
                <Text style={[s.stepNumber, { color: step.color }]}>{step.n}</Text>
                <Text style={s.stepText} numberOfLines={1} adjustsFontSizeToFit>
                  {step.t}
                </Text>
              </GradientCard>
            ))}
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bgPurple,
  },
  flex: { flex: 1 },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },

  // Heading
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  heading: {
    ...type.title,
    fontSize: 34,
    letterSpacing: -0.6,
  },
  gameNightPill: {
    alignSelf: "center",
    marginRight: 4,
  },
  subheading: {
    ...type.subtitle,
    marginBottom: 22,
  },

  // Hero card
  heroCard: {
    borderRadius: radii.xl,
    marginBottom: 16,
    shadowColor: colors.lavender,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 8,
  },
  heroGradient: {
    padding: 18,
  },
  heroLabel: {
    marginBottom: 10,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  heroMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  heroMainText: {
    fontFamily: fonts.extrabold,
    fontSize: 25,
    lineHeight: 30,
    color: colors.onLavender,
    letterSpacing: -0.5,
  },
  heroArt: {
    width: 96,
    height: 84,
    marginLeft: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  heroDiceBack: {
    position: "absolute",
    left: 4,
    top: 8,
    fontSize: 40,
    transform: [{ rotate: "-14deg" }],
  },
  heroDice: {
    position: "absolute",
    right: 6,
    bottom: 2,
    fontSize: 44,
    transform: [{ rotate: "12deg" }],
  },
  heroBubble: {
    position: "absolute",
    right: 0,
    top: -2,
    fontSize: 20,
  },
  heroSparkle: {
    position: "absolute",
    left: 0,
    bottom: 4,
    fontSize: 12,
    color: colors.onLavender,
  },
  heroSparkleSmall: {
    position: "absolute",
    left: 44,
    top: -4,
    fontSize: 9,
    color: "rgba(26,20,39,0.7)",
  },
  hostBar: {
    alignSelf: "stretch",
    borderRadius: radii.md,
    overflow: "hidden",
    minHeight: 50,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  hostBarInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hostBarText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
  },
  hostBarArrow: {
    transform: [{ rotate: "45deg" }],
  },

  // Invite card
  inviteSection: {
    marginBottom: 24,
  },
  inviteContent: {
    padding: 16,
  },
  inviteHeader: {
    marginBottom: 14,
  },
  inviteTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.white,
    marginBottom: 4,
  },
  inviteSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray400,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  codeInput: {
    flex: 1,
    backgroundColor: "#17121F",
    color: colors.white,
    fontFamily: fonts.semibold,
    fontSize: 15,
    letterSpacing: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardEdge,
  },
  joinBtn: {
    borderRadius: 12,
    overflow: "hidden",
    paddingVertical: 14,
    paddingHorizontal: 18,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  joinBtnDisabled: {
    opacity: 0.45,
  },
  joinBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  joinBtnText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.onLavender,
  },

  // Steps
  bottomSection: {
    marginTop: 0,
  },
  bottomLabel: {
    marginBottom: 10,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  stepsRow: {
    flexDirection: "row",
    gap: 8,
  },
  stepCard: {
    flex: 1,
  },
  stepContent: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 6,
  },
  stepNumber: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
  },
  stepText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.white,
  },
});
