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
  peach: "#F6C9A8",
  card: "#1A1730",
  cardBorder: "#2A2745",
  onPrimary: "#0E0C1A", // dark text on lavender/peach/lime surfaces
  highlightSoft: "rgba(184, 174, 232, 0.16)", // lavender tint (active tab, subtle fills)
  highlightGradientEnd: "#9B8FDB",
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
  hero: ["#D9D1FA", "#B8AEE8", "#9B8FDB", "#7E6BD6"] as const,
  /** Subtle lavender fill for primary buttons. */
  primaryButton: ["#CFC6F5", "#B8AEE8", "#A498E2"] as const,
  /** Faint inner sheen on dark cards. */
  card: ["rgba(155,143,219,0.10)", "rgba(26,23,48,0.0)"] as const,
  /** Deep purple player card. */
  profileCard: ["#2C2552", "#1F1A3D", "#16132B"] as const,
  /** 1px gradient edge around dark cards. */
  cardBorder: ["rgba(184,174,232,0.35)", "rgba(184,174,232,0.05)"] as const,
  /** Soft white highlight blob on lavender cards. */
  highlightBlob: ["rgba(255,255,255,0.35)", "rgba(255,255,255,0.12)", "rgba(255,255,255,0)"] as const,
  /** Golden buzzer / golden result accents (use with dark text). */
  gold: ["#F6E3A6", "#F0D78C", "#D4A843"] as const,
  /** Screen background top glow. */
  screenGlow: ["rgba(109,90,205,0.35)", "rgba(109,90,205,0.12)", "rgba(109,90,205,0)"] as const,
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
