// ===============================
// src/theme/mclHusketTheme.ts
// ===============================
// ======================================================
// Husket – Morning Coffee Labs (Single Theme, locked)
// Fjord-inspired variant (appearance only)
// ======================================================

export const MCL_HUSKET_THEME = {
  colors: {
    // Core surfaces
    bg: "#FFFAF4",
    surface: "#FFFFFF",

    // ✅ Fjord header (misty blue-gray, still “calm”)
    header: "#B7CBD6",

    // Text (light base)
    text: "#1B1A17",
    muted: "#6B655F",

    // Text on dark surfaces
    textOnDark: "#EAF4F6",

    // Brand accents (fjord teal)
    brand: "#2B6F76",
    accent: "#4B8F9B",

    // Lines / separators
    outline: "#D6E3EA",

    // Dark base surfaces (fjord deep)
    altSurface: "#0F2F36",
    darkSurface: "#071417",

    // System
    overlay: "rgba(0,0,0,0.40)",

    // Destructive
    danger: "#C23B3B",
  },

  radius: 16,

  elevation: {
    elev1: "0 4px 10px rgba(0,0,0,.08)",
    elev2: "0 10px 24px rgba(0,0,0,.12)",
  },
} as const;

export type HusketTheme = typeof MCL_HUSKET_THEME;
