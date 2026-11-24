import type { ComponentProps } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii } from "../../src/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

function TabPill({
  focused,
  label,
  icon,
  iconActive,
}: {
  focused: boolean;
  label: string;
  icon: IconName;
  iconActive: IconName;
}) {
  const color = focused ? colors.lavender : colors.gray400;
  return (
    <View style={[s.pill, focused && s.pillActive]}>
      <Ionicons name={focused ? iconActive : icon} size={19} color={color} />
      <Text style={[s.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: "rgba(186,162,249,0.10)",
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 68 + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 8,
        },
        tabBarItemStyle: { alignItems: "center", justifyContent: "center" },
        tabBarIconStyle: { width: "100%", height: 52 },
        tabBarActiveTintColor: colors.lavender,
        tabBarInactiveTintColor: colors.gray500,
      }}
    >
      <Tabs.Screen
        name="play"
        options={{
          title: "Play",
          tabBarIcon: ({ focused }) => (
            <TabPill focused={focused} label="Play" icon="game-controller-outline" iconActive="game-controller" />
          ),
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: "Games",
          tabBarIcon: ({ focused }) => (
            <TabPill focused={focused} label="Games" icon="grid-outline" iconActive="grid" />
          ),
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: "Friends",
          tabBarIcon: ({ focused }) => (
            <TabPill focused={focused} label="Friends" icon="people-outline" iconActive="people" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabPill focused={focused} label="Profile" icon="person-outline" iconActive="person" />
          ),
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  pill: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    height: 50,
    minWidth: 78,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  pillActive: {
    backgroundColor: colors.cardFill,
    borderWidth: 1,
    borderColor: "rgba(186,162,249,0.10)",
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
  },
});
