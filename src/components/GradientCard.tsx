import type { ReactNode } from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, radii } from "../theme";

type GradientStops = readonly [string, string, ...string[]];

interface GradientCardProps {
  children?: ReactNode;
  /** Outer style (margins, flex, width). */
  style?: StyleProp<ViewStyle>;
  /** Inner content style (padding, layout). */
  contentStyle?: StyleProp<ViewStyle>;
  radius?: number;
  /** Fill gradient; defaults to surface + faint lavender sheen. */
  fill?: GradientStops;
  borderColors?: GradientStops;
}

/** Dark rounded card with a 1px gradient edge and subtle inner sheen. */
export default function GradientCard({
  children,
  style,
  contentStyle,
  radius = radii.xl,
  fill,
  borderColors = gradients.cardBorder,
}: GradientCardProps) {
  return (
    <LinearGradient
      colors={borderColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius, padding: 1 }, style]}
    >
      <View style={[s.inner, { borderRadius: radius - 1 }]}>
        <LinearGradient
          colors={fill ?? gradients.card}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={contentStyle}>{children}</View>
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  inner: {
    flexGrow: 1,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
});
