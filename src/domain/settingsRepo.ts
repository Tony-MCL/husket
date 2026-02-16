// ===============================
// src/domain/settingsRepo.ts
// ===============================
import type { Settings } from "./types";
import { defaultSettings } from "./defaults";
import { localGetJson, localSetJson } from "../data/local";

const SETTINGS_KEY = "husket.settings.v2";

// v1 (legacy)
type SettingsV1 = {
  version: 1;
  language: "auto" | "no" | "en";
  premium: boolean;
  gpsGlobalEnabled: boolean;
  enabledLives: Partial<Record<"private" | "work", boolean>>;
};

function migrateV1ToV2(v1: SettingsV1): Settings {
  return {
    ...(v1 as any),
    version: 2,
    sharingEnabled: false,
    ratingPackByLife: {},
    disabledCategoryIdsByLife: {},
  } as Settings;
}

export function loadSettings(): Settings {
  const raw = localGetJson<any>(SETTINGS_KEY);
  if (!raw) return defaultSettings();

  // v1 migration
  if (raw.version === 1) {
    const migrated = migrateV1ToV2(raw as SettingsV1);
    saveSettings(migrated);
    return migrated;
  }

  const v2 = raw as Settings;

  // v2 backfills
  if (v2 && v2.version === 2) {
    let changed = false;
    let fixed: Settings = v2;

    if (typeof (fixed as any).sharingEnabled !== "boolean") {
      fixed = { ...fixed, sharingEnabled: false };
      changed = true;
    }

    if (!fixed.ratingPackByLife) {
      fixed = { ...fixed, ratingPackByLife: {} };
      changed = true;
    }

    if (!fixed.disabledCategoryIdsByLife) {
      fixed = { ...fixed, disabledCategoryIdsByLife: {} };
      changed = true;
    }

    if (changed) saveSettings(fixed);
    return fixed;
  }

  return defaultSettings();
}

export function saveSettings(settings: Settings): void {
  localSetJson(SETTINGS_KEY, settings);
}
