import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { useAuthStore } from "../src/stores/authStore";

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const loading = useAuthStore((s) => s.loading);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    initialize();
  }, []);

  if (!fontsLoaded || loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0E0C1A" }}>
        <ActivityIndicator size="large" color="#6D5ACD" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0E0C1A" },
          animation: "slide_from_right",
        }}
      />
    </>
  );
}
