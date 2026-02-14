// ===============================
// src/domain/types.ts
// ===============================
export type LanguageCode = "auto" | "en" | "no";

export type RatingPackKey = "emoji" | "thumbs" | "check" | "tens";

export type LifeKey = "private" | "work" | "custom1" | "custom2";

export type CategoryId = string;

export type CategoryDef = {
  id: CategoryId;
  label: string;
  gpsEligible: boolean;
};

export type Settings = {
  version: 2;
  language: LanguageCode;
  premium: boolean;

  gpsGlobalEnabled: boolean;

  // Global fallback/default
  ratingPack: RatingPackKey;

  // Optional per-life overrides (falls back to ratingPack)
  ratingPackByLife: Partial<Record<LifeKey, RatingPackKey>>;

  lives: {
    privateName: string;
    workName: string;
    custom1Name: string;
    custom2Name: string;

    enabledCustom1: boolean;
    enabledCustom2: boolean;
  };

  categories: Record<LifeKey, CategoryDef[]>;

  categoryGpsOverrides: Record<CategoryId, boolean>;

  /**
   * Per-life category enable/disable.
   * Convention: true => disabled.
   * If missing/undefined => category is enabled.
   */
  disabledCategoryIdsByLife?: Partial<Record<LifeKey, Record<CategoryId, boolean>>>;
};

export type Husket = {
  id: string;
  life: LifeKey;

  createdAt: number;

  imageKey: string;

  ratingValue: string | null;
  comment: string | null;
  categoryId: CategoryId | null;

  gps: { lat: number; lng: number } | null;
};

export type Account = {
  version: 1;
  userId: string;
  email: string;
  createdAt: number;
};
