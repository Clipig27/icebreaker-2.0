import { View, StyleSheet, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "../theme";

/**
 * Static screen background: near-black purple with a soft purple glow at the
 * top fading out by ~45% of the height, plus a faint offset "orb" for depth.
 */
export default function ScreenBackground() {
  const { width } = useWindowDimensions();
  const orb = width * 1.3;

  return (
    <View style={[StyleSheet.absoluteFill, s.base]} pointerEvents="none">
      <LinearGradient
        colors={gradients.screenGlow}
        locations={[0, 0.2, 0.45]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Radial-ish orb: a big circle whose own gradient fades to transparent */}
      <LinearGradient
        colors={["rgba(155,143,219,0.16)", "rgba(109,90,205,0.06)", "rgba(109,90,205,0)"]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: "absolute",
          width: orb,
          height: orb,
          borderRadius: orb / 2,
          top: -orb * 0.55,
          left: width * 0.25,
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  base: { backgroundColor: colors.background, zIndex: -1 },
});
