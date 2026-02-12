// ======================================================
// Husket – Morning Coffee Labs (Single Theme, locked)
// Built from official MCL tokens (light + dark mix)
// ======================================================

export const MCL_HUSKET_THEME = {
  colors: {
    // Core surfaces (Light base)
    bg: "#FFFAF4", // --mcl-bg (light)
    surface: "#FFFFFF", // --mcl-surface (light)
    header: "#D7C2A8", // --mcl-header (holy, locked)

    // Text (Light base)
    text: "#1B1A17", // --mcl-text (light)
    muted: "#6B655F", // --mcl-muted (light)

    // Text on dark surfaces (needed for altSurface/darkSurface)
    textOnDark: "#F7F3ED", // --mcl-text (dark)

    // Brand (Light base)
    brand: "#8B5E34", // --mcl-brand (light)
    accent: "#B08968", // --mcl-accent (light)

    // Lines / separators
    outline: "#E8DFD5", // --mcl-outline (light)

    // Dark “premium punch” accents (from dark mode)
    altSurface: "#3B2E23", // --mcl-altbg (dark) – used for selected chips/badges
    darkSurface: "#1B1A17", // --mcl-surface (dark)

    // System
    overlay: "rgba(0,0,0,0.40)",

    // Destructive (not part of the pasted MCL token set)
    danger: "#C23B3B",
  },

  radius: 16, // --radius

  elevation: {
    // Light-mode shadows (app is light-based)
    elev1: "0 4px 10px rgba(0,0,0,.08)", // --elev-1 (light)
    elev2: "0 10px 24px rgba(0,0,0,.12)", // --elev-2 (light)
  },
} as const;

export type HusketTheme = typeof MCL_HUSKET_THEME;
