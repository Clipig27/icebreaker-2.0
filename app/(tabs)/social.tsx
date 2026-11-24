import { useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../src/theme";

export default function Social() {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.content}>
        {/* Top bar */}
        <View style={s.topBar}>
          <View style={s.topBarLeft}>
            <Ionicons name="flash" size={20} color={colors.primaryLight} />
            <Text style={s.topBarTitle}>Icebreaker</Text>
          </View>
          <Pressable style={s.settingsCircle}>
            <Ionicons name="settings-outline" size={20} color={colors.gray400} />
          </Pressable>
        </View>

        <Text style={s.heading}>Social</Text>
        <Text style={s.sub}>Friends and invites</Text>

        <Animated.View style={[s.center, { opacity: fadeAnim }]}>
          <View style={s.iconContainer}>
            <Ionicons name="people-outline" size={64} color={colors.primary} />
          </View>
          <Text style={s.title}>Friends & Invites</Text>
          <Text style={s.placeholder}>Coming soon</Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  topBarLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  topBarTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.white },
  settingsCircle: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border,
  },

  heading: { fontFamily: fonts.extrabold, fontSize: 36, color: colors.white, marginBottom: 4 },
  sub: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray400, marginBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 128 },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontFamily: fonts.semibold, fontSize: 20, color: colors.white, marginBottom: 8 },
  placeholder: { fontFamily: fonts.regular, fontSize: 15, color: colors.gray500 },
});
