// ===============================
// src/domain/types.ts
// ===============================
export type RouteKey = "capture" | "album" | "shared";

export type LifeKey = "private" | "work";

export type LanguageCode = "auto" | "no" | "en";

export type Settings = {
  version: 2;
  language: LanguageCode;
  premium: boolean;

  /**
   * Sky / sharing center is opt-in. When false, the entire sharing UI is hidden.
   * Default: false (especially important for wrapped/mobile builds).
   */
  sharingEnabled: boolean;

  gpsGlobalEnabled: boolean;

  // Multi-life
  enabledLives: Partial<Record<LifeKey, boolean>>;

  // Rating pack (per-life)
  ratingPackByLife: Partial<Record<LifeKey, RatingPackKey>>;

  // Category disabling (per-life)
  disabledCategoryIdsByLife: Partial<Record<LifeKey, string[]>>;

  // TODO: More settings later...
};

export type Husket = {
  id: string;
  life: LifeKey;

  createdAt: number; // ms epoch
  capturedAt?: number | null; // ms epoch (optional separate field)

  // Image stored in IDB
  imageKey: string;

  // Data
  ratingValue?: string | null;
  comment?: string | null;
  categoryId?: string | null;

  // Optional GPS
  gps?: {
    lat: number;
    lon: number;
    acc?: number | null;
  } | null;

  // Optional extra meta
  meta?: Record<string, unknown>;
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
