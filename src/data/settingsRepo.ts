// ===============================
// src/data/settingsRepo.ts
// ===============================
import type { Settings } from "../domain/types";
import { defaultSettings } from "./defaults";
import { readJson, writeJson } from "../storage/local";

const KEY_V1 = "husket.settings.v1";
const KEY_V2 = "husket.settings.v2";

type SettingsV1 = Omit<Settings, "version" | "ratingPackByLife"> & {
  version: 1;
  ratingPackByLife?: never;
};

function migrateV1ToV2(v1: SettingsV1): Settings {
  return {
    ...v1,
    version: 2,
    ratingPackByLife: {},
  };
}

export function loadSettings(): Settings {
  const v2 = readJson<Settings>(KEY_V2);
  if (v2 && v2.version === 2) {
    // Defensive: ensure field exists
    if (!v2.ratingPackByLife) {
      const fixed: Settings = { ...v2, ratingPackByLife: {} };
      writeJson(KEY_V2, fixed);
      return fixed;
    }
    return v2;
  }

  const v1 = readJson<SettingsV1>(KEY_V1);
  if (v1 && v1.version === 1) {
    const migrated = migrateV1ToV2(v1);
    writeJson(KEY_V2, migrated);
    return migrated;
  }

  const fresh = defaultSettings();
  writeJson(KEY_V2, fresh);
  return fresh;
}

export function saveSettings(next: Settings): void {
  writeJson(KEY_V2, next);
}

export function setPremium(premium: boolean): Settings {
  const s = loadSettings();
  const next: Settings = {
    ...s,
    premium,
    lives: {
      ...s.lives,
      enabledCustom1: premium ? s.lives.enabledCustom1 : false,
      enabledCustom2: premium ? s.lives.enabledCustom2 : false,
    },
  };
  saveSettings(next);
  return next;
}
