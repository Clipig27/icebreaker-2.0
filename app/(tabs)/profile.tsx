import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, ScrollView, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "../../src/stores/authStore";
import { supabase } from "../../src/lib/supabase";
import { colors, fonts } from "../../src/theme";

function useStats() {
  const wins = useAuthStore((s) => s.wins);
  const gamesPlayed = useAuthStore((s) => s.gamesPlayed);
  return [
    { label: "Games", value: String(gamesPlayed) },
    { label: "Wins", value: String(wins) },
    { label: "Win Rate", value: gamesPlayed > 0 ? `${Math.round((wins / gamesPlayed) * 100)}%` : "0%" },
  ];
}

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
  const avatarUrl = useAuthStore((s) => s.avatarUrl);
  const setAvatarUrl = useAuthStore((s) => s.setAvatarUrl);
  const STATS = useStats();

  const [uploading, setUploading] = useState(false);

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
      // Upload to Supabase Storage
      const ext = uri.split(".").pop() ?? "jpg";
      const fileName = `${user.id}/avatar.${ext}`;

      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(fileName, arrayBuffer, {
          contentType: `image/${ext}`,
          upsert: true,
        });

      if (uploadErr) {
        // If storage bucket doesn't exist, just save the local URI
        console.warn("[profile] upload failed, using local URI:", uploadErr.message);
        await setAvatarUrl(uri);
      } else {
        const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
        await setAvatarUrl(data.publicUrl + "?t=" + Date.now());
      }
    } catch (e: any) {
      console.warn("[profile] avatar error:", e.message);
      // Fallback: just save local URI
      await setAvatarUrl(uri);
    } finally {
      setUploading(false);
    }
  };

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
          <Pressable onPress={pickImage} style={s.avatarContainer} disabled={uploading}>
            <Animated.View style={[s.avatar, { transform: [{ scale: breatheAnim }] }]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={s.avatarImage} />
              ) : (
                <Text style={s.avatarText}>{username.charAt(0).toUpperCase()}</Text>
              )}
            </Animated.View>
            {/* Camera badge */}
            <View style={s.cameraBadge}>
              <Ionicons name={uploading ? "hourglass" : "camera"} size={14} color={colors.white} />
            </View>
          </Pressable>
          <Text style={s.username}>{username}</Text>
          <Text style={s.tapHint}>Tap photo to change</Text>
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

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  topBarLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  topBarTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.white },
  settingsBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border,
  },

  heading: { fontFamily: fonts.extrabold, fontSize: 36, color: colors.white, marginBottom: 4 },
  subtitle: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray400, marginBottom: 32 },

  avatarSection: { alignItems: "center", marginBottom: 28 },
  avatarContainer: { width: 100, height: 100, marginBottom: 14 },
  avatar: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 40, color: colors.primaryLight },
  cameraBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.background,
  },
  username: { fontFamily: fonts.bold, fontSize: 24, color: colors.white, marginBottom: 2 },
  tapHint: { fontFamily: fonts.regular, fontSize: 13, color: colors.gray500, marginBottom: 8 },

  statsRow: { flexDirection: "row", gap: 12, marginBottom: 28 },
  stat: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    alignItems: "center", borderWidth: 1, borderColor: colors.border,
  },
  statNum: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.white },
  statLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.gray500, marginTop: 4 },

  milestoneLabel: {
    fontFamily: fonts.bold, fontSize: 11, color: colors.gray500,
    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12,
  },
  milestoneCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  milestoneTop: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 14 },
  milestoneIconContainer: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(196, 240, 77, 0.15)",
    alignItems: "center", justifyContent: "center",
  },
  milestoneTextContainer: { flex: 1 },
  milestoneTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.white, marginBottom: 4 },
  milestoneDesc: { fontFamily: fonts.regular, fontSize: 13, color: colors.gray400, lineHeight: 18 },
  progressBarBg: { height: 4, borderRadius: 2, backgroundColor: colors.border },
  progressBarFill: { width: "10%", height: 4, borderRadius: 2, backgroundColor: colors.lime },
});
