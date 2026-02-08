// ===============================
// src/components/ViewHusketModal.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Husket, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { getImageUrl } from "../data/husketRepo";

type Props = {
  dict: I18nDict;
  settings: Settings;
  items: Husket[];
  startIndex: number;
  onClose: () => void;
};

function formatDate(ts: number, lang: "no" | "en") {
  const d = new Date(ts);
  if (lang === "no") {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}.${mm}.${yy} ${hh}:${mi}`;
  }
  return d.toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ViewHusketModal({ dict, settings, items, startIndex, onClose }: Props) {
  const [idx, setIdx] = useState(startIndex);
  const cur = items[idx];

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const lang: "no" | "en" = useMemo(() => {
    if (settings.language === "no") return "no";
    if (settings.language === "en") return "en";
    const n = (navigator.language || "en").toLowerCase();
    return n.startsWith("no") || n.startsWith("nb") || n.startsWith("nn") ? "no" : "en";
  }, [settings.language]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setImgUrl(null);

      const u = await getImageUrl(cur.imageKey);
      if (cancelled) return;
      if (u) urlRef.current = u;
      setImgUrl(u);
    })();
    return () => {
      cancelled = true;
    };
  }, [cur.imageKey]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const canPrev = idx < items.length - 1;
  const canNext = idx > 0;

  const categoryLabel = useMemo(() => {
    const cats = settings.categories[cur.life] ?? [];
    return cats.find((c) => c.id === cur.categoryId)?.label ?? null;
  }, [cur.categoryId, cur.life, settings.categories]);

  const mapHref = useMemo(() => {
    if (!cur.gps) return null;
    const { lat, lng } = cur.gps;
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }, [cur.gps]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowLeft" && canPrev) setIdx((v) => v + 1);
    if (e.key === "ArrowRight" && canNext) setIdx((v) => v - 1);
  };

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Swipe
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    touchRef.current = null;

    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx > 0 && canPrev) setIdx((v) => v + 1);
    if (dx < 0 && canNext) setIdx((v) => v - 1);
  };

  return (
    <div className="viewer" role="dialog" aria-modal="true" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="viewerTop">
        <button className="flatBtn" onClick={onClose} type="button">
          ✕
        </button>
        <div className="badge">
          {idx + 1}/{items.length}
        </div>
      </div>

      <div className="viewerImgWrap">
        {imgUrl ? <img src={imgUrl} alt="" /> : <div className="smallHelp">Loading…</div>}
      </div>

      <div className="viewerBottom">
        <div className="viewerMetaLine">
          <div>
            {tGet(dict, "album.created")}: {formatDate(cur.createdAt, lang)}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {categoryLabel ? <span className="badge">{categoryLabel}</span> : null}
            {cur.ratingValue ? <span className="badge">{cur.ratingValue}</span> : null}
            {mapHref ? (
              <a className="badge" href={mapHref} target="_blank" rel="noreferrer">
                🌍 {tGet(dict, "album.map")}
              </a>
            ) : null}
          </div>
        </div>

        {cur.comment ? <div style={{ fontSize: 14 }}>{cur.comment}</div> : null}

        <div className="viewerNav">
          <button className="flatBtn" onClick={() => canPrev && setIdx((v) => v + 1)} type="button" disabled={!canPrev}>
            ◀
          </button>
          <button className="flatBtn" onClick={onClose} type="button">
            OK
          </button>
          <button className="flatBtn" onClick={() => canNext && setIdx((v) => v - 1)} type="button" disabled={!canNext}>
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}


