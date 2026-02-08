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
  version: 1;
  language: LanguageCode;
  premium: boolean;

  gpsGlobalEnabled: boolean;

  ratingPack: RatingPackKey;

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


