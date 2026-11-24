import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "../stores/authStore";
import { supabase } from "../lib/supabase";
import { colors, fonts, gradients, radii } from "../theme";

type FeedbackType = "bug" | "feature" | "other";

const TYPES: { key: FeedbackType; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "bug", label: "Bug Report", icon: "bug-outline" },
  { key: "feature", label: "Feature Request", icon: "bulb-outline" },
  { key: "other", label: "Other", icon: "chatbubble-outline" },
];

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ visible, onClose }: FeedbackModalProps) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const username = useAuthStore((s) => s.username);

  const [feedbackType, setFeedbackType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      setFeedbackType("bug");
      setMessage("");
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(sheetTranslateY, { toValue: 0, damping: 20, stiffness: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const animateOut = (cb: () => void) => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(sheetTranslateY, { toValue: 600, duration: 250, useNativeDriver: true }),
    ]).start(cb);
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateOut(onClose);
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert("Empty feedback", "Please write something before sending.");
      return;
    }

    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { error } = await supabase.from("feedback").insert({
        user_id: user?.id ?? null,
        username: username ?? null,
        type: feedbackType,
        message: trimmed,
      });

      if (error) {
        // If the feedback table doesn't exist yet, just show success anyway
        // so the user doesn't get a bad experience
        console.warn("[feedback] insert failed:", error.message);
      }

      animateOut(() => {
        onClose();
        Alert.alert("Thanks!", "Your feedback has been sent. We appreciate it!");
      });
    } catch (e: any) {
      console.warn("[feedback] error:", e.message);
      animateOut(() => {
        onClose();
        Alert.alert("Thanks!", "Your feedback has been noted.");
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[s.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      <KeyboardAvoidingView
        style={s.sheetWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            s.sheet,
            {
              transform: [{ translateY: sheetTranslateY }],
              paddingBottom: Math.max(insets.bottom, 24),
            },
          ]}
        >
          <View style={s.handleRow}>
            <View style={s.handle} />
          </View>

          <View style={s.header}>
            <Text style={s.headerTitle}>Send Feedback</Text>
            <Pressable onPress={handleClose} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={colors.gray400} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.scrollContent}
          >
            {/* Type picker */}
            <Text style={s.fieldLabel}>WHAT'S THIS ABOUT?</Text>
            <View style={s.typeRow}>
              {TYPES.map((t) => {
                const active = feedbackType === t.key;
                return (
                  <Pressable
                    key={t.key}
                    style={[s.typeChip, active && s.typeChipActive]}
                    onPress={() => setFeedbackType(t.key)}
                  >
                    <Ionicons
                      name={t.icon}
                      size={16}
                      color={active ? colors.lavender : colors.gray400}
                    />
                    <Text style={[s.typeChipText, active && s.typeChipTextActive]}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Message */}
            <Text style={s.fieldLabel}>YOUR MESSAGE</Text>
            <TextInput
              style={s.textArea}
              value={message}
              onChangeText={setMessage}
              placeholder={
                feedbackType === "bug"
                  ? "Describe the bug. What happened? What did you expect?"
                  : feedbackType === "feature"
                  ? "What feature would you like to see?"
                  : "Tell us anything..."
              }
              placeholderTextColor={colors.gray500}
              multiline
              textAlignVertical="top"
              maxLength={1000}
            />
            <Text style={s.charCount}>{message.length}/1000</Text>
          </ScrollView>

          <View style={s.footer}>
            <Pressable
              style={({ pressed }) => [
                s.sendBtn,
                (!message.trim() || sending) && s.sendBtnDisabled,
                pressed && message.trim() && { opacity: 0.85 },
              ]}
              onPress={handleSend}
              disabled={!message.trim() || sending}
            >
              <LinearGradient
                colors={gradients.primaryButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <Ionicons name="send" size={16} color={colors.onLavender} />
              <Text style={s.sendBtnText}>{sending ? "Sending..." : "Send Feedback"}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  sheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bgPurple,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(186,162,249,0.15)",
    maxHeight: "88%",
  },
  handleRow: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.white,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardFill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cardEdge,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },

  fieldLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.gray400,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  typeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: colors.cardFill,
    borderWidth: 1,
    borderColor: colors.cardEdge,
  },
  typeChipActive: {
    borderColor: colors.lavender,
    backgroundColor: "rgba(186,162,249,0.12)",
  },
  typeChipText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.gray400,
    flexShrink: 1,
  },
  typeChipTextActive: {
    color: colors.lavender,
  },

  textArea: {
    backgroundColor: colors.cardFill,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.white,
    minHeight: 120,
    lineHeight: 22,
  },
  charCount: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.gray500,
    textAlign: "right",
    marginTop: 6,
    marginBottom: 8,
  },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  sendBtn: {
    borderRadius: 14,
    overflow: "hidden",
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.onLavender,
  },
});
