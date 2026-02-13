// ===============================
// src/components/HusketSwipeDeck.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimation, type PanInfo } from "framer-motion";
import type { Husket, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { getImageUrl } from "../data/husketRepo";
import { MCL_HUSKET_THEME } from "../theme";
import { HUSKET_TYPO } from "../theme/typography";

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

  // ---- Typography helpers (A/B) ----
  const textA: React.CSSProperties = {
    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: HUSKET_TYPO.A.fontWeight,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,
  };

  const textB: React.CSSProperties = {
    fontSize: HUSKET_TYPO.B.fontSize,
    fontWeight: HUSKET_TYPO.B.fontWeight,
    lineHeight: HUSKET_TYPO.B.lineHeight,
    letterSpacing: HUSKET_TYPO.B.letterSpacing,
  };

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

  // ====== Minimal changes for the new layout request ======
  // 1) created line should be directly under image, with "Husket øyeblikk:"
  // 2) comment above the info-row
  // 3) info-row contains rating + category + GPS (globe link)
  // 4) thin divider under info-row
  // 5) bottom row: Slett | 1/2 | Lukk (edges + center)
  // NOTE: We keep the existing card structure + CSS classes intact.

  const createdLabel = lang === "no" ? "Husket øyeblikk" : "Husket moment";
  const mapText = lang === "no" ? "Kart" : "Map";

  // Flat-ish, but we do NOT rewrite global button/chip styling here.
  // We keep existing classes and only introduce a local divider + footer row layout.
  const dividerStyle: React.CSSProperties = {
    height: 1,
    background: "rgba(247, 243, 237, 0.18)",
  };

  const infoRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  };

  const footerRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  };

  const footerLeftStyle: React.CSSProperties = {
    justifySelf: "start",
  };

  const footerCenterStyle: React.CSSProperties = {
    justifySelf: "center",
  };

  const footerRightStyle: React.CSSProperties = {
    justifySelf: "end",
  };

  // Keep the original side rail (not touched here) + keep swipe behavior intact.

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        display: "grid",
        placeItems: "center",
        padding: "0 12px",
        isolation: "isolate",

        // Keep viewer/deck background match TopBar/BottomNav/Drawer
        background: MCL_HUSKET_THEME.colors.header,
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
          {/* Under-card: keep same structure as before */}
          <div className="husketCard" style={{ maxWidth: "calc(100% - 2px)" }}>
            <div className="husketCardTop">
              <div className="husketCardImg">
                {underUrl ? <img src={underUrl} alt="" /> : <div className="smallHelp" style={textB}>Loading…</div>}
              </div>
              <div className="husketCardSide" />
            </div>

            <div className="husketCardMeta">
              {/* Date directly under image */}
              <div style={{ ...textB, opacity: 0.9 }}>
                {createdLabel}: {formatDate(underItem.createdAt, lang)}
              </div>

              {/* Divider */}
              <div style={dividerStyle} />

              {/* Bottom row (no buttons on under-card) */}
              <div style={footerRowStyle}>
                <div />
                <div style={{ ...textB, ...footerCenterStyle, opacity: 0.75 }}>
                  {index + 1}/{items.length}
                </div>
                <div />
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
        {/* Arrow overlay (only when available) */}
        {canNewer ? (
          <button
            className="husketCardArrow left"
            onClick={() => void goNewerAnimated()}
            type="button"
            aria-label="Newer"
            title={lang === "no" ? "Nyere" : "Newer"}
            style={textA}
          >
            ◀
          </button>
        ) : null}

        {canOlder ? (
          <button
            className="husketCardArrow right"
            onClick={() => void goOlderAnimated()}
            type="button"
            aria-label="Older"
            title={lang === "no" ? "Eldre" : "Older"}
            style={textA}
          >
            ▶
          </button>
        ) : null}

        {/* Top: image + side rail (UNCHANGED) */}
        <div className="husketCardTop">
          <div className="husketCardImg">
            {topUrl ? <img src={topUrl} alt="" /> : <div className="smallHelp" style={textB}>Loading…</div>}
          </div>

          <div className="husketCardSide">
            {/* keep as-is (existing behavior) */}
            <div className="husketSidePill" title={lang === "no" ? "Rating" : "Rating"} style={textB}>
              {cur.ratingValue ?? "—"}
            </div>
            <div className="husketSidePill" title={lang === "no" ? "Kategori" : "Category"} style={textB}>
              {categoryLabel ?? "—"}
            </div>

            {mapHref ? (
              <a
                className="husketSidePill"
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                title={tGet(dict, "album.map")}
                style={textB}
              >
                🌍
              </a>
            ) : (
              <div className="husketSidePill" title="GPS" style={textB}>
                —
              </div>
            )}
          </div>
        </div>

        {/* Bottom meta area: re-ordered per request */}
        <div className="husketCardMeta">
          {/* Date directly under image */}
          <div style={{ ...textB, opacity: 0.9 }}>
            {createdLabel}: {formatDate(cur.createdAt, lang)}
          </div>

          {/* Free text above info row */}
          {cur.comment ? (
            <div style={{ ...textB, opacity: 0.98, whiteSpace: "pre-wrap" }}>{cur.comment}</div>
          ) : null}

          {/* Rating + Category + GPS on one line */}
          <div style={{ ...infoRowStyle, ...textB, opacity: 0.92 }}>
            <span>⭐ {cur.ratingValue ?? "—"}</span>
            <span>🏷 {categoryLabel ?? "—"}</span>

            {mapHref ? (
              <a
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                style={{ color: "inherit", textDecoration: "none" }}
                title={tGet(dict, "album.map")}
                onClick={(e) => e.stopPropagation()}
              >
                🌍 {mapText}
              </a>
            ) : (
              <span>🌍 —</span>
            )}
          </div>

          {/* Thin divider (no extra spacing height) */}
          <div style={dividerStyle} />

          {/* Bottom row: Slett | 1/2 | Lukk */}
          <div style={footerRowStyle}>
            <div style={footerLeftStyle}>
              <button
                className="flatBtn danger"
                onClick={onDeleteCurrent}
                type="button"
                title={lang === "no" ? "Slett" : "Delete"}
                style={textA}
              >
                🗑 {lang === "no" ? "Slett" : "Delete"}
              </button>
            </div>

            <div className="smallHelp" style={{ ...textB, ...footerCenterStyle, textAlign: "center" }}>
              {index + 1}/{items.length}
            </div>

            <div style={footerRightStyle}>
              <button
                className="flatBtn"
                onClick={onClose}
                type="button"
                title={lang === "no" ? "Lukk" : "Close"}
                style={textA}
              >
                ✕ {lang === "no" ? "Lukk" : "Close"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
