import { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii } from "../src/theme";
import ScreenBackground from "../src/components/ScreenBackground";
import RoomToolbar from "../src/components/RoomToolbar";
import GradientCard from "../src/components/GradientCard";
import Eyebrow from "../src/components/Eyebrow";
import { useAuthStore } from "../src/stores/authStore";

type StoreItem = {
  id: string;
  name: string;
  desc: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  trophyCost: number | null;
  priceCents: number | null;
  category: "pass" | "cosmetic" | "pack" | "utility";
  color: string;
};

const STORE_ITEMS: StoreItem[] = [
  // Party Pass
  {
    id: "party_pass",
    name: "Party Pass",
    desc: "All games forever. No ads. OG badge.",
    icon: "star",
    trophyCost: null,
    priceCents: 499,
    category: "pass",
    color: "#F5C842",
  },
  // Utility
  {
    id: "remove_ads",
    name: "Remove Ads",
    desc: "No more ads between games.",
    icon: "close-circle",
    trophyCost: 500,
    priceCents: 299,
    category: "utility",
    color: "#EF4444",
  },
  // Cosmetics
  {
    id: "gold_frame",
    name: "Gold Profile Frame",
    desc: "A golden frame around your avatar.",
    icon: "square-outline",
    trophyCost: 100,
    priceCents: 99,
    category: "cosmetic",
    color: "#F0C66A",
  },
  {
    id: "diamond_frame",
    name: "Diamond Profile Frame",
    desc: "A diamond frame that shows you mean business.",
    icon: "diamond-outline",
    trophyCost: 250,
    priceCents: 199,
    category: "cosmetic",
    color: "#8FE6DA",
  },
  {
    id: "rainbow_name",
    name: "Rainbow Name",
    desc: "Your name shows in rainbow colors in the lobby.",
    icon: "color-palette",
    trophyCost: 150,
    priceCents: 149,
    category: "cosmetic",
    color: "#A78BFA",
  },
  {
    id: "confetti_effect",
    name: "Winner Confetti",
    desc: "Custom confetti explosion when you win.",
    icon: "sparkles",
    trophyCost: 75,
    priceCents: 99,
    category: "cosmetic",
    color: "#F472B6",
  },
  // Game Packs
  {
    id: "spicy_pack",
    name: "Spicy Questions Pack",
    desc: "21+ questions for Pie Charts and Smarty Pot.",
    icon: "flame",
    trophyCost: 200,
    priceCents: 199,
    category: "pack",
    color: "#EF4444",
  },
  {
    id: "work_pack",
    name: "Work Edition Pack",
    desc: "Team-building questions. Office-safe.",
    icon: "briefcase",
    trophyCost: 150,
    priceCents: 149,
    category: "pack",
    color: "#3B82F6",
  },
];

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function StoreScreen() {
  const router = useRouter();
  const trophies = useAuthStore((s) => s.trophies);

  const handleBuyTrophies = (item: StoreItem) => {
    if (item.trophyCost && trophies >= item.trophyCost) {
      Alert.alert(
        "Confirm Purchase",
        `Spend ${item.trophyCost} trophies on ${item.name}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Buy",
            onPress: async () => {
              await useAuthStore.getState().addTrophies(-item.trophyCost!);
              Alert.alert("Purchased!", `${item.name} is now yours.`);
            },
          },
        ]
      );
    } else if (item.trophyCost) {
      Alert.alert("Not enough trophies", `You need ${item.trophyCost} trophies. You have ${trophies}.`);
    }
  };

  const handleBuyMoney = (item: StoreItem) => {
    Alert.alert("Coming Soon", "Real-money purchases will be available when the app launches on the App Store.");
  };

  const pass = STORE_ITEMS.filter((i) => i.category === "pass");
  const cosmetics = STORE_ITEMS.filter((i) => i.category === "cosmetic");
  const packs = STORE_ITEMS.filter((i) => i.category === "pack");
  const utilities = STORE_ITEMS.filter((i) => i.category === "utility");

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenBackground />
      <RoomToolbar
        backLabel="Profile"
        title="STORE"
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/profile");
        }}
      />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Trophy balance */}
        <View style={s.balanceRow}>
          <Ionicons name="trophy" size={20} color={colors.goldStat} />
          <Text style={s.balanceText}>{trophies} trophies</Text>
        </View>

        {/* Party Pass */}
        <Eyebrow style={s.sectionLabel}>PARTY PASS</Eyebrow>
        {pass.map((item) => (
          <StoreCard key={item.id} item={item} onBuyTrophies={handleBuyTrophies} onBuyMoney={handleBuyMoney} />
        ))}

        {/* Game Packs */}
        <Eyebrow style={s.sectionLabel}>GAME PACKS</Eyebrow>
        {packs.map((item) => (
          <StoreCard key={item.id} item={item} onBuyTrophies={handleBuyTrophies} onBuyMoney={handleBuyMoney} />
        ))}

        {/* Cosmetics */}
        <Eyebrow style={s.sectionLabel}>COSMETICS</Eyebrow>
        {cosmetics.map((item) => (
          <StoreCard key={item.id} item={item} onBuyTrophies={handleBuyTrophies} onBuyMoney={handleBuyMoney} />
        ))}

        {/* Utilities */}
        <Eyebrow style={s.sectionLabel}>UTILITIES</Eyebrow>
        {utilities.map((item) => (
          <StoreCard key={item.id} item={item} onBuyTrophies={handleBuyTrophies} onBuyMoney={handleBuyMoney} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function StoreCard({
  item,
  onBuyTrophies,
  onBuyMoney,
}: {
  item: StoreItem;
  onBuyTrophies: (item: StoreItem) => void;
  onBuyMoney: (item: StoreItem) => void;
}) {
  const isPass = item.category === "pass";
  return (
    <GradientCard
      radius={radii.lg}
      style={s.cardWrap}
      contentStyle={[s.card, isPass && s.cardPass]}
    >
      <View style={[s.iconWrap, { backgroundColor: item.color + "20" }]}>
        <Ionicons name={item.icon} size={24} color={item.color} />
      </View>
      <View style={s.cardBody}>
        <Text style={[s.cardName, isPass && { color: item.color }]}>{item.name}</Text>
        <Text style={s.cardDesc}>{item.desc}</Text>
        <View style={s.priceRow}>
          {item.trophyCost !== null && (
            <Pressable
              style={({ pressed }) => [s.buyBtn, s.buyTrophy, pressed && { opacity: 0.7 }]}
              onPress={() => onBuyTrophies(item)}
            >
              <Ionicons name="trophy" size={12} color={colors.goldStat} />
              <Text style={s.buyTrophyText}>{item.trophyCost}</Text>
            </Pressable>
          )}
          {item.priceCents !== null && (
            <Pressable
              style={({ pressed }) => [s.buyBtn, s.buyMoney, pressed && { opacity: 0.7 }]}
              onPress={() => onBuyMoney(item)}
            >
              <Text style={s.buyMoneyText}>{formatPrice(item.priceCents)}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </GradientCard>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPurple },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },

  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
    alignSelf: "center",
  },
  balanceText: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.goldStat,
  },

  sectionLabel: {
    marginTop: 16,
    marginBottom: 10,
    fontSize: 10,
    letterSpacing: 0.8,
  },

  cardWrap: {
    marginBottom: 10,
  },
  card: {
    flexDirection: "row",
    padding: 16,
    gap: 14,
  },
  cardPass: {
    borderWidth: 0,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
  },
  cardName: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
    marginBottom: 2,
  },
  cardDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.gray400,
    marginBottom: 10,
  },
  priceRow: {
    flexDirection: "row",
    gap: 8,
  },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  buyTrophy: {
    backgroundColor: "rgba(240,198,106,0.15)",
    borderWidth: 1,
    borderColor: "rgba(240,198,106,0.3)",
  },
  buyTrophyText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.goldStat,
  },
  buyMoney: {
    backgroundColor: colors.lavender,
  },
  buyMoneyText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.onLavender,
  },
});
