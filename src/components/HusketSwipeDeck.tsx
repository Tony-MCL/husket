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

  // Fullscreen image view (tap photo)
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

  // Close fullscreen when husket changes
  useEffect(() => {
    setFullOpen(false);
  }, [cur?.id]);

  // ESC closes fullscreen first, else closes modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (fullOpen) {
        setFullOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullOpen, onClose]);

  const commitSwipe = async (dir: "left" | "right") => {
    if (fullOpen) return;

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

  // --- Card style: “fotballkort”-prinsipp (A) ---
  const CARD_MAX_W = 520;

  // ✅ Under-card is slightly narrower so it never sticks out
  const UNDER_CARD_MAX_W = CARD_MAX_W - 18;

  const deckWrapStyle: React.CSSProperties = {
    position: "relative",
    height: "100%",
    display: "grid",
    placeItems: "center",
    padding: "0 12px",
    isolation: "isolate",
    background: MCL_HUSKET_THEME.colors.header, // light background behind card
  };

  const makeCardBase = (maxW: number): React.CSSProperties => ({
    width: "100%",
    maxWidth: maxW,
    borderRadius: 22,
    overflow: "hidden",
    background: MCL_HUSKET_THEME.colors.altSurface, // dark card
    color: MCL_HUSKET_THEME.colors.textOnDark,
    border: `1px solid rgba(27, 26, 23, 0.16)`,
    boxShadow: MCL_HUSKET_THEME.elevation.elev2,
    display: "grid",
    gridTemplateRows: "auto auto",
    position: "relative",
  });

  const cardBaseStyle = makeCardBase(CARD_MAX_W);
  const underCardBaseStyle = makeCardBase(UNDER_CARD_MAX_W);

  const imageFrameStyle: React.CSSProperties = {
    padding: 12, // visible card background around image
    background: MCL_HUSKET_THEME.colors.altSurface,
    display: "grid",
    placeItems: "center",
  };

  const imageShellStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
    border: `1px solid rgba(247, 243, 237, 0.14)`,
    background: "rgba(0,0,0,0.35)",
    // Keep space for metadata: image may not exceed ~58vh
    maxHeight: "min(58vh, 520px)",
    display: "grid",
    placeItems: "center",
    cursor: topUrl ? "pointer" : "default",
  };

  const imageStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  };

  const metaStyle: React.CSSProperties = {
    padding: "12px 14px 14px",
    display: "grid",
    gap: 10,
    background: MCL_HUSKET_THEME.colors.altSurface,
  };

  const metaTopRow: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  };

  const metaLeft: React.CSSProperties = {
    display: "grid",
    gap: 4,
    minWidth: 0,
  };

  const metaBadges: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
    alignItems: "center",
  };

  const darkBadge: React.CSSProperties = {
    ...textB,
    border: `1px solid rgba(247, 243, 237, 0.22)`,
    borderRadius: 999,
    padding: "6px 10px",
    color: MCL_HUSKET_THEME.colors.textOnDark,
    background: "rgba(255, 250, 244, 0.06)",
    whiteSpace: "nowrap",
  };

  const mapBtnStyle: React.CSSProperties = {
    ...textA,
    border: `1px solid rgba(247, 243, 237, 0.22)`,
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(255, 250, 244, 0.06)",
    color: MCL_HUSKET_THEME.colors.textOnDark,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
  };

  const actionBtnStyle: React.CSSProperties = {
    ...textA,
    border: `1px solid rgba(247, 243, 237, 0.22)`,
    borderRadius: 999,
    padding: "10px 14px",
    background: "rgba(255, 250, 244, 0.06)",
    color: MCL_HUSKET_THEME.colors.textOnDark,
    lineHeight: 1,
  };

  const dividerStyle: React.CSSProperties = {
    height: 1,
    width: "100%",
    background: "rgba(247, 243, 237, 0.14)",
    borderRadius: 999,
  };

  const fullOverlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 100000,
    background: "rgba(0,0,0,0.92)",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    padding: "10px 10px calc(10px + env(safe-area-inset-bottom))",
  };

  const fullTopStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  };

  const fullCloseBtn: React.CSSProperties = {
    ...textA,
    border: `1px solid rgba(255,255,255,0.22)`,
    borderRadius: 999,
    background: "rgba(0,0,0,0.25)",
    color: "rgba(255,255,255,0.92)",
    padding: "10px 14px",
    lineHeight: 1,
  };

  const fullImgWrap: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
  };

  const fullImgStyle: React.CSSProperties = {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    display: "block",
  };

  const underScale = 0.975;
  const underOpacity = 0.92;

  return (
    <div style={deckWrapStyle}>
      {/* Under card (peek) */}
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
          <div style={underCardBaseStyle}>
            <div style={imageFrameStyle}>
              <div style={{ ...imageShellStyle, cursor: "default" }}>
                {underUrl ? (
                  <img src={underUrl} alt="" style={imageStyle} />
                ) : (
                  <div className="smallHelp" style={{ ...textB, padding: 14, color: "rgba(247,243,237,0.8)" }}>
                    Loading…
                  </div>
                )}
              </div>
            </div>

            <div style={metaStyle}>
              <div style={metaTopRow}>
                <div style={metaLeft}>
                  <div style={{ ...textB, color: "rgba(247,243,237,0.86)" }}>
                    {tGet(dict, "album.created")}: {formatDate(underItem.createdAt, lang)}
                  </div>
                </div>
                <div style={metaBadges} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Fullscreen photo */}
      {fullOpen && topUrl ? (
        <div role="dialog" aria-modal="true" style={fullOverlayStyle} onClick={() => setFullOpen(false)}>
          <div style={fullTopStyle} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setFullOpen(false)} style={fullCloseBtn}>
              ✕
            </button>
            <div style={{ ...textA, color: "rgba(255,255,255,0.85)" }}>
              {index + 1}/{items.length}
            </div>
          </div>

          <div style={fullImgWrap} onClick={(e) => e.stopPropagation()}>
            <img src={topUrl} alt="" style={fullImgStyle} />
          </div>
        </div>
      ) : null}

      {/* Top (swipe) card */}
      <motion.div
        style={cardBaseStyle}
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

        {/* Image block (tap => fullscreen) */}
        <div style={imageFrameStyle}>
          <div
            style={imageShellStyle}
            onClick={(e) => {
              e.stopPropagation();
              if (!topUrl) return;
              setFullOpen(true);
            }}
            role={topUrl ? "button" : undefined}
            aria-label={topUrl ? (lang === "no" ? "Åpne bilde i fullskjerm" : "Open photo fullscreen") : undefined}
          >
            {topUrl ? (
              <img src={topUrl} alt="" style={imageStyle} />
            ) : (
              <div className="smallHelp" style={{ ...textB, padding: 14, color: "rgba(247,243,237,0.8)" }}>
                Loading…
              </div>
            )}
          </div>
        </div>

        {/* Meta block (UNDER image) */}
        <div style={metaStyle}>
          <div style={metaTopRow}>
            <div style={metaLeft}>
              <div style={{ ...textB, color: "rgba(247,243,237,0.86)" }}>
                {tGet(dict, "album.created")}: {formatDate(cur.createdAt, lang)}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {mapHref ? (
                  <a
                    href={mapHref}
                    target="_blank"
                    rel="noreferrer"
                    title={tGet(dict, "album.map")}
                    style={mapBtnStyle}
                    onClick={(e) => e.stopPropagation()}
                  >
                    🌍 {lang === "no" ? "Kart" : "Map"}
                  </a>
                ) : (
                  <span style={{ ...textB, color: "rgba(247,243,237,0.65)" }}>
                    🌍 {lang === "no" ? "Ingen GPS" : "No GPS"}
                  </span>
                )}
              </div>
            </div>

            <div style={metaBadges}>
              {categoryLabel ? <span style={darkBadge}>{categoryLabel}</span> : <span style={darkBadge}>—</span>}
              {cur.ratingValue ? <span style={darkBadge}>{cur.ratingValue}</span> : <span style={darkBadge}>—</span>}
            </div>
          </div>

          <div style={dividerStyle} />

          {cur.comment ? (
            <div style={{ ...textB, color: "rgba(247,243,237,0.92)", whiteSpace: "pre-wrap" }}>{cur.comment}</div>
          ) : (
            <div style={{ ...textB, color: "rgba(247,243,237,0.60)" }}>{lang === "no" ? "Ingen kommentar." : "No comment."}</div>
          )}

          {/* ✅ Actions: Lukk + Slett (instead of hard-to-reach X) */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 2, gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              style={actionBtnStyle}
              title={lang === "no" ? "Lukk" : "Close"}
            >
              ✕ {lang === "no" ? "Lukk" : "Close"}
            </button>

            <button
              className="flatBtn danger"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCurrent();
              }}
              type="button"
              title={lang === "no" ? "Slett" : "Delete"}
              style={textA}
            >
              🗑 {lang === "no" ? "Slett" : "Delete"}
            </button>
          </div>

          <div className="smallHelp" style={{ ...textB, textAlign: "center", color: "rgba(247,243,237,0.70)" }}>
            {index + 1}/{items.length}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
