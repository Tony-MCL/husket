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

// Swipe/anim tuning
const SWIPE_THRESHOLD_PX = 60;
const SWIPE_MAX_Y_DRIFT_PX = 80;
const TRANSITION_MS = 180;

type SwipeDir = "toOlder" | "toNewer"; // relative to time

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

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const [busyDelete, setBusyDelete] = useState(false);

  // Drag/animation state
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const swipeDirRef = useRef<SwipeDir | null>(null);

  const lang: "no" | "en" = useMemo(() => {
    if (settings.language === "no") return "no";
    if (settings.language === "en") return "en";
    const n = (navigator.language || "en").toLowerCase();
    return n.startsWith("no") || n.startsWith("nb") || n.startsWith("nn") ? "no" : "en";
  }, [settings.language]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cur) return;

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
  }, [cur?.imageKey]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

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

  const animateSwipe = (dir: SwipeDir) => {
    // dir decides where the current card exits
    // - toOlder: user swiped left => card exits left (negative)
    // - toNewer: user swiped right => card exits right (positive)
    if (isAnimating) return;

    const width = Math.max(window.innerWidth || 360, 360);
    const exitX = dir === "toOlder" ? -width : width;
    swipeDirRef.current = dir;

    setIsAnimating(true);
    setIsDragging(false);
    setDragX(exitX);

    window.setTimeout(() => {
      // switch item
      if (dir === "toOlder" && canOlder) onSetIndex(index + 1);
      if (dir === "toNewer" && canNewer) onSetIndex(index - 1);

      // snap new card in from opposite side, then animate to 0
      const enterX = dir === "toOlder" ? width : -width;
      setDragX(enterX);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setDragX(0);
          window.setTimeout(() => {
            setIsAnimating(false);
            swipeDirRef.current = null;
          }, TRANSITION_MS);
        });
      });
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

    // Ignore vertical scroll-ish drags
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

    // vertical-ish? ignore
    if (Math.abs(dx) < Math.abs(dy)) {
      setDragX(0);
      return;
    }

    // Requested direction:
    // swipe LEFT (dx < 0) => go to OLDER (index+1)
    // swipe RIGHT (dx > 0) => go to NEWER (index-1)
    if (dx < -SWIPE_THRESHOLD_PX && canOlder) {
      animateSwipe("toOlder");
      return;
    }
    if (dx > SWIPE_THRESHOLD_PX && canNewer) {
      animateSwipe("toNewer");
      return;
    }

    // not enough: snap back
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

  const transition = isDragging
    ? "none"
    : `transform ${TRANSITION_MS}ms ease-out`;

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

      {/* This wrapper follows your swipe */}
      <div
        style={{
          transform: `translateX(${dragX}px)`,
          transition,
          willChange: "transform",
        }}
      >
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
  );
}
