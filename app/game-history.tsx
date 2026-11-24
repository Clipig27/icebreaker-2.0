import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../src/stores/authStore";
import { loadGameHistory, timeAgo, type GameHistoryEntry } from "../src/utils/gameHistory";
import { colors, fonts, radii } from "../src/theme";
import RoomToolbar from "../src/components/RoomToolbar";
import ScreenBackground from "../src/components/ScreenBackground";
import GradientCard from "../src/components/GradientCard";
import GameLogo from "../src/components/GameLogo";

const GAME_LABELS: Record<string, string> = {
  numberGuessor: "1 to 100",
  talentShow: "Nobody's Got Talent",
  pieCharts: "Pie Charts",
  potLuck: "Pot Luck",
  blindRanking: "Blind Ranking",
  tenSecondTasks: "10 Second Tasks",
  auctionDraft: "Bid Wars",
};

export default function GameHistory() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadGameHistory(user.id)
      .then(setHistory)
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenBackground />
      <View style={s.container}>
        <RoomToolbar
          backLabel="Profile"
          onBack={() => router.back()}
          title="Game History"
        />

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={colors.lavender} size="large" />
          </View>
        ) : history.length === 0 ? (
          <View style={s.center}>
            <View style={s.emptyIcon}>
              <Ionicons name="game-controller-outline" size={48} color={colors.gray500} />
            </View>
            <Text style={s.emptyTitle}>No games yet</Text>
            <Text style={s.emptyDesc}>Play some games and your history will show up here.</Text>
          </View>
        ) : (
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {history.map((entry) => (
              <HistoryCard key={entry.id} entry={entry} currentUserId={user?.id ?? ""} />
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

function HistoryCard({
  entry,
  currentUserId,
}: {
  entry: GameHistoryEntry;
  currentUserId: string;
}) {
  const isWinner = entry.winner_id === currentUserId;
  const deltaColor =
    entry.trophy_delta > 0
      ? colors.goldStat
      : entry.trophy_delta < 0
      ? colors.danger
      : colors.gray400;
  const deltaText =
    entry.trophy_delta > 0
      ? `+${entry.trophy_delta}`
      : entry.trophy_delta < 0
      ? `${entry.trophy_delta}`
      : "0";

  return (
    <GradientCard radius={radii.lg} style={s.card} contentStyle={s.cardContent}>
      {/* Top row: game logo + time + trophy delta */}
      <View style={s.cardTop}>
        <View style={s.cardTopLeft}>
          <GameLogo gameId={entry.game_type} height={22} />
          <Text style={s.gameName}>{GAME_LABELS[entry.game_type] ?? entry.game_type}</Text>
        </View>
        <View style={s.cardTopRight}>
          <View style={[s.deltaBadge, { backgroundColor: `${deltaColor}18` }]}>
            <Ionicons name="trophy" size={12} color={deltaColor} />
            <Text style={[s.deltaText, { color: deltaColor }]}>{deltaText}</Text>
          </View>
        </View>
      </View>

      {/* Time */}
      <Text style={s.time}>{timeAgo(entry.timestamp)}</Text>

      {/* Winner */}
      {entry.winner_name && (
        <View style={s.winnerRow}>
          <Ionicons name="trophy" size={14} color={colors.goldStat} />
          <Text style={s.winnerText}>
            {isWinner ? "You won!" : `${entry.winner_name} won`}
          </Text>
        </View>
      )}

      {/* Players */}
      <View style={s.playersRow}>
        {entry.players.map((p) => {
          const isThisWinner = p.id === entry.winner_id;
          return (
            <View
              key={p.id}
              style={[s.playerChip, isThisWinner && s.playerChipWinner]}
            >
              <Text
                style={[s.playerChipText, isThisWinner && s.playerChipTextWinner]}
                numberOfLines={1}
              >
                {p.username}
              </Text>
            </View>
          );
        })}
      </View>
    </GradientCard>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPurple },
  container: { flex: 1, paddingHorizontal: 24 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40, paddingTop: 8 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 80 },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.cardFill,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.white, marginBottom: 6 },
  emptyDesc: { fontFamily: fonts.regular, fontSize: 14, color: colors.gray400, textAlign: "center", maxWidth: 260 },

  card: { marginBottom: 10 },
  cardContent: { padding: 16 },

  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  cardTopLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  cardTopRight: { flexDirection: "row", alignItems: "center" },
  gameName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },

  deltaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  deltaText: { fontFamily: fonts.bold, fontSize: 13 },

  time: { fontFamily: fonts.regular, fontSize: 12, color: colors.gray500, marginBottom: 10 },

  winnerRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  winnerText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.goldStat },

  playersRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  playerChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: colors.cardEdge,
  },
  playerChipWinner: {
    borderColor: "rgba(240,198,106,0.35)",
    backgroundColor: "rgba(240,198,106,0.10)",
  },
  playerChipText: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray300 },
  playerChipTextWinner: { color: colors.goldStat, fontFamily: fonts.bold },
});
