import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { colors, fonts } from "../theme";

type ButtonVariant = "primary" | "secondary" | "danger";

interface AnimatedButtonProps {
  onPress: () => void;
  title: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function AnimatedButton({
  onPress,
  title,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
}: AnimatedButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, {
      damping: 15,
      stiffness: 300,
    });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, {
      damping: 15,
      stiffness: 300,
    });
  };

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const textColor =
    variant === "danger" ? colors.danger : colors.white;

  const renderContent = () => (
    <>
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>{title}</Text>
      )}
    </>
  );

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled || loading}
      style={[animatedStyle, disabled && styles.disabled, style]}
    >
      {variant === "primary" ? (
        <LinearGradient
          colors={["#6D5ACD", "#5240A8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.buttonBase}
        >
          {renderContent()}
        </LinearGradient>
      ) : (
        <Animated.View
          style={[
            styles.buttonBase,
            variant === "secondary" && styles.secondary,
            variant === "danger" && styles.danger,
          ]}
        >
          {renderContent()}
        </Animated.View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  buttonBase: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.surfaceLight,
  },
  danger: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: `${colors.danger}4D`, // 30% opacity
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: 17,
    textAlign: "center",
  },
  disabled: {
    opacity: 0.5,
  },
});
