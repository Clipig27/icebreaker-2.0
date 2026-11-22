import { useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, fonts } from "../../src/theme";

const GAMES = [
  { id: "talentShow", name: "Nobody's Got Talent", desc: "Perform prompts — dodge the buzzers, win the finals!", icon: "star" as const, color: "#F59E0B" },
  { id: "numberGuessor", name: "1 to 100", desc: "Guess numeric trivia fast — lowest penalty wins", icon: "text" as const, color: "#06B6D4", iconText: "100" },
  { id: "pieCharts", name: "Pie Charts", desc: "Who's most likely to...?", icon: "pie-chart" as const, color: "#EF4444" },
  { id: "potLuck", name: "Pot Luck", desc: "Trivia with risk vs reward", icon: "trophy" as const, color: "#10B981" },
  { id: "blindRanking", name: "Blind Ranking", desc: "Rank items blind, then vote for the best list", icon: "list" as const, color: "#A78BFA" },
];

function FeaturedCard() {
  const animValue = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: 1,
      duration: 400,
      delay: 0,
      useNativeDriver: true,
    }).start();
  }, []);

  const onPressIn = () => {
    Animated.spring(scaleValue, { toValue: 0.97, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true }).start();
  };
  const onPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
      >
        <View style={s.featuredContent}>
          <View style={{ flex: 1 }}>
            <View style={s.limeBadge}>
              <Text style={s.limeBadgeText}>TONIGHT'S PICK</Text>
            </View>
            <Text style={s.featuredTitle}>Blind Ranking</Text>
            <Text style={s.featuredDesc}>Rank items and match the group</Text>
          </View>
          <View style={s.featuredRight}>
            <Text style={s.featuredBigNumber}>01</Text>
            <View style={s.featuredSmallNumbers}>
              <Text style={s.featuredSmallNumber}>02</Text>
              <Text style={[s.featuredSmallNumber, { marginLeft: 6 }]}>03</Text>
            </View>
            <View style={s.featuredArrow}>
              <Ionicons name="arrow-forward" size={14} color={colors.gray400} />
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function GameCard({ game, index }: { game: typeof GAMES[number]; index: number }) {
  const animValue = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: 1,
      duration: 400,
      delay: (index + 1) * 100,
      useNativeDriver: true,
    }).start();
  }, []);

  const onPressIn = () => {
    Animated.spring(scaleValue, { toValue: 0.97, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true }).start();
  };
  const onPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        style={s.card}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
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
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top bar */}
        <View style={s.topBar}>
          <View style={s.topBarLeft}>
            <Ionicons name="flash" size={20} color={colors.primaryLight} />
            <Text style={s.topBarTitle}>Icebreaker</Text>
          </View>
          <Pressable style={s.settingsCircle}>
            <Ionicons name="settings-outline" size={20} color={colors.gray400} />
          </Pressable>
        </View>

        {/* Heading */}
        <Text style={s.heading}>Games</Text>
        <Text style={s.sub}>5 games to break the ice</Text>

        {/* Featured card */}
        <FeaturedCard />

        {/* Section label */}
        <Text style={s.sectionLabel}>FIND YOUR NEXT FAVOURITE</Text>

        {/* Game list */}
        {GAMES.map((game, index) => (
          <GameCard key={game.id} game={game} index={index} />
        ))}
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
    paddingTop: 16,
    paddingBottom: 32,
  },

  // Top bar
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
  settingsCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Heading
  heading: {
    fontFamily: fonts.extrabold,
    fontSize: 36,
    color: colors.white,
    marginBottom: 4,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.gray400,
    marginBottom: 24,
  },

  // Featured card
  featuredCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featuredContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  limeBadge: {
    backgroundColor: "#C4F04D",
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  limeBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#000000",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  featuredTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.white,
    marginBottom: 4,
  },
  featuredDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray400,
  },
  featuredRight: {
    alignItems: "flex-end",
    marginLeft: 12,
  },
  featuredBigNumber: {
    fontFamily: fonts.extrabold,
    fontSize: 40,
    color: colors.primaryLight,
    lineHeight: 44,
  },
  featuredSmallNumbers: {
    flexDirection: "row",
    marginTop: 2,
  },
  featuredSmallNumber: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    color: colors.gray500,
  },
  featuredArrow: {
    alignSelf: "flex-end",
    marginTop: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },

  // Section label
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.gray500,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 28,
    marginBottom: 16,
  },

  // Game cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  iconText: {
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
    marginBottom: 1,
  },
  cardDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray400,
  },
});
