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
  index: number;
  onSetIndex: (nextIndex: number) => void;
  onDelete: (id: string) => Promise<void>;
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
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DEFAULT_BOTTOM_PANEL_PX = 78;

// Paper/stack swipe tuning
const SWIPE_THRESHOLD_PX = 70;
const SWIPE_MAX_Y_DRIFT_PX = 90;
const TRANSITION_MS = 220;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

type SwipeDir = "toOlder" | "toNewer"; // relative to time

type CardUrls = {
  top: string | null;
  under: string | null;
};

export function ViewHusketModal({
  dict,
  settings,
  items,
  index,
  onSetIndex,
  onDelete,
  onClose,
}: Props) {
  const cur = items[index];

  const [busyDelete, setBusyDelete] = useState(false);

  // Drag/animation state
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const touchRef = useRef<{ x: number; y: number } | null>(null);

  // Two-card stack: cache two URLs at once (top + under)
  const urlCacheRef = useRef<Map<string, string>>(new Map());
  const [urls, setUrls] = useState<CardUrls>({ top: null, under: null });

  const lang: "no" | "en" = useMemo(() => {
    if (settings.language === "no") return "no";
    if (settings.language === "en") return "en";
    const n = (navigator.language || "en").toLowerCase();
    return n.startsWith("no") || n.startsWith("nb") || n.startsWith("nn") ? "no" : "en";
  }, [settings.language]);

  // With newest at index 0:
  // - Older = index + 1 (if index < len-1)
  // - Newer = index - 1 (if index > 0)
  const canOlder = index < items.length - 1;
  const canNewer = index > 0;

  const goOlder = () => {
    if (isAnimating || isDragging) return;
    if (!canOlder) return;
    onSetIndex(index + 1);
  };

  const goNewer = () => {
    if (isAnimating || isDragging) return;
    if (!canNewer) return;
    onSetIndex(index - 1);
  };

  const categoryLabel = useMemo(() => {
    if (!cur) return null;
    const cats = settings.categories[cur.life] ?? [];
    return cats.find((c) => c.id === cur.categoryId)?.label ?? null;
  }, [cur?.categoryId, cur?.life, settings.categories]);

  const mapHref = useMemo(() => {
    if (!cur?.gps) return null;
    const { lat, lng } = cur.gps;
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }, [cur?.gps]);

  // Decide which card sits "under" based on current drag direction:
  // - drag left (dx < 0): reveal OLDER (index+1)
  // - drag right (dx > 0): reveal NEWER (index-1)
  const underIndex = useMemo(() => {
    if (!cur) return null;
    if (dragX < 0) return canOlder ? index + 1 : null;
    if (dragX > 0) return canNewer ? index - 1 : null;
    // when idle: default reveal direction = older if possible, else newer
    if (canOlder) return index + 1;
    if (canNewer) return index - 1;
    return null;
  }, [cur, dragX, index, canOlder, canNewer]);

  // Load/cache URLs for current top + under imageKeys
  useEffect(() => {
    let cancelled = false;

    const loadOne = async (imageKey: string): Promise<string | null> => {
      const cached = urlCacheRef.current.get(imageKey);
      if (cached) return cached;
      const u = await getImageUrl(imageKey);
      if (!u) return null;
      urlCacheRef.current.set(imageKey, u);
      return u;
    };

    (async () => {
      if (!cur) return;

      const topKey = cur.imageKey;
      const underKey = underIndex != null ? items[underIndex]?.imageKey : null;

      const [topUrl, underUrl] = await Promise.all([
        loadOne(topKey),
        underKey ? loadOne(underKey) : Promise.resolve(null),
      ]);

      if (cancelled) return;
      setUrls({ top: topUrl, under: underUrl });

      // Keep cache bounded (very small) to avoid memory growth
      // We keep only the most relevant keys: current + neighbor + one extra
      const keepKeys = new Set<string>();
      keepKeys.add(topKey);
      if (underKey) keepKeys.add(underKey);

      // also keep the opposite neighbor if available (for snappy direction change)
      const otherNeighbor =
        underIndex === index + 1 ? (canNewer ? items[index - 1]?.imageKey : null) : (canOlder ? items[index + 1]?.imageKey : null);
      if (otherNeighbor) keepKeys.add(otherNeighbor);

      const cache = urlCacheRef.current;
      for (const [k, v] of cache.entries()) {
        if (!keepKeys.has(k)) {
          try {
            URL.revokeObjectURL(v);
          } catch {
            // ignore
          }
          cache.delete(k);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cur?.imageKey, underIndex, items, index, canOlder, canNewer]);

  // Cleanup all cached urls on unmount
  useEffect(() => {
    return () => {
      const cache = urlCacheRef.current;
      for (const v of cache.values()) {
        try {
          URL.revokeObjectURL(v);
        } catch {
          // ignore
        }
      }
      cache.clear();
    };
  }, []);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();

    // Match requested direction:
    // Right arrow => older (next)
    // Left arrow  => newer (previous)
    if (e.key === "ArrowRight" && canOlder) goOlder();
    if (e.key === "ArrowLeft" && canNewer) goNewer();
  };

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const completeSwipe = (dir: SwipeDir) => {
    if (isAnimating) return;

    const width = Math.max(window.innerWidth || 360, 360);
    const exitX = dir === "toOlder" ? -width : width;

    setIsAnimating(true);
    setIsDragging(false);

    // animate top out
    setDragX(exitX);

    window.setTimeout(() => {
      // switch item (this makes the previous "under" become "top")
      if (dir === "toOlder" && canOlder) onSetIndex(index + 1);
      if (dir === "toNewer" && canNewer) onSetIndex(index - 1);

      // reset drag position for the new top (no slide-in; under-card effect already handled)
      setDragX(0);

      window.setTimeout(() => {
        setIsAnimating(false);
      }, 20);
    }, TRANSITION_MS);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (isAnimating) return;
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
    setIsDragging(true);
    setDragX(0);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    if (isAnimating) return;

    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 18) return;
    if (Math.abs(dy) > SWIPE_MAX_Y_DRIFT_PX) return;

    setDragX(dx);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    if (isAnimating) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    touchRef.current = null;
    setIsDragging(false);

    if (Math.abs(dx) < Math.abs(dy)) {
      setDragX(0);
      return;
    }

    // Requested direction:
    // swipe LEFT (dx < 0) => OLDER (index+1)
    // swipe RIGHT (dx > 0) => NEWER (index-1)
    if (dx < -SWIPE_THRESHOLD_PX && canOlder) {
      completeSwipe("toOlder");
      return;
    }
    if (dx > SWIPE_THRESHOLD_PX && canNewer) {
      completeSwipe("toNewer");
      return;
    }

    setDragX(0);
  };

  const onDeleteClick = async () => {
    if (!cur || busyDelete || isAnimating) return;
    setBusyDelete(true);
    try {
      await onDelete(cur.id);
    } finally {
      setBusyDelete(false);
    }
  };

  if (!cur) return null;

  const width = Math.max(window.innerWidth || 360, 360);
  const p = clamp(Math.abs(dragX) / width, 0, 1);

  // Under card subtle "come forward"
  const underScale = 0.96 + 0.04 * p;
  const underOpacity = 0.55 + 0.45 * p;
  const underBlur = 2 * (1 - p);

  // Top card "paper" feel
  const rot = (dragX / width) * 2.2; // degrees
  const shadowAlpha = 0.20 + 0.18 * p;

  const topTransition = isDragging
    ? "none"
    : `transform ${TRANSITION_MS}ms cubic-bezier(.22,.61,.36,1), box-shadow ${TRANSITION_MS}ms ease-out`;

  const underTransition = isDragging
    ? "none"
    : `transform ${TRANSITION_MS}ms cubic-bezier(.22,.61,.36,1), opacity ${TRANSITION_MS}ms ease-out, filter ${TRANSITION_MS}ms ease-out`;

  const underItem = underIndex != null ? items[underIndex] : null;

  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        paddingBottom: `calc(${DEFAULT_BOTTOM_PANEL_PX}px + env(safe-area-inset-bottom))`,
        overflow: "hidden",
      }}
    >
      <div className="viewerTop">
        <button className="flatBtn" onClick={onClose} type="button">
          ✕
        </button>

        <div className="badge">
          {index + 1}/{items.length}
        </div>

        <button
          className="flatBtn danger"
          onClick={() => void onDeleteClick()}
          type="button"
          disabled={busyDelete || isAnimating}
          title={lang === "no" ? "Slett" : "Delete"}
        >
          🗑
        </button>
      </div>

      {/* STACK AREA */}
      <div
        style={{
          position: "relative",
          height: "calc(100% - 56px)",
          display: "grid",
          placeItems: "center",
        }}
      >
        {/* UNDER CARD */}
        {underItem ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
              transform: `scale(${underScale})`,
              opacity: underOpacity,
              filter: `blur(${underBlur}px)`,
              transition: underTransition,
            }}
          >
            <div style={{ width: "100%", maxWidth: 980 }}>
              <div className="viewerImgWrap">
                {urls.under ? <img src={urls.under} alt="" /> : <div className="smallHelp">Loading…</div>}
              </div>

              <div className="viewerBottom">
                <div className="viewerMetaLine">
                  <div>
                    {tGet(dict, "album.created")}: {formatDate(underItem.createdAt, lang)}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {(() => {
                      const cats = settings.categories[underItem.life] ?? [];
                      const lab = cats.find((c) => c.id === underItem.categoryId)?.label ?? null;
                      return lab ? <span className="badge">{lab}</span> : null;
                    })()}
                    {underItem.ratingValue ? <span className="badge">{underItem.ratingValue}</span> : null}
                    {underItem.gps ? (
                      <span className="badge" aria-hidden>
                        🌍
                      </span>
                    ) : null}
                  </div>
                </div>

                {underItem.comment ? <div style={{ fontSize: 14 }}>{underItem.comment}</div> : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* TOP CARD (draggable) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 980,
              transform: `translateX(${dragX}px) rotate(${rot}deg)`,
              transition: topTransition,
              willChange: "transform",
              boxShadow: `0 18px 50px rgba(0,0,0,${shadowAlpha})`,
              borderRadius: 18,
            }}
          >
            <div className="viewerImgWrap">
              {urls.top ? <img src={urls.top} alt="" /> : <div className="smallHelp">Loading…</div>}
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
                {/* Left arrow => NEWER */}
                <button className="flatBtn" onClick={goNewer} type="button" disabled={!canNewer || isAnimating}>
                  ◀
                </button>

                <button className="flatBtn" onClick={onClose} type="button">
                  OK
                </button>

                {/* Right arrow => OLDER */}
                <button className="flatBtn" onClick={goOlder} type="button" disabled={!canOlder || isAnimating}>
                  ▶
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
