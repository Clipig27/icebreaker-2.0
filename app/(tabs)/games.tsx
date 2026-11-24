import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Animated, Image, type ImageSourcePropType } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { colors, fonts, gradients, radii, type } from "../../src/theme";
import { CARD_THEMES, GameCardBackground, GameCardIllustration, GameCardAccent, withAlpha } from "../../src/components/GameCardArt";

const GAME_LOGO_ASPECT: Record<string, number> = {
  talentShow: 2.0859,
  numberGuessor: 2.0859,
  pieCharts: 2.1328,
  potLuck: 2.0078,
  blindRanking: 1.9766,
  tenSecondTasks: 1.9844,
  auctionDraft: 1.7469,
};

const GAME_LOGOS: Record<string, ImageSourcePropType> = {
  talentShow: require("../../assets/game-logos/talent-show.png"),
  numberGuessor: require("../../assets/game-logos/one-to-hundred.png"),
  pieCharts: require("../../assets/game-logos/pie-charts.png"),
  potLuck: require("../../assets/game-logos/smarty-pot.png"),
  blindRanking: require("../../assets/game-logos/blind-ranking.png"),
  tenSecondTasks: require("../../assets/game-logos/ten-second-tasks.png"),
  auctionDraft: require("../../assets/game-logos/bid-wars.png"),
};
import { supabase } from "../../src/lib/supabase";
import AppHeader from "../../src/components/AppHeader";
import Eyebrow from "../../src/components/Eyebrow";
import Pill from "../../src/components/Pill";
import ScreenBackground from "../../src/components/ScreenBackground";
import GradientCard from "../../src/components/GradientCard";
import HeroGradient from "../../src/components/HeroGradient";

type RowTint = "gold" | "teal" | "pink" | "purple" | "green" | "orange" | "yellow";

const GAMES_LIST: {
  id: string;
  name: string;
  desc: string;
  icon: "star" | "text" | "pie-chart" | "trophy" | "list" | "timer" | "pricetags";
  color: string;
  iconText?: string;
  emoji: string;
  tint: RowTint;
  minPlayers: number;
  maxPlayers: number | null;
}[] = [
  { id: "talentShow", name: "Nobody's Got Talent", desc: "Perform ridiculous talents, judge your friends, and hit the golden buzzer.", icon: "star", color: "#F59E0B", emoji: "⭐", tint: "gold", minPlayers: 3, maxPlayers: 8 },
  { id: "numberGuessor", name: "1 to 100", desc: "Guess the hidden number. The closer you are, the less you drink.", icon: "text", color: "#06B6D4", iconText: "100", emoji: "🔢", tint: "teal", minPlayers: 1, maxPlayers: null },
  { id: "pieCharts", name: "Pie Charts", desc: "Vote on who's most likely to... and see the juicy results.", icon: "pie-chart", color: "#EF4444", emoji: "🥧", tint: "pink", minPlayers: 3, maxPlayers: null },
  { id: "potLuck", name: "Smarty Pot", desc: "Answer trivia or risk it all. The pot keeps growing!", icon: "trophy", color: "#F0C66A", emoji: "🍯", tint: "yellow", minPlayers: 3, maxPlayers: 8 },
  { id: "blindRanking", name: "Blind Ranking", desc: "Rank items one by one with no take-backs. Trust your gut.", icon: "list", color: "#A78BFA", emoji: "📊", tint: "purple", minPlayers: 2, maxPlayers: 5 },
  { id: "tenSecondTasks", name: "10 Second Tasks", desc: "Stack crazy tasks and beat the clock before time runs out.", icon: "timer", color: "#F97316", iconText: "10", emoji: "⏱️", tint: "orange", minPlayers: 3, maxPlayers: 6 },
  { id: "auctionDraft", name: "Bid Wars", desc: "Outbid your rivals in a high-stakes auction showdown.", icon: "pricetags", color: "#5ABF9C", emoji: "💰", tint: "green", minPlayers: 2, maxPlayers: 4 },
];

function formatPlayerCount(min: number, max: number | null): string {
  if (max === null) {
    return `${min}+ players`;
  }
  if (min === max) {
    return `${min} players`;
  }
  return `${min}-${max} players`;
}

/** Row fill tint, icon tile and glyph colour per game tint. */
const TINTS: Record<
  RowTint,
  { fill: readonly [string, string]; edge: readonly [string, string]; tileBg: string; tileBorder: string; fg: string }
