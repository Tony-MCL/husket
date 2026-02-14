// ===============================
// src/screens/AlbumScreen.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Husket, LifeKey, Settings, RatingPackKey } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { listHuskets, getImageUrl, deleteHusketById } from "../data/husketRepo";
import { ViewHusketModal } from "../components/ViewHusketModal";
import { MCL_HUSKET_THEME } from "../theme";
import { HUSKET_TYPO } from "../theme/typography";
import { getEffectiveRatingPack } from "../domain/settingsCore";

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

function ratingOptionsFromPack(pack: RatingPackKey, premium: boolean): string[] {
  const effective = pack === "tens" && !premium ? "emoji" : pack;
  switch (effective) {
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

  // Per-life pack affects ordering in filter UI (not what is stored)
  const packForLife = useMemo(() => getEffectiveRatingPack(settings, life), [settings, life]);
  const packRatingOptions = useMemo(() => ratingOptionsFromPack(packForLife, settings.premium), [packForLife, settings.premium]);

  useEffect(() => {
    const next = listHuskets(life).slice().sort((a, b) => b.createdAt - a.createdAt);
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
  const filteredItems = useMemo(() => applyFiltersToItems({ items, applied, nowMs }), [items, applied, nowMs]);

  // Ratings in filter dropdown: pack order first, but include ANY ratings that exist in data
  const ratingOptions = useMemo(() => {
    const present = new Set<string>();
    for (const it of items) present.add(it.ratingValue ?? "__none__");

    const ordered: string[] = [];
    for (const r of packRatingOptions) {
      if (present.has(r)) ordered.push(r);
    }
    for (const r of Array.from(present)) {
      if (!ordered.includes(r)) ordered.push(r);
    }

    const noneIdx = ordered.indexOf("__none__");
    if (noneIdx >= 0) {
      ordered.splice(noneIdx, 1);
      ordered.push("__none__");
    }

    return ordered;
  }, [items, packRatingOptions]);

  const catChoices = useMemo(() => {
    const present = new Set<string>();
    for (const it of items) present.add(it.categoryId ?? "__none__");

    const ordered: string[] = [];
    for (const c of cats) {
      if (present.has(c.id)) ordered.push(c.id);
    }
    for (const id of Array.from(present)) {
      if (!ordered.includes(id)) ordered.push(id);
    }

    const noneIdx = ordered.indexOf("__none__");
    if (noneIdx >= 0) {
      ordered.splice(noneIdx, 1);
      ordered.push("__none__");
    }

    return ordered;
  }, [items, cats]);

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
        } catch {
          // ignore
        }
        delete next[id];
      }
      return next;
    });

    if (!removed) {
      setViewer({ open: false, index: 0 });
      return;
    }

    const nextItems = items.filter((x) => x.id !== id);
    const nextFiltered = applyFiltersToItems({ items: nextItems, applied, nowMs: Date.now() });

    if (nextFiltered.length === 0) {
      setViewer({ open: false, index: 0 });
      return;
    }

    setViewer((v) => ({ open: true, index: Math.min(v.index, nextFiltered.length - 1) }));
  };

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

  if (items.length === 0) {
    return (
      <div className="smallHelp" style={textB}>
        {tGet(dict, "album.empty")}
      </div>
    );
  }

  const activeSummary = (() => {
    const parts: string[] = [];

    const anyRating = Object.values(applied.appliedRatings).some(Boolean);
    const anyCat = Object.values(applied.appliedCategoryIds).some(Boolean);

    if (anyRating) {
      const picked = Object.entries(applied.appliedRatings)
        .filter(([, v]) => v)
        .map(([k]) => (k === "__none__" ? (lang === "no" ? "Ingen" : "None") : k));
      if (picked.length > 0) parts.push(`⭐ ${picked.join(", ")}`);
    }

    if (anyCat) {
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
      const label =
        lang === "no"
          ? applied.appliedTimeFilter === "7d"
            ? "Siste uke"
            : applied.appliedTimeFilter === "30d"
              ? "Siste måned"
              : "Siste år"
          : applied.appliedTimeFilter === "7d"
            ? "Last week"
            : applied.appliedTimeFilter === "30d"
              ? "Last month"
              : "Last year";

      parts.push(`⏱ ${label}`);
    }

    return parts.length > 0 ? parts : [lang === "no" ? "Ingen filtre" : "No filters"];
  })();

  return (
    <div>
      {/* Filter bar + dropdown */}
      <div ref={filterWrapRef} style={{ position: "relative", marginBottom: 10 }}>
        <button type="button" className="flatBtn" onClick={() => setFiltersOpen((v) => !v)} style={filterBtnStyle} aria-expanded={filtersOpen}>
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
            <div>
              <h3 style={dropLabelStyle}>{tGet(dict, "album.filterRating")}</h3>
              <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                {ratingOptions.map((r) => {
                  const key = r;
                  const label = r === "__none__" ? "—" : r;
                  return (
                    <label key={key} style={flatChoiceRow}>
                      <input
                        type="checkbox"
                        checked={!!draftRatings[key]}
                        onChange={() => setDraftRatings((prev) => ({ ...prev, [key]: !prev[key] }))}
                        style={checkboxStyle}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 style={dropLabelStyle}>{tGet(dict, "album.filterCategory")}</h3>
              <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                {catChoices.map((id) => {
                  const key = id;
                  const label = id === "__none__" ? "—" : categoryLabel(id) ?? id;
                  return (
                    <label key={key} style={flatChoiceRow}>
                      <input
                        type="checkbox"
                        checked={!!draftCategoryIds[key]}
                        onChange={() => setDraftCategoryIds((prev) => ({ ...prev, [key]: !prev[key] }))}
                        style={checkboxStyle}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 style={dropLabelStyle}>{tGet(dict, "album.filterTime")}</h3>
              <select
                className="select"
                style={{ background: MCL_HUSKET_THEME.colors.header, border: "none", outline: "none", boxShadow: "none", ...textB }}
                value={draftTimeFilter}
                onChange={(e) => setDraftTimeFilter(e.target.value as TimeFilterKey)}
              >
                <option value="all">{tGet(dict, "album.timeAll")}</option>
                <option value="7d">{tGet(dict, "album.time7d")}</option>
                <option value="30d">{tGet(dict, "album.time30d")}</option>
                <option value="365d">{tGet(dict, "album.time365d")}</option>
              </select>
            </div>

            <div style={actionsRow}>
              <button type="button" className="flatBtn" style={actionBtnDanger} onClick={resetFiltersAndClose}>
                {tGet(dict, "album.clear")}
              </button>
              <button type="button" className="flatBtn" style={actionBtnConfirm} onClick={applyFiltersAndClose}>
                {tGet(dict, "album.apply")}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Grid */}
      <div className="albumGrid">
        {filteredItems.map((it, idx) => {
          const url = thumbUrls[it.id];
          const date = formatThumbDate(it.createdAt, lang);
          return (
            <button
              key={it.id}
              className="thumb"
              type="button"
              onClick={() => setViewer({ open: true, index: idx })}
              style={{ padding: 0, border: "none", background: "transparent", textAlign: "left" }}
            >
              {url ? <img className="thumbImg" src={url} alt="" /> : <div className="capturePreview" />}

              <div className="thumbMeta" style={textB}>
                <span>{date}</span>
                <span className="badge">{it.ratingValue ?? "—"}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Viewer (only render when open) */}
      {viewer.open ? (
        <ViewHusketModal
          dict={dict}
          settings={settings}
          items={filteredItems}
          index={viewer.index}
          onSetIndex={(nextIndex) => setViewer((v) => ({ ...v, index: nextIndex }))}
          onClose={() => setViewer({ open: false, index: 0 })}
          onDelete={onDeleteFromViewer}
        />
      ) : null}
    </div>
  );
}
