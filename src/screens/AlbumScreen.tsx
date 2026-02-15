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

  // ✅ NEW: pick mode for “send”
  pickMode?: boolean;
  onPickHusket?: (h: Husket) => void;
  onCancelPick?: () => void;
};

function formatThumbDate(ts: number, lang: "no" | "en") {
  const d = new Date(ts);
  if (lang === "no") {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}.${mm}.${yy}`;
  }
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

type TimeFilterKey = "all" | "7d" | "30d" | "365d";

type LifeFilters = {
  appliedRatings: Record<string, boolean>;
  appliedCategoryIds: Record<string, boolean>;
  appliedTimeFilter: TimeFilterKey;
};

function emptyLifeFilters(): LifeFilters {
  return { appliedRatings: {}, appliedCategoryIds: {}, appliedTimeFilter: "all" };
}

function computeCutoffMs(timeKey: TimeFilterKey, nowMs: number): number | null {
  if (timeKey === "7d") return nowMs - 7 * 24 * 60 * 60 * 1000;
  if (timeKey === "30d") return nowMs - 30 * 24 * 60 * 60 * 1000;
  if (timeKey === "365d") return nowMs - 365 * 24 * 60 * 60 * 1000;
  return null;
}

function applyFiltersToItems(args: { items: Husket[]; applied: LifeFilters; nowMs: number }): Husket[] {
  const { items, applied, nowMs } = args;

  const ratingsActive = Object.values(applied.appliedRatings).some(Boolean);
  const catsActive = Object.values(applied.appliedCategoryIds).some(Boolean);
  const timeActive = applied.appliedTimeFilter !== "all";

  const cutoffMs = computeCutoffMs(applied.appliedTimeFilter, nowMs);

  const res = items.filter((it) => {
    if (ratingsActive) {
      const key = it.ratingValue ?? "__none__";
      if (!applied.appliedRatings[key]) return false;
    }
    if (catsActive) {
      const key = it.categoryId ?? "__none__";
      if (!applied.appliedCategoryIds[key]) return false;
    }
    if (timeActive && cutoffMs != null) {
      if (it.createdAt < cutoffMs) return false;
    }
    return true;
  });

  res.sort((a, b) => b.createdAt - a.createdAt);
  return res;
}

export function AlbumScreen({ dict, life, settings, onAlbumBecameEmpty, pickMode, onPickHusket, onCancelPick }: Props) {
  const [items, setItems] = useState<Husket[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });

  const [filtersByLife, setFiltersByLife] = useState<Record<string, LifeFilters>>(() => ({}));

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftRatings, setDraftRatings] = useState<Record<string, boolean>>({});
  const [draftCategoryIds, setDraftCategoryIds] = useState<Record<string, boolean>>({});
  const [draftTimeFilter, setDraftTimeFilter] = useState<TimeFilterKey>("all");

  const filterWrapRef = useRef<HTMLDivElement | null>(null);

  const lang: "no" | "en" = useMemo(() => {
    if (settings.language === "no") return "no";
    if (settings.language === "en") return "en";
    const n = (navigator.language || "en").toLowerCase();
    return n.startsWith("no") || n.startsWith("nb") || n.startsWith("nn") ? "no" : "en";
  }, [settings.language]);

  const cats = settings.categories[life] ?? [];

  const categoryLabel = (id: string | null) => {
    if (!id) return null;
    return cats.find((c) => c.id === id)?.label ?? null;
  };

  const activeRatingPack = useMemo(() => getEffectiveRatingPack(settings, life), [settings, life]);
  const packRatingOptions = useMemo(() => getRatingPackOptions(activeRatingPack), [activeRatingPack]);

  useEffect(() => {
    const next = listHuskets(life)
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
    setItems(next);

    let cancelled = false;
    (async () => {
      const urls: Record<string, string> = {};
      for (const it of next.slice(0, 60)) {
        const u = await getImageUrl(it.imageKey);
        if (cancelled) return;
        if (u) urls[it.id] = u;
      }
      if (cancelled) return;
      setThumbUrls((prev) => {
        for (const k of Object.keys(prev)) {
          if (!urls[k]) URL.revokeObjectURL(prev[k]);
        }
        return urls;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [life]);

  useEffect(() => {
    return () => {
      for (const u of Object.values(thumbUrls)) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applied = useMemo<LifeFilters>(() => {
    return filtersByLife[life] ?? emptyLifeFilters();
  }, [filtersByLife, life]);

  useEffect(() => {
    if (!filtersOpen) return;
    setDraftRatings(applied.appliedRatings);
    setDraftCategoryIds(applied.appliedCategoryIds);
    setDraftTimeFilter(applied.appliedTimeFilter);
  }, [filtersOpen, applied.appliedRatings, applied.appliedCategoryIds, applied.appliedTimeFilter]);

  useEffect(() => {
    setFiltersOpen(false);
    setViewer({ open: false, index: 0 });
  }, [life]);

  useEffect(() => {
    if (!filtersOpen) return;

    const onDown = (e: MouseEvent) => {
      const el = filterWrapRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      setFiltersOpen(false);
    };

    window.addEventListener("mousedown", onDown, { capture: true });
    return () => window.removeEventListener("mousedown", onDown, { capture: true } as any);
  }, [filtersOpen]);

  const nowMs = Date.now();

  const filteredItems = useMemo(() => {
    return applyFiltersToItems({ items, applied, nowMs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, applied.appliedRatings, applied.appliedCategoryIds, applied.appliedTimeFilter]);

  const timeLabelShort = (k: TimeFilterKey) => {
    if (lang === "no") {
      if (k === "all") return "Alle";
      if (k === "7d") return "Siste uke";
      if (k === "30d") return "Siste måned";
      return "Siste år";
    }
    if (k === "all") return "All";
    if (k === "7d") return "Last week";
    if (k === "30d") return "Last month";
    return "Last year";
  };

  const ratingOptions = useMemo(() => {
    const inData = new Set<string>();
    for (const it of items) {
      if (it.ratingValue != null && it.ratingValue.trim().length > 0) {
        inData.add(it.ratingValue);
      }
    }

    const ordered: string[] = [];
    for (const r of packRatingOptions) {
      ordered.push(r);
      if (inData.has(r)) inData.delete(r);
    }

    const extras = Array.from(inData);
    extras.sort((a, b) => a.localeCompare(b));
    ordered.push(...extras);

    return ordered;
  }, [items, packRatingOptions]);

  const anyAppliedRatingSelected = useMemo(() => Object.values(applied.appliedRatings).some(Boolean), [applied.appliedRatings]);
  const anyAppliedCategorySelected = useMemo(() => Object.values(applied.appliedCategoryIds).some(Boolean), [applied.appliedCategoryIds]);

  const activeSummary = useMemo(() => {
    const parts: string[] = [];

    if (anyAppliedRatingSelected) {
      const picked = Object.entries(applied.appliedRatings)
        .filter(([, v]) => v)
        .map(([k]) => (k === "__none__" ? (lang === "no" ? "Ingen" : "None") : formatRatingValueForSummary(k)));
      if (picked.length > 0) parts.push(`⭐ ${picked.join(", ")}`);
    }

    if (anyAppliedCategorySelected) {
      const pickedIds = Object.entries(applied.appliedCategoryIds)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const labels = pickedIds.map((id) => {
        if (id === "__none__") return lang === "no" ? "Ingen" : "None";
        return categoryLabel(id) ?? id;
      });

      if (labels.length > 0) parts.push(`🏷 ${labels.join(", ")}`);
    }

    if (applied.appliedTimeFilter !== "all") {
      parts.push(`⏱ ${timeLabelShort(applied.appliedTimeFilter)}`);
    }

    return parts.length > 0 ? parts : [lang === "no" ? "Ingen filtre" : "No filters"];
  }, [
    anyAppliedRatingSelected,
    anyAppliedCategorySelected,
    applied.appliedRatings,
    applied.appliedCategoryIds,
    applied.appliedTimeFilter,
    lang,
    cats,
  ]);

  const toggleDraftRating = (val: string) => {
    setDraftRatings((prev) => ({ ...prev, [val]: !prev[val] }));
  };

  const toggleDraftCategory = (id: string) => {
    setDraftCategoryIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setDraftTimeExclusive = (k: TimeFilterKey) => {
    setDraftTimeFilter(k);
  };

  const applyFiltersAndClose = () => {
    setFiltersByLife((prev) => ({
      ...prev,
      [life]: {
        appliedRatings: draftRatings,
        appliedCategoryIds: draftCategoryIds,
        appliedTimeFilter: draftTimeFilter,
      },
    }));
    setFiltersOpen(false);
    setViewer({ open: false, index: 0 });
  };

  const resetFiltersAndClose = () => {
    setFiltersByLife((prev) => {
      const next = { ...prev };
      next[life] = emptyLifeFilters();
      return next;
    });
    setDraftRatings({});
    setDraftCategoryIds({});
    setDraftTimeFilter("all");
    setFiltersOpen(false);
    setViewer({ open: false, index: 0 });
  };

  const onDeleteFromViewer = async (id: string) => {
    const removed = await deleteHusketById(id);
    setItems((prev) => prev.filter((x) => x.id !== id));

    setThumbUrls((prev) => {
      const next = { ...prev };
      const u = next[id];
      if (u) {
        try {
          URL.revokeObjectURL(u);
        } catch {}
        delete next[id];
      }
      return next;
    });

    if (!removed) {
      setViewer({ open: false, index: 0 });
      return;
    }

    const nextItems = items.filter((x) => x.id !== id);
    if (nextItems.length === 0) {
      setViewer({ open: false, index: 0 });
      onAlbumBecameEmpty?.();
      return;
    }

    const nextFiltered = applyFiltersToItems({ items: nextItems, applied, nowMs: Date.now() });
    if (nextFiltered.length === 0) {
      setViewer({ open: false, index: 0 });
      return;
    }

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

  const filterBtnStyle: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
    background: "transparent",
    color: MCL_HUSKET_THEME.colors.textOnDark,
    border: `1px solid rgba(247, 243, 237, 0.18)`,
    borderRadius: 16,
  };

  const summaryTextStyle: React.CSSProperties = {
    ...textB,
    color: MCL_HUSKET_THEME.colors.textOnDark,
    opacity: 0.95,
    whiteSpace: "nowrap",
  };

  const dropStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    right: 0,
    zIndex: 30,
    borderRadius: 16,
    padding: 12,
    boxShadow: MCL_HUSKET_THEME.elevation.elev2,
    background: MCL_HUSKET_THEME.colors.header,
    color: MCL_HUSKET_THEME.colors.darkSurface,
    border: "none",
    display: "grid",
    gap: 12,
  };

  const dropLabelStyle: React.CSSProperties = {
    ...textA,
    margin: 0,
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const flatChoiceRow: React.CSSProperties = {
    ...textB,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "4px 0",
    border: "none",
    background: "transparent",
    color: MCL_HUSKET_THEME.colors.darkSurface,
    cursor: "pointer",
    userSelect: "none",
  };

  const checkboxStyle: React.CSSProperties = {
    transform: "scale(1.1)",
  };

  const actionsRow: React.CSSProperties = {
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    marginTop: 6,
  };

  const actionBtnBase: React.CSSProperties = {
    ...textA,
    border: "none",
    background: "transparent",
    padding: "6px 0",
    cursor: "pointer",
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const actionBtnDanger: React.CSSProperties = {
    ...actionBtnBase,
    color: MCL_HUSKET_THEME.colors.danger,
  };

  const actionBtnConfirm: React.CSSProperties = {
    ...actionBtnBase,
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const sectionDivider: React.CSSProperties = {
    height: 1,
    width: "100%",
    background: "rgba(27, 26, 23, 0.18)",
    borderRadius: 999,
  };

  const sectionSpacer: React.CSSProperties = {
    display: "grid",
    gap: 12,
  };

  const thumbMetaTypography: React.CSSProperties = {
    ...textB,
  };

  // ✅ pick-mode banner
  const pickBanner: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 16,
    border: "1px solid rgba(247, 243, 237, 0.18)",
    marginBottom: 10,
    display: "flex",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
  };

  const pickBtn: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "rgba(247, 243, 237, 0.92)",
    cursor: "pointer",
    ...textA,
  };

  if (items.length === 0) {
    return (
      <div className="smallHelp" style={textB}>
        {tGet(dict, "album.empty")}
      </div>
    );
  }

  return (
    <div>
      {pickMode ? (
        <div style={pickBanner}>
          <div style={textB}>Velg en husket å sende</div>
          <button type="button" style={pickBtn} onClick={onCancelPick}>
            Avbryt
          </button>
        </div>
      ) : null}

      <div ref={filterWrapRef} style={{ position: "relative", marginBottom: 10 }}>
        <button
          type="button"
          className="flatBtn"
          onClick={() => setFiltersOpen((v) => !v)}
          style={filterBtnStyle}
          aria-expanded={filtersOpen}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span aria-hidden>🔎</span>

            <span style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", minWidth: 0 }}>
              {activeSummary.map((p, idx) => (
                <span key={`${p}-${idx}`} style={summaryTextStyle}>
                  {p}
                </span>
              ))}
            </span>
          </span>

          <span aria-hidden style={{ opacity: 0.85, color: MCL_HUSKET_THEME.colors.textOnDark }}>
            {filtersOpen ? "▴" : "▾"}
          </span>
        </button>

        {filtersOpen ? (
          <div style={dropStyle}>
            <div style={sectionSpacer}>
              <div className="label" style={dropLabelStyle}>
                {lang === "no" ? "Tid" : "Time"}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {timeChoices.map(({ key, col }) => (
                  <label key={key} style={{ ...flatChoiceRow, gridColumn: col }}>
                    <input
                      type="checkbox"
                      checked={draftTimeFilter === key}
                      onChange={() => setDraftTimeExclusive(key)}
                      style={checkboxStyle}
                    />
                    <span>{timeLabelShort(key)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 6 }} />
            <div style={sectionDivider} />
            <div style={{ marginTop: 6 }} />

            <div style={sectionSpacer}>
              <div className="label" style={dropLabelStyle}>
                {lang === "no" ? "Vurdering" : "Rating"}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
                {ratingOptions.map((r) => (
                  <label key={r} style={flatChoiceRow}>
                    <input type="checkbox" checked={!!draftRatings[r]} onChange={() => toggleDraftRating(r)} style={checkboxStyle} />
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{renderRatingValue(r)}</span>
                  </label>
                ))}

                <label style={flatChoiceRow} title={lang === "no" ? "Huskets uten vurdering" : "Huskets without rating"}>
                  <input
                    type="checkbox"
                    checked={!!draftRatings["__none__"]}
                    onChange={() => setDraftRatings((p) => ({ ...p, __none__: !p.__none__ }))}
                    style={checkboxStyle}
                  />
                  <span>{lang === "no" ? "Ingen" : "None"}</span>
                </label>
              </div>
            </div>

            <div style={{ marginTop: 6 }} />
            <div style={sectionDivider} />
            <div style={{ marginTop: 6 }} />

            <div style={sectionSpacer}>
              <div className="label" style={dropLabelStyle}>
                {lang === "no" ? "Kategori" : "Category"}
              </div>

              {cats.length === 0 ? (
                <div className="smallHelp" style={textB}>
                  {tGet(dict, "capture.noCategories")}
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
                  {cats.map((c) => (
                    <label key={c.id} style={flatChoiceRow}>
                      <input
                        type="checkbox"
                        checked={!!draftCategoryIds[c.id]}
                        onChange={() => toggleDraftCategory(c.id)}
                        style={checkboxStyle}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}

                  <label style={flatChoiceRow} title={lang === "no" ? "Huskets uten kategori" : "Huskets without category"}>
                    <input
                      type="checkbox"
                      checked={!!draftCategoryIds["__none__"]}
                      onChange={() => setDraftCategoryIds((p) => ({ ...p, __none__: !p.__none__ }))}
                      style={checkboxStyle}
                    />
                    <span>{lang === "no" ? "Ingen" : "None"}</span>
                  </label>
                </div>
              )}
            </div>

            <div style={actionsRow}>
              <button type="button" onClick={resetFiltersAndClose} style={actionBtnDanger}>
                {lang === "no" ? "Nullstill filtre" : "Reset filters"}
              </button>

              <button type="button" onClick={applyFiltersAndClose} style={actionBtnConfirm}>
                {lang === "no" ? "Aktiver filtre" : "Apply filters"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {filteredItems.length === 0 ? (
        <div className="smallHelp" style={textB}>
          {lang === "no" ? "Ingen treff på valgte filtre." : "No matches for selected filters."}
        </div>
      ) : (
        <div className="albumGrid">
          {filteredItems.map((it, index) => (
            <button
              key={it.id}
              className="thumb"
              onClick={() => {
                if (pickMode && onPickHusket) {
                  onPickHusket(it);
                  return;
                }
                setViewer({ open: true, index });
              }}
              type="button"
              style={{ padding: 0, textAlign: "left", cursor: "pointer" }}
            >
              {thumbUrls[it.id] ? (
                <img className="thumbImg" src={thumbUrls[it.id]} alt="" />
              ) : (
                <div className="capturePreview" style={textB}>
                  Loading…
                </div>
              )}
              <div className="thumbMeta" style={thumbMetaTypography}>
                <span>{formatThumbDate(it.createdAt, lang)}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {it.gps ? <span title={tGet(dict, "album.gps")}>🌍</span> : null}
                  {categoryLabel(it.categoryId) ? <span className="badge">{categoryLabel(it.categoryId)}</span> : null}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {viewer.open ? (
        <ViewHusketModal
          dict={dict}
          settings={settings}
          items={filteredItems}
          index={Math.min(viewer.index, Math.max(filteredItems.length - 1, 0))}
          onSetIndex={(next: number) => setViewer((v) => ({ ...v, index: next }))}
          onDelete={onDeleteFromViewer}
          onClose={() => setViewer({ open: false, index: 0 })}
        />
      ) : null}
    </div>
  );
}
