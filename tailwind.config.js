/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0B0B1A",
        surface: "#1A1A2E",
        "surface-light": "#2A2A4A",
        primary: "#7C3AED",
        "primary-light": "#A78BFA",
        accent: "#06B6D4",
        danger: "#EF4444",
        success: "#10B981",
        warning: "#F59E0B",
      },
      fontFamily: {
        "exo": ["Exo2_400Regular"],
        "exo-medium": ["Exo2_500Medium"],
        "exo-semibold": ["Exo2_600SemiBold"],
        "exo-bold": ["Exo2_700Bold"],
        "exo-extrabold": ["Exo2_800ExtraBold"],
      },
    },
  },
  plugins: [],
};
