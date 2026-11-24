import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated as RNAnimated,
  Easing,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { colors, fonts } from "../src/theme";
import { useAuthStore } from "../src/stores/authStore";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function UsernameSetup() {
  const router = useRouter();
  const setUsername = useAuthStore((s) => s.setUsername);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const valid = /^[a-zA-Z0-9_]{3,16}$/.test(name);

  // RN Animated values for entrance & float
  const emojiAnim = useRef(new RNAnimated.Value(0)).current;
  const titleAnim = useRef(new RNAnimated.Value(0)).current;
  const subAnim = useRef(new RNAnimated.Value(0)).current;
  const formAnim = useRef(new RNAnimated.Value(0)).current;
  const floatAnim = useRef(new RNAnimated.Value(0)).current;

  // Reanimated value for button press
  const btnScale = useSharedValue(1);
  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  useEffect(() => {
    // Staggered entrance
    RNAnimated.stagger(150, [
      RNAnimated.timing(emojiAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      RNAnimated.timing(titleAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      RNAnimated.timing(subAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      RNAnimated.timing(formAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();

    // Floating emoji animation: 0 → -8 → 0 → 8 → 0 (smooth continuous bob)
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(floatAnim, {
          toValue: -8,
          duration: 1000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        RNAnimated.timing(floatAnim, {
          toValue: 8,
          duration: 2000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        RNAnimated.timing(floatAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
      ])
    ).start();
  }, []);

  const handleSubmit = async () => {
    if (!valid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      await setUsername(name);
      router.replace("/(tabs)/play");
    } catch (e: any) {
      const msg = e.message?.includes("username_lower_key")
        ? "That username is taken"
        : e.message ?? "Something went wrong";
      Alert.alert("Error", msg);
    }
    setLoading(false);
  };

  const onBtnPressIn = () => {
    btnScale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
  };
  const onBtnPressOut = () => {
    btnScale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const makeSlideStyle = (anim: RNAnimated.Value) => ({
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={s.container}
    >
      <View style={s.content}>
        <RNAnimated.View style={[makeSlideStyle(emojiAnim)]}>
          <RNAnimated.Text
            style={[s.emoji, { transform: [{ translateY: floatAnim }] }]}
          >
            ⚡
          </RNAnimated.Text>
        </RNAnimated.View>

        <RNAnimated.Text style={[s.heading, makeSlideStyle(titleAnim)]}>
          Pick a username
        </RNAnimated.Text>

        <RNAnimated.Text style={[s.sub, makeSlideStyle(subAnim)]}>
          This is how you'll appear in every game.{"\n"}Letters, numbers, and _ only.
        </RNAnimated.Text>

        <RNAnimated.View style={[{ width: "100%" }, makeSlideStyle(formAnim)]}>
          <TextInput
            placeholder="username"
            placeholderTextColor={colors.gray500}
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={16}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[
              s.input,
              focused && s.inputFocused,
              name.length > 0 && !valid && s.inputError,
            ]}
          />

          <AnimatedPressable
            onPress={handleSubmit}
            onPressIn={onBtnPressIn}
            onPressOut={onBtnPressOut}
            disabled={!valid || loading}
            style={[s.btn, !valid && s.btnDisabled, btnAnimStyle]}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={s.btnText}>Let's Go →</Text>
            )}
          </AnimatedPressable>
        </RNAnimated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  heading: { fontFamily: fonts.bold, fontSize: 28, color: colors.white, marginBottom: 8 },
  sub: { fontFamily: fonts.regular, fontSize: 14, color: colors.gray400, textAlign: "center", marginBottom: 32 },
  input: {
    width: "100%",
    backgroundColor: colors.surface,
    color: colors.white,
    fontFamily: fonts.bold,
    textAlign: "center",
    fontSize: 22,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 16,
  },
  inputFocused: { borderColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  inputError: { borderColor: colors.danger },
  btn: {
    width: "100%",
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontFamily: fonts.bold, fontSize: 18, color: colors.white },
});
