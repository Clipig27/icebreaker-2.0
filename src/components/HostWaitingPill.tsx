import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme";

interface HostWaitingPillProps {
  /** Must start with "Waiting for host" (QA matches /Waiting for host.*\/). */
  label?: string;
  /** Spacing overrides so the pill sits where the host's button would be. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared non-host "waiting for host" pill (hourglass + text), used on every
 * game's game-over screen in place of the host's "Back to Lobby" button.
 */
export default function HostWaitingPill({
  label = "Waiting for host...",
  style,
}: HostWaitingPillProps) {
  return (
    <View style={[styles.pill, style]}>
      <Ionicons name="hourglass-outline" size={20} color={colors.gray400} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 10,
    backgroundColor: colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginTop: 16,
  },
  text: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.gray400,
  },
});
