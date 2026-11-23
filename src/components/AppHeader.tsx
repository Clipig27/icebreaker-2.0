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
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: "#7B5CE6",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: { fontFamily: fonts.extrabold, fontSize: 19, color: colors.white, letterSpacing: -0.3 },
  gear: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardFill,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    alignItems: "center",
    justifyContent: "center",
  },
});
