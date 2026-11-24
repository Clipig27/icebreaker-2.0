import { View, Text, ScrollView, StyleSheet, Image, type ImageSourcePropType } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, gradients, radii, spacing, type } from "../src/theme";
import ScreenBackground from "../src/components/ScreenBackground";
import RoomToolbar from "../src/components/RoomToolbar";
import GradientCard from "../src/components/GradientCard";
import Eyebrow from "../src/components/Eyebrow";
import { useRouter } from "expo-router";
import { CARD_THEMES, GameCardBackground, GameCardIllustration, GameCardAccent, withAlpha } from "../src/components/GameCardArt";

const GAME_LOGOS: Record<string, ImageSourcePropType> = {
  talentShow: require("../assets/game-logos/talent-show.png"),
  numberGuessor: require("../assets/game-logos/one-to-hundred.png"),
  pieCharts: require("../assets/game-logos/pie-charts.png"),
  potLuck: require("../assets/game-logos/smarty-pot.png"),
  blindRanking: require("../assets/game-logos/blind-ranking.png"),
  tenSecondTasks: require("../assets/game-logos/ten-second-tasks.png"),
  auctionDraft: require("../assets/game-logos/bid-wars.png"),
};

const GAME_LOGO_ASPECT: Record<string, number> = {
  talentShow: 2.0859, numberGuessor: 2.0859, pieCharts: 2.1328,
  potLuck: 2.0078, blindRanking: 1.9766, tenSecondTasks: 1.9844, auctionDraft: 1.7469,
};

type GameId = string;

interface GameInfo {
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number | null;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  rules: string[];
  tips: string[];
}

const HERO_LOGO_H = 76;

const GAME_INFO: Record<GameId, GameInfo> = {
  talentShow: {
    name: "Nobody's Got Talent",
    tagline: "Perform, buzz, and vote your way to victory!",
    minPlayers: 3,
    maxPlayers: 8,
    icon: "star",
    color: "#F59E0B",
    rules: [
      "Round 1 — Auditions: Everyone performs a 30-second prompt. The audience buzzes (eliminate) or golden buzzes (advance).",
      "You need more than half the audience to buzz or golden buzz for it to count. Ties = eliminated.",
      "If the vote is split, undecided voters cast a final advance/eliminate vote.",
      "Round 2 — Semifinals: Survivors perform again. Everyone votes for the top 2 to advance to the finals.",
      "Round 3 — The Finals: The 2 finalists perform one last time. Everyone votes for the winner.",
      "If there's a tie at any stage, a quick 10-second tiebreaker round decides it.",
    ],
    tips: [
      "Commit to the performance — confidence wins votes.",
      "Golden buzzers are powerful. Save yours for someone who really nails it.",
      "In later rounds, vote strategically — not just for who's funniest.",
    ],
  },
  numberGuessor: {
    name: "1 to 100",
    tagline: "Guess numeric trivia — lowest penalty wins.",
    minPlayers: 1,
    maxPlayers: null,
    icon: "calculator",
    color: "#06B6D4",
    rules: [
      "A trivia question appears with an answer between 1 and 100.",
      "Everyone guesses the number as fast as they can.",
      "Your penalty = how far off you were + how many seconds you took.",
      "Lowest total penalty after all rounds wins.",
    ],
    tips: [
      "Speed matters — a close guess sent quickly beats a perfect guess sent late.",
      "Don't overthink it. Trust your gut.",
    ],
  },
  pieCharts: {
    name: "Pie Charts",
    tagline: "Who's most likely to...?",
    minPlayers: 3,
    maxPlayers: null,
    icon: "pie-chart",
    color: "#EF4444",
    rules: [
      "A \"Who's most likely to...\" question appears.",
      "Everyone votes for who they think fits the question best. You can vote for yourself.",
      "Results are revealed as a donut chart showing the vote breakdown.",
      "There's no winner or scoring — just fun reveals and debates.",
      "The host can add custom questions during setup.",
    ],
    tips: [
      "Be honest — the funniest results come from real answers.",
      "Custom questions make it personal and way more entertaining.",
    ],
  },
  potLuck: {
    name: "Smarty Pot",
    tagline: "Trivia with risk vs reward.",
    minPlayers: 3,
    maxPlayers: 8,
    icon: "trophy",
    color: "#10B981",
    rules: [
      "Players take turns answering trivia questions one at a time.",
      "Answer correctly = win the pot. Answer wrong = lose points equal to the pot.",
      "Skip = the pot grows by 1 and passes to the next player.",
      "First player to reach the target score wins.",
      "You have 15 seconds per turn. If time runs out, you skip automatically.",
    ],
    tips: [
      "Skipping isn't weak — it builds the pot for someone else to risk.",
      "If you're behind, take the risk. If you're ahead, play it safe.",
    ],
  },
  blindRanking: {
    name: "Blind Ranking",
    tagline: "Rank items blind, then vote for the best list.",
    minPlayers: 2,
    maxPlayers: 5,
    icon: "list",
    color: "#A78BFA",
    rules: [
      "Items appear one at a time. You place each into a rank slot — best to worst.",
      "Once placed, it's locked. No take-backs.",
      "After everyone's done, the real ranking is revealed side-by-side.",
      "\"Most Divisive\" and \"Everyone Agrees\" callouts highlight the interesting items.",
      "Everyone votes for whose list they think is the best.",
    ],
    tips: [
      "Save your top slots for items you're confident about.",
      "The middle slots are safest for items you're unsure about.",
    ],
  },
  tenSecondTasks: {
    name: "10 Second Tasks",
    tagline: "Stack tasks. Beat the timer. Dodge the buzzer.",
    minPlayers: 3,
    maxPlayers: 6,
    icon: "timer",
    color: "#F97316",
    rules: [
      "One player holds the phone and performs a growing stack of tasks before the timer runs out.",
      "Judges vote pass or fail after each performance.",
      "Fail = you're eliminated. You get one shield to save yourself.",
      "The task stack grows each turn — up to 5 tasks at once.",
      "Timer increases: 10s → 15s → 20s → 25s as more tasks pile on.",
      "Last player standing wins.",
    ],
    tips: [
      "Read all tasks before you start — plan your order.",
      "Save your shield for when it really matters.",
      "Be a fair judge — the game's more fun when everyone plays honestly.",
    ],
  },
  auctionDraft: {
    name: "Bid Wars",
    tagline: "Auction draft showdown.",
    minPlayers: 2,
    maxPlayers: 4,
    icon: "pricetags",
    color: "#F472B6",
    rules: [
      "Everyone starts with $20.",
      "Items are auctioned one at a time. Bid or pass each round.",
      "Highest bidder wins the item and pays their bid.",
      "15 seconds per bidding round.",
      "At the end, everyone votes for who built the best collection.",
    ],
    tips: [
      "Don't blow your budget early — save for the items you really want.",
      "Let others overpay for items you don't care about.",
    ],
  },
};

