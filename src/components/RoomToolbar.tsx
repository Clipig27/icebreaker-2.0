import type { ReactNode } from "react";
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii } from "../theme";

interface RoomToolbarProps {
  backLabel: string;
  onBack: () => void;
  title: string;
  /** Shows the round "…" button when provided. */
  onMenu?: () => void;
  /** Custom right-side element; takes precedence over the menu button. */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const SIDE_WIDTH = 96;

/** In-room top bar: pill back button, centered uppercase title, optional menu. */
export default function RoomToolbar({ backLabel, onBack, title, onMenu, right, style }: RoomToolbarProps) {
  return (
    <View style={[s.row, style]}>
      <View style={[s.side, { alignItems: "flex-start" }]}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${backLabel}`}
          style={({ pressed }) => [s.backPill, pressed && s.pressed]}
        >
          <Ionicons name="chevron-back" size={16} color={colors.white} />
          <Text style={s.backText} numberOfLines={1}>
            {backLabel}
          </Text>
        </Pressable>
      </View>

      <Text style={s.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={[s.side, { alignItems: "flex-end" }]}>
        {right ??
          (onMenu ? (
            <Pressable
              onPress={onMenu}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="More options"
              style={({ pressed }) => [s.menuBtn, pressed && s.pressed]}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.white} />
            </Pressable>
          ) : null)}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  side: { width: SIDE_WIDTH },
  backPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 38,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  backText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.white,
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
});
