import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, fonts } from "../theme";
import { useRoomStore } from "../stores/roomStore";

/**
 * Shared header for all game screens.
 * - Host sees: "End Game" (back to lobby) + "Leave Room" (leave entirely)
 * - Non-host sees: "Leave" (leave room entirely)
 * - Room code shown center
 */
export default function GameHeader() {
  const router = useRouter();
  const { room, isHost, leaveRoom, endGame } = useRoomStore();

  // Host: end current game and return everyone to lobby (pick a new game)
  const handleEndGame = () => {
    Alert.alert(
      "End Game?",
      "This will end the current game and take everyone back to the lobby.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Game",
          onPress: async () => {
            await endGame();
          },
        },
      ]
    );
  };

  // Leave room entirely (host role transfers if host leaves)
  const handleLeaveRoom = () => {
    Alert.alert(
      "Leave Room?",
      isHost
        ? "Host role will transfer to another player."
        : "You will leave the room and return to the home screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            await leaveRoom();
            router.replace("/(tabs)/play");
          },
        },
      ]
    );
  };

  return (
    <View style={styles.header}>
      {isHost ? (
        <View style={styles.hostBtns}>
          <TouchableOpacity onPress={handleEndGame} style={styles.endGameBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={16} color={colors.primaryLight} />
            <Text style={styles.endGameText}>Lobby</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLeaveRoom} style={styles.leaveBtn} activeOpacity={0.7}>
            <Ionicons name="exit-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={handleLeaveRoom} style={styles.leaveBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={16} color={colors.danger} />
          <Text style={styles.leaveText}>Leave</Text>
        </TouchableOpacity>
      )}
      {room?.code && (
        <View style={styles.codePill}>
          <Text style={styles.codeText}>{room.code}</Text>
        </View>
      )}
      <View style={{ width: isHost ? 80 : 70 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  hostBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  endGameBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary + "22",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  endGameText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primaryLight,
  },
  leaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.danger + "18",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  leaveText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.danger,
  },
  codePill: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  codeText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.gray400,
    letterSpacing: 2,
  },
});
