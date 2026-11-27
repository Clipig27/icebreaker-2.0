import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, ScrollView, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "../../src/stores/authStore";
import { supabase } from "../../src/lib/supabase";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts, gradients, radii, type } from "../../src/theme";
import AppHeader from "../../src/components/AppHeader";
import Eyebrow from "../../src/components/Eyebrow";
import ScreenBackground from "../../src/components/ScreenBackground";
import GradientCard from "../../src/components/GradientCard";
import EditProfileModal from "../../src/components/EditProfileModal";
import FeedbackModal from "../../src/components/FeedbackModal";

function useStats() {
  const wins = useAuthStore((s) => s.wins);
  const gamesPlayed = useAuthStore((s) => s.gamesPlayed);
  const trophies = useAuthStore((s) => s.trophies);
  return [
    { label: "Games", value: String(gamesPlayed) },
    { label: "Wins", value: String(wins) },
    { label: "Trophies", value: String(trophies) },
  ];
}

/** Human-readable labels for game type keys. */
const GAME_LABELS: Record<string, string> = {
  numberGuessor: "1 to 100",
  talentShow: "Nobody's Got Talent",
  pieCharts: "Pie Charts",
  potLuck: "Pot Luck",
  blindRanking: "Blind Ranking",
  tenSecondTasks: "10 Second Tasks",
};

/** Visual accent per stat card (index-based: Games, Wins, Trophies). */
const STAT_ACCENTS = [
  { bar: "rgba(255,255,255,0.85)", num: colors.white, fill: undefined, edge: undefined },
  { bar: colors.lavender, num: colors.lavender, fill: undefined, edge: undefined },
  {
    bar: colors.goldStat,
    num: colors.goldStat,
    fill: ["rgba(240,198,106,0.12)", "rgba(240,198,106,0.03)"] as const,
    edge: ["rgba(240,198,106,0.30)", "rgba(240,198,106,0.10)"] as const,
  },
];

function StatCard({ label, value, index, onPress }: { label: string; value: string; index: number; onPress?: () => void }) {
  const accent = STAT_ACCENTS[index] ?? STAT_ACCENTS[0];
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
      <Pressable onPress={onPress} style={{ flex: 1 }} disabled={!onPress}>
        <GradientCard
          radius={radii.lg}
          style={s.statCard}
          contentStyle={s.statContent}
          fill={accent.fill}
          borderColors={accent.edge}
        >
          <View style={[s.statAccent, { backgroundColor: accent.bar }]} />
          <Text style={[s.statNum, { color: accent.num }]}>{value}</Text>
          <Text style={s.statLabel}>{label}</Text>
        </GradientCard>
      </Pressable>
    </Animated.View>
  );
}

