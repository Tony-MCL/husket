// ===============================
// src/data/defaults.ts
// ===============================
import type { CategoryDef, LifeKey, Settings } from "../domain/types";

// -------------------------------
// Categories: PRIVATE
// -------------------------------
const PRIVATE_CATS: CategoryDef[] = [
  // Standard (Privat)
  { id: "p.foodDrink", label: "cats.p.foodDrink", gpsEligible: true },
  { id: "p.travel", label: "cats.p.travel", gpsEligible: true },
  { id: "p.people", label: "cats.p.people", gpsEligible: false },
  { id: "p.things", label: "cats.p.things", gpsEligible: true },
  { id: "p.hobby", label: "cats.p.hobby", gpsEligible: false },
  { id: "p.other", label: "cats.p.other", gpsEligible: false },

  // Premium (Privat)
  { id: "p.restaurants", label: "cats.p.restaurants", gpsEligible: true },
  { id: "p.bars", label: "cats.p.bars", gpsEligible: true },
  { id: "p.hotels", label: "cats.p.hotels", gpsEligible: true },
  { id: "p.health", label: "cats.p.health", gpsEligible: false },
  { id: "p.training", label: "cats.p.training", gpsEligible: false },
  { id: "p.media", label: "cats.p.media", gpsEligible: false },
  { id: "p.ideas", label: "cats.p.ideas", gpsEligible: false },
  { id: "p.experiences", label: "cats.p.experiences", gpsEligible: true },
  { id: "p.places", label: "cats.p.places", gpsEligible: true },

  // Premium: one editable custom category (single slot)
  { id: "p.custom.1", label: "cats.p.custom.1", gpsEligible: true },
];

// -------------------------------
// Categories: WORK
// -------------------------------
const WORK_CATS: CategoryDef[] = [
  // Standard (Jobb)
  { id: "w.place", label: "cats.w.place", gpsEligible: true },
  { id: "w.task", label: "cats.w.task", gpsEligible: false },
  { id: "w.issue", label: "cats.w.issue", gpsEligible: true },
  { id: "w.note", label: "cats.w.note", gpsEligible: false },
  { id: "w.meeting", label: "cats.w.meeting", gpsEligible: false },
  { id: "w.other", label: "cats.w.other", gpsEligible: false },

  // Premium (Jobb)
  { id: "w.siteVisit", label: "cats.w.siteVisit", gpsEligible: true },
  { id: "w.safety", label: "cats.w.safety", gpsEligible: false },
  { id: "w.quality", label: "cats.w.quality", gpsEligible: false },
  { id: "w.progress", label: "cats.w.progress", gpsEligible: false },
  { id: "w.docs", label: "cats.w.docs", gpsEligible: false },
  { id: "w.delivery", label: "cats.w.delivery", gpsEligible: false },
  { id: "w.client", label: "cats.w.client", gpsEligible: false },
  { id: "w.plan", label: "cats.w.plan", gpsEligible: false },
  { id: "w.risk", label: "cats.w.risk", gpsEligible: false },

  // Premium: one editable custom category (single slot)
  { id: "w.custom.1", label: "cats.w.custom.1", gpsEligible: false },
];

// -------------------------------
// Custom category IDs (editable slots)
// -------------------------------
export const PRIVATE_CUSTOM_CATEGORY_ID = "p.custom.1" as const;
export const WORK_CUSTOM_CATEGORY_ID = "w.custom.1" as const;

/** Categories that should only be available when Premium is enabled. */
export const PREMIUM_CATEGORY_IDS_BY_LIFE: Partial<Record<LifeKey, string[]>> = {
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
  work: [
    "w.siteVisit",
    "w.safety",
    "w.quality",
    "w.progress",
    "w.docs",
    "w.delivery",
    "w.client",
    "w.plan",
    "w.risk",
    WORK_CUSTOM_CATEGORY_ID,
  ],
};

// -------------------------------
// Helpers
// -------------------------------
function cloneCats(list: CategoryDef[]): CategoryDef[] {
  return list.map((c) => ({ ...c }));
}

/**
 * Repo expects this export.
 * Overloads:
 * - getDefaultCategoriesByLife(life) -> CategoryDef[]
 * - getDefaultCategoriesByLife() -> Record<LifeKey, CategoryDef[]>
 */
export function getDefaultCategoriesByLife(life: LifeKey): CategoryDef[];
export function getDefaultCategoriesByLife(): Record<LifeKey, CategoryDef[]>;
export function getDefaultCategoriesByLife(life?: LifeKey) {
  const empty: CategoryDef[] = [];

  if (life) {
    switch (life) {
      case "private":
        return cloneCats(PRIVATE_CATS);
      case "work":
        return cloneCats(WORK_CATS);
      case "custom1":
        return cloneCats(empty);
      case "custom2":
        return cloneCats(empty);
      default:
        return cloneCats(PRIVATE_CATS);
    }
  }

  return {
    private: cloneCats(PRIVATE_CATS),
    work: cloneCats(WORK_CATS),
    custom1: cloneCats(empty),
    custom2: cloneCats(empty),
  };
}

export function defaultSettings(): Settings {
  return {
    version: 2,
    language: "auto",
    premium: false,

    // ✅ Default theme
    themeKey: "fjord",

    gpsGlobalEnabled: true,

    ratingPack: "emoji",
    ratingPackByLife: {},

    lives: {
      privateName: "Privat",
      workName: "Jobb",
      custom1Name: "start.custom1",
      custom2Name: "start.custom2",

      enabledPrivate: true,
      enabledWork: true,

      enabledCustom1: false,
      enabledCustom2: false,
    },

    categories: getDefaultCategoriesByLife(),

    // Default ON/OFF:
    // - Privat: 4 aktive som default (Mat&drikke, Reiser, Folk, Ting)
    // - Jobb: 4 aktive som default (Sted, Oppgave, Avvik, Notat)
    // - Custom-liv: starter tomme
    disabledCategoryIdsByLife: {
      private: {
        "p.hobby": true,
        "p.other": true,

        // Premium categories start OFF as well.
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
      work: {
        // Standard categories beyond the first 4 start OFF
        "w.meeting": true,
        "w.other": true,

        // Premium categories start OFF
        "w.siteVisit": true,
        "w.safety": true,
        "w.quality": true,
        "w.progress": true,
        "w.docs": true,
        "w.delivery": true,
        "w.client": true,
        "w.plan": true,
        "w.risk": true,
        [WORK_CUSTOM_CATEGORY_ID]: true,
      },
    },

    // Kept for backwards compatibility / future use.
    categoryGpsOverrides: {},
  };
}

export function defaultAccount(): null {
  return null;
}
