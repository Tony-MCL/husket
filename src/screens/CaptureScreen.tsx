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
import type { RatingPackKey } from "../domain/types";

type Props = {
  dict: I18nDict;
  life: LifeKey;
  settings: Settings;
  onRequirePremium: () => void;
  onSavedGoAlbum: () => void;
};

function ratingOptionsFromPack(pack: RatingPackKey, premium: boolean): string[] {
  // Defensive: tens is premium-only
  if (pack === "tens" && !premium) pack = "emoji";

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

  const catsAll = useMemo(() => settings.categories[life] ?? [], [life, settings.categories]);

  // NEW: per-life disabled categories => hide from Capture choices
  const disabledMap = useMemo(() => settings.disabledCategoryIdsByLife?.[life] ?? {}, [settings.disabledCategoryIdsByLife, life]);

  const cats = useMemo(() => {
    return catsAll.filter((c) => !disabledMap[c.id]);
  }, [catsAll, disabledMap]);

  // NEW: if current selection becomes disabled (or removed), clear it
  useEffect(() => {
    if (!categoryId) return;
    const existsAndEnabled = cats.some((c) => c.id === categoryId);
    if (!existsAndEnabled) setCategoryId(null);
  }, [categoryId, cats]);

  const catDefaultGpsEligible = useMemo(() => {
    if (!categoryId) return false;
    return catsAll.find((c) => c.id === categoryId)?.gpsEligible ?? false;
  }, [categoryId, catsAll]);

  // Rating pack is PER LIFE (falls back to global in Settings)
  const activePack = useMemo(() => getEffectiveRatingPack(settings, life), [settings, life]);
  const ratingOpts = useMemo(() => ratingOptionsFromPack(activePack, settings.premium), [activePack, settings.premium]);

  const openCamera = () => {
    fileRef.current?.click();
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;

    const blob = file.slice(0, file.size, file.type);
    setImageBlob(blob);

    setRating(null);

    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);

    const url = URL.createObjectURL(blob);
    setImagePreviewUrl(url);
  };

  useEffect(() => {
    // Attempt auto-open once
    if (autoOpenAttemptedRef.current) return;
    autoOpenAttemptedRef.current = true;

    // Only if there is no image yet (prevents annoying loops)
    if (imagePreviewUrl) return;

    // Some browsers will ignore this without a user gesture; that's fine.
    setTimeout(() => openCamera(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSave = !!imageBlob;

  const onSave = async () => {
    if (!imageBlob) return;

    // If tens is somehow active without premium (defensive), treat as emoji pack
    if (activePack === "tens" && !settings.premium) {
      onRequirePremium();
      return;
    }

    const gps = await getGpsIfAllowed({
      settings,
      categoryId,
      categoryDefaultGpsEligible: catDefaultGpsEligible,
    });

    const next: Omit<Husket, "id"> = {
      life,
      createdAt: Date.now(),
      imageKey: "", // set in repo
      ratingValue: rating,
      comment: comment.trim() ? clamp100(comment.trim()) : null,
      categoryId: categoryId,
      gps,
    };

    await createHusket(next, imageBlob);

    // Clear form
    setImageBlob(null);
    setRating(null);
    setComment("");
    setCategoryId(null);

    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);

    toast.show(tGet(dict, "capture.saved"));
    onSavedGoAlbum();
  };

  const remaining = useMemo(() => {
    const max = settings.premium ? 999999 : 25;
    const used = countAllHuskets();
    return Math.max(0, max - used);
  }, [settings.premium]);

  // ---- Typography helpers ----
  const textA: React.CSSProperties = {
    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: HUSKET_TYPO.A.fontWeight,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,
  };

  const textB: React.CSSProperties = {
    fontSize: HUSKET_TYPO.B.fontSize,
    fontWeight: HUSKET_TYPO.B.fontWeight,
    lineHeight: HUSKET_TYPO.B.lineHeight,
    letterSpacing: HUSKET_TYPO.B.letterSpacing,
  };

  const sectionLabel: React.CSSProperties = { ...textB, color: MCL_HUSKET_THEME.colors.muted, margin: "10px 0 6px" };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ ...textA }}>{tGet(dict, "capture.title")}</div>
        {!settings.premium ? (
          <div className="smallHelp" style={{ ...textB, color: MCL_HUSKET_THEME.colors.muted }}>
            {tGet(dict, "capture.remaining")}: {remaining}
          </div>
        ) : null}
      </div>

      <div className="captureFrame">
        <div className="capturePreview" onClick={openCamera} role="button" tabIndex={0}>
          {imagePreviewUrl ? <img src={imagePreviewUrl} alt="" /> : <div className="smallHelp">{tGet(dict, "capture.tapToTake")}</div>}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          void onPickFile(f);
          // allow re-picking same file
          e.currentTarget.value = "";
        }}
      />

      <div style={sectionLabel}>{tGet(dict, "capture.rating")}</div>
      <div className="ratingRow">
        {ratingOpts.map((r) => (
          <button key={r} type="button" className={`pill ${rating === r ? "active" : ""}`} onClick={() => setRating(r)}>
            {r}
          </button>
        ))}
      </div>

      <div style={sectionLabel}>{tGet(dict, "capture.category")}</div>
      <div className="ratingRow">
        {cats.length === 0 ? (
          <div className="smallHelp" style={{ ...textB, color: MCL_HUSKET_THEME.colors.muted }}>
            {tGet(dict, "capture.noCategories")}
          </div>
        ) : (
          cats.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`pill ${categoryId === c.id ? "active" : ""}`}
              onClick={() => setCategoryId(c.id)}
            >
              {c.label}
            </button>
          ))
        )}
      </div>

      <div style={sectionLabel}>{tGet(dict, "capture.comment")}</div>
      <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={tGet(dict, "capture.commentPlaceholder")} />

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
        <button className="flatBtn" type="button" onClick={openCamera} style={textA}>
          {tGet(dict, "capture.takeNew")}
        </button>

        <button className="flatBtn primary" type="button" onClick={() => void onSave()} disabled={!canSave} style={textA}>
          {tGet(dict, "capture.save")}
        </button>
      </div>
    </div>
  );
}
