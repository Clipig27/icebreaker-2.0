import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "../stores/authStore";
import { supabase } from "../lib/supabase";
import { colors, fonts, gradients, radii } from "../theme";

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function EditProfileModal({ visible, onClose }: EditProfileModalProps) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const currentUsername = useAuthStore((s) => s.username) ?? "";
  const currentDisplayName = useAuthStore((s) => s.displayName) ?? "";
  const currentAvatarUrl = useAuthStore((s) => s.avatarUrl);
  const setUsername = useAuthStore((s) => s.setUsername);
  const setDisplayName = useAuthStore((s) => s.setDisplayName);
  const setAvatarUrl = useAuthStore((s) => s.setAvatarUrl);

  const [displayName, setDisplayNameLocal] = useState(currentDisplayName);
  const [username, setUsernameLocal] = useState(currentUsername);
  const [avatarUrl, setAvatarUrlLocal] = useState(currentAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      setDisplayNameLocal(currentDisplayName);
      setUsernameLocal(currentUsername);
      setAvatarUrlLocal(currentAvatarUrl);
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

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    const uri = result.assets[0].uri;
    if (!user) return;

    setUploading(true);
    try {
      const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
      const mimeType = ext === "png" ? "image/png" : "image/jpeg";
      const fileName = `${user.id}/avatar.${ext}`;

      // Use FormData for reliable React Native uploads
      const formData = new FormData();
      formData.append("file", {
        uri,
        name: `avatar.${ext}`,
        type: mimeType,
      } as any);

      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(fileName, formData, { contentType: mimeType, upsert: true });

      if (uploadErr) {
        // Fallback to blob
        const response = await fetch(uri);
        const blob = await response.blob();
        const { error: blobErr } = await supabase.storage
          .from("avatars")
          .upload(fileName, blob, { contentType: mimeType, upsert: true });

        if (blobErr) {
          setAvatarUrlLocal(uri);
        } else {
          const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
          setAvatarUrlLocal(data.publicUrl + "?t=" + Date.now());
        }
      } else {
        const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
        setAvatarUrlLocal(data.publicUrl + "?t=" + Date.now());
      }
    } catch {
      setAvatarUrlLocal(uri);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const trimmedUsername = username.trim();
    const trimmedDisplayName = displayName.trim();

    if (!trimmedUsername) {
      Alert.alert("Username required", "Please enter a username.");
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (trimmedUsername !== currentUsername) {
        await setUsername(trimmedUsername);
      }
      if (trimmedDisplayName !== currentDisplayName) {
        await setDisplayName(trimmedDisplayName);
      }
      if (avatarUrl !== currentAvatarUrl && avatarUrl) {
        await setAvatarUrl(avatarUrl);
      }
      animateOut(onClose);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    username.trim() !== currentUsername ||
    displayName.trim() !== currentDisplayName ||
    avatarUrl !== currentAvatarUrl;

  const initial = (username || "?").charAt(0).toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Dimmed backdrop */}
      <Animated.View style={[s.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
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
          {/* Handle bar */}
          <View style={s.handleRow}>
            <View style={s.handle} />
          </View>

          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerTitle}>Edit profile</Text>
            <Pressable onPress={handleClose} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={colors.gray400} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.scrollContent}
          >
            {/* Avatar */}
            <View style={s.avatarSection}>
              <Pressable onPress={pickImage} disabled={uploading}>
                <LinearGradient
                  colors={gradients.avatarTile}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.avatar}
                >
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={s.avatarImage} />
                  ) : (
                    <Text style={s.avatarText}>{initial}</Text>
                  )}
                </LinearGradient>
                <View style={s.cameraBadge}>
                  <Ionicons
                    name={uploading ? "hourglass-outline" : "camera"}
                    size={14}
                    color={colors.white}
                  />
                </View>
              </Pressable>
              <Text style={s.changePhotoText}>Tap to change photo</Text>
            </View>

            {/* Fields */}
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>DISPLAY NAME</Text>
              <TextInput
                style={s.input}
                value={displayName}
                onChangeText={setDisplayNameLocal}
                placeholder="Your display name"
                placeholderTextColor={colors.gray500}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={30}
              />
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>USERNAME</Text>
              <TextInput
                style={s.input}
                value={username}
                onChangeText={setUsernameLocal}
                placeholder="Your username"
                placeholderTextColor={colors.gray500}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
            </View>
          </ScrollView>

          {/* Save button */}
          <View style={s.footer}>
            <Pressable
              style={({ pressed }) => [
                s.saveBtn,
                (!hasChanges || saving) && s.saveBtnDisabled,
                pressed && hasChanges && { opacity: 0.85 },
              ]}
              onPress={handleSave}
              disabled={!hasChanges || saving}
            >
              <LinearGradient
                colors={gradients.primaryButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <Text style={s.saveBtnText}>{saving ? "Saving..." : "Save changes"}</Text>
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

  // Avatar
  avatarSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 24,
  },
  avatarText: {
    fontFamily: fonts.extrabold,
    fontSize: 40,
    color: colors.onLavender,
  },
  cameraBadge: {
    position: "absolute",
    bottom: -2,
    right: -6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.lavender,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.bgPurple,
  },
  changePhotoText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray400,
    marginTop: 10,
  },

  // Fields
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.gray400,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.cardFill,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
  },

  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  saveBtn: {
    borderRadius: 14,
    overflow: "hidden",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.onLavender,
  },
});
