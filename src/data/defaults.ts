// ===============================
// src/data/defaults.ts
// ===============================
import type { CategoryDef, LifeKey, Settings } from "../domain/types";

export const PRIVATE_CUSTOM_CATEGORY_ID = "private.custom.single";
export const WORK_CUSTOM_CATEGORY_ID = "work.custom.single";

export const PREMIUM_CATEGORY_IDS_BY_LIFE: Record<LifeKey, string[]> = {
  private: ["private.food", "private.product", PRIVATE_CUSTOM_CATEGORY_ID],
  work: ["work.place", "work.product", WORK_CUSTOM_CATEGORY_ID],
  custom1: [],
  custom2: [],
};

export function getDefaultCategoriesByLife(life: LifeKey): CategoryDef[] {
  if (life === "private") {
    return [
      { id: "private.place", label: "Sted", gpsEligible: true },
      { id: "private.food", label: "Mat", gpsEligible: true },
      { id: "private.product", label: "Produkt", gpsEligible: false },
      { id: PRIVATE_CUSTOM_CATEGORY_ID, label: "Egendefinert", gpsEligible: true },
    ];
  }

  if (life === "work") {
    return [
      { id: "work.place", label: "Sted", gpsEligible: true },
      { id: "work.product", label: "Produkt", gpsEligible: false },
      { id: WORK_CUSTOM_CATEGORY_ID, label: "Egendefinert", gpsEligible: true },
    ];
  }

  if (life === "custom1") {
    return [{ id: "custom1.default", label: "Default", gpsEligible: true }];
  }

  return [{ id: "custom2.default", label: "Default", gpsEligible: true }];
}

export function defaultSettings(): Settings {
  return {
    version: 2,
    language: "auto",
    premium: false,

    // ✅ Sharing is OFF by default (user must opt-in via Settings)
    shareEnabled: false,

    lives: {
      enabledPrivate: true,
      enabledCustom1: false,
      enabledCustom2: false,
      enabledWork: true,

      custom1Name: "Custom 1",
      custom2Name: "Custom 2",
    },

    categories: {
      private: getDefaultCategoriesByLife("private"),
      work: getDefaultCategoriesByLife("work"),
      custom1: getDefaultCategoriesByLife("custom1"),
      custom2: getDefaultCategoriesByLife("custom2"),
    },

    gpsGlobalEnabled: false,

    ratingPack: "emoji",
    ratingPackByLife: {},

    disabledCategoryIds: {},
    disabledCategoryIdsByLife: {},

    // Kept for backwards compatibility / future use.
    categoryGpsOverrides: {},
  };
}

export function getDefaultCategories(): CategoryDef[] {
  return getDefaultCategoriesByLife("private");
}
