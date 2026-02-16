// ===============================
// src/domain/settingsCore.ts
// ===============================
import type { LifeKey, RatingPackKey, Settings } from "./types";

/**
 * Returns the rating pack for a given life, falling back to global ratingPack.
 * Defensive: tolerates older saved settings that may miss ratingPackByLife.
 */
export function getEffectiveRatingPack(settings: Settings, life: LifeKey): RatingPackKey {
  const byLife = (settings as any).ratingPackByLife as Partial<Record<LifeKey, RatingPackKey>> | undefined;
  const v = byLife?.[life];
  return v ?? settings.ratingPack;
}

/**
 * Sets rating pack for a specific life (per-life override).
 * Defensive: always ensures ratingPackByLife exists.
 */
export function setRatingPackForLife(settings: Settings, life: LifeKey, pack: RatingPackKey): Settings {
  const cur = (settings as any).ratingPackByLife as Partial<Record<LifeKey, RatingPackKey>> | undefined;
  const nextByLife: Partial<Record<LifeKey, RatingPackKey>> = { ...(cur ?? {}) };

  // Store override
  nextByLife[life] = pack;

  return {
    ...settings,
    ratingPackByLife: nextByLife,
  };
}

/**
 * Optional helper: clears per-life override (reverts to global).
 */
export function clearRatingPackForLife(settings: Settings, life: LifeKey): Settings {
  const cur = (settings as any).ratingPackByLife as Partial<Record<LifeKey, RatingPackKey>> | undefined;
  if (!cur) return settings;

  const nextByLife: Partial<Record<LifeKey, RatingPackKey>> = { ...cur };
  delete nextByLife[life];

  return {
    ...settings,
    ratingPackByLife: nextByLife,
  };
}
