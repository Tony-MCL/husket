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
import { getRatingPackOptions, renderRatingValue } from "../domain/ratingPacks";

type Props = {
  dict: I18nDict;
  life: LifeKey;
  settings: Settings;
  onRequirePremium: () => void;
  onSavedGoAlbum: () => void;
};

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
 * Screenshot → shrink → fly into Galleri button.
 * Uses existing preview image URL (no html2canvas dependency).
 */
function animatePreviewToAlbumButton(args: {
  previewEl: HTMLElement | null;
  imageUrl: string | null;
}): Promise<void> {
  const { previewEl, imageUrl } = args;

  if (!previewEl || !imageUrl) return Promise.resolve();

  const targetEl =
    (document.querySelector("#bottomNavAlbumBtn") as HTMLElement | null) ??
    (document.querySelector('[data-nav="album"]') as HTMLElement | null);

  if (!targetEl) return Promise.resolve();

  const from = previewEl.getBoundingClientRect();
  const toBtn = targetEl.getBoundingClientRect();

  // Target: center of Galleri button, ending as a small thumbnail
  const endW = 18;
  const endH = 18;
  const toX = toBtn.left + toBtn.width / 2 - endW / 2;
  const toY = toBtn.top + toBtn.height / 2 - endH / 2;

  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = "";
  img.setAttribute("aria-hidden", "true");

  Object.assign(img.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    objectFit: "cover",
    borderRadius: "16px",
    zIndex: "999999",
    pointerEvents: "none",
    boxShadow: "0 14px 38px rgba(0,0,0,0.22)",
    transformOrigin: "top left",
    opacity: "1",
  } as Partial<CSSStyleDeclaration>);

  document.body.appendChild(img);

  const anim = img.animate(
    [
      {
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        borderRadius: "16px",
        opacity: 1,
        filter: "none",
      },
      {
        left: `${toX}px`,
        top: `${toY}px`,
        width: `${endW}px`,
        height: `${endH}px`,
        borderRadius: "8px",
        opacity: 0.0,
        filter: "blur(0.4px)",
      },
    ],
    {
      duration: 520,
      easing: "cubic-bezier(0.2, 0.9, 0.2, 1)",
      fill: "forwards",
    }
  );

  return new Promise((resolve) => {
    const done = () => {
      try {
        anim.cancel();
      } catch {
        // ignore
      }
      img.remove();
      resolve();
    };

    // Some browsers don’t reliably fire finish, so guard with timeout too.
    const t = window.setTimeout(done, 700);

    anim.onfinish = () => {
      window.clearTimeout(t);
      done();
    };
    anim.oncancel = () => {
      window.clearTimeout(t);
      done();
    };
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

  const [isSaving, setIsSaving] = useState<boolean>(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const autoOpenAttemptedRef = useRef(false);

  // ✅ Used for screenshot animation
  const previewBoxRef = useRef<HTMLDivElement | null>(null);

  const catsAll = useMemo(() => settings.categories[life] ?? [], [life, settings.categories]);

  // NEW: per-life disabled categories => hide from Capture choices
  const disabledMap = useMemo(
    () => settings.disabledCategoryIdsByLife?.[life] ?? {},
    [settings.disabledCategoryIdsByLife, life]
  );

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

  // Rating pack is per-life (fallback to global)
  const activeRatingPack = useMemo(() => getEffectiveRatingPack(settings, life), [settings, life]);
  const ratingOpts = useMemo(() => getRatingPackOptions(activeRatingPack), [activeRatingPack]);

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

  const canSave = !!imageBlob && !isSaving;

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
    if (isSaving) return;

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

    setIsSaving(true);

    // Start the screenshot-to-album animation immediately (do not block on GPS/save)
    const animPromise = animatePreviewToAlbumButton({
      previewEl: previewBoxRef.current,
      imageUrl: imagePreviewUrl,
    });

    try {
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

      // Ensure animation has had time to finish
      await animPromise;

      toast.show(tGet(dict, "capture.saved"));

      resetAll();
      onSavedGoAlbum();
    } finally {
      setIsSaving(false);
    }
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

  const dividerThin: React.CSSProperties = {
    width: "100%",
    height: 0,
    borderTop: "1px solid rgba(247, 243, 237, 0.12)",
    margin: 0,
  };

  // ---- Flat reset for rows ----
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

  // ---- Flat pill style (no outline) ----
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

  // ---- Textarea border matches divider ----
  const textareaStyle: React.CSSProperties = {
    ...baseTextB,
    color: "rgba(247, 243, 237, 0.92)",
    background: "transparent",
    border: "1px solid rgba(247, 243, 237, 0.12)",
    boxShadow: "none",
    outline: "none",
    borderRadius: 14,
  };

  // ✅ Primary button style (Ta bilde + “Ta nytt bilde” + Lagre) with DARK text
  const primaryBtnStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.header, // same as TopBar
    color: "rgba(27, 26, 23, 0.92)", // dark text for contrast on light background
    border: "1px solid rgba(247, 243, 237, 0.14)",
    boxShadow: "none",
    opacity: isSaving ? 0.75 : 1,
  };

  // ✅ Always center the single button under preview
  const photoActionsStyle: React.CSSProperties = {
    marginTop: 10,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  };

  return (
    <div>
      {/* Preview panel */}
      <div
        className="captureFrame"
        style={{
          maxWidth: 680,
          margin: "0 auto",
          marginTop: 12, // ✅ LUFT mellom TopBar og preview
        }}
      >
        <div
          ref={previewBoxRef}
          className="capturePreview"
          style={{
            width: "100%",
            height: "min(260px, 38vh)",
            borderRadius: 16,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {imagePreviewUrl ? (
            <img
              src={imagePreviewUrl}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <div aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ marginTop: 12 }}>
        <div style={dividerThin} />
      </div>

      {/* Photo action (ONE button only) */}
      <div style={photoActionsStyle}>
        <button
          className="flatBtn primary"
          style={primaryBtnStyle}
          onClick={openCamera}
          type="button"
          disabled={isSaving}
        >
          {!imageBlob ? tGet(dict, "capture.pickPhoto") : tGet(dict, "capture.retakePhoto")}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            void onPickFile(f);
          }}
        />
      </div>

      {/* Divider */}
      <div style={{ marginTop: 12 }}>
        <div style={dividerThin} />
      </div>

      {/* Rating */}
      <div className="label" style={{ ...labelTextStyle, marginTop: 10 }}>
        {tGet(dict, "capture.like")}
      </div>
      <div className="ratingRow" aria-label="Rating" style={flatChoiceRowStyle}>
        {ratingOpts.map((v) => {
          const active = rating === v;
          return (
            <button
              key={v}
              className={`pill ${active ? "active" : ""}`}
              onClick={() => setRating((prev) => (prev === v ? null : v))}
              type="button"
              style={{ ...(active ? pillFlatActive : pillFlatBase) }}
              disabled={isSaving}
            >
              {renderRatingValue(v)}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ marginTop: 12 }}>
        <div style={dividerThin} />
      </div>

      {/* Comment */}
      <div className="label" style={{ ...labelTextStyle, marginTop: 10 }}>
        {tGet(dict, "capture.comment")}
      </div>
      <textarea
        className="textarea"
        style={textareaStyle}
        value={comment}
        onChange={(e) => setComment(clamp100(e.target.value))}
        placeholder={tGet(dict, "capture.commentPh")}
        disabled={isSaving}
      />
      <div className="smallHelp" style={helpTextStyle}>
        {comment.length}/100
      </div>

      {/* Divider */}
      <div style={{ marginTop: 12 }}>
        <div style={dividerThin} />
      </div>

      {/* Category */}
      <div className="label" style={{ ...labelTextStyle, marginTop: 10 }}>
        {tGet(dict, "capture.category")}
      </div>
      <div className="ratingRow" aria-label="Categories" style={flatChoiceRowStyle}>
        {cats.length === 0 ? (
          <div className="smallHelp" style={helpTextStyle}>
            {tGet(dict, "capture.noCategories")}
          </div>
        ) : (
          cats.map((c) => {
            const active = categoryId === c.id;
            return (
              <button
                key={c.id}
                className={`pill ${active ? "active" : ""}`}
                onClick={() => setCategoryId((prev) => (prev === c.id ? null : c.id))}
                type="button"
                title={c.label}
                style={{ ...(active ? pillFlatActive : pillFlatBase) }}
                disabled={isSaving}
              >
                {c.label}
              </button>
            );
          })
        )}
      </div>

      {/* Divider */}
      <div style={{ marginTop: 12 }}>
        <div style={dividerThin} />
      </div>

      {/* Save */}
      <div style={{ marginTop: 12, display: "grid", gap: 8, justifyItems: "center" }}>
        <button
          className="flatBtn primary"
          style={primaryBtnStyle}
          onClick={() => void onSave()}
          type="button"
          disabled={!canSave}
        >
          {isSaving ? "Lagrer…" : tGet(dict, "capture.save")}
        </button>
      </div>
    </div>
  );
}
