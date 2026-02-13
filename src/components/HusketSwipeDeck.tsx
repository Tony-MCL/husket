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

export function HusketSwipeDeck({ dict, settings, items, index, onSetIndex, onClose, onDeleteCurrent }: Props) {
  const cur = items[index];
  const canOlder = index < items.length - 1; // index 0 = newest, so older is +1
  const canNewer = index > 0;

  const [topUrl, setTopUrl] = useState<string | null>(null);
  const [underUrl, setUnderUrl] = useState<string | null>(null);
  const urlCacheRef = useRef<Map<string, string>>(new Map());

  const controls = useAnimation();

  const [fullOpen, setFullOpen] = useState(false);

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
    if (!cur.categoryId) return null;
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

      const [t, u] = await Promise.all([loadOne(topKey), underKey ? loadOne(underKey) : Promise.resolve(null)]);
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

  // Close fullscreen on ESC
  useEffect(() => {
    if (!fullOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullOpen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullOpen]);

  const commitSwipe = async (dir: "left" | "right") => {
    if (fullOpen) return; // don't swipe while fullscreen
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

  // Under card: ensure it NEVER peeks wider than top card
  const underScale = 0.965;
  const underOpacity = 0.92;

  const ratingValue = cur.ratingValue ?? null;
  const catValue = categoryLabel ?? null;

  // ---- Flat, no-outline styles ----
  const deckWrap: React.CSSProperties = {
    position: "relative",
    height: "100%",
    display: "grid",
    placeItems: "center",
    padding: "0 12px",
    isolation: "isolate",
    background: MCL_HUSKET_THEME.colors.header,
  };

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 980,
    height: "min(84vh, 820px)",
    borderRadius: 22,
    overflow: "hidden",
    background: MCL_HUSKET_THEME.colors.altSurface, // dark card on light-ish backdrop
    color: MCL_HUSKET_THEME.colors.textOnDark,
    display: "grid",
    gridTemplateRows: "1fr auto",
    position: "relative",
    boxShadow: MCL_HUSKET_THEME.elevation.elev2,
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    transformStyle: "preserve-3d",
  };

  // Image panel: leave visible card background around image
  const imageWrap: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.darkSurface,
    padding: 10,
    boxSizing: "border-box",
    display: "grid",
    placeItems: "center",
  };

  const imageInner: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: 18,
    overflow: "hidden",
    background: "#000",
    display: "grid",
    placeItems: "center",
    cursor: topUrl ? "pointer" : "default",
  };

  const imgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain", // no crop
    display: "block",
  };

  const metaWrap: React.CSSProperties = {
    padding: "12px 14px 12px",
    display: "grid",
    gap: 10,
    background: MCL_HUSKET_THEME.colors.altSurface,
  };

  const createdLine: React.CSSProperties = {
    ...textB,
    opacity: 0.92,
  };

  const commentStyle: React.CSSProperties = {
    ...textB,
    fontWeight: 700, // readable without being “shouty”
    opacity: 0.98,
    wordBreak: "break-word",
  };

  // Rating / category / GPS line (ONE line, wraps if needed)
  const infoRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    ...textB,
    opacity: 0.95,
  };

  const infoItem: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  };

  const divider: React.CSSProperties = {
    height: 1,
    width: "100%",
    background: "rgba(247, 243, 237, 0.18)", // subtle on dark
    borderRadius: 999,
  };

  // Footer: Slett (left), 1/2 (center), Lukk (right)
  const footerRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 10,
  };

  const footerBtn: React.CSSProperties = {
    ...textA,
    border: "none",
    background: "transparent",
    color: MCL_HUSKET_THEME.colors.textOnDark,
    padding: "8px 6px",
    cursor: "pointer",
  };

  const footerBtnLeft: React.CSSProperties = {
    ...footerBtn,
    justifySelf: "start",
    textAlign: "left",
  };

  const footerBtnRight: React.CSSProperties = {
    ...footerBtn,
    justifySelf: "end",
    textAlign: "right",
  };

  const counterStyle: React.CSSProperties = {
    ...textB,
    justifySelf: "center",
    opacity: 0.85,
  };

  // Fullscreen overlay
  const fullOverlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 999999, // above the viewer modal
    background: "rgba(0,0,0,0.92)",
    display: "grid",
    placeItems: "center",
    padding: 12,
  };

  const fullImgWrap: React.CSSProperties = {
    width: "100%",
    height: "100%",
    maxWidth: 1200,
    maxHeight: "92vh",
    display: "grid",
    placeItems: "center",
  };

  return (
    <div style={deckWrap}>
      {/* Fullscreen image */}
      {fullOpen && topUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          style={fullOverlay}
          onClick={() => setFullOpen(false)}
          title={lang === "no" ? "Trykk for å lukke" : "Tap to close"}
        >
          <div style={fullImgWrap}>
            <img src={topUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          </div>
        </div>
      ) : null}

      {/* UNDER card (smaller + guaranteed not wider) */}
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
          <div style={cardStyle}>
            <div style={imageWrap}>
              <div style={{ ...imageInner, cursor: "default" }}>
                {underUrl ? (
                  <img src={underUrl} alt="" style={imgStyle} />
                ) : (
                  <div className="smallHelp" style={{ ...textB, color: MCL_HUSKET_THEME.colors.textOnDark, opacity: 0.75 }}>
                    Loading…
                  </div>
                )}
              </div>
            </div>
            <div style={metaWrap}>
              <div style={createdLine}>
                {(lang === "no" ? "Husket øyeblikk" : "Husket moment")}: {formatDate(underItem.createdAt, lang)}
              </div>
              <div style={divider} />
              <div style={footerRow}>
                <div />
                <div style={counterStyle}>
                  {Math.min(index + 1, items.length)}/{items.length}
                </div>
                <div />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* TOP card (swipe) */}
      <motion.div
        style={cardStyle}
        drag={fullOpen ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        animate={controls}
        onDrag={(_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
          if (fullOpen) return;
          const w = Math.max(window.innerWidth || 360, 360);
          const p = clamp(info.offset.x / w, -1, 1);
          controls.set({ rotate: p * 6 });
        }}
        onDragEnd={async (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
          if (fullOpen) return;

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

        {/* Image panel */}
        <div style={imageWrap}>
          <div
            style={imageInner}
            onClick={() => {
              if (!topUrl) return;
              setFullOpen(true);
            }}
            role={topUrl ? "button" : undefined}
            aria-label={topUrl ? (lang === "no" ? "Åpne bilde i fullskjerm" : "Open image fullscreen") : undefined}
            tabIndex={topUrl ? 0 : -1}
            onKeyDown={(e) => {
              if (!topUrl) return;
              if (e.key === "Enter" || e.key === " ") setFullOpen(true);
            }}
          >
            {topUrl ? (
              <img src={topUrl} alt="" style={imgStyle} />
            ) : (
              <div className="smallHelp" style={{ ...textB, color: MCL_HUSKET_THEME.colors.textOnDark, opacity: 0.75 }}>
                Loading…
              </div>
            )}
          </div>
        </div>

        {/* Meta panel */}
        <div style={metaWrap}>
          {/* Date directly under image */}
          <div style={createdLine}>
            {(lang === "no" ? "Husket øyeblikk" : "Husket moment")}: {formatDate(cur.createdAt, lang)}
          </div>

          {/* Free text above info line */}
          {cur.comment ? <div style={commentStyle}>{cur.comment}</div> : null}

          {/* Rating / Category / GPS in one line */}
          <div style={infoRow}>
            <span style={infoItem} title={lang === "no" ? "Vurdering" : "Rating"}>
              <span aria-hidden>⭐</span>
              <span>{ratingValue ?? "—"}</span>
            </span>

            <span style={infoItem} title={lang === "no" ? "Kategori" : "Category"}>
              <span aria-hidden>🏷</span>
              <span>{catValue ?? "—"}</span>
            </span>

            {mapHref ? (
              <a
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...infoItem,
                  color: MCL_HUSKET_THEME.colors.textOnDark,
                  textDecoration: "none",
                  cursor: "pointer",
                }}
                title={tGet(dict, "album.map")}
              >
                <span aria-hidden>🌍</span>
                <span>{lang === "no" ? "Kart" : "Map"} </span>
              </a>
            ) : (
              <span style={infoItem} title="GPS">
                <span aria-hidden>🌍</span>
                <span>{"—"}</span>
              </span>
            )}
          </div>

          {/* Thin divider (no extra height padding) */}
          <div style={divider} />

          {/* Bottom row: Slett | 1/2 | Lukk */}
          <div style={footerRow}>
            <button type="button" onClick={onDeleteCurrent} style={footerBtnLeft} title={lang === "no" ? "Slett" : "Delete"}>
              🗑 {lang === "no" ? "Slett" : "Delete"}
            </button>

            <div style={counterStyle}>
              {index + 1}/{items.length}
            </div>

            <button type="button" onClick={onClose} style={footerBtnRight} title={lang === "no" ? "Lukk" : "Close"}>
              ✕ {lang === "no" ? "Lukk" : "Close"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
