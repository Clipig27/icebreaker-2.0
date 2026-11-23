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
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts, gradients, radii, spacing, type } from "../src/theme";
import { useRoomStore, GameType } from "../src/stores/roomStore";
import ScreenBackground from "../src/components/ScreenBackground";
import GradientCard from "../src/components/GradientCard";
import RoomToolbar from "../src/components/RoomToolbar";
import Eyebrow from "../src/components/Eyebrow";
import PlayerAvatar from "../src/components/PlayerAvatar";
import { PrimaryActionBar } from "../src/components/PrimaryAction";
import { AUCTION_GAME_NAME } from "../src/data/auctionDraft";

type RowTint = "gold" | "teal" | "pink" | "purple";

const GAMES: { id: GameType; name: string; icon: string; color: string; tint: RowTint; iconText?: string }[] = [
  { id: "talentShow", name: "Nobody's Got Talent", icon: "star", color: "#F59E0B", tint: "gold" },
  { id: "numberGuessor", name: "1 to 100", icon: "calculator", color: "#06B6D4", tint: "teal", iconText: "100" },
  { id: "pieCharts", name: "Pie Charts", icon: "pie-chart", color: "#EF4444", tint: "pink" },
  { id: "potLuck", name: "Smarty Pot", icon: "trophy", color: "#10B981", tint: "purple" },
  { id: "blindRanking", name: "Blind Ranking", icon: "list", color: "#A78BFA", tint: "purple" },
  { id: "tenSecondTasks", name: "10 Second Tasks", icon: "timer", color: "#F97316", tint: "purple", iconText: "10" },
  { id: "auctionDraft", name: AUCTION_GAME_NAME, icon: "pricetags", color: "#F472B6", tint: "pink" },
];

/** Same per-game row tints as the Games tab list. */
const TINTS: Record<
  RowTint,
  { fill: readonly [string, string]; edge: readonly [string, string]; tileBg: string; tileBorder: string; fg: string }
> = {
  gold: {
    fill: gradients.rowGold,
    edge: ["rgba(248,210,147,0.24)", "rgba(248,210,147,0.08)"],
    tileBg: colors.goldTile,
    tileBorder: "rgba(255,255,255,0.25)",
    fg: colors.onLavender,
  },
  teal: {
    fill: gradients.rowTeal,
    edge: ["rgba(94,214,200,0.22)", "rgba(94,214,200,0.07)"],
    tileBg: "rgba(94,214,200,0.16)",
    tileBorder: "rgba(94,214,200,0.35)",
    fg: "#8FE6DA",
  },
  pink: {
    fill: gradients.rowPink,
    edge: ["rgba(246,150,190,0.22)", "rgba(246,150,190,0.07)"],
    tileBg: "rgba(246,150,190,0.16)",
    tileBorder: "rgba(246,150,190,0.35)",
    fg: "#F7A8C8",
  },
  purple: {
    fill: gradients.rowPurple,
    edge: ["rgba(186,162,249,0.22)", "rgba(186,162,249,0.07)"],
    tileBg: "rgba(186,162,249,0.16)",
    tileBorder: "rgba(186,162,249,0.35)",
    fg: colors.lavender,
  },
};

