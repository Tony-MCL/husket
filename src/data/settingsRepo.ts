// ===============================
// src/data/settingsRepo.ts
// ===============================
import type { Settings } from "../domain/types";
import { defaultSettings } from "./defaults";
import { readJson, writeJson } from "../storage/local";

const KEY = "husket.settings.v1";

export function loadSettings(): Settings {
  const existing = readJson<Settings>(KEY);
  if (existing && existing.version === 1) return existing;
  const fresh = defaultSettings();
  writeJson(KEY, fresh);
  return fresh;
}

export function saveSettings(next: Settings): void {
  writeJson(KEY, next);
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


