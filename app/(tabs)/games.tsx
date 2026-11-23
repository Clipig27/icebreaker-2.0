import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, fonts } from "../../src/theme";
import { supabase } from "../../src/lib/supabase";

const GAMES_LIST = [
  { id: "talentShow", name: "Nobody's Got Talent", desc: "Perform prompts — dodge the buzzers, win the finals!", icon: "star" as const, color: "#F59E0B" },
  { id: "numberGuessor", name: "1 to 100", desc: "Guess numeric trivia fast — lowest penalty wins", icon: "text" as const, color: "#06B6D4", iconText: "100" },
  { id: "pieCharts", name: "Pie Charts", desc: "Who's most likely to...?", icon: "pie-chart" as const, color: "#EF4444" },
  { id: "potLuck", name: "Smarty Pot", desc: "Take turns — answer or skip the growing pot", icon: "trophy" as const, color: "#10B981" },
  { id: "blindRanking", name: "Blind Ranking", desc: "Rank items blind, then vote for the best list", icon: "list" as const, color: "#A78BFA" },
  { id: "tenSecondTasks", name: "10 Second Tasks", desc: "Stack tasks, beat the timer, dodge the buzzer", icon: "timer" as const, color: "#F97316" },
];

// Default fallback if no data
const DEFAULT_POPULAR = GAMES_LIST[0];

function useMostPopularGame() {
  const [popular, setPopular] = useState(DEFAULT_POPULAR);
  const [playCount, setPlayCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        // Count game types from rooms updated in the last 7 days
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from("rooms")
          .select("game_type")
          .not("game_type", "is", null)
          .gte("updated_at", weekAgo);

        if (error || !data || data.length === 0) return;

        // Tally
        const counts: Record<string, number> = {};
        for (const row of data) {
          if (row.game_type) counts[row.game_type] = (counts[row.game_type] ?? 0) + 1;
        }

        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return;

        const topId = sorted[0][0];
        const topCount = sorted[0][1];
        const game = GAMES_LIST.find((g) => g.id === topId);
        if (game) {
          setPopular(game);
          setPlayCount(topCount);
        }
      } catch {
        // Silently fail — just use default
      }
    })();
  }, []);

  return { popular, playCount };
}

function FeaturedCard({ game, playCount }: { game: typeof GAMES_LIST[number]; playCount: number }) {
  const animValue = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(animValue, { toValue: 1, duration: 400, delay: 0, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View
      style={{
        opacity: animValue,
        transform: [
          { translateY: animValue.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
          { scale: scaleValue },
        ],
      }}
    >
      <Pressable
        style={s.featuredCard}
        onPressIn={() => Animated.spring(scaleValue, { toValue: 0.97, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true }).start()}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      >
        <View style={s.featuredContent}>
          <View style={{ flex: 1 }}>
            <View style={s.limeBadge}>
              <Ionicons name="flame" size={10} color="#000" />
              <Text style={s.limeBadgeText}>MOST PLAYED THIS WEEK</Text>
            </View>
            <Text style={s.featuredTitle}>{game.name}</Text>
            <Text style={s.featuredDesc}>{game.desc}</Text>
            {playCount > 0 && (
              <Text style={s.playCountText}>{playCount} games this week</Text>
            )}
          </View>
          <View style={[s.featuredIconBox, { backgroundColor: game.color + "33" }]}>
            {game.iconText ? (
              <Text style={[s.featuredIconText, { color: game.color }]}>{game.iconText}</Text>
            ) : (
              <Ionicons name={game.icon} size={28} color={game.color} />
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function GameCard({ game, index }: { game: typeof GAMES_LIST[number]; index: number }) {
  const animValue = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(animValue, { toValue: 1, duration: 400, delay: (index + 1) * 100, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View
      style={{
        opacity: animValue,
        transform: [
          { translateY: animValue.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
          { scale: scaleValue },
        ],
      }}
    >
      <Pressable
        style={s.card}
        onPressIn={() => Animated.spring(scaleValue, { toValue: 0.97, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true }).start()}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      >
        <View style={[s.iconBox, { backgroundColor: game.color + "33" }]}>
          {game.iconText ? (
            <Text style={[s.iconText, { color: game.color }]}>{game.iconText}</Text>
          ) : (
            <Ionicons name={game.icon} size={20} color={game.color} />
          )}
        </View>
        <View style={s.cardText}>
          <Text style={s.cardTitle}>{game.name}</Text>
          <Text style={s.cardDesc}>{game.desc}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.gray500} />
      </Pressable>
    </Animated.View>
  );
}

export default function Games() {
  const { popular, playCount } = useMostPopularGame();

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={s.topBar}>
          <View style={s.topBarLeft}>
            <Ionicons name="flash" size={20} color={colors.primaryLight} />
            <Text style={s.topBarTitle}>Icebreaker</Text>
          </View>
          <Pressable style={s.settingsCircle}>
            <Ionicons name="settings-outline" size={20} color={colors.gray400} />
          </Pressable>
        </View>

        <Text style={s.heading}>Games</Text>
        <Text style={s.sub}>{GAMES_LIST.length} games to break the ice</Text>

        <FeaturedCard game={popular} playCount={playCount} />

        <Text style={s.sectionLabel}>ALL GAMES</Text>
        {GAMES_LIST.map((game, index) => (
          <GameCard key={game.id} game={game} index={index} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  topBarLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  topBarTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.white },
  settingsCircle: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border,
  },

  heading: { fontFamily: fonts.extrabold, fontSize: 36, color: colors.white, marginBottom: 4 },
  sub: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray400, marginBottom: 24 },

  featuredCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border },
  featuredContent: { flexDirection: "row", alignItems: "center" },
  limeBadge: {
    backgroundColor: colors.lime, alignSelf: "flex-start", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 4,
  },
  limeBadgeText: { fontFamily: fonts.bold, fontSize: 10, color: "#000", textTransform: "uppercase", letterSpacing: 0.5 },
  featuredTitle: { fontFamily: fonts.bold, fontSize: 22, color: colors.white, marginBottom: 4 },
  featuredDesc: { fontFamily: fonts.regular, fontSize: 13, color: colors.gray400 },
  playCountText: { fontFamily: fonts.medium, fontSize: 12, color: colors.primaryLight, marginTop: 6 },
  featuredIconBox: {
    width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginLeft: 12,
  },
  featuredIconText: { fontFamily: fonts.bold, fontSize: 18 },

  sectionLabel: {
    fontFamily: fonts.bold, fontSize: 11, color: colors.gray500,
    letterSpacing: 1.5, textTransform: "uppercase", marginTop: 28, marginBottom: 16,
  },

  card: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    flexDirection: "row", alignItems: "center", marginBottom: 10, borderWidth: 1, borderColor: colors.border,
  },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 14 },
  iconText: { fontFamily: fonts.bold, fontSize: 13 },
  cardText: { flex: 1 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.white, marginBottom: 1 },
  cardDesc: { fontFamily: fonts.regular, fontSize: 13, color: colors.gray400 },
});
