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
import type { RatingPackKey } from "../domain/types";

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
  // Defensive: tens is premium-only
  if (pack === "tens" && !premium) pack = "emoji";

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

  // Rating options should match PER-LIFE pack (for ordering in the filter UI)
  const packForLife = useMemo(() => getEffectiveRatingPack(settings, life), [settings, life]);
  const packRatingOptions = useMemo(() => ratingOptionsFromPack(packForLife, settings.premium), [packForLife, settings.premium]);

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
      if (!el.contains(e.target as Node)) setFiltersOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [filtersOpen]);

  const nowMs = Date.now();

  const filtered = useMemo(() => applyFiltersToItems({ items, applied, nowMs }), [items, applied, nowMs]);

  // For filter UI: include ratings present in data, but keep pack ordering first.
  const ratingChoices = useMemo(() => {
    const present = new Set<string>();
    for (const it of items) present.add(it.ratingValue ?? "__none__");

    const ordered: string[] = [];
    for (const r of packRatingOptions) {
      if (present.has(r)) ordered.push(r);
    }

    // add any extra (older pack, etc.)
    for (const r of Array.from(present)) {
      if (!ordered.includes(r)) ordered.push(r);
    }

    // Put "__none__" last if present
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

  const applyDraft = () => {
    setFiltersByLife((prev) => ({
      ...prev,
      [life]: {
        appliedRatings: draftRatings,
        appliedCategoryIds: draftCategoryIds,
        appliedTimeFilter: draftTimeFilter,
      },
    }));
    setFiltersOpen(false);
  };

  const clearDraft = () => {
    setDraftRatings({});
    setDraftCategoryIds({});
    setDraftTimeFilter("all");
  };

  // ---- Typography helpers ----
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

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={textA}>{tGet(dict, "album.title")}</div>

        <div ref={filterWrapRef} style={{ position: "relative" }}>
          <button className="flatBtn" type="button" onClick={() => setFiltersOpen((v) => !v)} style={textA}>
            {tGet(dict, "album.filters")}
          </button>

          {filtersOpen ? (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 8px)",
                width: 320,
                maxWidth: "86vw",
                background: MCL_HUSKET_THEME.colors.header,
                border: "1px solid rgba(27, 26, 23, 0.14)",
                borderRadius: 14,
                padding: 10,
                boxShadow: MCL_HUSKET_THEME.elevation.elev2,
                zIndex: 10,
              }}
            >
              <div style={{ ...textB, opacity: 0.85, marginBottom: 8 }}>{tGet(dict, "album.filterRating")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {ratingChoices.map((r) => {
                  const key = r;
                  const label = r === "__none__" ? "—" : r;
                  const active = !!draftRatings[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`pill ${active ? "active" : ""}`}
                      onClick={() => setDraftRatings((p) => ({ ...p, [key]: !p[key] }))}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div style={{ ...textB, opacity: 0.85, marginBottom: 8 }}>{tGet(dict, "album.filterCategory")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {catChoices.map((id) => {
                  const key = id;
                  const label = id === "__none__" ? "—" : categoryLabel(id) ?? id;
                  const active = !!draftCategoryIds[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`pill ${active ? "active" : ""}`}
                      onClick={() => setDraftCategoryIds((p) => ({ ...p, [key]: !p[key] }))}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div style={{ ...textB, opacity: 0.85, marginBottom: 8 }}>{tGet(dict, "album.filterTime")}</div>
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

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
                <button className="flatBtn danger" type="button" onClick={clearDraft} style={textA}>
                  {tGet(dict, "album.clear")}
                </button>
                <button className="flatBtn primary" type="button" onClick={applyDraft} style={textA}>
                  {tGet(dict, "album.apply")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="smallHelp" style={{ ...textB, color: MCL_HUSKET_THEME.colors.muted }}>
          {tGet(dict, "album.empty")}
        </div>
      ) : (
        <div className="albumGrid">
          {filtered.map((it, idx) => {
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

                <div className="thumbMeta">
                  <span>{date}</span>
                  <span className="badge">{it.ratingValue ?? "—"}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ViewHusketModal
        open={viewer.open}
        index={viewer.index}
        items={filtered}
        dict={dict}
        settings={settings}
        onClose={() => setViewer({ open: false, index: 0 })}
        onDelete={async (id) => {
          await deleteHusketById(id);
          setItems((prev) => prev.filter((x) => x.id !== id));
          setViewer((v) => ({ open: v.open, index: Math.max(0, Math.min(v.index, filtered.length - 2)) }));
        }}
      />
    </div>
  );
}
