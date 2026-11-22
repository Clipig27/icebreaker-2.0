import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, AppState, Animated as RNAnimated, Easing } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useIsFocused } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { colors, fonts } from "../src/theme";
import { useRoomStore, GameType } from "../src/stores/roomStore";
import SkiaBackground from "../src/components/SkiaBackground";

const GAMES: { id: GameType; name: string; icon: string; color: string }[] = [
  { id: "talentShow", name: "Nobody's Got Talent", icon: "star", color: "#F59E0B" },
  { id: "numberGuessor", name: "1 to 100", icon: "calculator", color: "#06B6D4" },
  { id: "pieCharts", name: "Pie Charts", icon: "pie-chart", color: "#EF4444" },
  { id: "potLuck", name: "Smarty Pot", icon: "trophy", color: "#10B981" },
  { id: "blindRanking", name: "Blind Ranking", icon: "list", color: "#A78BFA" },
];

// Pulsing dot component for online indicator
function PulsingDot() {
  const pulseAnim = useRef(new RNAnimated.Value(0.4)).current;

  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        RNAnimated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
      ])
    ).start();
  }, []);

  return (
    <RNAnimated.View
      style={[
        s.onlineDot,
        { opacity: pulseAnim },
      ]}
    />
  );
}

// Generous retention area so a slightly moving finger (or a card that shifts a
// few px under it) doesn't cancel the press before release.
const CARD_PRESS_RETENTION = { top: 40, bottom: 40, left: 40, right: 40 };
const CARD_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

