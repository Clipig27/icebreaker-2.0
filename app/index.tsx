import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuthStore } from "../src/stores/authStore";
import { colors } from "../src/theme";

export default function Index() {
  const router = useRouter();
  const loading = useAuthStore((s) => s.loading);
  const needsUsername = useAuthStore((s) => s.needsUsername);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/welcome");
    } else if (needsUsername) {
      router.replace("/username-setup");
    } else {
      router.replace("/(tabs)/play");
    }
  }, [loading, user, needsUsername]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
