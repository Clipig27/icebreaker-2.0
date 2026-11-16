import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";
import { colors, fonts } from "../src/theme";

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password || !username) return;
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Check your email", "We sent you a confirmation link.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={s.container}
    >
      <View style={s.content}>
        <Pressable onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>Back</Text>
        </Pressable>

        <Text style={s.heading}>Create account</Text>

        <View style={s.inputs}>
          <TextInput
            placeholder="Username"
            placeholderTextColor={colors.gray500}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            style={s.input}
          />
          <TextInput
            placeholder="Email"
            placeholderTextColor={colors.gray500}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={s.input}
          />
          <TextInput
            placeholder="Password"
            placeholderTextColor={colors.gray500}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={s.input}
          />
        </View>

        <Pressable onPress={handleSignUp} disabled={loading} style={s.btn}>
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={s.btnText}>Create Account</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  back: { marginBottom: 32 },
  backText: { fontFamily: fonts.regular, fontSize: 16, color: colors.primaryLight },
  heading: { fontFamily: fonts.bold, fontSize: 30, color: colors.white, marginBottom: 32 },
  inputs: { gap: 16, marginBottom: 32 },
  input: {
    backgroundColor: colors.surface,
    color: colors.white,
    fontFamily: fonts.regular,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  btnText: { fontFamily: fonts.bold, fontSize: 18, color: colors.white },
});
