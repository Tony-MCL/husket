// ===============================
// src/components/HusketSwipeDeck.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimation, type PanInfo } from "framer-motion";
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
  onClose: () => void;
  onDeleteCurrent: () => void;
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

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function HusketSwipeDeck({
  dict,
  settings,
  items,
  index,
  onSetIndex,
  onClose,
  onDeleteCurrent,
}: Props) {
  const cur = items[index];
  const canOlder = index < items.length - 1; // index 0 = newest, so older is +1
  const canNewer = index > 0;

  const [topUrl, setTopUrl] = useState<string | null>(null);
  const [underUrl, setUnderUrl] = useState<string | null>(null);
  const urlCacheRef = useRef<Map<string, string>>(new Map());

  const controls = useAnimation();

  const lang: "no" | "en" = useMemo(() => {
    if (settings.language === "no") return "no";
    if (settings.language === "en") return "en";
    const n = (navigator.language || "en").toLowerCase();
    return n.startsWith("no") || n.startsWith("nb") || n.startsWith("nn") ? "no" : "en";
  }, [settings.language]);

  const underIndex = useMemo(() => {
    if (canOlder) return index + 1;
    if (canNewer) return index - 1;
    return null;
  }, [index, canOlder, canNewer]);

  const underItem = underIndex != null ? items[underIndex] : null;

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

      const [t, u] = await Promise.all([
        loadOne(topKey),
        underKey ? loadOne(underKey) : Promise.resolve(null),
      ]);

      if (cancelled) return;

      setTopUrl(t);
      setUnderUrl(u);

      const keep = new Set<string>();
      keep.add(topKey);
      if (underKey) keep.add(underKey);

      for (const [k, v] of urlCacheRef.current.entries()) {
        if (!keep.has(k)) {
          try {
            URL.revokeObjectURL(v);
          } catch {
            // ignore
          }
          urlCacheRef.current.delete(k);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cur?.imageKey, underItem?.imageKey]);

  useEffect(() => {
    return () => {
      for (const v of urlCacheRef.current.values()) {
        try {
          URL.revokeObjectURL(v);
        } catch {
          // ignore
        }
      }
      urlCacheRef.current.clear();
    };
  }, []);

  const commitSwipe = async (dir: "left" | "right") => {
    const w = Math.max(window.innerWidth || 360, 360);
    const exitX = dir === "left" ? -w : w;

    await controls.start({
      x: exitX,
      rotate: dir === "left" ? -6 : 6,
      transition: { type: "spring", stiffness: 420, damping: 34 },
    });

    if (dir === "left" && canOlder) onSetIndex(index + 1);
    if (dir === "right" && canNewer) onSetIndex(index - 1);

    controls.set({ x: 0, rotate: 0 });
  };

  const goOlderAnimated = async () => {
    if (!canOlder) return;
    await commitSwipe("left");
  };

  const goNewerAnimated = async () => {
    if (!canNewer) return;
    await commitSwipe("right");
  };

  if (!cur) return null;

  // Under card slightly smaller (so top covers edges)
  const underScale = 0.975;
  const underOpacity = 0.92;

  const sideRating = cur.ratingValue ?? "—";
  const sideCat = categoryLabel ?? "—";
  const sideGps = cur.gps ? "🌍" : "—";

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        display: "grid",
        placeItems: "center",
        padding: "0 12px",
        isolation: "isolate",
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
            opacity: underOpacity,
            transform: `scale(${underScale})`,
          }}
        >
          <div className="husketCard">
            <div className="husketCardTop">
              <div className="husketCardImg">
                {underUrl ? <img src={underUrl} alt="" /> : <div className="smallHelp">Loading…</div>}
              </div>
              <div className="husketCardSide" />
            </div>
            <div className="husketCardMeta">
              <div className="viewerMetaLine">
                <div>
                  {tGet(dict, "album.created")}: {formatDate(underItem.createdAt, lang)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <motion.div
        className="husketCard"
        style={{
          boxShadow: "0 14px 40px rgba(0,0,0,0.22)",
          touchAction: "pan-y",
          background: "#fff",
          opacity: 1,
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          transformStyle: "preserve-3d",
        }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        animate={controls}
        onDrag={(_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
          const w = Math.max(window.innerWidth || 360, 360);
          const p = clamp(info.offset.x / w, -1, 1);
          controls.set({ rotate: p * 6 });
        }}
        onDragEnd={async (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
          const dx = info.offset.x;
          const w = Math.max(window.innerWidth || 360, 360);
          const threshold = Math.max(90, w * 0.22);

          // swipe LEFT => older
          if (dx < -threshold && canOlder) {
            await commitSwipe("left");
            return;
          }

          // swipe RIGHT => newer
          if (dx > threshold && canNewer) {
            await commitSwipe("right");
            return;
          }

          await controls.start({
            x: 0,
            rotate: 0,
            transition: { type: "spring", stiffness: 520, damping: 36 },
          });
        }}
      >
        {/* Arrow overlay */}
        <button
          className="husketCardArrow left"
          onClick={() => void goNewerAnimated()}
          type="button"
          disabled={!canNewer}
          aria-label="Newer"
          title={lang === "no" ? "Nyere" : "Newer"}
        >
          ◀
        </button>

        <button
          className="husketCardArrow right"
          onClick={() => void goOlderAnimated()}
          type="button"
          disabled={!canOlder}
          aria-label="Older"
          title={lang === "no" ? "Eldre" : "Older"}
        >
          ▶
        </button>

        {/* Top: image + side rail */}
        <div className="husketCardTop">
          <div className="husketCardImg" role="button" tabIndex={0} onClick={onClose} onKeyDown={() => {}}>
            {topUrl ? <img src={topUrl} alt="" /> : <div className="smallHelp">Loading…</div>}
          </div>

          <div className="husketCardSide">
            <div className="husketSidePill" title={lang === "no" ? "Rating" : "Rating"}>{sideRating}</div>
            <div className="husketSidePill" title={lang === "no" ? "Kategori" : "Category"}>{sideCat}</div>

            {mapHref ? (
              <a className="husketSidePill" href={mapHref} target="_blank" rel="noreferrer" title={tGet(dict, "album.map")}>
                🌍
              </a>
            ) : (
              <div className="husketSidePill" title="GPS">{sideGps}</div>
            )}
          </div>
        </div>

        {/* Bottom: timestamp + comment + delete */}
        <div className="husketCardMeta">
          <div className="viewerMetaLine">
            <div>
              {tGet(dict, "album.created")}: {formatDate(cur.createdAt, lang)}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {categoryLabel ? <span className="badge">{categoryLabel}</span> : null}
              {cur.ratingValue ? <span className="badge">{cur.ratingValue}</span> : null}
            </div>
          </div>

          {cur.comment ? <div style={{ fontSize: 14 }}>{cur.comment}</div> : null}

          <div style={{ marginTop: 2, display: "flex", justifyContent: "center" }}>
            <button className="flatBtn danger" onClick={onDeleteCurrent} type="button" title={lang === "no" ? "Slett" : "Delete"}>
              🗑 {lang === "no" ? "Slett" : "Delete"}
            </button>
          </div>

          <div className="smallHelp" style={{ textAlign: "center" }}>
            {index + 1}/{items.length}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
