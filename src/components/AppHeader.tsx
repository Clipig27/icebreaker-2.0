import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii } from "../theme";

interface AppHeaderProps {
  onSettings?: () => void;
}

/** Tab-screen header: purple bolt tile + "Icebreaker" wordmark, store + gear buttons. */
export default function AppHeader({ onSettings }: AppHeaderProps) {
  const router = useRouter();
  return (
    <View style={s.row}>
      <View style={s.left}>
        <View style={s.logoTile}>
          <Ionicons name="flash" size={18} color={colors.white} />
        </View>
        <Text style={s.wordmark}>Icebreaker</Text>
      </View>
      <View style={s.right}>
        <Pressable
          onPress={() => router.push("/store")}
          accessibilityRole="button"
          accessibilityLabel="Store"
          style={({ pressed }) => [s.storeBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="cart" size={17} color={colors.goldStat} />
        </Pressable>
        <Pressable
          onPress={onSettings}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={({ pressed }) => [s.gear, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="settings-outline" size={19} color={colors.gray300} />
        </Pressable>
      </View>
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
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  storeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(240,198,106,0.12)",
    borderWidth: 1,
    borderColor: "rgba(240,198,106,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
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
