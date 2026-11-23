import { View, StyleSheet, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "../theme";

/**
 * Static screen background: dark purple vertical base (#221A35 → #1C172B →
 * #1A1527) with a soft lavender glow at the top-left / top-center. The glow is
 * built from large circles whose own gradients fade to transparent so there is
 * no visible banding edge.
 */
export default function ScreenBackground() {
  const { width, height } = useWindowDimensions();
  const orb = width * 1.5;
  const orb2 = width * 1.1;

  return (
    <View style={[StyleSheet.absoluteFill, s.base]} pointerEvents="none">
      <LinearGradient
        colors={gradients.screenBase}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.3, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Soft top glow fading out by ~40% of the height */}
      <LinearGradient
        colors={gradients.screenGlow}
        locations={[0, 0.18, 0.4]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Top-left orb */}
      <LinearGradient
        colors={["rgba(186,162,249,0.09)", "rgba(186,162,249,0.03)", "rgba(186,162,249,0)"]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.3, y: 0.3 }}
        end={{ x: 0.8, y: 0.9 }}
        style={{
          position: "absolute",
          width: orb,
          height: orb,
          borderRadius: orb / 2,
          top: -orb * 0.55,
          left: -orb * 0.4,
        }}
      />
      {/* Top-center orb */}
      <LinearGradient
        colors={["rgba(186,162,249,0.06)", "rgba(186,162,249,0.02)", "rgba(186,162,249,0)"]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0.2 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: "absolute",
          width: orb2,
          height: orb2,
          borderRadius: orb2 / 2,
          top: -orb2 * 0.5,
          left: width * 0.5 - orb2 / 2,
        }}
      />
      {/* Very faint deepening towards the bottom */}
      <LinearGradient
        colors={["rgba(16,14,24,0)", "rgba(16,14,24,0.18)"]}
        start={{ x: 0.5, y: 0.6 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { top: height * 0.4 }]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  base: { backgroundColor: colors.bgPurple, zIndex: -1 },
});
