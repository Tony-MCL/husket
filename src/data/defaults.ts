import type { Settings } from "../domain/types";
import { defaultCategoriesByLife } from "./ratingPacks";

export function defaultSettings(): Settings {
  return {
    version: 2,
    language: "auto",
    premium: false,

    themeKey: "fjord",

    lives: {
      enabledPrivate: true,
      enabledWork: true,
      enabledCustom1: true,
      enabledCustom2: true,

      custom1Name: "Custom 1",
      custom2Name: "Custom 2",
    },

    categories: defaultCategoriesByLife(),

    disabledCategoryIdsByLife: {
      private: [],
      work: [],
      custom1: [],
      custom2: [],
    },

    ratingPackByLife: {
      private: "emoji",
      work: "check",
      custom1: "thumbs",
      custom2: "dice",
    },

    categoryGpsOverrides: {},
  };
}
