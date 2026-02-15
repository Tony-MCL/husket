// ===============================
// src/screens/AlbumScreen.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Husket, LifeKey, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { listHuskets, getImageUrl, deleteHusketById } from "../data/husketRepo";
import { ViewHusketModal } from "../components/ViewHusketModal";
import { MCL_HUSKET_THEME } from "../theme";
import { HUSKET_TYPO } from "../theme/typography";
import { getEffectiveRatingPack } from "../domain/settingsCore";
import { formatRatingValueForSummary, getRatingPackOptions, renderRatingValue } from "../domain/ratingPacks";

type Props = {
  dict: I18nDict;
  life: LifeKey;
  settings: Settings;
  onAlbumBecameEmpty?: () => void;
};

function formatThumbDate(ts: number, lang: "no" | "en") {
  const d = new Date(ts);
  if (lang === "no") {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

type TimeFilterKey = "all" | "7d" | "30d" | "365d";
type RatingFilterKey = "any" | "rated" | "unrated";
type CategoryFilterKey = "any" | "none" | "some";

type AppliedFilters = {
  time: TimeFilterKey;
  rating: RatingFilterKey;
  category: CategoryFilterKey;
};

const DEFAULT_FILTERS: AppliedFilters = {
  time: "all",
  rating: "any",
  category: "any",
};

function withinTime(ts: number, nowMs: number, key: TimeFilterKey): boolean {
  if (key === "all") return true;
  const diff = nowMs - ts;
  const dayMs = 24 * 60 * 60 * 1000;
  if (key === "7d") return diff <= 7 * dayMs;
  if (key === "30d") return diff <= 30 * dayMs;
  return diff <= 365 * dayMs;
}

function applyFiltersToItems(args: { items: Husket[]; applied: AppliedFilters; nowMs: number }): Husket[] {
  const { items, applied, nowMs } = args;

  return items.filter((h) => {
    if (!withinTime(h.createdAt, nowMs, applied.time)) return false;

    if (applied.rating === "rated" && !h.ratingValue) return false;
    if (applied.rating === "unrated" && !!h.ratingValue) return false;

    if (applied.category === "none" && !!h.categoryId) return false;
    if (applied.category === "some" && !h.categoryId) return false;

    return true;
  });
}

function countApplied(applied: AppliedFilters): number {
  let n = 0;
  if (applied.time !== "all") n += 1;
  if (applied.rating !== "any") n += 1;
  if (applied.category !== "any") n += 1;
  return n;
}

export function AlbumScreen({ dict, life, settings, onAlbumBecameEmpty }: Props) {
  const [items, setItems] = useState<Husket[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });

  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<AppliedFilters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<AppliedFilters>(DEFAULT_FILTERS);

  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
    };
  }, []);

  useEffect(() => {
    // reset filters when switching lives (keeps logic predictable)
    setDraft(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
  }, [life]);

  useEffect(() => {
    const hs = listHuskets({ life });

    // newest first (hard rule)
    const sorted = [...hs].sort((a, b) => b.createdAt - a.createdAt);
    setItems(sorted);

    // rebuild thumb URLs
    const next: Record<string, string> = {};
    for (const h of sorted) {
      const blob = getImageUrl(h.imageKey);
      if (blob) next[h.id] = blob;
    }

    // revoke old URLs not present anymore
    setThumbUrls((prev) => {
      for (const id of Object.keys(prev)) {
        if (!next[id]) {
          try {
            URL.revokeObjectURL(prev[id]);
          } catch {
            // ignore
          }
        }
      }
      return next;
    });
  }, [life]);

  const activeRatingPack = useMemo(() => getEffectiveRatingPack(settings, life), [settings, life]);
  const ratingOpts = useMemo(() => getRatingPackOptions(activeRatingPack), [activeRatingPack]);

  const filtered = useMemo(() => {
    return applyFiltersToItems({ items, applied, nowMs: Date.now() });
  }, [items, applied]);

  const appliedCount = useMemo(() => countApplied(applied), [applied]);

  const openViewerAt = (index: number) => {
    if (filtered.length === 0) return;
    const clamped = Math.max(0, Math.min(index, filtered.length - 1));
    setViewer({ open: true, index: clamped });
  };

  const onDeleteFromViewer = async (id: string) => {
    // delete from store first
    const removed = await deleteHusketById(id);

    // update local list
    setItems((prev) => prev.filter((x) => x.id !== id));

    // revoke & remove thumb url
    setThumbUrls((prev) => {
      const next = { ...prev };
      const u = next[id];
      if (u) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          // ignore
        }
        delete next[id];
      }
      return next;
    });

    // If delete didn't find anything, just close viewer defensively
    if (!removed) {
      setViewer({ open: false, index: 0 });
      return;
    }

    // Compute what the list WILL look like after deletion (unfiltered + filtered)
    const nextItems = items.filter((x) => x.id !== id);

    // ✅ NEW RULE: if album truly became empty, kick user back to Capture
    if (nextItems.length === 0) {
      setViewer({ open: false, index: 0 });
      onAlbumBecameEmpty?.();
      return;
    }

    const nextFiltered = applyFiltersToItems({ items: nextItems, applied, nowMs: Date.now() });

    // If current filter set becomes empty, just close viewer (do NOT navigate)
    if (nextFiltered.length === 0) {
      setViewer({ open: false, index: 0 });
      return;
    }

    // Keep same index if possible, else clamp to last
    setViewer((v) => {
      const curIndex = Math.min(v.index, nextFiltered.length - 1);
      return { open: true, index: curIndex };
    });
  };

  const timeChoices: Array<{ key: TimeFilterKey; col: 1 | 2 }> = [
    { key: "all", col: 1 },
    { key: "7d", col: 2 },
    { key: "30d", col: 1 },
    { key: "365d", col: 2 },
  ];

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

  const helpText: React.CSSProperties = {
    ...textB,
    color: "rgba(247, 243, 237, 0.70)",
  };

  // ---- visual atoms ----
  const dividerThin: React.CSSProperties = {
    width: "100%",
    height: 0,
    borderTop: "1px solid rgba(247, 243, 237, 0.12)",
    margin: "10px 0",
  };

  const pillBase: React.CSSProperties = {
    border: "none",
    background: "transparent",
    color: "rgba(247, 243, 237, 0.86)",
    padding: "8px 10px",
    borderRadius: 999,
    boxShadow: "none",
    outline: "none",
    cursor: "pointer",
    ...textB,
    lineHeight: 1,
  };

  const pillActive: React.CSSProperties = {
    background: "rgba(247, 243, 237, 0.10)",
    color: "rgba(247, 243, 237, 0.95)",
  };

  const primaryBtnStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.header,
    color: "rgba(27, 26, 23, 0.92)",
    border: "1px solid rgba(247, 243, 237, 0.14)",
    boxShadow: "none",
  };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={textA}>{tGet(dict, "album.title")}</div>

        <button className="flatBtn primary" style={primaryBtnStyle} type="button" onClick={() => setFilterOpen(true)}>
          {tGet(dict, "album.filter")} {appliedCount > 0 ? `(${appliedCount})` : ""}
        </button>
      </div>

      <div style={dividerThin} />

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="smallHelp" style={helpText}>
          {tGet(dict, "album.empty")}
        </div>
      ) : (
        <div className="albumGrid" style={{ marginTop: 10 }}>
          {filtered.map((h, idx) => {
            const url = thumbUrls[h.id];
            const ratingSummary = h.ratingValue ? formatRatingValueForSummary(h.ratingValue, activeRatingPack) : null;

            const catLabel = h.categoryId
              ? (settings.categories[life] ?? []).find((c) => c.id === h.categoryId)?.label ?? null
              : null;

            return (
              <button
                key={h.id}
                type="button"
                className="thumb"
                onClick={() => openViewerAt(idx)}
                style={{
                  border: "1px solid rgba(247, 243, 237, 0.12)",
                  borderRadius: 16,
                  overflow: "hidden",
                  background: "rgba(247, 243, 237, 0.04)",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                {url ? (
                  <img src={url} className="thumbImg" alt="" />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      display: "grid",
                      placeItems: "center",
                      color: "rgba(247, 243, 237, 0.70)",
                      ...textB,
                    }}
                  >
                    {tGet(dict, "album.noImage")}
                  </div>
                )}

                <div className="thumbMeta" style={{ background: "transparent" }}>
                  <span>{formatThumbDate(h.createdAt, settings.language)}</span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {ratingSummary ? <span className="badge">{ratingSummary}</span> : null}
                    {catLabel ? <span className="badge">{catLabel}</span> : null}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Viewer */}
      <ViewHusketModal
        dict={dict}
        open={viewer.open}
        index={viewer.index}
        items={filtered}
        ratingPack={activeRatingPack}
        onClose={() => setViewer({ open: false, index: 0 })}
        onIndexChange={(i) => setViewer((v) => ({ ...v, index: i }))}
        onDelete={onDeleteFromViewer}
        getImageUrlByKey={(key) => getImageUrl(key)}
      />

      {/* Filter modal */}
      {filterOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Album filters">
          <div className="modalBox" style={{ background: MCL_HUSKET_THEME.colors.surface }}>
            <div className="modalTitle" style={textA}>
              {tGet(dict, "album.filterTitle")}
            </div>

            <div style={dividerThin} />

            {/* Time */}
            <div style={{ ...textB, marginBottom: 6, color: "rgba(27, 26, 23, 0.75)" }}>{tGet(dict, "album.filterTime")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {timeChoices.map((c) => {
                const active = draft.time === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    style={{ ...pillBase, ...(active ? pillActive : null), color: active ? "rgba(27,26,23,0.92)" : "rgba(27,26,23,0.78)" }}
                    onClick={() => setDraft((d) => ({ ...d, time: c.key }))}
                  >
                    {tGet(dict, `album.time.${c.key}`)}
                  </button>
                );
              })}
            </div>

            <div style={dividerThin} />

            {/* Rating */}
            <div style={{ ...textB, marginBottom: 6, color: "rgba(27, 26, 23, 0.75)" }}>{tGet(dict, "album.filterRating")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(["any", "rated", "unrated"] as RatingFilterKey[]).map((k) => {
                const active = draft.rating === k;
                return (
                  <button
                    key={k}
                    type="button"
                    style={{ ...pillBase, ...(active ? pillActive : null), color: active ? "rgba(27,26,23,0.92)" : "rgba(27,26,23,0.78)" }}
                    onClick={() => setDraft((d) => ({ ...d, rating: k }))}
                  >
                    {tGet(dict, `album.rating.${k}`)}
                  </button>
                );
              })}
            </div>

            {/* Quick legend for pack */}
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ratingOpts.map((v) => (
                <span key={v} className="badge" style={{ borderColor: "rgba(0,0,0,0.16)", color: "rgba(0,0,0,0.72)" }}>
                  {renderRatingValue(v)}
                </span>
              ))}
            </div>

            <div style={dividerThin} />

            {/* Category */}
            <div style={{ ...textB, marginBottom: 6, color: "rgba(27, 26, 23, 0.75)" }}>{tGet(dict, "album.filterCategory")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(["any", "some", "none"] as CategoryFilterKey[]).map((k) => {
                const active = draft.category === k;
                return (
                  <button
                    key={k}
                    type="button"
                    style={{ ...pillBase, ...(active ? pillActive : null), color: active ? "rgba(27,26,23,0.92)" : "rgba(27,26,23,0.78)" }}
                    onClick={() => setDraft((d) => ({ ...d, category: k }))}
                  >
                    {tGet(dict, `album.category.${k}`)}
                  </button>
                );
              })}
            </div>

            <div className="modalActions" style={{ marginTop: 14 }}>
              <button
                className="flatBtn danger"
                type="button"
                onClick={() => {
                  setDraft(applied);
                  setFilterOpen(false);
                }}
              >
                {tGet(dict, "common.cancel")}
              </button>

              <button
                className="flatBtn"
                type="button"
                onClick={() => {
                  setDraft(DEFAULT_FILTERS);
                }}
              >
                {tGet(dict, "common.reset")}
              </button>

              <button
                className="flatBtn primary"
                type="button"
                onClick={() => {
                  setApplied(draft);
                  setFilterOpen(false);
                }}
              >
                {tGet(dict, "common.apply")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
