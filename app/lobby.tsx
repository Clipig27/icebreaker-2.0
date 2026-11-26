import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, AlertButton, AppState, Animated as RNAnimated, Easing, Image, type ImageSourcePropType } from "react-native";
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

const GAME_LOGOS: Record<string, ImageSourcePropType> = {
  talentShow: require("../assets/game-logos/talent-show.png"),
  numberGuessor: require("../assets/game-logos/one-to-hundred.png"),
  pieCharts: require("../assets/game-logos/pie-charts.png"),
  potLuck: require("../assets/game-logos/smarty-pot.png"),
  blindRanking: require("../assets/game-logos/blind-ranking.png"),
  tenSecondTasks: require("../assets/game-logos/ten-second-tasks.png"),
  auctionDraft: require("../assets/game-logos/bid-wars.png"),
};
/** width / height of each transparent logo PNG (cropped to the artwork's left/right edges). */
const GAME_LOGO_ASPECT: Record<string, number> = {
  talentShow: 2.0859,
  numberGuessor: 2.0859,
  pieCharts: 2.1328,
  potLuck: 2.0078,
  blindRanking: 1.9766,
  tenSecondTasks: 1.9844,
  auctionDraft: 1.7469,
};
import { useRoomStore, GameType } from "../src/stores/roomStore";
import { supabase } from "../src/lib/supabase";
import ScreenBackground from "../src/components/ScreenBackground";
import GradientCard from "../src/components/GradientCard";
import RoomToolbar from "../src/components/RoomToolbar";
import Eyebrow from "../src/components/Eyebrow";
import PlayerAvatar from "../src/components/PlayerAvatar";
import { PrimaryActionBar } from "../src/components/PrimaryAction";
import { AUCTION_GAME_NAME } from "../src/data/auctionDraft";
import { CARD_THEMES, GameCardAccent, GameCardBackground, GameCardIllustration, withAlpha } from "../src/components/GameCardArt";

type RowTint = "gold" | "teal" | "pink" | "purple" | "green" | "orange" | "yellow";

const GAMES: { id: GameType; name: string; desc: string; emoji: string; icon: string; color: string; tint: RowTint; iconText?: string; minPlayers: number; maxPlayers: number | null }[] = [
  { id: "talentShow", name: "Nobody's Got Talent", desc: "Perform, judge, hit the buzzer.", emoji: "⭐", icon: "star", color: "#F59E0B", tint: "gold", minPlayers: 3, maxPlayers: 8 },
  { id: "numberGuessor", name: "1 to 100", desc: "Guess the hidden number.", emoji: "🔢", icon: "calculator", color: "#06B6D4", tint: "teal", iconText: "100", minPlayers: 1, maxPlayers: null },
  { id: "pieCharts", name: "Pie Charts", desc: "Who's most likely to...?", emoji: "🥧", icon: "pie-chart", color: "#EF4444", tint: "pink", minPlayers: 3, maxPlayers: null },
  { id: "potLuck", name: "Smarty Pot", desc: "Trivia with risk vs reward.", emoji: "🍯", icon: "trophy", color: "#F0C66A", tint: "yellow", minPlayers: 3, maxPlayers: 8 },
  { id: "blindRanking", name: "Blind Ranking", desc: "Rank items blind, vote for the best.", emoji: "📊", icon: "list", color: "#A78BFA", tint: "purple", minPlayers: 2, maxPlayers: 5 },
  { id: "tenSecondTasks", name: "10 Second Tasks", desc: "Stack tasks. Beat the timer.", emoji: "⏱️", icon: "timer", color: "#F97316", tint: "orange", iconText: "10", minPlayers: 3, maxPlayers: 6 },
  { id: "auctionDraft", name: AUCTION_GAME_NAME, desc: "Outbid your rivals.", emoji: "💰", icon: "pricetags", color: "#5ABF9C", tint: "green", minPlayers: 2, maxPlayers: 4 },
  { id: "blindSpot", name: "Blind Spot", desc: "Find the saboteur.", emoji: "🕵️", icon: "eye-off", color: "#4ECDC4", tint: "teal", minPlayers: 4, maxPlayers: 8 },
];