export default function Profile() {
  const username = useAuthStore((s) => s.username) ?? "Player";
  const user = useAuthStore((s) => s.user);
  const avatarUrl = useAuthStore((s) => s.avatarUrl);
  const setAvatarUrl = useAuthStore((s) => s.setAvatarUrl);
  const STATS = useStats();
  const wins = useAuthStore((s) => s.wins);
  const gamesPlayed = useAuthStore((s) => s.gamesPlayed);
  const perGameWins = useAuthStore((s) => s.perGameWins);
  const gameWinEntries = Object.entries(perGameWins).filter(([, count]) => count > 0);

  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);

  const breatheAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(breatheAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow access to your photos to set a profile picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    const uri = result.assets[0].uri;
    if (!user) return;

    setUploading(true);
    try {
      const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
      const mimeType = ext === "png" ? "image/png" : "image/jpeg";
      const fileName = `${user.id}/avatar.${ext}`;

      // Use FormData — the only reliable upload method in React Native
      const formData = new FormData();
      formData.append("file", {
        uri,
        name: `avatar.${ext}`,
        type: mimeType,
      } as any);

      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(fileName, formData, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadErr) {
        // Try the fetch/blob fallback
        console.warn("[profile] FormData upload failed, trying blob:", uploadErr.message);
        const response = await fetch(uri);
        const blob = await response.blob();
        const { error: blobErr } = await supabase.storage
          .from("avatars")
          .upload(fileName, blob, {
            contentType: mimeType,
            upsert: true,
          });

        if (blobErr) {
          console.warn("[profile] blob upload also failed:", blobErr.message);
          // Save local URI as last resort (won't work cross-device)
          await setAvatarUrl(uri);
          Alert.alert("Upload issue", "Photo saved locally but may not show on other devices. Try again later.");
        } else {
          const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
          await setAvatarUrl(data.publicUrl + "?t=" + Date.now());
        }
      } else {
        const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
        await setAvatarUrl(data.publicUrl + "?t=" + Date.now());
      }
    } catch (e: any) {
      console.warn("[profile] avatar error:", e.message);
      await setAvatarUrl(uri);
      Alert.alert("Upload issue", "Photo saved locally. Try again later.");
    } finally {
      setUploading(false);
    }
  };

  const milestone = getMilestone(gamesPlayed, wins);
  const progressPct = Math.max(0, Math.min(1, milestone.current / milestone.target));

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenBackground />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top bar */}
        <AppHeader />

        {/* Heading */}
        <Text style={s.heading}>Profile</Text>
        <Text style={s.subtitle}>Good company starts with you.</Text>

        {/* Player Card */}
        <GradientCard
          style={s.playerCard}
          contentStyle={s.playerCardContent}
          fill={gradients.profileCard}
          borderColors={["rgba(186,162,249,0.32)", "rgba(186,162,249,0.12)", "rgba(186,162,249,0.06)"]}
        >
          {/* Decorative concentric rings behind the avatar */}
          <View style={s.ringsWrap} pointerEvents="none">
            <View style={[s.ring, s.ring3]} />
            <View style={[s.ring, s.ring2]} />
            <View style={[s.ring, s.ring1]} />
          </View>
          <Text style={[s.sparkle, s.sparkleRight]} pointerEvents="none">{"✦"}</Text>
          <Text style={[s.sparkle, s.sparkleLeft]} pointerEvents="none">{"✧"}</Text>

          <Eyebrow style={s.cardEyebrow}>PLAYER CARD</Eyebrow>

          <View style={s.playerCol}>
            <Pressable onPress={pickImage} style={s.avatarContainer} disabled={uploading}>
              <Animated.View style={[s.avatarShadow, { transform: [{ scale: breatheAnim }] }]}>
                <LinearGradient
                  colors={gradients.avatarTile}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.avatar}
                >
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={s.avatarImage} />
                  ) : (
                    <Text style={s.avatarText}>{username.charAt(0).toUpperCase()}</Text>
                  )}
                </LinearGradient>
              </Animated.View>
              {/* Sparkle badge (tap avatar to change photo) */}
              <View style={s.starBadge}>
                {uploading ? (
                  <Ionicons name="hourglass-outline" size={12} color={colors.onLavender} />
                ) : (
                  <Text style={s.starBadgeText}>{"✦"}</Text>
                )}
              </View>
            </Pressable>
            <Text style={s.username} numberOfLines={1}>{username}</Text>
            <Text style={s.playerType}>Anonymous player</Text>

            {/* Edit profile button */}
            <Pressable
              style={({ pressed }) => [s.editProfileBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setEditVisible(true)}
            >
              <Text style={s.editProfileText}>Edit profile</Text>
            </Pressable>
          </View>
        </GradientCard>

        {/* Stats row */}
        <View style={s.statsRow}>
          {STATS.map((stat, index) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              index={index}
              onPress={
                stat.label === "Games" || stat.label === "Wins"
                  ? () => router.push("/game-history")
                  : undefined
              }
            />
          ))}
        </View>

        {/* Milestone section */}
        <Eyebrow style={s.sectionLabel}>YOUR NEXT MILESTONE</Eyebrow>
        <GradientCard radius={radii.lg} contentStyle={s.milestoneCard}>
          <View style={s.milestoneTop}>
            <View style={s.milestoneIconContainer}>
              <Ionicons name="trophy-outline" size={20} color={colors.goldStat} />
            </View>
            <View style={s.milestoneTextContainer}>
              <Text style={s.milestoneTitle}>{milestone.title}</Text>
              <Text style={s.milestoneDesc}>{milestone.desc}</Text>
            </View>
          </View>
          {/* Progress bar */}
          <View style={s.progressMeta}>
            <Text style={s.progressLabel}>PROGRESS</Text>
            <Text style={s.progressCount}>
              {Math.min(milestone.current, milestone.target)}/{milestone.target}
            </Text>
          </View>
          <View style={s.progressBarBg}>
            <LinearGradient
              colors={gradients.primaryButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[s.progressBarFill, { width: `${Math.max(progressPct * 100, 4)}%` }]}
            />
          </View>
        </GradientCard>
        {/* Game Stats section */}
        {gameWinEntries.length > 0 && (
          <>
            <Eyebrow style={[s.sectionLabel, { marginTop: 24 }]}>GAME STATS</Eyebrow>
            {gameWinEntries.map(([gameType, count]) => (
              <GradientCard key={gameType} radius={radii.lg} contentStyle={s.gameStatCard} style={{ marginBottom: 8 }}>
                <View style={s.gameStatRow}>
                  <Ionicons name="game-controller-outline" size={18} color={colors.lavender} />
                  <Text style={s.gameStatName}>{GAME_LABELS[gameType] ?? gameType}</Text>
                  <Text style={s.gameStatCount}>{count} {count === 1 ? "win" : "wins"}</Text>
                </View>
              </GradientCard>
            ))}
          </>
        )}

        {/* Bonus trophies — rewarded ad */}
        <Pressable
          style={({ pressed }) => [s.feedbackBtn, pressed && { opacity: 0.7 }]}
          onPress={async () => {
            const { showRewarded } = await import("../../src/utils/ads");
            const earned = await showRewarded();
            if (earned) {
              await useAuthStore.getState().addTrophies(2);
              Alert.alert("Nice!", "You earned 2 bonus trophies!");
            }
          }}
        >
          <Ionicons name="trophy" size={18} color={colors.goldStat} />
          <Text style={s.feedbackText}>Watch Ad for 2 Trophies</Text>
          <Ionicons name="play-circle-outline" size={18} color={colors.gray500} style={{ marginLeft: "auto" }} />
        </Pressable>

        {/* Store button */}
        <Pressable
          style={({ pressed }) => [s.feedbackBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.push("/store")}
        >
          <Ionicons name="cart-outline" size={18} color={colors.goldStat} />
          <Text style={s.feedbackText}>Trophy Store</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.gray500} style={{ marginLeft: "auto" }} />
        </Pressable>

        {/* Feedback button */}
        <Pressable
          style={({ pressed }) => [s.feedbackBtn, pressed && { opacity: 0.7 }]}
          onPress={() => setFeedbackVisible(true)}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.lavender} />
          <Text style={s.feedbackText}>Send Feedback</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.gray500} style={{ marginLeft: "auto" }} />
        </Pressable>
      </ScrollView>

      <EditProfileModal visible={editVisible} onClose={() => setEditVisible(false)} />
      <FeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
    </SafeAreaView>
  );
}

