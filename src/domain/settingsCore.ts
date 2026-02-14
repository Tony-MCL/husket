// ===============================
// src/domain/settingsCore.ts
// ===============================
import type { LifeKey, RatingPackKey, Settings } from "./types";

export function getEffectiveRatingPack(settings: Settings, life: LifeKey): RatingPackKey {
  return settings.ratingPackByLife?.[life] ?? settings.ratingPack;
}

export function setRatingPackForLife(settings: Settings, life: LifeKey, pack: RatingPackKey): Settings {
  return {
    ...settings,
    ratingPackByLife: {
      ...(settings.ratingPackByLife ?? {}),
      [life]: pack,
    },
  };
}
