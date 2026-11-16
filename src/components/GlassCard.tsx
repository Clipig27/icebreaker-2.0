import React, { useState } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { colors } from "../theme";

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  tint?: "dark" | "light" | "default";
}

export default function GlassCard({
  children,
  style,
  intensity = 40,
  tint = "dark",
}: GlassCardProps) {
  const [blurFailed, setBlurFailed] = useState(false);

  if (blurFailed) {
    return (
      <View style={[styles.fallbackContainer, style]}>
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.outerContainer, style]}>
      <BlurView
        intensity={intensity}
        tint={tint}
        style={styles.blurView}
        onLayout={() => {}}
        // If BlurView fails on certain simulators, catch and fallback
        {...({
          onError: () => setBlurFailed(true),
        } as any)}
      >
        <View style={styles.innerContainer}>{children}</View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: `${colors.surfaceLight}4D`, // 30% opacity
  },
  blurView: {
    flex: 1,
  },
  innerContainer: {
    padding: 16,
    // Subtle inner shadow feel via top/left highlight
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    borderLeftColor: "rgba(255, 255, 255, 0.04)",
  },
  fallbackContainer: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: `${colors.surfaceLight}4D`, // 30% opacity
    backgroundColor: `${colors.surface}D9`, // 85% opacity
    padding: 16,
    // Subtle inner shadow feel
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    borderLeftColor: "rgba(255, 255, 255, 0.04)",
  },
});
