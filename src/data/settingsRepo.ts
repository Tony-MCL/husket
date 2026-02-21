// ===============================
// src/data/settingsRepo.ts
// ===============================
import type { CategoryDef, Settings } from "../domain/types";
import { defaultSettings, getDefaultCategoriesByLife, PRIVATE_CUSTOM_CATEGORY_ID } from "./defaults";
import { readJson, writeJson } from "../storage/local";

const KEY_V1 = "husket.settings.v1";
const KEY_V2 = "husket.settings.v2";

type SettingsV1 = Omit<Settings, "version" | "ratingPackByLife" | "disabledCategoryIdsByLife"> & {
  version: 1;
  ratingPackByLife?: never;
  disabledCategoryIdsByLife?: never;
};

function migrateV1ToV2(v1: SettingsV1): Settings {
  return {
    ...(v1 as any),
    version: 2,
    themeKey: "fjord",
    ratingPackByLife: {},
    disabledCategoryIdsByLife: {},
  } as Settings;
}

function isUserEditableCategoryId(id: string): boolean {
  // Custom lives
  if (id.includes(".custom.")) return true;
  // Private single-slot custom
  if (id === PRIVATE_CUSTOM_CATEGORY_ID) return true;
  return false;
}

function mergeCategories(current: CategoryDef[] | undefined, defaults: CategoryDef[]): CategoryDef[] {
  const cur = current ?? [];
  const curById = new Map<string, CategoryDef>();
  for (const c of cur) curById.set(c.id, c);

  const merged: CategoryDef[] = [];

  // 1) Defaults in default order, updating label/gpsEligible
  for (const d of defaults) {
    const existing = curById.get(d.id);

    if (!existing) {
      merged.push(d);
      continue;
    }

    // Keep user label for editable categories
    if (isUserEditableCategoryId(d.id)) {
      merged.push(existing);
    } else {
      merged.push({
        ...existing,
        label: d.label,
        gpsEligible: d.gpsEligible,
      });
    }

    curById.delete(d.id);
  }

  // 2) Append any extra categories that exist in stored settings but not in defaults
  for (const [, extra] of curById) merged.push(extra);

  return merged;
}

function ensureCategoriesUpToDate(s: Settings): { next: Settings; changed: boolean } {
  let changed = false;

  const nextCats: Settings["categories"] = { ...s.categories };

  (["private", "work", "custom1", "custom2"] as const).forEach((life) => {
    const defaults = getDefaultCategoriesByLife(life);
    const current = s.categories?.[life];
    const merged = mergeCategories(current, defaults);

    const same =
      Array.isArray(current) &&
      current.length === merged.length &&
      current.every((c, idx) => c.id === merged[idx].id && c.label === merged[idx].label && c.gpsEligible === merged[idx].gpsEligible);

    if (!same) {
      nextCats[life] = merged;
      changed = true;
    }
  });

  if (!changed) return { next: s, changed: false };

  return {
    next: {
      ...s,
      categories: nextCats,
    },
    changed: true,
  };
}

function ensureLivesFlags(s: Settings): { next: Settings; changed: boolean } {
  const lives: any = (s as any).lives ?? {};
  let changed = false;

  const enabledPrivate = typeof lives.enabledPrivate === "boolean" ? lives.enabledPrivate : true;
  const enabledWork = typeof lives.enabledWork === "boolean" ? lives.enabledWork : true;

  if (enabledPrivate !== lives.enabledPrivate) changed = true;
  if (enabledWork !== lives.enabledWork) changed = true;

  if (!changed) return { next: s, changed: false };

  return {
    next: {
      ...s,
      lives: {
        ...s.lives,
        enabledPrivate,
        enabledWork,
      },
    },
    changed: true,
  };
}

export function loadSettings(): Settings {
  const v2 = readJson<Settings>(KEY_V2);
  if (v2 && v2.version === 2) {
    let changed = false;
    let fixed: Settings = v2;

    if (!fixed.ratingPackByLife) {
      fixed = { ...fixed, ratingPackByLife: {} };
      changed = true;
    }

    if (!fixed.disabledCategoryIdsByLife) {
      fixed = { ...fixed, disabledCategoryIdsByLife: {} };
      changed = true;
    }

    if (!fixed.themeKey) {
      fixed = { ...fixed, themeKey: "fjord" };
      changed = true;
    }

    const ensuredCats = ensureCategoriesUpToDate(fixed);
    if (ensuredCats.changed) {
      fixed = ensuredCats.next;
      changed = true;
    }

    const ensuredLives = ensureLivesFlags(fixed);
    if (ensuredLives.changed) {
      fixed = ensuredLives.next;
      changed = true;
    }

    if (changed) writeJson(KEY_V2, fixed);
    return fixed;
  }

  const v1 = readJson<SettingsV1>(KEY_V1);
  if (v1 && (v1 as any).version === 1) {
    const migrated = migrateV1ToV2(v1);
    const ensuredCats = ensureCategoriesUpToDate(migrated);
    const ensuredLives = ensureLivesFlags(ensuredCats.changed ? ensuredCats.next : migrated);
    const final = ensuredLives.changed ? ensuredLives.next : ensuredLives.next;

    writeJson(KEY_V2, final);
    return final;
  }

  const fresh = defaultSettings();
  const fixedFresh: Settings = {
    ...fresh,
    ratingPackByLife: fresh.ratingPackByLife ?? {},
    disabledCategoryIdsByLife: fresh.disabledCategoryIdsByLife ?? {},
  };
  writeJson(KEY_V2, fixedFresh);
  return fixedFresh;
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
