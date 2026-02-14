// ===============================
// src/screens/CaptureScreen.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Husket, LifeKey, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { createHusket, countAllHuskets } from "../data/husketRepo";
import { useToast } from "../components/ToastHost";
import { HUSKET_TYPO } from "../theme/typography";
import { MCL_HUSKET_THEME } from "../theme";
import { getEffectiveRatingPack } from "../domain/settingsCore";

type Props = {
  dict: I18nDict;
  life: LifeKey;
  settings: Settings;
  onRequirePremium: () => void;
  onSavedGoAlbum: () => void;
};

function ratingOptions(pack: Settings["ratingPack"]): string[] {
  switch (pack) {
    case "emoji":
      return ["😍", "😊", "😐", "😕", "😖"];
    case "thumbs":
      return ["👍", "👎"];
    case "check":
      return ["✓", "−", "✗"];
    case "tens":
      return ["10/10", "9/10", "8/10", "7/10", "6/10", "5/10", "4/10", "3/10", "2/10", "1/10"];
    default:
      return ["😊", "😐", "😖"];
  }
}

function clamp100(s: string): string {
  return s.length > 100 ? s.slice(0, 100) : s;
}

async function getGpsIfAllowed(args: {
  settings: Settings;
  categoryId: string | null;
  categoryDefaultGpsEligible: boolean;
}): Promise<{ lat: number; lng: number } | null> {
  const { settings, categoryId, categoryDefaultGpsEligible } = args;

  if (!settings.gpsGlobalEnabled) return null;
  if (!categoryId) return null;

  const override = settings.categoryGpsOverrides[categoryId];
  const effective = override === undefined ? categoryDefaultGpsEligible : override;
  if (!effective) return null;

  if (!("geolocation" in navigator)) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 4500, maximumAge: 60_000 }
    );
  });
}

/**
 * Note about "auto-open camera":
 * On mobile, browsers often allow programmatic click on a file input on first load,
 * but some environments require an explicit user gesture. We do:
 * - try once automatically
 * - always provide a big tappable button
 */
export function CaptureScreen({ dict, life, settings, onRequirePremium, onSavedGoAlbum }: Props) {
  const toast = useToast();

  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);

  const [rating, setRating] = useState<string | null>(null);
  const [comment, setComment] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const autoOpenAttemptedRef = useRef(false);

  const cats = useMemo(() => settings.categories[life] ?? [], [life, settings.categories]);

  const catDefaultGpsEligible = useMemo(() => {
    if (!categoryId) return false;
    return cats.find((c) => c.id === categoryId)?.gpsEligible ?? false;
  }, [categoryId, cats]);

  const ratingPack = useMemo(() => getEffectiveRatingPack(settings, life), [settings, life]);
  const ratingOpts = useMemo(() => ratingOptions(ratingPack), [ratingPack]);

  const openCamera = () => {
    fileRef.current?.click();
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;

    const blob = file.slice(0, file.size, file.type);
    setImageBlob(blob);

    setRating(null);

    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(URL.createObjectURL(blob));
  };

  const canSave = !!imageBlob;

  const resetAll = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setImageBlob(null);
    setRating(null);
    setComment("");
    setCategoryId(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // Try auto-open camera once when entering Capture (camera-first UX)
  useEffect(() => {
    if (autoOpenAttemptedRef.current) return;
    autoOpenAttemptedRef.current = true;

    if (imageBlob) return;

    const t = window.setTimeout(() => {
      try {
        fileRef.current?.click();
      } catch {
        // ignore
      }
    }, 250);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSave = async () => {
    if (!imageBlob) {
      toast.show(tGet(dict, "capture.photoRequired"));
      return;
    }

    // Standard: max 100 (paywall triggers elsewhere)
    const total = countAllHuskets();
    if (!settings.premium && total >= 100) {
      onRequirePremium();
      return;
    }

    const imageKey = `img:${crypto.randomUUID()}`;

    const gps = await getGpsIfAllowed({
      settings,
      categoryId,
      categoryDefaultGpsEligible: catDefaultGpsEligible,
    });

    const trimmed = clamp100(comment.trim());
    const commentOrNull = trimmed.length > 0 ? trimmed : null;

    const husketBase: Omit<Husket, "id"> = {
      life,
      createdAt: Date.now(),
      imageKey,
      ratingValue: rating,
      comment: commentOrNull,
      categoryId,
      gps,
    };

    await createHusket({ husket: husketBase, imageBlob });

    toast.show(tGet(dict, "capture.saved"));

    resetAll();
    onSavedGoAlbum();
  };

  // ... resten av fila er uendret ...