// Game card with press scale animation.
// The scale is applied to an inner Animated.View, not to the Pressable itself,
// so the touchable's own frame (which Pressability measures on press-in to
// decide whether the release is still "inside") never shrinks or moves.
function GameCard({ game, onPress }: { game: typeof GAMES[number]; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      style={s.gameCardTouch}
      hitSlop={CARD_HIT_SLOP}
      pressRetentionOffset={CARD_PRESS_RETENTION}
      onPressIn={() => {
        console.log("[tapdiag] lobby card onPressIn", game.id);
        scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
      }}
      onPressOut={() => {
        console.log("[tapdiag] lobby card onPressOut", game.id);
        scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      }}
      onPress={() => {
        console.log("[tapdiag] lobby card onPress fired", game.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <Animated.View style={[s.gameRow, animStyle]}>
        <View style={[s.gameIcon, { backgroundColor: game.color + "20" }]}>
          <Ionicons name={game.icon as any} size={20} color={game.color} />
        </View>
        <Text style={s.gameName}>{game.name}</Text>
        <Ionicons name="play" size={18} color={colors.primaryLight} />
      </Animated.View>
    </Pressable>
  );
}

export default function Lobby() {
  const router = useRouter();
  const { room, players, isHost, leaveRoom, startGame, kickPlayer, kicked, clearKicked } = useRoomStore();

  useEffect(() => {
    // If room gets closed (or we were kicked), go back
    if (!room) {
      if (kicked) {
        clearKicked();
        Alert.alert("Removed", "You were removed from the room");
      }
      router.replace("/(tabs)/play");
    }
  }, [room, kicked]);

  // Navigate to game when room status transitions into "playing".
  // Track the last game we pushed so a stale "playing" status (e.g. while
  // returning from a game) never re-pushes the same game; reset once the room
  // is back out of "playing" so the next game start navigates again.
  const isFocused = useIsFocused();
  const lastPushedGameRef = useRef<string | null>(null);
  useEffect(() => {
    if (room?.status !== "playing" || !room.game_type) {
      lastPushedGameRef.current = null;
      return;
    }
    const key = `${room.id}:${room.game_type}`;
    if (!isFocused || lastPushedGameRef.current === key) return;
    lastPushedGameRef.current = key;
    router.push(`/games/${room.game_type}`);
  }, [room?.id, room?.status, room?.game_type, isFocused]);

  // Fallback for non-hosts: if a realtime rooms UPDATE (game start) is ever
  // missed, poll the room row while we sit focused in the lobby, and refetch
  // whenever the app returns to the foreground. The navigation effect above
  // (lastPushedGameRef/isFocused) still guarantees a game is pushed only once.
  const refreshRoom = useRoomStore((st) => st.refreshRoom);
  const shouldPoll = isFocused && !isHost && room?.status === "lobby";
  useEffect(() => {
    if (!shouldPoll) return;
    const interval = setInterval(() => {
      refreshRoom();
    }, 4000);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") refreshRoom();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [shouldPoll, room?.id, refreshRoom]);

  // Only let the ScrollView scroll when its content actually overflows. An
  // always-enabled ScrollView can claim the touch responder on a few px of
  // finger movement, which cancels a game-card press (onPressIn, no onPress).
  const [viewportH, setViewportH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const canScroll = viewportH > 0 && contentH > viewportH + 1;

  // Player-row entering animation only plays for rows present on the lobby's
  // first render. Realtime refetches/reconciles (e.g. on returning from a game)
  // must not remount/replay animations that shift content under a pressing finger.
  const enteringEnabledRef = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => {
      enteringEnabledRef.current = false;
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  if (!room) return null;

  const handleCopyCode = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(room.code);
    Alert.alert("Copied!", "Room code copied to clipboard.");
  };

  const handleLeave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Leave Room", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          await leaveRoom();
          router.replace("/(tabs)/play");
        },
      },
    ]);
  };

  const handleStartGame = (gameType: GameType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log("[tapdiag] handleStartGame", gameType, "local status:", room.status, "isHost:", isHost);
    startGame(gameType).catch((e) => console.log("[tapdiag] startGame threw", gameType, String(e)));
  };

  const handleKick = (userId: string, username: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Kick Player", `Remove ${username}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Kick",
        style: "destructive",
        onPress: async () => {
          try {
            // kickPlayer refetches players on success
            await kickPlayer(userId);
          } catch (e) {
            Alert.alert(
              "Couldn't remove player",
              e instanceof Error ? e.message : "Something went wrong. Please try again."
            );
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <SkiaBackground />
      <View style={s.header}>
        <Pressable onPress={handleLeave}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </Pressable>
        <Pressable onPress={handleCopyCode} style={s.codeBox}>
          <Text style={s.codeLabel}>ROOM CODE</Text>
          <View style={s.codeRow}>
            <Text style={s.code}>{room.code}</Text>
            <Ionicons name="copy-outline" size={16} color={colors.gray400} style={{ marginLeft: 8 }} />
          </View>
        </Pressable>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        scrollEnabled={canScroll}
        onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setContentH(h)}
      >
      <View style={s.section}>
        <Text style={s.sectionTitle}>
          Players ({players.length})
        </Text>
        {players.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={
                enteringEnabledRef.current
                  ? FadeInDown.delay(index * 80).duration(400).springify()
                  : undefined
              }
              style={s.playerRow}
            >
              <PulsingDot />
              <View style={[s.avatar, { backgroundColor: item.is_host ? colors.primary + "30" : colors.surfaceLight }]}>
                <Text style={s.avatarText}>{item.username.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={s.playerName}>{item.username}</Text>
              {item.is_host && <Text style={s.hostBadge}>HOST</Text>}
              {isHost && !item.is_host && (
                <Pressable onPress={() => handleKick(item.user_id, item.username)}>
                  <Ionicons name="close-circle" size={22} color={colors.danger} />
                </Pressable>
              )}
            </Animated.View>
        ))}
      </View>

      {isHost && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Pick a Game</Text>
          {GAMES.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              onPress={() => handleStartGame(game.id)}
            />
          ))}
        </View>
      )}

      {!isHost && (
        <View style={s.waiting}>
          <Text style={s.waitingText}>Waiting for host to start...</Text>
        </View>
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  codeBox: { alignItems: "center", padding: 8 },
  codeRow: { flexDirection: "row", alignItems: "center" },
  codeLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray400, letterSpacing: 2 },
  code: { fontFamily: fonts.extrabold, fontSize: 32, color: colors.primary, letterSpacing: 6 },
  section: { paddingHorizontal: 24, marginBottom: 24 },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.gray400, marginBottom: 12 },
  scroll: { flex: 1 },
  // flexGrow lets the non-host "waiting" block (flex: 1) still fill the leftover space
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  playerName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.white, flex: 1 },
  hostBadge: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    backgroundColor: colors.primary + "20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  gameCardTouch: { marginBottom: 8 },
  gameRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gameIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  gameName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.white, flex: 1 },
  waiting: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 100 },
  waitingText: { fontFamily: fonts.regular, fontSize: 16, color: colors.gray500 },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
    marginRight: 10,
  },
});
