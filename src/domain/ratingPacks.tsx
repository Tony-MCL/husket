// ===============================
// src/domain/ratingPacks.tsx
// ===============================
import React from "react";
import type { RatingPackKey } from "./types";
import { Dice } from "../components/icons/Dice";

export type RatingPackDef = {
  key: RatingPackKey;
  premiumOnly: boolean;
  options: string[]; // stored in data (e.g. "😍", "dice:3", "10/10")
  label: string; // short label for Settings select
};

const TENS: string[] = [
  "1/10",
  "2/10",
  "3/10",
  "4/10",
  "5/10",
  "6/10",
  "7/10",
  "8/10",
  "9/10",
  "10/10",
];

const DICE: string[] = ["dice:1", "dice:2", "dice:3", "dice:4", "dice:5", "dice:6"];

export const RATING_PACKS: Record<RatingPackKey, RatingPackDef> = {
  emoji: { key: "emoji", premiumOnly: false, options: ["😖", "😐", "😍"], label: "😖 😐 😍" },
  thumbs: { key: "thumbs", premiumOnly: false, options: ["👎", "🤏", "👍"], label: "👎 🤏 👍" },
  check: { key: "check", premiumOnly: false, options: ["✗", "−", "✓"], label: "✗ − ✓" },

  tens: { key: "tens", premiumOnly: true, options: TENS, label: "1/10 … 10/10" },
  progress: { key: "progress", premiumOnly: true, options: ["▰▱▱", "▰▰▱", "▰▰▰"], label: "▰▱▱ ▰▰▱ ▰▰▰" },
  weather: { key: "weather", premiumOnly: true, options: ["🌧", "🌤", "☀️"], label: "🌧 🌤 ☀️" },
  heartpoop: { key: "heartpoop", premiumOnly: true, options: ["💩", "👀", "❤️"], label: "💩 👀 ❤️" },
  dice: { key: "dice", premiumOnly: true, options: DICE, label: "🎲 1–6" },
};

export function isPremiumRatingPack(pack: RatingPackKey): boolean {
  return RATING_PACKS[pack]?.premiumOnly ?? false;
}

export function getRatingPackOptions(pack: RatingPackKey): string[] {
  return RATING_PACKS[pack]?.options ?? RATING_PACKS.emoji.options;
}

export function listSelectableRatingPacks(args: { premium: boolean }): RatingPackKey[] {
  const keys: RatingPackKey[] = ["emoji", "thumbs", "check", "tens", "progress", "weather", "heartpoop", "dice"];
  if (args.premium) return keys;
  return keys.filter((k) => !isPremiumRatingPack(k));
}

/** Renders a stored rating value (string) to UI (emoji/text OR SVG). */
export function renderRatingValue(value: string): React.ReactNode {
  if (value.startsWith("dice:")) {
    const n = Number(value.split(":")[1]);
    if (n >= 1 && n <= 6) {
      return <Dice face={n as 1 | 2 | 3 | 4 | 5 | 6} title={`Dice ${n}`} />;
    }
  }
  return value;
}

/** For compact summaries (filter button), keep it string-based. */
export function formatRatingValueForSummary(value: string): string {
  if (value.startsWith("dice:")) {
    const n = Number(value.split(":")[1]);
    if (n >= 1 && n <= 6) return `🎲${n}`;
  }
  return value;
}
