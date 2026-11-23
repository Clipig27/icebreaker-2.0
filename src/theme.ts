export const colors = {
  background: "#0E0C1A",
  surface: "#1A1730",
  surfaceLight: "#2A2745",
  border: "#2A2745",

  primary: "#6D5ACD",
  primaryLight: "#9B8FDB",
  primaryDark: "#5240A8",
  highlight: "#B8AEE8",

  // Lime accent (from Figma - badges, Join button, category labels)
  lime: "#C4F04D",
  limeDark: "#A8D43A",

  accent: "#06B6D4",
  gold: "#D4A843",
  goldLight: "#F0D78C",
  danger: "#EF4444",
  success: "#10B981",
  warning: "#F59E0B",

  white: "#FFFFFF",
  gray300: "#D1D5DB",
  gray400: "#9CA3AF",
  gray500: "#6B7280",
  gray600: "#4B5563",

  // Redesign tokens
  peach: "#F8D2C0",
  card: "#231C31",
  cardBorder: "rgba(186,162,249,0.14)",
  onPrimary: "#0E0C1A", // dark text on lavender/peach/lime surfaces
  highlightSoft: "rgba(184, 174, 232, 0.16)", // lavender tint (active tab, subtle fills)
  highlightGradientEnd: "#9B8FDB",

  // Mockup-sampled tokens (compare pass)
  bgPurple: "#1D182D", // screen background (mid)
  bgPurpleTop: "#221A35",
  bgPurpleBottom: "#1A1527",
  tabBar: "#100E18",
  lavender: "#BAA2F9", // primary lavender (buttons, progress, accents)
  lavenderPill: "#C9B8F1",
  onLavender: "#1A1427", // dark text on lavender
  peachSticker: "#F8D2C0",
  cardFill: "#231C31",
  cardEdge: "rgba(186,162,249,0.14)",
  cardRaised: "#2A2140",
  goldStat: "#F0C66A",
  goldTile: "#F8D293",
  joinedGreen: "#6FD8A4",
};

export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  screen: 24, // horizontal screen padding
};

/** Gradient stops for expo-linear-gradient (tuples so they satisfy its `colors` type). */
export const gradients = {
  /** Lavender → violet diagonal for hero / featured cards. */
  hero: ["#D6C4FA", "#C3A9F3", "#B79CEF", "#A484EA"] as const,
  /** Subtle lavender fill for primary buttons. */
  primaryButton: ["#C4AFFA", "#B19CF9", "#A68EF3"] as const,
  /** Faint inner sheen on dark cards. */
  card: ["rgba(186,162,249,0.06)", "rgba(35,28,49,0)"] as const,
  /** Deep purple player card. */
  profileCard: ["#422F5D", "#251C33", "#20182E"] as const,
  /** 1px gradient edge around dark cards. */
  cardBorder: ["rgba(186,162,249,0.20)", "rgba(186,162,249,0.10)"] as const,
  /** Soft white highlight blob on lavender cards. */
  highlightBlob: ["rgba(255,255,255,0.35)", "rgba(255,255,255,0.12)", "rgba(255,255,255,0)"] as const,
  /** Golden buzzer / golden result accents (use with dark text). */
  gold: ["#F6E3A6", "#F0D78C", "#D4A843"] as const,
  /** Screen background top glow. */
  screenGlow: ["rgba(186,162,249,0.10)", "rgba(186,162,249,0.04)", "rgba(186,162,249,0)"] as const,
  /** Base screen background (top → bottom). */
  screenBase: ["#221A35", "#1C172B", "#1A1527"] as const,
  /** Invite / tinted dark card. */
  inviteCard: ["#2C203B", "#201B2D"] as const,
  /** Dark purple bar button on lavender hero (Host a game). */
  heroDarkButton: ["#2F1D4E", "#24173D"] as const,
  /** Raised task card (NGT). */
  taskCard: ["#2C2140", "#231C31"] as const,
  /** Lavender avatar tile. */
  avatarTile: ["#CBB3F6", "#A783EF"] as const,
  /** Per-game row tints over the card fill. */
  rowGold: ["rgba(248,210,147,0.11)", "rgba(248,210,147,0.02)"] as const,
  rowTeal: ["rgba(94,214,200,0.10)", "rgba(94,214,200,0.02)"] as const,
  rowPink: ["rgba(246,150,190,0.10)", "rgba(246,150,190,0.02)"] as const,
  rowPurple: ["rgba(186,162,249,0.10)", "rgba(186,162,249,0.02)"] as const,
};

export const gradientDirections = {
  diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  vertical: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
};

export const type = {
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    color: colors.gray400,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 34,
    lineHeight: 40,
    color: colors.white,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.gray400,
  },
};
