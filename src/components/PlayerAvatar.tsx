import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { colors, fonts } from "../theme";

interface PlayerAvatarProps {
  username: string;
  size?: number;
  color?: string;
  showBorder?: boolean;
  avatarUrl?: string | null;
}

const AVATAR_PALETTE = [
  "#6D5ACD", // purple
  "#06B6D4", // cyan
  "#10B981", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#EC4899", // pink
  "#3B82F6", // blue
  "#F97316", // orange
];

function hashUsername(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    const char = username.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export default function PlayerAvatar({
  username,
  size = 40,
  color,
  showBorder = false,
  avatarUrl,
}: PlayerAvatarProps) {
  const bgColor =
    color ?? AVATAR_PALETTE[hashUsername(username) % AVATAR_PALETTE.length];

  const firstLetter = username.charAt(0).toUpperCase();
  const fontSize = size * 0.42;
  const radius = size / 2;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: bgColor,
          overflow: "hidden",
        },
        showBorder && {
          borderWidth: 2,
          borderColor: colors.primary,
        },
      ]}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius: radius }}
        />
      ) : (
        <Text
          style={[
            styles.letter,
            {
              fontSize,
              lineHeight: fontSize * 1.2,
            },
          ]}
        >
          {firstLetter}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  letter: {
    fontFamily: fonts.bold,
    color: colors.white,
    textAlign: "center",
  },
});
