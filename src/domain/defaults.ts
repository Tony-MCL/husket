// ===============================
// src/domain/defaults.ts
// ===============================
import type { Settings } from "./types";

export function defaultSettings(): Settings {
  return {
    version: 2,
    language: "auto",
    premium: false,

    // Sky / Sharing is opt-in (important for wrapped/mobile builds)
    sharingEnabled: false,

    gpsGlobalEnabled: true,

    enabledLives: {
      private: true,
      work: false,
    },

    ratingPackByLife: {},

    disabledCategoryIdsByLife: {},
  };
}
