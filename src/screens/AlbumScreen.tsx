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

type Props = {
  dict: I18nDict;
  life: LifeKey;
  settings: Settings;
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

function ratingOptionsFromPack(pack: Settings["ratingPack"]): string[] {
  switch (pack) {
    case "emoji":
      return ["😍", "😊", "😐", "😕", "😖"];
    case "thumbs":
      return ["👍", "👎"];
    case "check":
      return ["✓", "−", "✗"];
    case "tens":
      return ["10/10", "9/10", "8/10", "7/10", "6/10", "5/10", "4/10", "3/10", "2/10", "1/10"];
    default:
      return ["😊", "😐", "😖"];
  }
}

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

export function AlbumScreen({ dict, life, settings }: Props) {
  const [items, setItems] = useState<Husket[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });

  // Filters are per-life
  const [filtersByLife, setFiltersByLife] = useState<Record<string, LifeFilters>>(() => ({}));

  // Dropdown open + draft state
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

  const ratingOptions = useMemo(() => ratingOptionsFromPack(settings.ratingPack), [settings.ratingPack]);

  const applied = useMemo<LifeFilters>(() => {
    return filtersByLife[life] ?? emptyLifeFilters();
  }, [filtersByLife, life]);

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

  // When opening filters: seed draft from applied (for the CURRENT life)
  useEffect(() => {
    if (!filtersOpen) return;
    setDraftRatings(applied.appliedRatings);
    setDraftCategoryIds(applied.appliedCategoryIds);
    setDraftTimeFilter(applied.appliedTimeFilter);
  }, [filtersOpen, applied.appliedRatings, applied.appliedCategoryIds, applied.appliedTimeFilter]);

  // When switching life: close dropdown & close viewer
  useEffect(() => {
    setFiltersOpen(false);
    setViewer({ open: false, index: 0 });
  }, [life]);

  // Close dropdown when clicking outside
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

  const anyAppliedRatingSelected = useMemo(() => Object.values(applied.appliedRatings).some(Boolean), [applied.appliedRatings]);
  const anyAppliedCategorySelected = useMemo(() => Object.values(applied.appliedCategoryIds).some(Boolean), [applied.appliedCategoryIds]);

  const activeSummary = useMemo(() => {
    const parts: string[] = [];

    if (anyAppliedRatingSelected) {
      const picked = Object.entries(applied.appliedRatings)
        .filter(([, v]) => v)
        .map(([k]) => (k === "__none__" ? (lang === "no" ? "Ingen" : "None") : k));
      if (picked.length > 0) parts.push(`⭐ ${picked.join(", ")}`);
    }

    if (anyAppliedCategorySelected) {
      const pickedIds = Object.entries(applied.appliedCategoryIds)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const labels = pickedIds.map((id) =>
        id === "__none__" ? (lang === "no" ? "Ingen" : "None") : categoryLabel(id) ?? id
      );
      if (labels.length > 0) parts.push(`🏷 ${labels.join(", ")}`);
    }

    if (applied.appliedTimeFilter !== "all") {
      parts.push(`⏱ ${timeLabelShort(applied.appliedTimeFilter)}`);
    }

    return parts.length > 0 ? parts : [lang === "no" ? "Ingen filtre" : "No filters"];
  }, [anyAppliedRatingSelected, anyAppliedCategorySelected, applied.appliedRatings, applied.appliedCategoryIds, applied.appliedTimeFilter, lang, cats]);

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

    // Compute what the filtered list WILL look like after deletion (using current filters)
    const nextItems = items.filter((x) => x.id !== id);
    const nextFiltered = applyFiltersToItems({ items: nextItems, applied, nowMs: Date.now() });

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

  // ---- MCL styles for filter UI (per your latest rules) ----
  // Filter field matches main background (mørk mokka). Dropdown uses light cappuccino.
  const filterBtnStyle: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
    background: MCL_HUSKET_THEME.colors.altSurface, // match main view
    color: MCL_HUSKET_THEME.colors.textOnDark,
    border: "none",
    borderRadius: 16,
  };

  // Active-summary badges inside the dark field: light badge, dark text
  const summaryBadgeStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.header,
    color: MCL_HUSKET_THEME.colors.darkSurface,
    border: "none",
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
    background: MCL_HUSKET_THEME.colors.header, // dropdown in light cappuccino
    color: MCL_HUSKET_THEME.colors.darkSurface,
    border: "none", // flat surface, no frame
    display: "grid",
    gap: 12,
  };

  // Labels on the dropdown background should be dark
  const dropLabelStyle: React.CSSProperties = {
    margin: 0,
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  // Flat option zones (no borders). Checked state uses mokka to be obvious.
  const optionZoneBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 10px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    userSelect: "none",
    background: "rgba(255, 250, 244, 0.40)",
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const optionZoneChecked: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.altSurface,
    color: MCL_HUSKET_THEME.colors.textOnDark,
  };

  const optionPillBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
    userSelect: "none",
    background: "rgba(255, 250, 244, 0.40)",
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const optionPillChecked: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.altSurface,
    color: MCL_HUSKET_THEME.colors.textOnDark,
  };

  // Bottom action buttons: dark text on light (no borders)
  const actionBtnBase: React.CSSProperties = {
    border: "none",
    borderRadius: 999,
    padding: "9px 12px",
    fontWeight: 800,
    cursor: "pointer",
    background: "rgba(255, 250, 244, 0.55)",
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const actionBtnDanger: React.CSSProperties = {
    ...actionBtnBase,
    color: MCL_HUSKET_THEME.colors.danger,
  };

  const actionBtnConfirm: React.CSSProperties = {
    ...actionBtnBase,
    background: MCL_HUSKET_THEME.colors.accent, // light accent, still dark text
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  if (items.length === 0) {
    return <div className="smallHelp">{tGet(dict, "album.empty")}</div>;
  }

  return (
    <div>
      {/* Filter bar + dropdown */}
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
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
              {activeSummary.map((p) => (
                <span key={p} className="badge" style={summaryBadgeStyle}>
                  {p}
                </span>
              ))}
            </span>
          </span>
          <span aria-hidden style={{ opacity: 0.85 }}>
            {filtersOpen ? "▴" : "▾"}
          </span>
        </button>

        {filtersOpen ? (
          <div style={dropStyle}>
            {/* Time */}
            <div style={{ display: "grid", gap: 8 }}>
              <div className="label" style={dropLabelStyle}>
                {lang === "no" ? "Tid" : "Time"}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {timeChoices.map(({ key, col }) => {
                  const checked = draftTimeFilter === key;
                  return (
                    <label key={key} style={{ ...(optionZoneBase as any), ...(checked ? optionZoneChecked : null), gridColumn: col }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setDraftTimeExclusive(key)}
                        style={{ transform: "scale(1.1)" }}
                      />
                      <span>{timeLabelShort(key)}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Rating */}
            <div style={{ display: "grid", gap: 8 }}>
              <div className="label" style={dropLabelStyle}>
                {lang === "no" ? "Vurdering" : "Rating"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ratingOptions.map((r) => {
                  const checked = !!draftRatings[r];
                  return (
                    <label key={r} style={{ ...optionPillBase, ...(checked ? optionPillChecked : null) }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDraftRating(r)}
                        style={{ transform: "scale(1.1)" }}
                      />
                      <span>{r}</span>
                    </label>
                  );
                })}

                {(() => {
                  const checked = !!draftRatings["__none__"];
                  return (
                    <label
                      style={{ ...optionPillBase, ...(checked ? optionPillChecked : null) }}
                      title={lang === "no" ? "Huskets uten vurdering" : "Huskets without rating"}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setDraftRatings((p) => ({ ...p, __none__: !p.__none__ }))}
                        style={{ transform: "scale(1.1)" }}
                      />
                      <span>{lang === "no" ? "Ingen" : "None"}
                      </span>
                    </label>
                  );
                })()}
              </div>
            </div>

            {/* Categories */}
            <div style={{ display: "grid", gap: 8 }}>
              <div className="label" style={dropLabelStyle}>
                {lang === "no" ? "Kategori" : "Category"}
              </div>

              {cats.length === 0 ? (
                <div className="smallHelp">{tGet(dict, "capture.noCategories")}</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {cats.map((c) => {
                    const checked = !!draftCategoryIds[c.id];
                    return (
                      <label key={c.id} style={{ ...optionPillBase, ...(checked ? optionPillChecked : null) }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDraftCategory(c.id)}
                          style={{ transform: "scale(1.1)" }}
                        />
                        <span>{c.label}</span>
                      </label>
                    );
                  })}

                  {(() => {
                    const checked = !!draftCategoryIds["__none__"];
                    return (
                      <label
                        style={{ ...optionPillBase, ...(checked ? optionPillChecked : null) }}
                        title={lang === "no" ? "Huskets uten kategori" : "Huskets without category"}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setDraftCategoryIds((p) => ({ ...p, __none__: !p.__none__ }))}
                          style={{ transform: "scale(1.1)" }}
                        />
                        <span>{lang === "no" ? "Ingen" : "None"}</span>
                      </label>
                    );
                  })()}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
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
        <div className="smallHelp">{lang === "no" ? "Ingen treff på valgte filtre." : "No matches for selected filters."}</div>
      ) : (
        <div className="albumGrid">
          {filteredItems.map((it, index) => (
            <button
              key={it.id}
              className="thumb"
              onClick={() => setViewer({ open: true, index })}
              type="button"
              style={{ padding: 0, textAlign: "left", cursor: "pointer" }}
            >
              {thumbUrls[it.id] ? <img className="thumbImg" src={thumbUrls[it.id]} alt="" /> : <div className="capturePreview">Loading…</div>}
              <div className="thumbMeta">
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
          onSetIndex={(next) => setViewer((v) => ({ ...v, index: next }))}
          onDelete={onDeleteFromViewer}
          onClose={() => setViewer({ open: false, index: 0 })}
        />
      ) : null}
    </div>
  );
}
