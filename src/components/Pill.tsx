import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { colors, fonts, radii } from "../theme";

export type PillTone = "peach" | "lavender" | "dark" | "lime";

interface PillProps {
  label?: string;
  children?: ReactNode;
  tone?: PillTone;
  /** Rotate slightly (~-6deg) so the pill reads like a sticker. */
  tilt?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<PillTone, { bg: string; fg: string; border?: string }> = {
  peach: { bg: colors.peachSticker, fg: colors.onLavender },
  lavender: { bg: colors.lavenderPill, fg: colors.onLavender },
  lime: { bg: colors.lime, fg: colors.onPrimary },
  dark: { bg: colors.cardFill, fg: colors.gray300, border: colors.cardEdge },
};

/** Small rounded uppercase badge. */
export default function Pill({ label, children, tone = "lavender", tilt = false, style }: PillProps) {
  const t = TONES[tone];
  return (
    <View
      style={[
        s.pill,
        { backgroundColor: t.bg },
        t.border ? { borderWidth: 1, borderColor: t.border } : null,
        tilt && s.tilt,
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
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tilt: {
    transform: [{ rotate: "-6deg" }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  text: {
    fontFamily: fonts.extrabold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
