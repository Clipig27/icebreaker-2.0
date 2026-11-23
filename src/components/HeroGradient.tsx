import type { ReactNode } from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, radii } from "../theme";

interface HeroGradientProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}

const BLOB = 220;

/** Lavender → violet diagonal card with a soft white highlight in the top-left. */
export default function HeroGradient({ children, style, radius = radii.xl }: HeroGradientProps) {
  return (
    <LinearGradient
      colors={gradients.hero}
      locations={[0, 0.35, 0.7, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius, overflow: "hidden" }, style]}
    >
      <LinearGradient
        colors={gradients.highlightBlob}
        locations={[0, 0.4, 1]}
        start={{ x: 0.2, y: 0.2 }}
        end={{ x: 0.85, y: 0.85 }}
        style={s.blob}
        pointerEvents="none"
      />
      {/* faint darker sheen bottom-right for depth */}
      <LinearGradient
        colors={["rgba(82,64,168,0)", "rgba(82,64,168,0.18)"]}
        start={{ x: 0.4, y: 0.4 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
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
    top: -BLOB * 0.45,
    left: -BLOB * 0.35,
  },
});
