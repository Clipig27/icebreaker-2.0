import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii, spacing, type } from "../../src/theme";
import { useRoomStore, GameType } from "../../src/stores/roomStore";
import ScreenBackground from "../../src/components/ScreenBackground";
import PrimaryAction, { PrimaryActionBar } from "../../src/components/PrimaryAction";
import Eyebrow from "../../src/components/Eyebrow";
import Pill from "../../src/components/Pill";
import GradientCard from "../../src/components/GradientCard";
import HeroGradient from "../../src/components/HeroGradient";
import PlayerAvatar from "../../src/components/PlayerAvatar";
import { AUCTION_GAME_NAME } from "../../src/data/auctionDraft";

const GAME_INFO: Record<string, { name: string; icon: string; color: string; description: string }> = {
  talentShow: {
    name: "Nobody's Got Talent",
    icon: "star",
    color: "#F59E0B",
    description: "Everyone performs a prompt while the audience buzzes or golden buzzes. Survive the majority buzz, make the top 2 in the semifinals, then win the vote in the finals!",
  },
  numberGuessor: {
    name: "1 to 100",
    icon: "calculator",
    color: "#06B6D4",
    description: "Each round is a trivia question with a numeric answer. Your penalty is how far off you are plus seconds taken — lowest total penalty wins!",
  },
  pieCharts: {
    name: "Pie Charts",
    icon: "pie-chart",
    color: "#EF4444",
    description: "Vote on 'who's most likely to...' questions. See the results as a pie chart!",
  },
  potLuck: {
    name: "Smarty Pot",
    icon: "trophy",
    color: "#10B981",
    description: "Take turns answering trivia. Skip to grow the pot, answer to win it — but get it wrong and you lose!",
  },
  blindRanking: {
    name: "Blind Ranking",
    icon: "list",
    color: "#A78BFA",
    description: "Items from a category appear one at a time — lock each into a rank slot without seeing what's next. Compare lists side-by-side, then vote for the best one!",
  },
  tenSecondTasks: {
    name: "10 Second Tasks",
    icon: "timer",
    color: "#F97316",
    description: "One player holds the phone and performs a growing stack of silly tasks before the timer runs out. Judges vote pass or fail. Last player standing wins!",
  },
  auctionDraft: {
    name: AUCTION_GAME_NAME,
    icon: "pricetags",
    color: "#F472B6",
    description: "Everyone starts with $20 and the same base. Bid on items one at a time to build the best creation, then vote for the winner!",
  },
  blindSpot: {
    name: "Blind Spot",
    icon: "eye-off",
    color: "#4ECDC4",
    description: "One player closes their eyes while everyone else gives voice instructions — but one guide is secretly the Saboteur! The blind player must figure out who was lying.",
  },
};

export default function GameScreen() {
  const { gameType } = useLocalSearchParams<{ gameType: string }>();
  const router = useRouter();
  const { room, players, isHost, endGame, updateGameState } = useRoomStore();
  const info = GAME_INFO[gameType ?? ""] ?? GAME_INFO.talentShow;
  const phase = room?.game_state?.phase ?? "starting";

  // Reset refs when game restarts (Play Again)
  useEffect(() => {
    if (phase === "intro" || phase === "starting") {
      navigatedBackRef.current = false;
    }
  }, [phase]);

  // Single place that returns to the lobby (host + players); fires once.
  const navigatedBackRef = useRef(false);
  useEffect(() => {
    if (navigatedBackRef.current) return;
    if (room?.status === "lobby" || room?.status === "finished") {
      navigatedBackRef.current = true;
      if (router.canGoBack()) router.back();
      else router.replace("/lobby");
    }
  }, [room?.status]);

  // Navigation happens in the room-status effect above once status is "lobby".
  const handleEndGame = async () => {
    await endGame();
  };

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScreenBackground />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.titleBlock}>
          <View style={s.eyebrowRow}>
            <Eyebrow tone="lavender">{info.name}</Eyebrow>
            {room?.code ? <Pill tone="peach" label={`Room ${room.code}`} /> : null}
          </View>
          <View style={s.titleRow}>
            <View style={s.iconBox}>
              <Ionicons name={info.icon as any} size={26} color={colors.highlight} />
            </View>
            <Text style={[type.title, s.flex1]}>{info.name}</Text>
          </View>
          <Text style={type.subtitle}>Getting the game ready...</Text>
        </View>

        <HeroGradient>
          <View style={s.hero}>
            <Eyebrow tone="dark">How to play</Eyebrow>
            <Text style={s.heroText}>{info.description}</Text>
          </View>
        </HeroGradient>

        <View style={s.sectionHead}>
          <Eyebrow>Players</Eyebrow>
          <Pill tone="dark" label={`${players.length}`} />
        </View>
        <View style={s.list}>
          {players.map((p) => (
            <GradientCard key={p.id} radius={radii.lg} contentStyle={s.playerRow}>
              <PlayerAvatar username={p.username} size={36} />
              <Text style={s.playerName} numberOfLines={1}>{p.username}</Text>
              <Text style={s.playerScore}>{p.score} pts</Text>
            </GradientCard>
          ))}
        </View>

        <View style={s.statRow}>
          <GradientCard style={s.flex1} radius={radii.lg} contentStyle={s.statContent}>
            <Text style={s.statValue} numberOfLines={1}>{room?.code ?? "—"}</Text>
            <Eyebrow>Room</Eyebrow>
          </GradientCard>
          <GradientCard style={s.flex1} radius={radii.lg} contentStyle={s.statContent}>
            <Text style={s.statValueSm} numberOfLines={1}>{phase}</Text>
            <Eyebrow>Phase</Eyebrow>
          </GradientCard>
        </View>
      </ScrollView>

      <PrimaryActionBar>
        <View style={s.waiting}>
          <ActivityIndicator size="small" color={colors.highlight} />
          <Text style={s.waitingText} numberOfLines={1}>
            Loading {info.name}...
          </Text>
        </View>
        {isHost && <PrimaryAction label="End Game" variant="dark" onPress={handleEndGame} />}
      </PrimaryActionBar>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPurple },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  flex1: { flex: 1 },
  list: { gap: spacing.sm },
  titleBlock: { gap: spacing.sm },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.highlightSoft,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: { padding: 22, gap: spacing.sm },
  heroText: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 24, color: colors.onPrimary },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  playerName: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  playerScore: { fontFamily: fonts.bold, fontSize: 15, color: colors.highlight },
  statRow: { flexDirection: "row", gap: spacing.md },
  statContent: { padding: spacing.lg, gap: 4 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 28, letterSpacing: 1, color: colors.white },
  statValueSm: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 34, color: colors.white },
  waiting: {
    minHeight: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  waitingText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.gray300 },
});
