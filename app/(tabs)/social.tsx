import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
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
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 32 },
  heading: { fontFamily: fonts.bold, fontSize: 30, color: colors.white, marginBottom: 4 },
  sub: { fontFamily: fonts.regular, fontSize: 16, color: colors.gray400, marginBottom: 32 },
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
