import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii } from "../theme";

interface AppHeaderProps {
  onSettings?: () => void;
}

/** Tab-screen header: purple bolt tile + "Icebreaker" wordmark, round gear button. */
export default function AppHeader({ onSettings }: AppHeaderProps) {
  return (
    <View style={s.row}>
      <View style={s.left}>
        <View style={s.logoTile}>
          <Ionicons name="flash" size={18} color={colors.white} />
        </View>
        <Text style={s.wordmark}>Icebreaker</Text>
      </View>
      <Pressable
        onPress={onSettings}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        style={({ pressed }) => [s.gear, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="settings-outline" size={19} color={colors.gray300} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 24,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoTile: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: { fontFamily: fonts.extrabold, fontSize: 19, color: colors.white, letterSpacing: -0.3 },
  gear: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
});
