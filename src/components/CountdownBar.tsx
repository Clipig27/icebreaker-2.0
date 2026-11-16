import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing, StyleSheet } from "react-native";
import { colors, fonts } from "../theme";

interface CountdownBarProps {
  seconds: number;
  onExpire: () => void;
  paused?: boolean;
  color?: string;
}

export default function CountdownBar({
  seconds,
  onExpire,
  paused = false,
  color = colors.primary,
}: CountdownBarProps) {
  const progress = useRef(new Animated.Value(1)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const remainingRef = useRef(seconds);
  const startTimeRef = useRef<number>(0);

  // Derive seconds remaining for display
  const secondsLeft = useRef(new Animated.Value(seconds)).current;

  // Use a state for the displayed seconds text
  const [displaySeconds, setDisplaySeconds] = React.useState(seconds);

  useEffect(() => {
    // Update display seconds via listener
    const listenerId = progress.addListener(({ value }) => {
      const secs = Math.ceil(value * seconds);
      setDisplaySeconds(secs);
    });

    return () => {
      progress.removeListener(listenerId);
    };
  }, [seconds]);

  useEffect(() => {
    if (paused) {
      // Stop current animation and record remaining
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
      return;
    }

    // Start or resume animation
    // Get the current progress value to calculate remaining duration
    let currentValue = 1;
    const listenerId = progress.addListener(({ value }) => {
      currentValue = value;
    });
    // Force a read
    progress.removeListener(listenerId);

    // We need to get the current animated value; use __getValue for RN Animated
    const currentProgress = (progress as any).__getValue
      ? (progress as any).__getValue()
      : 1;
    const remainingDuration = currentProgress * seconds * 1000;

    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: remainingDuration,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    animationRef.current = animation;

    animation.start(({ finished }) => {
      if (finished) {
        onExpire();
      }
    });

    return () => {
      animation.stop();
    };
  }, [paused]);

  // Reset when seconds prop changes
  useEffect(() => {
    progress.setValue(1);
    setDisplaySeconds(seconds);

    if (!paused) {
      const animation = Animated.timing(progress, {
        toValue: 0,
        duration: seconds * 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      });

      animationRef.current = animation;

      animation.start(({ finished }) => {
        if (finished) {
          onExpire();
        }
      });

      return () => {
        animation.stop();
      };
    }
  }, [seconds]);

  // Interpolate bar color based on progress
  const barColor = progress.interpolate({
    inputRange: [0, 0.15, 0.30, 1],
    outputRange: [colors.danger, colors.danger, colors.warning, color],
  });

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <Text style={styles.secondsText}>{displaySeconds}s</Text>
      <View style={styles.trackBar}>
        <Animated.View
          style={[
            styles.fillBar,
            {
              width: barWidth,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  secondsText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.gray400,
    marginBottom: 4,
  },
  trackBar: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: `${colors.surfaceLight}80`, // 50% opacity
    overflow: "hidden",
  },
  fillBar: {
    height: "100%",
    borderRadius: 3,
  },
});
