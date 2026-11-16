import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Animated,
  Dimensions,
  StyleSheet,
} from "react-native";
import { colors } from "../theme";

interface ConfettiProps {
  active: boolean;
}

const CONFETTI_COUNT = 30;
const CONFETTI_COLORS = [
  colors.primary,
  colors.accent,
  colors.warning,
  colors.success,
  colors.primaryLight,
];
const SCREEN_HEIGHT = Dimensions.get("window").height;
const SCREEN_WIDTH = Dimensions.get("window").width;

interface ConfettiPiece {
  x: number;
  delay: number;
  size: number;
  color: string;
  isCircle: boolean;
  translateY: Animated.Value;
  translateX: Animated.Value;
  rotate: Animated.Value;
  opacity: Animated.Value;
}

export default function Confetti({ active }: ConfettiProps) {
  const [visible, setVisible] = useState(false);
  const piecesRef = useRef<ConfettiPiece[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (active) {
      // Generate new pieces
      piecesRef.current = Array.from({ length: CONFETTI_COUNT }, () => ({
        x: Math.random() * SCREEN_WIDTH,
        delay: Math.random() * 800,
        size: 6 + Math.random() * 8,
        color:
          CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        isCircle: Math.random() > 0.5,
        translateY: new Animated.Value(-20),
        translateX: new Animated.Value(0),
        rotate: new Animated.Value(0),
        opacity: new Animated.Value(1),
      }));

      setVisible(true);

      // Animate each piece
      piecesRef.current.forEach((piece) => {
        const horizontalDrift = (Math.random() - 0.5) * 120;

        Animated.parallel([
          Animated.timing(piece.translateY, {
            toValue: SCREEN_HEIGHT + 50,
            duration: 2200 + Math.random() * 1000,
            delay: piece.delay,
            useNativeDriver: true,
          }),
          Animated.timing(piece.translateX, {
            toValue: horizontalDrift,
            duration: 2200 + Math.random() * 1000,
            delay: piece.delay,
            useNativeDriver: true,
          }),
          Animated.timing(piece.rotate, {
            toValue: 3 + Math.random() * 5,
            duration: 2200 + Math.random() * 1000,
            delay: piece.delay,
            useNativeDriver: true,
          }),
          Animated.timing(piece.opacity, {
            toValue: 0,
            duration: 800,
            delay: piece.delay + 1800,
            useNativeDriver: true,
          }),
        ]).start();
      });

      // Auto-deactivate after 3 seconds
      timeoutRef.current = setTimeout(() => {
        setVisible(false);
      }, 3000);
    } else {
      setVisible(false);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [active]);

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {piecesRef.current.map((piece, index) => {
        const spin = piece.rotate.interpolate({
          inputRange: [0, 8],
          outputRange: ["0deg", "2880deg"],
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.piece,
              {
                left: piece.x,
                width: piece.size,
                height: piece.size,
                backgroundColor: piece.color,
                borderRadius: piece.isCircle ? piece.size / 2 : 2,
                transform: [
                  { translateY: piece.translateY },
                  { translateX: piece.translateX },
                  { rotate: spin },
                ],
                opacity: piece.opacity,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...(StyleSheet.absoluteFill as object),
    zIndex: 9999,
  },
  piece: {
    position: "absolute",
    top: -20,
  },
});