> = {
  gold: {
    fill: ["rgba(248,210,147,0.11)", "rgba(248,210,147,0.02)"] as readonly [string, string],
    edge: ["rgba(248,210,147,0.24)", "rgba(248,210,147,0.08)"],
    tileBg: "rgba(248,210,147,0.16)",
    tileBorder: "rgba(248,210,147,0.35)",
    fg: "#F8D293",
  },
  teal: {
    fill: ["rgba(94,214,200,0.10)", "rgba(94,214,200,0.02)"] as readonly [string, string],
    edge: ["rgba(94,214,200,0.22)", "rgba(94,214,200,0.07)"],
    tileBg: "rgba(94,214,200,0.16)",
    tileBorder: "rgba(94,214,200,0.35)",
    fg: "#8FE6DA",
  },
  pink: {
    fill: ["rgba(246,150,190,0.10)", "rgba(246,150,190,0.02)"] as readonly [string, string],
    edge: ["rgba(246,150,190,0.22)", "rgba(246,150,190,0.07)"],
    tileBg: "rgba(246,150,190,0.16)",
    tileBorder: "rgba(246,150,190,0.35)",
    fg: "#F7A8C8",
  },
  purple: {
    fill: ["rgba(186,162,249,0.10)", "rgba(186,162,249,0.02)"] as readonly [string, string],
    edge: ["rgba(186,162,249,0.22)", "rgba(186,162,249,0.07)"],
    tileBg: "rgba(186,162,249,0.16)",
    tileBorder: "rgba(186,162,249,0.35)",
    fg: colors.lavender,
  },
  green: {
    fill: ["rgba(90,191,156,0.10)", "rgba(90,191,156,0.02)"] as readonly [string, string],
    edge: ["rgba(90,191,156,0.22)", "rgba(90,191,156,0.07)"],
    tileBg: "rgba(90,191,156,0.16)",
    tileBorder: "rgba(90,191,156,0.35)",
    fg: "#7DD8B5",
  },
  orange: {
    fill: ["rgba(249,115,22,0.10)", "rgba(249,115,22,0.02)"] as readonly [string, string],
    edge: ["rgba(249,115,22,0.22)", "rgba(249,115,22,0.07)"],
    tileBg: "rgba(249,115,22,0.16)",
    tileBorder: "rgba(249,115,22,0.35)",
    fg: "#FBB078",
  },
  yellow: {
    fill: ["rgba(240,198,106,0.10)", "rgba(240,198,106,0.02)"] as readonly [string, string],
    edge: ["rgba(240,198,106,0.22)", "rgba(240,198,106,0.07)"],
    tileBg: "rgba(240,198,106,0.16)",
    tileBorder: "rgba(240,198,106,0.35)",
    fg: "#F0D78C",
  },
};

/** Fetch the most-played game type from the last 7 days via Supabase rooms table. */
async function fetchMostPlayedGameId(): Promise<string | null> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from("rooms")
      .select("game_type")
      .not("game_type", "is", null)
      .gte("created_at", sevenDaysAgo.toISOString());

    if (error || !data || data.length === 0) return null;

    // Count occurrences of each game_type
    const counts: Record<string, number> = {};
    for (const row of data) {
      if (row.game_type) {
        counts[row.game_type] = (counts[row.game_type] || 0) + 1;
      }
    }

    // Find the most popular
    let maxId: string | null = null;
    let maxCount = 0;
    for (const [id, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxId = id;
      }
    }
    return maxId;
  } catch {
    return null;
  }
}

