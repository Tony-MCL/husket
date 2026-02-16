// ===============================
// src/domain/types.ts
// ===============================
export type LanguageCode = "auto" | "no" | "en";

export type LifeKey = "private" | "custom1" | "custom2" | "work";

export type RatingPackKey = "emoji" | "thumbs" | "check" | "tens" | "progress" | "weather" | "heartpoop" | "dice";

export type CategoryId = string;

export type CategoryDef = {
  id: CategoryId;
  label: string;
  gpsEligible: boolean;
};

export type HusketGps = {
  lat: number;
  lng: number;
  acc?: number;
  ts?: number;
};

export type Husket = {
  id: string;
  life: LifeKey;
  createdAt: number;
  imageKey: string;
  ratingValue: string | null;
  categoryId: CategoryId | null;
  comment: string | null;
  gps: HusketGps | null;
};

export type Settings = {
  version: 2;
  language: LanguageCode;
  premium: boolean;

  /**
   * ✅ Sky/Sharing master toggle.
   * When false, the entire Sharing center (route "shared") should be hidden.
   * Default should be OFF for wrapped/mobile distribution.
   */
  shareEnabled?: boolean;

  lives: {
    enabledPrivate: boolean;
    enabledCustom1: boolean;
    enabledCustom2: boolean;
    enabledWork: boolean;

    custom1Name: string;
    custom2Name: string;
  };

  categories: Record<LifeKey, CategoryDef[]>;

  gpsGlobalEnabled: boolean;

  ratingPack: RatingPackKey;

  ratingPackByLife?: Partial<Record<LifeKey, RatingPackKey>>;

  disabledCategoryIds?: Record<CategoryId, true>;

  disabledCategoryIdsByLife?: Partial<Record<LifeKey, Record<CategoryId, true>>>;

  // Kept for backwards compatibility / future use.
  categoryGpsOverrides: Record<CategoryId, boolean>;
};
