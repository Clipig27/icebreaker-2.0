import { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../src/theme";
import { useRoomStore, GameType } from "../../src/stores/roomStore";

const GAME_INFO: Record<string, { name: string; icon: string; color: string; description: string }> = {
  talentShow: {
    name: "Nobody's Got Talent",
    icon: "star",
    color: "#F59E0B",
    description: "Write unique answers to the prompt. If someone else writes the same thing, you both lose points!",
  },
  numberGuessor: {
    name: "1 to 100",
    icon: "calculator",
    color: "#06B6D4",
    description: "A hidden number between 1-100 is chosen. Guess the closest without going over! Speed matters.",
  },
  pieCharts: {
    name: "Pie Charts",
    icon: "pie-chart",
    color: "#EF4444",
    description: "Vote on 'who's most likely to...' questions. See the results as a pie chart!",
  },
  potLuck: {
    name: "Pot Luck",
    icon: "trophy",
    color: "#10B981",
    description: "Answer trivia questions. The pot grows each round — risk it all or play it safe!",
  },
  blindRanking: {
    name: "Blind Ranking",
    icon: "list",
    color: "#A78BFA",
    description: "Secretly rank items from a category. Score points by matching the group consensus!",
  },
};

export default function GameScreen() {
  const { gameType } = useLocalSearchParams<{ gameType: string }>();
  const router = useRouter();
  const { room, players, isHost, endGame, updateGameState } = useRoomStore();
  const info = GAME_INFO[gameType ?? ""] ?? GAME_INFO.talentShow;
  const phase = room?.game_state?.phase ?? "starting";

  useEffect(() => {
    if (room?.status === "lobby" || room?.status === "finished") {
      router.back();
    }
  }, [room?.status]);

  const handleEndGame = async () => {
    await endGame();
    router.replace("/lobby");
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View style={[s.iconBox, { backgroundColor: info.color + "20" }]}>
          <Ionicons name={info.icon as any} size={28} color={info.color} />
        </View>
        <Text style={s.title}>{info.name}</Text>
      </View>

      <View style={s.body}>
        <View style={s.card}>
          <Text style={s.cardTitle}>How to Play</Text>
          <Text style={s.cardDesc}>{info.description}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Players ({players.length})</Text>
          {players.map((p) => (
            <View key={p.id} style={s.playerRow}>
              <Text style={s.playerName}>{p.username}</Text>
              <Text style={s.playerScore}>{p.score} pts</Text>
            </View>
          ))}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Room: {room?.code}</Text>
          <Text style={s.phase}>Phase: {phase}</Text>
        </View>
      </View>

      {isHost && (
        <View style={s.footer}>
          <Pressable style={s.endBtn} onPress={handleEndGame}>
            <Text style={s.endBtnText}>End Game</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { alignItems: "center", paddingTop: 24, paddingBottom: 16 },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontFamily: fonts.bold, fontSize: 26, color: colors.white },
  body: { flex: 1, paddingHorizontal: 24, gap: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
  },
  cardTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.white, marginBottom: 8 },
  cardDesc: { fontFamily: fonts.regular, fontSize: 14, color: colors.gray400, lineHeight: 20 },
  playerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  playerName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  playerScore: { fontFamily: fonts.bold, fontSize: 15, color: colors.primaryLight },
  phase: { fontFamily: fonts.regular, fontSize: 14, color: colors.gray500 },
  footer: { paddingHorizontal: 24, paddingBottom: 32 },
  endBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(239,68,68,0.3)",
    backgroundColor: "rgba(239,68,68,0.05)",
  },
  endBtnText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.danger },
});
