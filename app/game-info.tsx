import { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Image, Alert, type ImageSourcePropType } from "react-native";
import * as Haptics from "expo-haptics";
import { useRoomStore } from "../src/stores/roomStore";
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
  blindSpot: {
    name: "Blind Spot",
    tagline: "One is blind. One is lying. Find the saboteur.",
    minPlayers: 4,
    maxPlayers: 8,
    icon: "eye-off",
    color: "#4ECDC4",
    rules: [
      "One player closes their eyes -- they're the Blind player.",
      "Everyone else gives voice instructions to help them complete a physical task.",
      "But ONE person is secretly the Saboteur, giving bad instructions.",
      "Each guide gets 10 seconds to speak. The order goes around twice.",
      "After guiding, the host decides if the task was completed.",
      "The Blind player opens their eyes and guesses who the Saboteur was.",
      "Correct guess = 3 points for the Blind player. Wrong guess = Saboteur scores.",
      "If the task fails and the Saboteur isn't caught, they get 5 points!",
    ],
    tips: [
      "Saboteurs: be subtle! Give instructions that sound helpful but lead astray.",
      "Guides: be specific and clear so the Blind player trusts you.",
      "Blind players: listen for inconsistencies between instructions.",
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

  const [tab, setTab] = useState<"video" | "rules">("video");
  const { createRoom } = useRoomStore();
  const [creating, setCreating] = useState(false);

  const handlePlayNow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCreating(true);
    try {
      await createRoom();
      const state = useRoomStore.getState();
      if (state.error) {
        Alert.alert("Error", state.error);
      } else if (state.room) {
        router.replace("/lobby");
      }
    } catch {
      Alert.alert("Error", "Could not create room.");
    }
    setCreating(false);
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenBackground />
      <RoomToolbar backLabel="Games" title={info.name.toUpperCase()} onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)/games");
      }} />

      {/* Header: logo left, player count + play now right */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          {logo ? (
            <Image
              source={logo.src}
              style={{ height: HERO_LOGO_H, width: HERO_LOGO_H * logo.aspect }}
              resizeMode="contain"
            />
          ) : (
            <Text style={s.heroTitle}>{info.name}</Text>
          )}
        </View>
        <View style={s.headerRight}>
          <View style={s.playerPill}>
            <Ionicons name="people" size={12} color={colors.lavender} />
            <Text style={s.playerPillText}>{playerText}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [s.playNowBtn, pressed && { opacity: 0.8 }]}
            onPress={handlePlayNow}
            disabled={creating}
          >
            <Ionicons name="play" size={14} color={colors.onLavender} />
            <Text style={s.playNowText}>{creating ? "..." : "Play Now"}</Text>
          </Pressable>
        </View>
      </View>

      {/* Tab switcher */}
      <View style={s.tabRow}>
        <Pressable
          style={[s.tab, tab === "video" && s.tabActive]}
          onPress={() => setTab("video")}
        >
          <Ionicons name="play-circle-outline" size={16} color={tab === "video" ? colors.lavender : colors.gray500} />
          <Text style={[s.tabText, tab === "video" && s.tabTextActive]}>Video</Text>
        </Pressable>
        <Pressable
          style={[s.tab, tab === "rules" && s.tabActive]}
          onPress={() => setTab("rules")}
        >
          <Ionicons name="list-outline" size={16} color={tab === "rules" ? colors.lavender : colors.gray500} />
          <Text style={[s.tabText, tab === "rules" && s.tabTextActive]}>Rules</Text>
        </Pressable>
      </View>

      {/* Tab content */}
      {tab === "video" ? (
        <View style={s.videoContainer}>
          <GradientCard radius={radii.lg} contentStyle={s.videoPlaceholder}>
            <View style={s.videoFrame}>
              <Ionicons name="play-circle-outline" size={56} color={colors.gray500} />
              <Text style={s.videoText}>Video tutorial coming soon</Text>
            </View>
          </GradientCard>
        </View>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
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
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPurple },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  headerRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  heroTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.white,
    letterSpacing: -0.3,
  },
  playerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(186,162,249,0.12)",
    borderWidth: 1,
    borderColor: "rgba(186,162,249,0.25)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  playerPillText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.lavender,
  },
  playNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.lavender,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    paddingLeft: 11,
  },
  playNowText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.onLavender,
  },

  // Tabs
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: colors.cardFill,
    borderRadius: 12,
    padding: 3,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: "rgba(186,162,249,0.15)",
  },
  tabText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.gray500,
  },
  tabTextActive: {
    color: colors.lavender,
  },

  // Video
  videoContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  videoPlaceholder: {
    padding: 0,
  },
  videoFrame: {
    aspectRatio: 9 / 16,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
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
