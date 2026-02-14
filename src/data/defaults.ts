// ===============================
// src/data/defaults.ts
// ===============================
import type { CategoryDef, Settings } from "../domain/types";

const privateCats: CategoryDef[] = [
  // Standard (Privat)
  { id: "p.foodDrink", label: "Mat & drikke", gpsEligible: true },
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
  { id: "p.custom.1", label: "Egendefinert", gpsEligible: true },
];

const workCats: CategoryDef[] = [
  // Standard (Jobb)
  { id: "w.place", label: "Sted", gpsEligible: true },
  { id: "w.task", label: "Oppgave", gpsEligible: false },
  { id: "w.issue", label: "Avvik", gpsEligible: true },
  { id: "w.note", label: "Notat", gpsEligible: false },
  { id: "w.meeting", label: "Møte", gpsEligible: false },
  { id: "w.other", label: "Annet", gpsEligible: false },

  // Premium (Jobb)
  { id: "w.siteVisit", label: "Befaring", gpsEligible: true },
  { id: "w.safety", label: "Sikkerhet", gpsEligible: false },
  { id: "w.quality", label: "Kvalitet", gpsEligible: false },
  { id: "w.progress", label: "Fremdrift", gpsEligible: false },
  { id: "w.docs", label: "Dokumentasjon", gpsEligible: false },
  { id: "w.delivery", label: "Leveranse", gpsEligible: false },
  { id: "w.client", label: "Kunde", gpsEligible: false },
  { id: "w.plan", label: "Plan", gpsEligible: false },
  { id: "w.risk", label: "Risiko", gpsEligible: false },

  // Premium: one editable custom category (single slot)
  { id: "w.custom.1", label: "Egendefinert", gpsEligible: false },
];

export const PRIVATE_CUSTOM_CATEGORY_ID = "p.custom.1" as const;
export const WORK_CUSTOM_CATEGORY_ID = "w.custom.1" as const;

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
      private: privateCats,
      work: workCats,
      custom1: [
        { id: "c1.a", label: "Kategori 1", gpsEligible: true },
        { id: "c1.b", label: "Kategori 2", gpsEligible: false },
      ],
      custom2: [
        { id: "c2.a", label: "Kategori 1", gpsEligible: true },
        { id: "c2.b", label: "Kategori 2", gpsEligible: false },
      ],
    },

    // Default ON/OFF:
    // - Privat: 4 aktive som default (Mat&drikke, Reiser, Folk, Ting)
    // - Jobb: 4 aktive som default (Sted, Oppgave, Avvik, Notat)
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
        "p.custom.1": true,
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
        "w.custom.1": true,
      },
    },

    // Kept for backwards compatibility / future use.
    categoryGpsOverrides: {},
  };
}

export function defaultAccount(): null {
  return null;
}