function GameTile({ game, size = 40 }: { game: typeof GAMES[number]; size?: number }) {
  const t = TINTS[game.tint];
  return (
    <View
      style={[
        s.gameIcon,
        { width: size, height: size, backgroundColor: t.tileBg, borderColor: t.tileBorder },
      ]}
    >
      {game.iconText ? (
        <Text style={[s.gameIconText, { color: t.fg }]}>{game.iconText}</Text>
      ) : (
        <Ionicons name={game.icon as any} size={19} color={t.fg} />
      )}
    </View>
  );
}

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
      <Animated.View style={animStyle}>
        <GradientCard
          radius={radii.lg}
          contentStyle={s.gameRow}
          fill={TINTS[game.tint].fill}
          borderColors={TINTS[game.tint].edge}
        >
          <GameTile game={game} />
          <Text style={s.gameName} numberOfLines={1}>{game.name}</Text>
          <View style={s.playChip}>
            <Ionicons name="play" size={13} color={colors.onLavender} />
          </View>
        </GradientCard>
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

  const selectedGame = room.game_type ? GAMES.find((g) => g.id === room.game_type) : undefined;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenBackground />
      <RoomToolbar backLabel="Play" title="ROOM LOBBY" onBack={handleLeave} style={s.toolbar} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        scrollEnabled={canScroll}
        onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setContentH(h)}
      >
      <Text style={s.title}>Your people. Your room.</Text>
      <Text style={s.subtitle}>Invite friends, then pick your game.</Text>

      {/* Room code */}
      <GradientCard radius={radii.lg} style={s.codeCard} contentStyle={s.codeCardContent}>
        <Eyebrow style={s.codeLabel}>ROOM CODE</Eyebrow>
        <View style={s.codeRow}>
          <Text style={s.code} numberOfLines={1} adjustsFontSizeToFit>
            {room.code}
          </Text>
          <Pressable
            onPress={handleCopyCode}
            accessibilityRole="button"
            accessibilityLabel="Copy room code"
            style={({ pressed }) => [s.copyBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
          >
            <LinearGradient
              colors={gradients.primaryButton}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.6, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Text style={s.copyText}>Copy</Text>
          </Pressable>
        </View>
        <Text style={s.codeHelper}>Share this code so friends can join.</Text>
      </GradientCard>

      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Players</Text>
          <Text style={s.sectionMeta}>{players.length} joined</Text>
        </View>
        {players.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={
                enteringEnabledRef.current
                  ? FadeInDown.delay(index * 80).duration(400).springify()
                  : undefined
              }
              style={s.playerRowWrap}
            >
              <GradientCard radius={radii.md} contentStyle={s.playerRow}>
                <View>
                  <PlayerAvatar username={item.username} size={28} />
                  <View style={s.onlineDotWrap}>
                    <PulsingDot />
                  </View>
                </View>
                <Text style={s.playerName} numberOfLines={1}>{item.username}</Text>
                {item.is_host ? (
                  <Text style={[s.statusLabel, { color: colors.lavender }]}>HOST</Text>
                ) : (
                  <Text style={[s.statusLabel, { color: colors.joinedGreen }]}>JOINED</Text>
                )}
                {isHost && !item.is_host && (
                  <Pressable
                    onPress={() => handleKick(item.user_id, item.username)}
                    hitSlop={8}
                    style={s.kickBtn}
                  >
                    <Ionicons name="close" size={14} color={colors.danger} />
                  </Pressable>
                )}
              </GradientCard>
            </Animated.View>
        ))}
      </View>

      {selectedGame && (
        <GradientCard radius={radii.lg} style={s.section} contentStyle={s.selectedCard}>
          <GameTile game={selectedGame} />
          <View style={{ flex: 1 }}>
            <Eyebrow style={s.smallEyebrow}>SELECTED GAME</Eyebrow>
            <Text style={s.selectedName} numberOfLines={1}>★ {selectedGame.name}</Text>
          </View>
        </GradientCard>
      )}

      {isHost && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Eyebrow style={s.smallEyebrow}>Pick a game</Eyebrow>
          </View>
          {GAMES.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              onPress={() => handleStartGame(game.id)}
            />
          ))}
        </View>
      )}
      </ScrollView>

      {isHost ? (
        <PrimaryActionBar helperText="You're the host. Tap a game to start when everyone's in.">
          {null}
        </PrimaryActionBar>
      ) : (
        <PrimaryActionBar>
          <GradientCard radius={radii.md} contentStyle={s.waiting}>
            <PulsingDot />
            <Text style={s.waitingText}>Waiting for the host to start…</Text>
          </GradientCard>
        </PrimaryActionBar>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPurple },
  toolbar: { paddingHorizontal: spacing.lg },
  title: {
    ...type.title,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
    marginTop: 14,
    marginBottom: 4,
  },
  subtitle: { ...type.subtitle, fontSize: 14, marginBottom: 18 },

  // Room code
  codeCard: { marginBottom: 22 },
  codeCardContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  codeLabel: { marginBottom: 6, fontSize: 9, letterSpacing: 0.8 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  code: {
    flex: 1,
    fontFamily: fonts.extrabold,
    fontSize: 30,
    lineHeight: 36,
    color: colors.white,
    letterSpacing: 1,
  },
  codeHelper: { fontFamily: fonts.regular, fontSize: 12, color: colors.gray400, marginTop: 8 },
  copyBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    overflow: "hidden",
  },
  copyText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onLavender },

  section: { marginBottom: 22 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  sectionMeta: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray400 },
  smallEyebrow: { fontSize: 10, letterSpacing: 0.8 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing.screen, paddingBottom: 24 },

  // Players
  playerRowWrap: { marginBottom: 8 },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  statusLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  onlineDotWrap: {
    position: "absolute",
    right: -2,
    bottom: -2,
    padding: 2,
    borderRadius: 7,
    backgroundColor: colors.card,
  },
  playerName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white, flex: 1 },
  kickBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    marginLeft: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },

  // Selected game
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    padding: 14,
  },
  selectedName: { fontFamily: fonts.bold, fontSize: 17, color: colors.white, marginTop: 4 },

  // Game picker
  gameCardTouch: { marginBottom: 10 },
  gameRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  gameIcon: {
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  gameIconText: { fontFamily: fonts.extrabold, fontSize: 13 },
  gameName: { fontFamily: fonts.bold, fontSize: 15, color: colors.white, flex: 1, marginRight: 8 },
  playChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.lavender,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
  },

  // Non-host footer
  waiting: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    minHeight: 54,
  },
  waitingText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.gray300 },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
});
