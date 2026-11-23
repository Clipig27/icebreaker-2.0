import { Text, StyleProp, TextStyle } from "react-native";
import type { ReactNode } from "react";
import { colors, type } from "../theme";

interface EyebrowProps {
  children: ReactNode;
  tone?: "gray" | "lavender" | "dark";
  style?: StyleProp<TextStyle>;
}

/** Small uppercase label used above sections and inside cards. */
export default function Eyebrow({ children, tone = "gray", style }: EyebrowProps) {
  const color =
    tone === "lavender" ? colors.lavender : tone === "dark" ? "rgba(26,20,39,0.72)" : colors.gray400;
  return <Text style={[type.eyebrow, { color }, style]}>{children}</Text>;
}