/** Display-only milestone derived from the player's real games/wins counts. */
function getMilestone(gamesPlayed: number, wins: number) {
  if (gamesPlayed < 1) {
    return {
      title: "First of many",
      desc: "Play your first game to unlock your first trophy.",
      current: gamesPlayed,
      target: 1,
    };
  }
  if (wins < 1) {
    return {
      title: "First victory",
      desc: "Win a game to claim your first bragging rights.",
      current: wins,
      target: 1,
    };
  }
  const winTargets = [5, 10, 25, 50, 100];
  const target = winTargets.find((t) => wins < t) ?? Math.ceil((wins + 1) / 100) * 100;
  return {
    title: `${target} wins`,
    desc: `${target - wins} more ${target - wins === 1 ? "win" : "wins"} to reach your next milestone.`,
    current: wins,
    target,
  };
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPurple },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },

  heading: { ...type.title, fontSize: 34, letterSpacing: -0.6, marginBottom: 6 },
  subtitle: { ...type.subtitle, marginBottom: 22 },

  sectionLabel: { marginBottom: 10, fontSize: 10, letterSpacing: 0.8 },

  // Player card
  playerCard: {
    marginBottom: 12,
  },
  playerCardContent: {
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  cardEyebrow: { fontSize: 9, letterSpacing: 0.8, color: "rgba(255,255,255,0.6)" },
  ringsWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(186,162,249,0.09)",
  },
  // Centered on the avatar (~74px below the card content top).
  ring1: { width: 150, height: 150, borderRadius: 75, top: -1 },
  ring2: { width: 230, height: 230, borderRadius: 115, top: -41 },
  ring3: { width: 320, height: 320, borderRadius: 160, top: -86 },
  sparkle: { position: "absolute", color: "#D9C8FF" },
  sparkleRight: { top: 26, right: 26, fontSize: 18 },
  sparkleLeft: { top: 70, left: 28, fontSize: 14, color: "rgba(248,210,192,0.85)" },
  playerCol: { alignItems: "center" },
  avatarContainer: { width: 92, height: 92, marginTop: 2, marginBottom: 10 },
  avatarShadow: {
    borderRadius: 26,
    shadowColor: "#A783EF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: 92, height: 92, borderRadius: 26 },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 44, color: colors.onLavender },
  starBadge: {
    position: "absolute",
    bottom: 2,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.peachSticker,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#2E2245",
  },
  starBadgeText: { fontSize: 12, lineHeight: 14, color: colors.onLavender },
  username: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.white,
    marginBottom: 2,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  playerType: { fontFamily: fonts.regular, fontSize: 13, color: colors.gray400, textAlign: "center" },
  editProfileBtn: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: "rgba(186,162,249,0.16)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 26,
  },
  editProfileText: { fontFamily: fonts.bold, fontSize: 14, color: colors.lavender },

  // Stats
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 24 },
  stat: { flex: 1 },
  statCard: { flex: 1 },
  statContent: { paddingTop: 16, paddingBottom: 14, paddingHorizontal: 10, alignItems: "center" },
  statAccent: {
    position: "absolute",
    top: 0,
    width: 22,
    height: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  statNum: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.gray400,
    marginTop: 2,
  },

  // Milestone
  milestoneCard: {
    padding: 16,
  },
  milestoneTop: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  milestoneIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(240,198,106,0.14)",
    borderWidth: 1,
    borderColor: "rgba(240,198,106,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  milestoneTextContainer: { flex: 1 },
  milestoneTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.white, marginBottom: 4 },
  milestoneDesc: { fontFamily: fonts.regular, fontSize: 13, color: colors.gray400, lineHeight: 18 },
  progressMeta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  progressLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2, color: colors.gray500 },
  progressCount: { fontFamily: fonts.bold, fontSize: 12, color: colors.lavender },
  progressBarBg: { height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  progressBarFill: { height: 5, borderRadius: 3 },

  // Game Stats
  gameStatCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  gameStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  gameStatName: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.white,
  },
  gameStatCount: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.lavender,
  },

  // Feedback
  feedbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24,
    backgroundColor: colors.cardFill,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    borderRadius: radii.lg,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  feedbackText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.white,
  },
});