function FeaturedCard({ featuredId }: { featuredId: string }) {
  const router = useRouter();
  const animValue = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;
  const featured = GAMES_LIST.find((g) => g.id === featuredId) ?? GAMES_LIST[0];
  const theme = CARD_THEMES[featured.id as keyof typeof CARD_THEMES] ?? CARD_THEMES.talentShow;

  useEffect(() => {
    Animated.timing(animValue, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/game-info?gameId=${featured.id}`);
  };

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
        onPress={handlePress}
      >
        <View style={s.featuredWrap}>
          {/* Full game card as the featured visual */}
          <View style={[s.featuredGameCard, { borderColor: theme.border }]}>
            <GameCardBackground theme={theme} />
            <GameCardIllustration id={featured.id as any} />
            <GameCardAccent id={featured.id as any} />
            {GAME_LOGOS[featured.id] ? (
              <Image
                source={GAME_LOGOS[featured.id]}
                style={s.featuredCardLogo}
                resizeMode="contain"
              />
            ) : (
              <Text style={s.featuredCardName}>{featured.name}</Text>
            )}
            <View style={s.featuredBadge}>
              <Ionicons name="flame" size={10} color="#fff" />
              <Text style={s.featuredBadgeText}>MOST PLAYED THIS WEEK</Text>
            </View>
          </View>
          {/* Info below the card */}
          <View style={s.featuredInfo}>
            <Text style={s.featuredTitle}>{featured.name}</Text>
            <Text style={s.featuredDesc}>{featured.desc}</Text>
            <Text style={s.featuredPlayers}>{formatPlayerCount(featured.minPlayers, featured.maxPlayers)}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function GameCard({ game, index }: { game: typeof GAMES_LIST[number]; index: number }) {
  const router = useRouter();
  const animValue = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;
  const theme = CARD_THEMES[game.id as keyof typeof CARD_THEMES] ?? CARD_THEMES.talentShow;
  const [cardW, setCardW] = useState(0);
  const logoAspect = GAME_LOGO_ASPECT[game.id] ?? 2;
  const logoW = Math.round(cardW * 0.57);
  const logoH = Math.min(Math.round(logoW / logoAspect), 112);
  const playerText = formatPlayerCount(game.minPlayers, game.maxPlayers);

  useEffect(() => {
    Animated.timing(animValue, { toValue: 1, duration: 400, delay: (index + 1) * 100, useNativeDriver: true }).start();
  }, []);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/game-info?gameId=${game.id}`);
  };

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
        style={s.cardTouch}
        onPressIn={() => Animated.spring(scaleValue, { toValue: 0.97, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true }).start()}
        onPress={handlePress}
      >
        <View
          style={[s.card, { borderColor: theme.border }]}
          onLayout={(e) => setCardW(e.nativeEvent.layout.width)}
        >
          <GameCardBackground theme={theme} />
          <GameCardIllustration id={game.id as any} />
          <GameCardAccent id={game.id as any} />
          {/* Logo — top left */}
          {GAME_LOGOS[game.id] ? (
            <Image
              source={GAME_LOGOS[game.id]}
              style={[s.cardLogo, { width: logoH * logoAspect, height: logoH }]}
              resizeMode="contain"
            />
          ) : (
            <Text style={[s.cardLogo, s.cardTitle]} numberOfLines={2}>{game.name}</Text>
          )}
          {/* Description — bottom left */}
          <Text style={s.cardDesc} numberOfLines={2}>{game.desc}</Text>
          {/* Player count — top right */}
          <View style={[s.playerPill, { borderColor: withAlpha(theme.accent, 0.35) }]}>
            <Text style={[s.playerPillText, { color: theme.text }]}>{playerText}</Text>
          </View>
          {/* Play — bottom right */}
          <View style={[s.playBtn, { backgroundColor: theme.accent }]}>
            <Ionicons name="play" size={20} color="#1A1420" />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function Games() {
  const count = GAMES_LIST.length;
  const [featuredId, setFeaturedId] = useState<string>(GAMES_LIST[0].id);

  // Fetch the most-played game on mount
  useEffect(() => {
    fetchMostPlayedGameId().then((id) => {
      if (id && GAMES_LIST.some((g) => g.id === id)) {
        setFeaturedId(id);
      }
    });
  }, []);

  const listGames = GAMES_LIST.filter((g) => g.id !== featuredId);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenBackground />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <AppHeader />

        <View style={s.headingRow}>
          <Text style={s.heading}>Games</Text>
          <Pill tone="lavender" tilt label={`${count} GAMES`} style={{ alignSelf: "center", marginRight: 4 }} />
        </View>
        <Text style={s.sub}>{count} games to break the ice</Text>

        <FeaturedCard featuredId={featuredId} />

        <Eyebrow style={s.sectionLabel}>FIND YOUR NEXT FAVOURITE</Eyebrow>
        {listGames.map((game, index) => (
          <GameCard key={game.id} game={game} index={index} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPurple },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 32 },

  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  heading: { ...type.title, fontSize: 34, letterSpacing: -0.6 },
  sub: { ...type.subtitle, marginBottom: 22 },

  featuredCard: {
    marginBottom: 4,
  },
  featuredWrap: {
    gap: 12,
  },
  featuredGameCard: {
    height: 200,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: "hidden",
    backgroundColor: "#1A1420",
  },
  featuredCardLogo: {
    position: "absolute",
    left: 18,
    top: 28,
    width: "55%",
    height: 90,
  },
  featuredCardName: {
    position: "absolute",
    left: 18,
    top: 28,
    fontFamily: fonts.extrabold,
    fontSize: 26,
    color: colors.white,
  },
  featuredBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(14,12,26,0.75)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  featuredBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: 0.6,
    color: "#fff",
  },
  featuredInfo: {
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  featuredTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.white,
    marginBottom: 2,
  },
  featuredDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray400,
  },
  featuredPlayers: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.gray500,
    marginTop: 4,
  },

  sectionLabel: { marginTop: 24, marginBottom: 12, fontSize: 10, letterSpacing: 0.8 },

  cardTouch: {
    marginBottom: 12,
  },
  card: {
    height: 200,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: "hidden",
    backgroundColor: "#1A1420",
  },
  cardLogo: {
    position: "absolute",
    left: 18,
    top: 22,
  },
  cardTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    color: colors.white,
  },
  cardDesc: {
    position: "absolute",
    left: 18,
    bottom: 22,
    maxWidth: "58%",
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 19,
    color: "rgba(242,238,248,0.9)",
  },
  playBtn: {
    position: "absolute",
    right: 14,
    bottom: 14,
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 3,
    borderWidth: 1.5,
    borderColor: "rgba(26,20,32,0.35)",
  },
  playerPill: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(14,12,26,0.75)",
  },
  playerPillText: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
  },
  chevron: {
    position: "absolute",
    right: 14,
    top: 14,
  },
});
