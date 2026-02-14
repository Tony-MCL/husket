// ===============================
// src/data/defaults.ts
// ===============================
import type { CategoryDef, Settings } from "../domain/types";

/**
 * NOTE ABOUT IDS:
 * We keep existing category IDs stable to avoid breaking old saved Huskets.
 * (e.g. keep "p.food" instead of renaming to "p.foodDrink".)
 */

export const PRIVATE_CUSTOM_CATEGORY_ID = "p.custom.1" as const;

/** Categories that should only be available when Premium is enabled. */
export const PREMIUM_CATEGORY_IDS_BY_LIFE: Partial<Record<keyof Settings["categories"], string[]>> = {
  private: [
    "p.restaurants",
    "p.bars",
    "p.hotels",
    "p.health",
    "p.training",
    "p.media",
    "p.ideas",
    "p.experiences",
    "p.places",
    PRIVATE_CUSTOM_CATEGORY_ID,
  ],
};

const privateCats: CategoryDef[] = [
  // Standard (Privat)
  { id: "p.food", label: "Mat & drikke", gpsEligible: true },
  { id: "p.travel", label: "Reiser", gpsEligible: true },
  { id: "p.people", label: "Folk", gpsEligible: false },
  { id: "p.things", label: "Ting", gpsEligible: true },
  { id: "p.hobby", label: "Hobby", gpsEligible: false },
  { id: "p.other", label: "Annet", gpsEligible: false },

  // Premium (Privat)
  { id: "p.restaurants", label: "Restauranter", gpsEligible: true },
  { id: "p.bars", label: "Barer", gpsEligible: true },
  { id: "p.hotels", label: "Hotell", gpsEligible: true },
  { id: "p.health", label: "Helse", gpsEligible: false },
  { id: "p.training", label: "Trening", gpsEligible: false },
  { id: "p.media", label: "Media", gpsEligible: false },
  { id: "p.ideas", label: "Idéer", gpsEligible: false },
  { id: "p.experiences", label: "Opplevelser", gpsEligible: true },
  { id: "p.places", label: "Steder", gpsEligible: true },

  // Premium: one editable custom category (single slot)
  { id: PRIVATE_CUSTOM_CATEGORY_ID, label: "Egendefinert", gpsEligible: true },
];

const workCats: CategoryDef[] = [
  { id: "w.site", label: "Anlegg", gpsEligible: true },
  { id: "w.task", label: "Oppgave", gpsEligible: false },
  { id: "w.issue", label: "Avvik", gpsEligible: true },
  { id: "w.other", label: "Annet", gpsEligible: false },
];

export function getDefaultCategoriesByLife(life: keyof Settings["categories"]): CategoryDef[] {
  if (life === "private") return privateCats;
  if (life === "work") return workCats;
  if (life === "custom1") {
    return [
      { id: "c1.a", label: "Kategori 1", gpsEligible: true },
      { id: "c1.b", label: "Kategori 2", gpsEligible: false },
    ];
  }
  return [
    { id: "c2.a", label: "Kategori 1", gpsEligible: true },
    { id: "c2.b", label: "Kategori 2", gpsEligible: false },
  ];
}

export function defaultSettings(): Settings {
  return {
    version: 2,
    language: "auto",
    premium: false,

    gpsGlobalEnabled: true,

    ratingPack: "emoji",
    ratingPackByLife: {},

    lives: {
      privateName: "Privat",
      workName: "Jobb",
      custom1Name: "Liv 3",
      custom2Name: "Liv 4",
      enabledCustom1: false,
      enabledCustom2: false,
    },

    categories: {
      private: getDefaultCategoriesByLife("private"),
      work: getDefaultCategoriesByLife("work"),
      custom1: getDefaultCategoriesByLife("custom1"),
      custom2: getDefaultCategoriesByLife("custom2"),
    },

    // Default: max 4 active for Privat (Mat & drikke + Reiser + Folk + Ting)
    disabledCategoryIdsByLife: {
      private: {
        "p.hobby": true,
        "p.other": true,

        // Premium categories start OFF as well
        "p.restaurants": true,
        "p.bars": true,
        "p.hotels": true,
        "p.health": true,
        "p.training": true,
        "p.media": true,
        "p.ideas": true,
        "p.experiences": true,
        "p.places": true,
        [PRIVATE_CUSTOM_CATEGORY_ID]: true,
      },
    },

    // Kept for backwards compatibility / future use.
    categoryGpsOverrides: {},
  };
}

export function defaultAccount(): null {
  return null;
}
