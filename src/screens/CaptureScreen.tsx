// ===============================
// src/screens/CaptureScreen.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Husket, LifeKey, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { createHusket, countAllHuskets } from "../data/husketRepo";
import { useToast } from "../components/ToastHost";

type Props = {
  dict: I18nDict;
  life: LifeKey;
  settings: Settings;
  onRequirePremium: () => void;
  onSavedGoAlbum: () => void;
};

function ratingOptions(settings: Settings): string[] {
  switch (settings.ratingPack) {
    case "emoji":
      return ["😍", "😊", "😐", "😕", "😖"];
    case "thumbs":
      return ["👍", "👎"];
    case "check":
      return ["✓", "−", "✗"];
    case "tens":
      return [
        "10/10",
        "9/10",
        "8/10",
        "7/10",
        "6/10",
        "5/10",
        "4/10",
        "3/10",
        "2/10",
        "1/10",
      ];
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
export function CaptureScreen({
  dict,
  life,
  settings,
  onRequirePremium,
  onSavedGoAlbum,
}: Props) {
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

  const ratingOpts = useMemo(() => ratingOptions(settings), [settings]);

  const openCamera = () => {
    // always safe to call on button tap
    fileRef.current?.click();
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;

    const blob = file.slice(0, file.size, file.type);
    setImageBlob(blob);

    setRating(null); // optional: reset rating on new photo
    // keep comment/category (user might just retake the photo)

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

  const clearPhotoOnly = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setImageBlob(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // Try auto-open camera once when entering Capture (camera-first UX)
  useEffect(() => {
    if (autoOpenAttemptedRef.current) return;
    autoOpenAttemptedRef.current = true;

    // If we already have a photo, don't open
    if (imageBlob) return;

    // Small delay so layout paints before camera prompt
    const t = window.setTimeout(() => {
      try {
        fileRef.current?.click();
      } catch {
        // ignore (some environments block it)
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

    // Free: max 100
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

    // "skrelles av" animasjon kommer senere – nå: direkte til album
    resetAll();
    onSavedGoAlbum();
  };

  return (
    <div>
      <div
        className="captureFrame"
        style={{
          // Keep preview clearly as a "panel", not a full-view viewer
          maxWidth: 680,
          margin: "0 auto",
        }}
      >
        <div
          className="capturePreview"
          style={{
            // Force a preview-sized area (no full-height behavior)
            width: "100%",
            height: "min(260px, 38vh)",
            borderRadius: 16,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {imagePreviewUrl ? (
            <div
              style={{
                // Inner frame to make it feel like a preview, not a viewer
                width: "100%",
                height: "100%",
                padding: 10,
                boxSizing: "border-box",
                display: "grid",
                placeItems: "center",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
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
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10, placeItems: "center", padding: 14 }}>
              <div className="smallHelp">{tGet(dict, "capture.cameraHint")}</div>
              <button className="flatBtn primary" onClick={openCamera} type="button">
                {tGet(dict, "capture.pickPhoto")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
        {!imageBlob ? (
          <button className="flatBtn primary" onClick={openCamera} type="button">
            {tGet(dict, "capture.pickPhoto")}
          </button>
        ) : (
          <>
            <button className="flatBtn primary" onClick={openCamera} type="button">
              {tGet(dict, "capture.retakePhoto")}
            </button>
            <button className="flatBtn danger" onClick={clearPhotoOnly} type="button">
              {tGet(dict, "capture.removePhoto")}
            </button>
          </>
        )}

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

      <div className="label">{tGet(dict, "capture.like")}</div>
      <div className="ratingRow" aria-label="Rating">
        {ratingOpts.map((v) => (
          <button
            key={v}
            className={`pill ${rating === v ? "active" : ""}`}
            onClick={() => setRating((prev) => (prev === v ? null : v))}
            type="button"
          >
            {v}
          </button>
        ))}
      </div>

      <div className="label">{tGet(dict, "capture.comment")}</div>
      <textarea
        className="textarea"
        value={comment}
        onChange={(e) => setComment(clamp100(e.target.value))}
        placeholder={tGet(dict, "capture.commentPh")}
      />
      <div className="smallHelp">{comment.length}/100</div>

      <div className="label">{tGet(dict, "capture.category")}</div>
      <div className="ratingRow" aria-label="Categories">
        {cats.length === 0 ? (
          <div className="smallHelp">{tGet(dict, "capture.noCategories")}</div>
        ) : (
          cats.map((c) => (
            <button
              key={c.id}
              className={`pill ${categoryId === c.id ? "active" : ""}`}
              onClick={() => setCategoryId((prev) => (prev === c.id ? null : c.id))}
              type="button"
              title={c.label}
            >
              {c.label}
            </button>
          ))
        )}
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <button
          className="flatBtn confirm"
          onClick={() => void onSave()}
          type="button"
          disabled={!canSave}
        >
          {tGet(dict, "capture.save")}
        </button>

        {!settings.premium ? <div className="smallHelp">Free: 100 husket maks</div> : null}
      </div>
    </div>
  );
}
