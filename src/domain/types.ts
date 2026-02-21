export type LanguageCode = "auto" | "no" | "en";

export type LifeKey = "private" | "work" | "custom1" | "custom2";

export type CategoryId = string;

export type RatingPackKey =
  | "emoji"
  | "thumbs"
  | "check"
  | "tens"
  | "progress"
  | "weather"
  | "heartpoop"
  | "dice";

/** Theme keys (add more later: "sunset" | "forest" | ...) */
export type ThemeKey = "fjord";

export type Settings = {
  version: 2;
  language: LanguageCode;
  premium: boolean;

  /** Visual theme (background image + UI palette). */
  themeKey: ThemeKey;

  lives: {
    enabledPrivate: boolean;
    enabledWork: boolean;
    enabledCustom1: boolean;
    enabledCustom2: boolean;

    custom1Name: string;
    custom2Name: string;
  };

  categories: Record<
    LifeKey,
    Array<{
      id: CategoryId;
      name: string;
      emoji: string;
      gpsDefault?: boolean;
    }>
  >;

  disabledCategoryIdsByLife: Record<LifeKey, CategoryId[]>;

  ratingPackByLife: Record<LifeKey, RatingPackKey>;

  /** Backwards compat / future use */
  categoryGpsOverrides: Record<CategoryId, boolean>;
};
