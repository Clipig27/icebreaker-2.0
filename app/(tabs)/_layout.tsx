import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../src/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 88,
          paddingBottom: 28,
          paddingTop: 12,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray500,
        tabBarLabelStyle: {
          fontFamily: fonts.semibold,
          fontSize: 12,
        },
      }}
    >
      <Tabs.Screen
        name="play"
        options={{
          title: "Play",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="game-controller" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: "Games",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: "Social",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}
