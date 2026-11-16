import { useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../src/stores/authStore";
import { colors, fonts } from "../../src/theme";

const STATS = [
  { label: "Games", value: "0" },
  { label: "Wins", value: "0" },
  { label: "Trophies", value: "0" },
];

function StatCard({ label, value, index }: { label: string; value: string; index: number }) {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: 1,
      duration: 400,
      delay: 300 + index * 120,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        s.stat,
        {
          opacity: animValue,
          transform: [
            { translateY: animValue.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
          ],
        },
      ]}
    >
      <Text style={s.statNum}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Animated.View>
  );
}

export default function Profile() {
  const username = useAuthStore((s) => s.username) ?? "Player";
  const user = useAuthStore((s) => s.user);

  // Breathing animation for avatar
  const breatheAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(breatheAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Top bar */}
        <View style={s.topBar}>
          <View style={s.topBarLeft}>
            <Ionicons name="flash" size={20} color={colors.lime} />
            <Text style={s.topBarTitle}>Icebreaker</Text>
          </View>
          <Pressable style={s.settingsBtn}>
            <Ionicons name="settings-outline" size={20} color={colors.gray400} />
          </Pressable>
        </View>

        {/* Heading */}
        <Text style={s.heading}>Profile</Text>
        <Text style={s.subtitle}>Good company starts with you.</Text>

        {/* Avatar section */}
        <View style={s.avatarSection}>
          <View style={s.avatarContainer}>
            <Animated.View style={[s.avatar, { transform: [{ scale: breatheAnim }] }]}>
              <Text style={s.avatarText}>{username.charAt(0).toUpperCase()}</Text>
            </Animated.View>
            {/* Diamond badge */}
            <View style={s.badgeContainer}>
              <Ionicons name="diamond" size={14} color={colors.lime} />
            </View>
          </View>
          <Text style={s.username}>{username}</Text>
          <Text style={s.anonymousLabel}>Anonymous player</Text>
          <Pressable style={s.editProfileBtn}>
            <Text style={s.editProfileText}>Edit profile &rarr;</Text>
          </Pressable>
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          {STATS.map((stat, index) => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} index={index} />
          ))}
        </View>

        {/* Milestone section */}
        <Text style={s.milestoneLabel}>YOUR NEXT MILESTONE</Text>
        <View style={s.milestoneCard}>
          <View style={s.milestoneTop}>
            <View style={s.milestoneIconContainer}>
              <Ionicons name="trophy" size={22} color={colors.lime} />
            </View>
            <View style={s.milestoneTextContainer}>
              <Text style={s.milestoneTitle}>First of many</Text>
              <Text style={s.milestoneDesc}>
                Your first game is a story waiting to happen. Let's make it a good one.
              </Text>
            </View>
          </View>
          {/* Progress bar */}
          <View style={s.progressBarBg}>
            <View style={s.progressBarFill} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },

  /* Top bar */
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
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
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },

  /* Heading */
  heading: {
    fontFamily: fonts.extrabold,
    fontSize: 36,
    color: colors.white,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.gray400,
    marginBottom: 32,
  },

  /* Avatar section */
  avatarSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    marginBottom: 14,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: fonts.extrabold,
    fontSize: 40,
    color: colors.primaryLight,
  },
  badgeContainer: {
    position: "absolute",
    bottom: 0,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
  username: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.white,
    marginBottom: 2,
  },
  anonymousLabel: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray400,
    marginBottom: 14,
  },
  editProfileBtn: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editProfileText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.gray300,
  },

  /* Stats row */
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  statNum: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    color: colors.white,
  },
  statLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.gray500,
    marginTop: 4,
  },

  /* Milestone section */
  milestoneLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.gray500,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  milestoneCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  milestoneTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 14,
  },
  milestoneIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(196, 240, 77, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  milestoneTextContainer: {
    flex: 1,
  },
  milestoneTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
    marginBottom: 4,
  },
  milestoneDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray400,
    lineHeight: 18,
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  progressBarFill: {
    width: "10%",
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lime,
  },
});
