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

// Calm “paper” swipe tuning
const SWIPE_THRESHOLD_PX = 80;
const SWIPE_MAX_Y_DRIFT_PX = 90;
const TRANSITION_MS = 240;
const DIR_LOCK_PX = 10;
const DRAG_DAMPING = 0.92;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

type SwipeDir = "toOlder" | "toNewer";

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

  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const dirLockRef = useRef<SwipeDir | null>(null);

  const urlCacheRef = useRef<Map<string, string>>(new Map());
  const [urls, setUrls] = useState<CardUrls>({ top: null, under: null });

  const stackRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef<number>(360);

  const lang: "no" | "en" = useMemo(() => {
    if (settings.language === "no") return "no";
    if (settings.language === "en") return "en";
    const n = (navigator.language || "en").toLowerCase();
    return n.startsWith("no") || n.startsWith("nb") || n.startsWith("nn") ? "no" : "en";
  }, [settings.language]);

  const canOlder = index < items.length - 1;
  const canNewer = index > 0;

  const goOlder = () => {
    if (isAnimatingOut || isDragging) return;
    if (!canOlder) return;
    onSetIndex(index + 1);
  };

  const goNewer = () => {
    if (isAnimatingOut || isDragging) return;
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

  useEffect(() => {
    const measure = () => {
      const w = stackRef.current?.getBoundingClientRect().width ?? window.innerWidth ?? 360;
      widthRef.current = Math.max(320, Math.floor(w));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const underIndex = useMemo(() => {
    const locked = dirLockRef.current;
    if (locked === "toOlder") return canOlder ? index + 1 : null;
    if (locked === "toNewer") return canNewer ? index - 1 : null;

    if (canOlder) return index + 1;
    if (canNewer) return index - 1;
    return null;
  }, [index, canOlder, canNewer]);

  const underItem = underIndex != null ? items[underIndex] : null;

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
      const underKey = underItem?.imageKey ?? null;

      const [topUrl, underUrl] = await Promise.all([
        loadOne(topKey),
        underKey ? loadOne(underKey) : Promise.resolve(null),
      ]);

      if (cancelled) return;
      setUrls({ top: topUrl, under: underUrl });

      // keep cache tight (top + under)
      const keep = new Set<string>();
      keep.add(topKey);
      if (underKey) keep.add(underKey);

      const cache = urlCacheRef.current;
      for (const [k, v] of cache.entries()) {
        if (!keep.has(k)) {
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
  }, [cur?.imageKey, underItem?.imageKey]);

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
    if (e.key === "ArrowRight" && canOlder) goOlder();
    if (e.key === "ArrowLeft" && canNewer) goNewer();
  };

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const animateOutThenFlip = (dir: SwipeDir) => {
    if (isAnimatingOut) return;

    const canGo = dir === "toOlder" ? canOlder : canNewer;
    if (!canGo) {
      dirLockRef.current = null;
      setDragX(0);
      return;
    }

    const w = widthRef.current || 360;
    const exitX = dir === "toOlder" ? -w : w;

    setIsAnimatingOut(true);
    setIsDragging(false);

    setDragX(exitX);

    window.setTimeout(() => {
      if (dir === "toOlder") onSetIndex(index + 1);
      else onSetIndex(index - 1);

      dirLockRef.current = null;
      setDragX(0);

      window.setTimeout(() => {
        setIsAnimatingOut(false);
      }, 20);
    }, TRANSITION_MS);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (isAnimatingOut) return;
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
    dirLockRef.current = null;
    setIsDragging(true);
    setDragX(0);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    if (isAnimatingOut) return;

    const t = e.touches[0];
    const rawDx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    if (Math.abs(dy) > Math.abs(rawDx) && Math.abs(dy) > 18) return;
    if (Math.abs(dy) > SWIPE_MAX_Y_DRIFT_PX) return;

    const dx = rawDx * DRAG_DAMPING;

    if (!dirLockRef.current && Math.abs(dx) > DIR_LOCK_PX) {
      if (dx < 0 && canOlder) dirLockRef.current = "toOlder";
      if (dx > 0 && canNewer) dirLockRef.current = "toNewer";
    }

    setDragX(dx);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    if (isAnimatingOut) return;

    const t = e.changedTouches[0];
    const rawDx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    touchRef.current = null;
    setIsDragging(false);

    const dx = rawDx * DRAG_DAMPING;

    if (Math.abs(dx) < Math.abs(dy)) {
      dirLockRef.current = null;
      setDragX(0);
      return;
    }

    if (dx < -SWIPE_THRESHOLD_PX && canOlder) {
      dirLockRef.current = "toOlder";
      animateOutThenFlip("toOlder");
      return;
    }

    if (dx > SWIPE_THRESHOLD_PX && canNewer) {
      dirLockRef.current = "toNewer";
      animateOutThenFlip("toNewer");
      return;
    }

    dirLockRef.current = null;
    setDragX(0);
  };

  const onDeleteClick = async () => {
    if (!cur || busyDelete || isAnimatingOut) return;
    setBusyDelete(true);
    try {
      await onDelete(cur.id);
    } finally {
      setBusyDelete(false);
    }
  };

  if (!cur) return null;

  const w = widthRef.current || 360;
  const p = clamp(Math.abs(dragX) / w, 0, 1);

  const underScale = 0.975 + 0.025 * p;
  const underOpacity = 0.70 + 0.30 * p;

  const shadowAlpha = 0.12 + 0.14 * p;

  const topTransition = isDragging
    ? "none"
    : `transform ${TRANSITION_MS}ms cubic-bezier(.22,.61,.36,1), box-shadow ${TRANSITION_MS}ms ease-out`;
  const underTransition = isDragging
    ? "none"
    : `transform ${TRANSITION_MS}ms cubic-bezier(.22,.61,.36,1), opacity ${TRANSITION_MS}ms ease-out`;

  const underCreatedText = underItem
    ? `${tGet(dict, "album.created")}: ${formatDate(underItem.createdAt, lang)}`
    : null;

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
          disabled={busyDelete || isAnimatingOut}
          title={lang === "no" ? "Slett" : "Delete"}
        >
          🗑
        </button>
      </div>

      <div
        ref={stackRef}
        style={{
          position: "relative",
          height: "calc(100% - 56px)",
          display: "grid",
          placeItems: "center",
          padding: "0 12px",
        }}
      >
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
              transition: underTransition,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 980,
                borderRadius: 18,
                overflow: "hidden",
              }}
            >
              <div className="viewerImgWrap">
                {urls.under ? <img src={urls.under} alt="" /> : <div className="smallHelp">Loading…</div>}
              </div>

              <div className="viewerBottom" style={{ opacity: 0.55 }}>
                <div className="viewerMetaLine">
                  <div>{underCreatedText}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

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
              transform: `translateX(${dragX}px)`,
              transition: topTransition,
              willChange: "transform",
              boxShadow: `0 14px 40px rgba(0,0,0,${shadowAlpha})`,
              borderRadius: 18,
              overflow: "hidden",
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
                <button className="flatBtn" onClick={goNewer} type="button" disabled={!canNewer || isAnimatingOut}>
                  ◀
                </button>

                <button className="flatBtn" onClick={onClose} type="button">
                  OK
                </button>

                <button className="flatBtn" onClick={goOlder} type="button" disabled={!canOlder || isAnimatingOut}>
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
