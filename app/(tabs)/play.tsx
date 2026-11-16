import { useState, useRef, useEffect } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../src/theme";
import { useRoomStore } from "../../src/stores/roomStore";

export default function Play() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const { createRoom, joinRoom, loading, error, room } = useRoomStore();
  const canJoin = roomCode.length >= 4;

  // Animated values
  const headingOpacity = useRef(new Animated.Value(0)).current;
  const headingTranslateY = useRef(new Animated.Value(16)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(20)).current;
  const hostBtnScale = useRef(new Animated.Value(1)).current;
  const joinBtnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Heading fade in
    Animated.parallel([
      Animated.timing(headingOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(headingTranslateY, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();

    // Hero card fade in after heading
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
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top bar */}
        <View style={s.topBar}>
          <View style={s.topBarLeft}>
            <Ionicons name="flash" size={20} color={colors.primaryLight} />
            <Text style={s.topBarTitle}>Icebreaker</Text>
          </View>
          <View style={s.settingsCircle}>
            <Ionicons name="settings" size={18} color={colors.gray400} />
          </View>
        </View>

        {/* Heading */}
        <Animated.View
          style={{
            opacity: headingOpacity,
            transform: [{ translateY: headingTranslateY }],
          }}
        >
          <Text style={s.heading}>Lets Play!</Text>
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
          <LinearGradient
            colors={["#6D5ACD", "#5240A8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.heroGradient}
          >
            <Text style={s.heroLabel}>THE GROUP CHAT, BUT BETTER</Text>
            <View style={s.heroMainRow}>
              <Text style={s.heroMainText}>
                {"Your people.\nYour game night."}
              </Text>
              <View style={s.heroEmojiGroup}>
                <Text style={{ fontSize: 36 }}>{"🎲"}</Text>
                <Text style={{ fontSize: 24, marginLeft: -8, marginTop: -4 }}>{"✨"}</Text>
                <Text style={{ fontSize: 16, marginLeft: -4, marginTop: 8 }}>{"💬"}</Text>
              </View>
            </View>
            <Animated.View style={{ transform: [{ scale: hostBtnScale }] }}>
              <Pressable
                style={s.hostPill}
                onPress={handleHost}
                onPressIn={onPressInHost}
                onPressOut={onPressOutHost}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <View style={s.hostPillInner}>
                    <Text style={s.hostPillText}>Host Game</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.white} />
                  </View>
                )}
              </Pressable>
            </Animated.View>
          </LinearGradient>
        </Animated.View>

        {/* Got an invite? */}
        <View style={s.inviteSection}>
          <Text style={s.inviteTitle}>Got an invite?</Text>
          <Text style={s.inviteSub}>Join a Game with your room code.</Text>
          <View style={s.inviteRow}>
            <TextInput
              placeholder="Room code"
              placeholderTextColor={colors.gray500}
              value={roomCode}
              onChangeText={(t) => setRoomCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
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
                {loading ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <Text style={s.joinBtnText}>{"Join →"}</Text>
                )}
              </Pressable>
            </Animated.View>
          </View>
        </View>

        {/* Bottom section */}
        <View style={s.bottomSection}>
          <Text style={s.bottomLabel}>
            A LITTLE COMPETITION. A LOT OF CONNECTION.
          </Text>
          <View style={s.stepsRow}>
            <View style={s.stepCol}>
              <Text style={s.stepNumber}>01</Text>
              <Text style={s.stepText}>Get together</Text>
            </View>
            <View style={s.stepCol}>
              <Text style={s.stepNumber}>02</Text>
              <Text style={s.stepText}>Pick a game</Text>
            </View>
            <View style={s.stepCol}>
              <Text style={s.stepNumber}>03</Text>
              <Text style={s.stepText}>Break the ice</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 24,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  topBarTitle: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.white,
  },
  settingsCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  // Heading
  heading: {
    fontFamily: fonts.extrabold,
    fontSize: 36,
    color: colors.white,
    marginBottom: 6,
  },
  subheading: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.gray400,
    marginBottom: 28,
  },

  // Hero card
  heroCard: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 28,
    shadowColor: "#6D5ACD",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  heroGradient: {
    padding: 24,
    borderRadius: 20,
  },
  heroLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  heroMainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  heroMainText: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.white,
    lineHeight: 32,
    flex: 1,
  },
  heroEmojiGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    marginLeft: 8,
    width: 70,
  },
  hostPill: {
    alignSelf: "stretch",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  hostPillInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hostPillText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
  },

  // Invite section
  inviteSection: {
    marginBottom: 32,
  },
  inviteTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.white,
    marginBottom: 4,
  },
  inviteSub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray400,
    marginBottom: 14,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  codeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.white,
    fontFamily: fonts.semibold,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  joinBtn: {
    backgroundColor: colors.lime,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  joinBtnDisabled: {
    opacity: 0.45,
  },
  joinBtnText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.background,
  },

  // Bottom section
  bottomSection: {
    marginTop: 4,
  },
  bottomLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.gray500,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  stepsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stepCol: {
    flex: 1,
    alignItems: "flex-start",
  },
  stepNumber: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.lime,
    marginBottom: 4,
  },
  stepText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray400,
  },
});
