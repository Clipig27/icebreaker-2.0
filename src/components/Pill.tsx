import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { colors, fonts, radii } from "../theme";

export type PillTone = "peach" | "lavender" | "dark" | "lime";

interface PillProps {
  label?: string;
  children?: ReactNode;
  tone?: PillTone;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<PillTone, { bg: string; fg: string; border?: string }> = {
  peach: { bg: colors.peach, fg: colors.onPrimary },
  lavender: { bg: colors.highlight, fg: colors.onPrimary },
  lime: { bg: colors.lime, fg: colors.onPrimary },
  dark: { bg: colors.surface, fg: colors.gray300, border: colors.cardBorder },
};

/** Small rounded uppercase badge. */
export default function Pill({ label, children, tone = "lavender", style }: PillProps) {
  const t = TONES[tone];
  return (
    <View
      style={[
        s.pill,
        { backgroundColor: t.bg },
        t.border ? { borderWidth: 1, borderColor: t.border } : null,
        style,
      ]}
    >
      {label != null ? <Text style={[s.text, { color: t.fg }]}>{label}</Text> : children}
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
