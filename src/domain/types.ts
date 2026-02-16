// ===============================
// src/domain/types.ts
// ===============================
export type LanguageCode = "auto" | "no" | "en";

export type LifeKey = "private" | "work" | "custom1" | "custom2";

export type CategoryId =
  | "p.foodDrink"
  | "p.travel"
  | "p.people"
  | "p.things"
  | "p.hobby"
  | "p.other"
  | "p.restaurants"
  | "p.bars"
  | "p.hotels"
  | "p.health"
  | "p.training"
  | "p.media"
  | "p.ideas"
  | "p.experiences"
  | "p.places"
  | "p.custom.1"
  | "w.place"
  | "w.task"
  | "w.issue"
  | "w.note"
  | "w.meeting"
  | "w.other"
  | "w.siteVisit"
  | "w.safety"
  | "w.quality"
  | "w.progress"
  | "w.docs"
  | "w.delivery"
  | "w.client"
  | "w.plan"
  | "w.risk"
  | "w.custom.1"
  | `${LifeKey}.custom.${string}`;

export type CategoryDef = {
  id: CategoryId;
  label: string;
  gpsEligible: boolean;
};

export type RatingPackKey =
  | "emoji"
  | "thumbs"
  | "check"
  | "tens"
  | "progress"
  | "weather"
  | "heartpoop"
  | "dice";

export type Settings = {
  version: 2;
  language: LanguageCode;
  premium: boolean;

  gpsGlobalEnabled: boolean;

  /** Master toggle for showing/hiding the entire sharing center (Sky v1 UI entry points). */
  shareCenterEnabled: boolean;

  // Global fallback/default
  ratingPack: RatingPackKey;

  // Optional per-life overrides (falls back to ratingPack)
  ratingPackByLife: Partial<Record<LifeKey, RatingPackKey>>;

  lives: {
    privateName: string;
    workName: string;
    custom1Name: string;
    custom2Name: string;

    enabledPrivate: boolean;
    enabledWork: boolean;

    enabledCustom1: boolean;
    enabledCustom2: boolean;
  };

  categories: Record<LifeKey, CategoryDef[]>;

  // Per-life disabled categories (true = disabled)
  disabledCategoryIdsByLife?: Partial<Record<LifeKey, Record<CategoryId, true>>>;

  categoryGpsOverrides: Record<CategoryId, boolean>;
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