export default function GameInfoScreen() {
  const router = useRouter();
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const info = GAME_INFO[gameId ?? ""] ?? GAME_INFO.talentShow;
  const logoKey = GAME_INFO[gameId ?? ""] ? (gameId as string) : "talentShow";
  const logo = GAME_LOGOS[logoKey] ? { src: GAME_LOGOS[logoKey], aspect: GAME_LOGO_ASPECT[logoKey] ?? 2 } : undefined;
  const playerText = info.maxPlayers
    ? `${info.minPlayers}–${info.maxPlayers} players`
    : `${info.minPlayers}+ players`;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenBackground />
      <RoomToolbar backLabel="Games" title={info.name.toUpperCase()} onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)/games");
      }} />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        {logo ? (
          <View style={s.heroLogoBlock}>
            <Image
              source={logo.src}
              style={{ height: HERO_LOGO_H, width: HERO_LOGO_H * logo.aspect, marginLeft: -4 }}
              resizeMode="contain"
              accessibilityLabel={info.name}
            />
            <Text style={s.heroTagline}>{info.tagline}</Text>
          </View>
        ) : (
          <View style={s.heroRow}>
            <View style={[s.heroIcon, { backgroundColor: info.color + "25" }]}>
              <Ionicons name={info.icon} size={28} color={info.color} />
            </View>
            <View style={s.heroText}>
              <Text style={s.heroTitle}>{info.name}</Text>
              <Text style={s.heroTagline}>{info.tagline}</Text>
            </View>
          </View>
        )}

        {/* Player count */}
        <GradientCard radius={radii.lg} contentStyle={s.metaCard}>
          <View style={s.metaRow}>
            <Ionicons name="people" size={18} color={colors.lavender} />
            <Text style={s.metaText}>{playerText}</Text>
          </View>
        </GradientCard>

        {/* Video placeholder (9:16 aspect ratio) */}
        <GradientCard radius={radii.lg} contentStyle={s.videoPlaceholder}>
          <View style={s.videoFrame}>
            <Ionicons name="play-circle-outline" size={48} color={colors.gray500} />
            <Text style={s.videoText}>Video tutorial coming soon</Text>
          </View>
        </GradientCard>

        {/* Rules */}
        <Eyebrow style={s.sectionLabel}>HOW TO PLAY</Eyebrow>
        <View style={s.rulesList}>
          {info.rules.map((rule, i) => (
            <GradientCard key={i} radius={radii.lg} contentStyle={s.ruleRow}>
              <View style={s.ruleNumber}>
                <Text style={s.ruleNumberText}>{i + 1}</Text>
              </View>
              <Text style={s.ruleText}>{rule}</Text>
            </GradientCard>
          ))}
        </View>

        {/* Tips */}
        {info.tips.length > 0 && (
          <>
            <Eyebrow style={s.sectionLabel}>TIPS</Eyebrow>
            <View style={s.rulesList}>
              {info.tips.map((tip, i) => (
                <GradientCard key={i} radius={radii.lg} contentStyle={s.ruleRow}>
                  <Ionicons name="bulb-outline" size={18} color={colors.goldStat} />
                  <Text style={s.ruleText}>{tip}</Text>
                </GradientCard>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPurple },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },

  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
  },
  heroLogoBlock: {
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 16,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 24,
    color: colors.white,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroTagline: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray400,
  },

  metaCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  metaText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.white,
  },

  videoPlaceholder: {
    marginBottom: 20,
    padding: 0,
  },
  videoFrame: {
    aspectRatio: 9 / 16,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: radii.lg,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  videoText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray500,
  },

  sectionLabel: {
    marginBottom: 10,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  rulesList: {
    gap: 8,
    marginBottom: 24,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  ruleNumber: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(186,162,249,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  ruleNumberText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.lavender,
  },
  ruleText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray300,
    lineHeight: 20,
  },
});
