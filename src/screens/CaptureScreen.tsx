// ===============================
// src/screens/CaptureScreen.tsx
// ===============================
import React, { useMemo, useRef, useState } from "react";
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

  const cats = useMemo(() => settings.categories[life] ?? [], [life, settings.categories]);

  const catDots = useMemo(() => {
    // Wireframe: 4 dots. If more, we still show 4 (first 4) and pick from dropdown later.
    return cats.slice(0, 4);
  }, [cats]);

  const catDefaultGpsEligible = useMemo(() => {
    if (!categoryId) return false;
    return cats.find((c) => c.id === categoryId)?.gpsEligible ?? false;
  }, [categoryId, cats]);

  const ratingOpts = useMemo(() => ratingOptions(settings), [settings]);

  const pickPhoto = () => fileRef.current?.click();

  const onPickFile = async (file: File | null) => {
    if (!file) return;

    const blob = file.slice(0, file.size, file.type);
    setImageBlob(blob);

    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(URL.createObjectURL(blob));
  };

  const canSave = !!imageBlob;

  const resetForm = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setImageBlob(null);
    setRating(null);
    setComment("");
    setCategoryId(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onSave = async () => {
    if (!imageBlob) {
      toast.show(tGet(dict, "capture.photoRequired"));
      return;
    }

    // Gratis: max 100
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

    const husketBase: Omit<Husket, "id"> = {
      life,
      createdAt: Date.now(),
      imageKey,
      ratingValue: rating,
      comment: clamp100(comment.trim() || ""),
      categoryId,
      gps,
    };

    await createHusket({ husket: husketBase, imageBlob });

    toast.show(tGet(dict, "capture.saved"));
    resetForm();

    // "skrelles av" animasjon kommer senere – men vi hopper direkte til album nå
    onSavedGoAlbum();
  };

  return (
    <div>
      <div className="captureFrame">
        <div className="capturePreview">
          {imagePreviewUrl ? <img src={imagePreviewUrl} alt="" /> : <div>{tGet(dict, "capture.pickPhoto")}</div>}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <button className="flatBtn primary" onClick={pickPhoto} type="button">
          {tGet(dict, "capture.pickPhoto")}
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

      <div className="label">{tGet(dict, "capture.like")}</div>
      <div className="ratingRow">
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

      <div className="label">{tGet(dict, "capture.category")}</div>
      <div className="categoryRow">
        {catDots.map((c) => (
          <button
            key={c.id}
            className={`catDot ${categoryId === c.id ? "active" : ""}`}
            onClick={() => setCategoryId((prev) => (prev === c.id ? null : c.id))}
            type="button"
            aria-label={c.label}
            title={c.label}
          />
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <button className={`flatBtn confirm`} onClick={() => void onSave()} type="button" disabled={!canSave}>
          {tGet(dict, "capture.save")}
        </button>
        {!settings.premium ? (
          <div className="smallHelp" style={{ marginTop: 8 }}>
            Free: 100 husket maks
          </div>
        ) : null}
      </div>
    </div>
  );
}


