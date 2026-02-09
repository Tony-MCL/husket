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

// Tinder-like stack swipe tuning
const SWIPE_THRESHOLD_PX = 70;
const SWIPE_MAX_Y_DRIFT_PX = 90;
const TRANSITION_MS = 220;
const DIR_LOCK_PX = 10;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

type SwipeDir = "toOlder" | "toNewer";

type CardUrls = {
  top: string | null;
  under: string | null;
  other: string | null;
};

type LeavingLayer = {
  item: Husket;
  url: string | null;
  startX: number;
  dir: SwipeDir;
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

  // Drag state (only affects TOP card while dragging)
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Leaving layer state (old card animates out while new card is already in place)
  const [leaving, setLeaving] = useState<LeavingLayer | null>(null);
  const [leavingX, setLeavingX] = useState(0);
  const [leavingActive, setLeavingActive] = useState(false); // transition enabled after first frame

  const touchRef = useRef<{ x: number; y: number } | null>(null);

  // Direction lock so under-card never switches mid-gesture
  const dirLockRef = useRef<SwipeDir | null>(null);

  // Cache URLs (object URLs must be revoked)
  const urlCacheRef = useRef<Map<string, string>>(new Map());
  const [urls, setUrls] = useState<CardUrls>({ top: null, under: null, other: null });

  // measure width from stack container
  const stackRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef<number>(360);

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
    if (leaving) return;
    if (!canOlder) return;
    onSetIndex(index + 1);
  };

  const goNewer = () => {
    if (leaving) return;
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

  // Keep widthRef updated
  useEffect(() => {
    const measure = () => {
      const w = stackRef.current?.getBoundingClientRect().width ?? window.innerWidth ?? 360;
      widthRef.current = Math.max(320, Math.floor(w));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Pick which item sits "under" the top while dragging (locked)
  const underIndex = useMemo(() => {
    const locked = dirLockRef.current;

    if (locked === "toOlder") return canOlder ? index + 1 : null;
    if (locked === "toNewer") return canNewer ? index - 1 : null;

    // idle: prefer older if possible, else newer
    if (canOlder) return index + 1;
    if (canNewer) return index - 1;
    return null;
  }, [index, canOlder, canNewer]);

  const underItem = underIndex != null ? items[underIndex] : null;

  // Load/cache URLs for current top + under + opposite neighbor (for instant direction change)
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

      // opposite neighbor for fast flip if user changes drag direction
      const oppKey =
        underIndex === index + 1
          ? canNewer
            ? items[index - 1]?.imageKey ?? null
            : null
          : canOlder
            ? items[index + 1]?.imageKey ?? null
            : null;

      const [topUrl, underUrl, otherUrl] = await Promise.all([
        loadOne(topKey),
        underKey ? loadOne(underKey) : Promise.resolve(null),
        oppKey ? loadOne(oppKey) : Promise.resolve(null),
      ]);

      if (cancelled) return;
      setUrls({ top: topUrl, under: underUrl, other: otherUrl });

      // Keep cache bounded: top + under + opp + leaving (if any)
      const keepKeys = new Set<string>();
      keepKeys.add(topKey);
      if (underKey) keepKeys.add(underKey);
      if (oppKey) keepKeys.add(oppKey);
      if (leaving?.item.imageKey) keepKeys.add(leaving.item.imageKey);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.imageKey, underItem?.imageKey, underIndex, index, canOlder, canNewer, leaving?.item.imageKey]);

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

  // Keyboard
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();

    // Requested direction:
    // Right arrow => older (next)
    // Left arrow  => newer (previous)
    if (e.key === "ArrowRight" && canOlder) goOlder();
    if (e.key === "ArrowLeft" && canNewer) goNewer();
  };

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Core: commit swipe WITHOUT moving the under card.
  // We freeze old card as a separate "leaving" layer, switch index immediately,
  // then animate the leaving layer out. This avoids the “both move / comes back” illusion.
  const commitSwipe = (dir: SwipeDir) => {
    if (!cur) return;
    if (leaving) return;

    const nextIndex = dir === "toOlder" ? index + 1 : index - 1;
    const canGo = dir === "toOlder" ? canOlder : canNewer;
    if (!canGo) {
      dirLockRef.current = null;
      setDragX(0);
      return;
    }

    // Freeze current as leaving layer
    const frozenUrl = urls.top; // current top url
    const start = dragX;

    setLeaving({ item: cur, url: frozenUrl, startX: start, dir });
    setLeavingX(start);
    setLeavingActive(false);

    // Switch index immediately so the new card is already "under"
    onSetIndex(nextIndex);

    // Reset drag state (new top card is static while leaving animates out)
    dirLockRef.current = null;
    setIsDragging(false);
    setDragX(0);
  };

  // When leaving is set, trigger exit animation on next frame
  useEffect(() => {
    if (!leaving) return;

    const w = widthRef.current || 360;
    const exitX = leaving.dir === "toOlder" ? -w : w;

    // 1) ensure first paint at startX (no transition)
    setLeavingActive(false);
    setLeavingX(leaving.startX);

    // 2) next frames: enable transition and move to exitX
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setLeavingActive(true);
        setLeavingX(exitX);
      });
      return () => cancelAnimationFrame(raf2);
    });

    // 3) cleanup after animation completes
    const t = window.setTimeout(() => {
      setLeaving(null);
      setLeavingActive(false);
      setLeavingX(0);
    }, TRANSITION_MS + 30);

    return () => {
      cancelAnimationFrame(raf1);
      window.clearTimeout(t);
    };
  }, [leaving]);

  // Touch handlers (disable dragging while leaving animates)
  const onTouchStart = (e: React.TouchEvent) => {
    if (leaving) return;
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
    dirLockRef.current = null;
    setIsDragging(true);
    setDragX(0);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    if (leaving) return;

    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 18) return;
    if (Math.abs(dy) > SWIPE_MAX_Y_DRIFT_PX) return;

    // lock direction once intent is clear
    if (!dirLockRef.current && Math.abs(dx) > DIR_LOCK_PX) {
      if (dx < 0 && canOlder) dirLockRef.current = "toOlder";
      if (dx > 0 && canNewer) dirLockRef.current = "toNewer";
    }

    setDragX(dx);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    if (leaving) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    touchRef.current = null;
    setIsDragging(false);

    if (Math.abs(dx) < Math.abs(dy)) {
      dirLockRef.current = null;
      setDragX(0);
      return;
    }

    if (dx < -SWIPE_THRESHOLD_PX && canOlder) {
      dirLockRef.current = "toOlder";
      commitSwipe("toOlder");
      return;
    }

    if (dx > SWIPE_THRESHOLD_PX && canNewer) {
      dirLockRef.current = "toNewer";
      commitSwipe("toNewer");
      return;
    }

    // snap back
    dirLockRef.current = null;
    setDragX(0);
  };

  const onDeleteClick = async () => {
    if (!cur || busyDelete || leaving) return;
    setBusyDelete(true);
    try {
      await onDelete(cur.id);
    } finally {
      setBusyDelete(false);
    }
  };

  if (!cur) return null;

  const w = widthRef.current || 360;
  const p = leaving ? 0 : clamp(Math.abs(dragX) / w, 0, 1);

  // Under card subtle "come forward" during drag only
  const underScale = 0.965 + 0.035 * p;
  const underOpacity = 0.58 + 0.42 * p;

  // Top card paper feel while dragging only
  const rot = leaving ? 0 : (dragX / w) * 1.4; // degrees
  const shadowAlpha = 0.18 + 0.18 * p;

  const topTransition = isDragging
    ? "none"
    : `transform ${TRANSITION_MS}ms cubic-bezier(.22,.61,.36,1), box-shadow ${TRANSITION_MS}ms ease-out`;

  const underTransition = isDragging
    ? "none"
    : `transform ${TRANSITION_MS}ms cubic-bezier(.22,.61,.36,1), opacity ${TRANSITION_MS}ms ease-out`;

  const leavingTransition = leavingActive
    ? `transform ${TRANSITION_MS}ms cubic-bezier(.22,.61,.36,1), box-shadow ${TRANSITION_MS}ms ease-out`
    : "none";

  // Build a minimal under-meta label (avoid “two cards moving” illusion)
  const underCreatedText = underItem ? `${tGet(dict, "album.created")}: ${formatDate(underItem.createdAt, lang)}` : null;

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
          disabled={busyDelete || !!leaving}
          title={lang === "no" ? "Slett" : "Delete"}
        >
          🗑
        </button>
      </div>

      {/* STACK AREA */}
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
        {/* UNDER CARD (always stays put) */}
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

              {/* Minimal meta to avoid confusion */}
              <div className="viewerBottom" style={{ opacity: 0.55 }}>
                <div className="viewerMetaLine">
                  <div>{underCreatedText}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* TOP CARD (draggable when not leaving) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: leaving ? "none" : "auto",
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
              overflow: "hidden",
              background: "transparent",
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
                <button className="flatBtn" onClick={goNewer} type="button" disabled={!canNewer || !!leaving}>
                  ◀
                </button>

                <button className="flatBtn" onClick={onClose} type="button">
                  OK
                </button>

                {/* Right arrow => OLDER */}
                <button className="flatBtn" onClick={goOlder} type="button" disabled={!canOlder || !!leaving}>
                  ▶
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* LEAVING LAYER (frozen old card, animates out on top) */}
        {leaving ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
              zIndex: 5,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 980,
                transform: `translateX(${leavingX}px) rotate(${(leavingX / (w || 360)) * 1.4}deg)`,
                transition: leavingTransition,
                willChange: "transform",
                boxShadow: `0 18px 50px rgba(0,0,0,0.32)`,
                borderRadius: 18,
                overflow: "hidden",
              }}
            >
              <div className="viewerImgWrap">
                {leaving.url ? <img src={leaving.url} alt="" /> : <div className="smallHelp">Loading…</div>}
              </div>

              <div className="viewerBottom">
                <div className="viewerMetaLine">
                  <div>
                    {tGet(dict, "album.created")}: {formatDate(leaving.item.createdAt, lang)}
                  </div>
                </div>

                {leaving.item.comment ? <div style={{ fontSize: 14 }}>{leaving.item.comment}</div> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
