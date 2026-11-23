import type { ReactNode } from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, radii } from "../theme";

interface HeroGradientProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}

const BLOB = 200;

/**
 * Evenly saturated lavender → violet diagonal card (#D6C4FA → #B79CEF →
 * #A484EA) with a soft white highlight in the top-left corner.
 */
export default function HeroGradient({ children, style, radius = radii.xl }: HeroGradientProps) {
  return (
    <LinearGradient
      colors={gradients.hero}
      locations={[0, 0.3, 0.6, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius, overflow: "hidden" }, style]}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0.07)", "rgba(255,255,255,0)"]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.2, y: 0.2 }}
        end={{ x: 0.85, y: 0.85 }}
        style={s.blob}
        pointerEvents="none"
      />
      {/* Inner top hairline for a slightly glossy edge */}
      <View style={[s.edge, { borderRadius: radius }]} pointerEvents="none" />
      <View>{children}</View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  blob: {
    position: "absolute",
    width: BLOB,
    height: BLOB,
    borderRadius: BLOB / 2,
    top: -BLOB * 0.5,
    left: -BLOB * 0.4,
  },
  edge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
});
