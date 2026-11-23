import type { ComponentProps, ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts, gradients, radii, spacing } from "../theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

export type PrimaryActionVariant = "primary" | "dark" | "ghost";

interface PrimaryActionProps {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  /** Where to render the icon relative to the label. Defaults to "right". */
  iconPosition?: "left" | "right";
  disabled?: boolean;
  loading?: boolean;
  variant?: PrimaryActionVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const VARIANTS: Record<PrimaryActionVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.lavender, fg: colors.onLavender },
  dark: { bg: colors.cardRaised, fg: colors.white, border: colors.cardBorder },
  ghost: { bg: "transparent", fg: colors.white, border: colors.cardBorder },
};

/** Full-width lavender action button with dark bold text. */
export default function PrimaryAction({
  label,
  onPress,
  icon,
  iconPosition = "right",
  disabled = false,
  loading = false,
  variant = "primary",
  style,
  testID,
}: PrimaryActionProps) {
  const v = VARIANTS[variant];
  const inactive = disabled || loading;
  const iconEl = icon ? <Ionicons name={icon} size={18} color={v.fg} /> : null;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        s.base,
        { backgroundColor: variant === "primary" ? "transparent" : v.bg },
        v.border ? { borderWidth: 1, borderColor: v.border } : null,
        inactive && s.dimmed,
        pressed && !inactive && s.pressed,
        style,
      ]}
    >
      {variant === "primary" ? (
        <LinearGradient
          colors={gradients.primaryButton}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.6, y: 1 }}
          style={[StyleSheet.absoluteFill, s.fillRadius]}
          pointerEvents="none"
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : (
        <View style={s.inner}>
          {iconPosition === "left" && iconEl}
          <Text style={[s.label, { color: v.fg }]} numberOfLines={1}>
            {label}
          </Text>
          {iconPosition === "right" && iconEl}
        </View>
      )}
    </Pressable>
  );
}

interface PrimaryActionBarProps {
  children: ReactNode;
  helperText?: string;
  style?: StyleProp<ViewStyle>;
}

/** Footer wrapper that pins actions to the bottom with safe-area padding. */
export function PrimaryActionBar({ children, helperText, style }: PrimaryActionBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, spacing.lg) }, style]}>
      {helperText ? <Text style={s.helper}>{helperText}</Text> : null}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  base: {
    alignSelf: "stretch",
    minHeight: 54,
    borderRadius: radii.md,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 16,
    letterSpacing: 0.1,
  },
  fillRadius: { borderRadius: radii.md },
  dimmed: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  bar: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    backgroundColor: "transparent",
    gap: spacing.md,
  },
  helper: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray400,
    textAlign: "center",
  },
});
