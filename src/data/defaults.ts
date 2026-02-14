// ===============================
// src/data/defaults.ts
// ===============================
import type { CategoryDef, Settings } from "../domain/types";

const privateCats: CategoryDef[] = [
  { id: "p.food", label: "Mat", gpsEligible: true },
  { id: "p.places", label: "Steder", gpsEligible: true },
  { id: "p.people", label: "Folk", gpsEligible: false },
  { id: "p.other", label: "Annet", gpsEligible: false },
];

const workCats: CategoryDef[] = [
  { id: "w.site", label: "Anlegg", gpsEligible: true },
  { id: "w.task", label: "Oppgave", gpsEligible: false },
  { id: "w.issue", label: "Avvik", gpsEligible: true },
  { id: "w.other", label: "Annet", gpsEligible: false },
];

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

    categoryGpsOverrides: {},
  };
}

export function defaultAccount(): null {
  return null;
}
