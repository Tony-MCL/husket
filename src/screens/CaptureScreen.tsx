// ===============================
// src/screens/CaptureScreen.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Husket, LifeKey, Settings, RatingPackKey } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { createHusket, countAllHuskets } from "../data/husketRepo";
import { useToast } from "../components/ToastHost";
import { HUSKET_TYPO } from "../theme/typography";
import { getEffectiveRatingPack } from "../domain/settingsCore";

type Props = {
  dict: I18nDict;
  life: LifeKey;
  settings: Settings;
  onRequirePremium: () => void;
  onSavedGoAlbum: () => void;
};

function ratingOptionsFromPack(pack: RatingPackKey, premium: boolean): string[] {
  // Defensive: tens is premium-only
  const effective = pack === "tens" && !premium ? "emoji" : pack;

  switch (effective) {
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

  // per-life disabled categories => hide from Capture choices
  const disabledMap = useMemo(() => settings.disabledCategoryIdsByLife?.[life] ?? {}, [settings.disabledCategoryIdsByLife, life]);

  const cats = useMemo(() => {
    return catsAll.filter((c) => !disabledMap[c.id]);
  }, [catsAll, disabledMap]);

  useEffect(() => {
    if (!categoryId) return;
    const existsAndEnabled = cats.some((c) => c.id === categoryId);
    if (!existsAndEnabled) setCategoryId(null);
  }, [categoryId, cats]);

  const catDefaultGpsEligible = useMemo(() => {
    if (!categoryId) return false;
    return catsAll.find((c) => c.id === categoryId)?.gpsEligible ?? false;
  }, [categoryId, catsAll]);

  // Rating pack is PER LIFE (falls back to global)
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

  // Try auto-open camera once when entering Capture
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

    // Non-premium limit (same as before)
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

  // ---- Typography (B) ----
  const baseTextB: React.CSSProperties = {
    fontSize: HUSKET_TYPO.B.fontSize,
    fontWeight: HUSKET_TYPO.B.fontWeight,
    lineHeight: HUSKET_TYPO.B.lineHeight,
    letterSpacing: HUSKET_TYPO.B.letterSpacing,
  };

  const labelTextStyle: React.CSSProperties = {
    ...baseTextB,
    color: "rgba(247, 243, 237, 0.78)",
  };

  const helpTextStyle: React.CSSProperties = {
    ...baseTextB,
    color: "rgba(247, 243, 237, 0.60)",
  };

  const flatChoiceRowStyle: React.CSSProperties = {
    border: "none",
    boxShadow: "none",
    outline: "none",
    background: "transparent",
    padding: 0,
    borderRadius: 0,
    justifyContent: "center",
    textAlign: "center",
  };

  const pillFlatBase: React.CSSProperties = {
    border: "none",
    boxShadow: "none",
    outline: "none",
    background: "transparent",
    color: "rgba(247, 243, 237, 0.88)",
  };

  const pillFlatActive: React.CSSProperties = {
    background: "rgba(247, 243, 237, 0.10)",
    color: "rgba(247, 243, 237, 0.95)",
  };

  const textareaStyle: React.CSSProperties = {
    ...baseTextB,
    color: "rgba(247, 243, 237, 0.92)",
    background: "transparent",
    border: "1px solid rgba(247, 243, 237, 0.12)",
    boxShadow: "none",
    outline: "none",
    borderRadius: 14,
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={labelTextStyle}>{tGet(dict, "capture.title")}</div>

      <div className="captureFrame">
        <div className="capturePreview" onClick={openCamera} role="button" tabIndex={0}>
          {imagePreviewUrl ? <img src={imagePreviewUrl} alt="" /> : <div className="smallHelp" style={helpTextStyle}>{tGet(dict, "capture.tapToTake")}</div>}
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
          e.currentTarget.value = "";
        }}
      />

      <div style={labelTextStyle}>{tGet(dict, "capture.rating")}</div>
      <div className="ratingRow" style={flatChoiceRowStyle}>
        {ratingOpts.map((r) => (
          <button
            key={r}
            type="button"
            className="pill"
            onClick={() => setRating(r)}
            style={{ ...pillFlatBase, ...(rating === r ? pillFlatActive : null) }}
          >
            {r}
          </button>
        ))}
      </div>

      <div style={labelTextStyle}>{tGet(dict, "capture.category")}</div>
      <div className="ratingRow" style={flatChoiceRowStyle}>
        {cats.length === 0 ? (
          <div className="smallHelp" style={helpTextStyle}>
            {tGet(dict, "capture.noCategories")}
          </div>
        ) : (
          cats.map((c) => (
            <button
              key={c.id}
              type="button"
              className="pill"
              onClick={() => setCategoryId(c.id)}
              style={{ ...pillFlatBase, ...(categoryId === c.id ? pillFlatActive : null) }}
            >
              {c.label}
            </button>
          ))
        )}
      </div>

      <div style={labelTextStyle}>{tGet(dict, "capture.comment")}</div>
      <textarea
        className="textarea"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={tGet(dict, "capture.commentPlaceholder")}
        style={textareaStyle}
      />

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button className="flatBtn" type="button" onClick={openCamera}>
          {tGet(dict, "capture.takeNew")}
        </button>

        <button className="flatBtn primary" type="button" onClick={() => void onSave()} disabled={!canSave}>
          {tGet(dict, "capture.save")}
        </button>
      </div>
    </div>
  );
}
