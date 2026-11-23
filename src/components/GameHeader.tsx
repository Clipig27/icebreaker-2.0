import { TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, radii, spacing } from "../theme";
import { useRoomStore } from "../stores/roomStore";
import RoomToolbar from "./RoomToolbar";

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

  // Rendered as the shared RoomToolbar: pill back button (host → end game /
  // back to lobby, others → leave room), room code centered, and for the host
  // a round "leave room" button on the right.
  return (
    <RoomToolbar
      style={styles.header}
      backLabel={isHost ? "Lobby" : "Leave"}
      onBack={isHost ? handleEndGame : handleLeaveRoom}
      title={room?.code ?? ""}
      right={
        isHost ? (
          <TouchableOpacity
            onPress={handleLeaveRoom}
            style={styles.leaveBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Leave room"
          >
            <Ionicons name="exit-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.screen,
    paddingTop: 4,
  },
  leaveBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
});