/** Same per-game row tints as the Games tab list. */
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
  const theme = CARD_THEMES[game.id];
  // Measured card width → explicit logo size (an absolute Image with only a %
  // width + aspectRatio collapses to 0 height on iOS).
  const [cardW, setCardW] = useState(0);
  const logoAspect = GAME_LOGO_ASPECT[game.id] ?? 2;
  const logoW = Math.round(cardW * 0.57);
  const logoH = Math.min(Math.round(logoW / logoAspect), 112);
  const playerText = game.maxPlayers
    ? `${game.minPlayers}–${game.maxPlayers} players`
    : `${game.minPlayers}+ players`;

  return (
    <Pressable
      style={s.gameCardTouch}
      hitSlop={CARD_HIT_SLOP}
      pressRetentionOffset={CARD_PRESS_RETENTION}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <Animated.View style={animStyle}>
        <View
          style={[s.gameCard, { borderColor: theme.border }]}
          onLayout={(e) => setCardW(e.nativeEvent.layout.width)}
        >
          {/* gradient + light rays → illustration → edge accents */}
          <GameCardBackground theme={theme} />
          <GameCardIllustration id={game.id} />
          <GameCardAccent id={game.id} />
          {/* Logo — top left */}
          {GAME_LOGOS[game.id] ? (
            <Image
              source={GAME_LOGOS[game.id]}
              style={[s.gameCardLogo, { width: logoH * logoAspect, height: logoH }]}
              resizeMode="contain"
            />
          ) : (
            <Text style={[s.gameCardLogo, s.gameCardName]} numberOfLines={2}>{game.name}</Text>
          )}
          {/* Description — bottom left */}
          <Text style={s.gameCardDesc} numberOfLines={2}>{game.desc}</Text>
          {/* Player count — top right */}
          <View style={[s.gameCardPill, { borderColor: withAlpha(theme.accent, 0.35) }]}>
            <Text style={[s.gameCardPillText, { color: theme.text }]}>{playerText}</Text>
          </View>
          {/* Play — bottom right */}
          <View style={[s.playChip, { backgroundColor: theme.accent }]}>
            <Ionicons name="play" size={20} color="#1A1420" />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function Lobby() {
  const router = useRouter();
  const { room, players, isHost, leaveRoom, startGame, kickPlayer, endGame, kicked, clearKicked, _fetchPlayers } = useRoomStore();

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

  // Show an interstitial ad when returning from a game
  const prevStatusRef = useRef(room?.status);
  useEffect(() => {
    if (prevStatusRef.current === "playing" && room?.status === "lobby") {
      import("../src/utils/ads").then((m) => m.showInterstitial()).catch(() => {});
    }
    prevStatusRef.current = room?.status;
  }, [room?.status]);

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

    // Validate player count
    const gameDef = GAMES.find((g) => g.id === gameType);
    if (gameDef) {
      const playerCount = players.length;
      if (playerCount < gameDef.minPlayers) {
        Alert.alert(
          "Not Enough Players",
          `Need at least ${gameDef.minPlayers} players for ${gameDef.name}. Currently ${playerCount} in the room.`
        );
        return;
      }
      if (gameDef.maxPlayers !== null && playerCount > gameDef.maxPlayers) {
        Alert.alert(
          "Too Many Players",
          `${gameDef.name} supports up to ${gameDef.maxPlayers} players. Currently ${playerCount} in the room.`
        );
        return;
      }
    }

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

  const handleTransferHost = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const others = players.filter((p) => !p.is_host);
    if (others.length === 0) {
      Alert.alert("No Players", "There are no other players to transfer host to.");
      return;
    }
    // Show an action sheet with player names
    const buttons: AlertButton[] = others.map((p) => ({
      text: p.username,
      onPress: async () => {
        try {
          // Update rooms table
          await supabase
            .from("rooms")
            .update({ host_id: p.user_id })
            .eq("id", room.id);
          // Remove host from current host
          await supabase
            .from("room_players")
            .update({ is_host: false })
            .eq("room_id", room.id)
            .eq("is_host", true);
          // Set new host
          await supabase
            .from("room_players")
            .update({ is_host: true })
            .eq("room_id", room.id)
            .eq("user_id", p.user_id);
          // Refetch players to update UI
          await _fetchPlayers(room.id);
        } catch (e) {
          Alert.alert("Error", "Failed to transfer host. Please try again.");
        }
      },
    }));
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Transfer Host", "Choose the new host:", buttons);
  };

  const handleEndRoom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "End Room",
      "This will close the room and remove all players. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Room",
          style: "destructive",
          onPress: async () => {
            if (!room) return;
            // Delete ALL players first so no one remains
            await supabase
              .from("room_players")
              .delete()
              .eq("room_id", room.id);
            // Set room to finished
            await supabase
              .from("rooms")
              .update({ status: "finished", game_type: null, game_state: {} })
              .eq("id", room.id);
            // Clean up locally without triggering host transfer
            useRoomStore.getState().cleanup();
            router.replace("/(tabs)/play");
          },
        },
      ]
    );
  };

  const selectedGame = room.game_type ? GAMES.find((g) => g.id === room.game_type) : undefined;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenBackground />
      <RoomToolbar backLabel="Play" title="ROOM LOBBY" onBack={handleLeave} onMenu={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const buttons: AlertButton[] = [
          {
            text: "Leave Room",
            style: "destructive" as const,
            onPress: () => handleLeave(),
          },
        ];
        if (isHost) {
          buttons.push({
            text: "Transfer Host",
            onPress: () => handleTransferHost(),
          });
          buttons.push({
            text: "End Room",
            style: "destructive" as const,
            onPress: () => handleEndRoom(),
          });
        }
        buttons.push({ text: "Cancel", style: "cancel" as const });
        Alert.alert("Room Options", undefined, buttons);
      }} style={s.toolbar} />

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
        <Pressable
          style={({ pressed }) => [s.shareLinkBtn, pressed && { opacity: 0.7 }]}
          onPress={() => {
            const url = `https://icebreaker-2-0.vercel.app/join/${room.code}`;
            Clipboard.setStringAsync(url);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Link Copied!", `Share this link:\n${url}\n\nFriends can join from their browser — no download needed!`);
          }}
        >
          <Ionicons name="link" size={16} color={colors.lavender} />
          <Text style={s.shareLinkText}>Copy Join Link (no download needed)</Text>
        </Pressable>
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
                  <PlayerAvatar username={item.username} size={28} avatarUrl={item.avatar_url} />
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
  shareLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "rgba(186,162,249,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(186,162,249,0.2)",
  },
  shareLinkText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.lavender,
  },
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
  gameCardTouch: { marginBottom: 12 },
  gameCard: {
    height: 200,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: "hidden",
    backgroundColor: "#1A1420",
  },
  gameCardName: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    color: colors.white,
  },
  gameCardDesc: {
    position: "absolute",
    left: 18,
    bottom: 22,
    maxWidth: "58%",
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 19,
    color: "rgba(242,238,248,0.9)",
  },
  gameCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gameCardPill: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(14,12,26,0.75)",
  },
  gameCardPillText: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
  },
  gameCardLogo: {
    position: "absolute",
    left: 18,
    top: 22,
  },
  gameCardEmoji: {
    fontSize: 44,
  },
  gameIcon: {
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  gameIconText: { fontFamily: fonts.extrabold, fontSize: 13 },
  playChip: {
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
