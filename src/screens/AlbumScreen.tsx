// ===============================
// src/screens/AlbumScreen.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Husket, LifeKey, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { listHuskets, getImageUrl } from "../data/husketRepo";
import { ViewHusketModal } from "../components/ViewHusketModal";

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
      return [
        "10/10",
        "9/10",
        "8/10",
        "7/10",
        "6/10",
        "5/10",
        "4/10",
        "3/10",
        "2/10",
        "1/10",
      ];
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

export function AlbumScreen({ dict, life, settings }: Props) {
  const [items, setItems] = useState<Husket[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });

  // Filters are per-life (so Jobb filters do not affect Privat, etc.)
  const [filtersByLife, setFiltersByLife] = useState<Record<string, LifeFilters>>(() => ({}));

  // Dropdown open + draft state (draft changes only apply when user clicks "Aktiver filtre")
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

  // Current life applied filters
  const applied = useMemo<LifeFilters>(() => {
    return filtersByLife[life] ?? emptyLifeFilters();
  }, [filtersByLife, life]);

  useEffect(() => {
    const next = listHuskets(life)
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt); // ensure newest first
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
        // revoke old urls that are replaced
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

  // When switching life: close dropdown & close viewer (clean UX), filters remain per-life
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

  const anyAppliedRatingSelected = useMemo(
    () => Object.values(applied.appliedRatings).some(Boolean),
    [applied.appliedRatings]
  );
  const anyAppliedCategorySelected = useMemo(
    () => Object.values(applied.appliedCategoryIds).some(Boolean),
    [applied.appliedCategoryIds]
  );

  const cutoffMs = useMemo(() => {
    const nowMs = Date.now();
    if (applied.appliedTimeFilter === "7d") return nowMs - 7 * 24 * 60 * 60 * 1000;
    if (applied.appliedTimeFilter === "30d") return nowMs - 30 * 24 * 60 * 60 * 1000;
    if (applied.appliedTimeFilter === "365d") return nowMs - 365 * 24 * 60 * 60 * 1000;
    return null;
  }, [applied.appliedTimeFilter]);

  const filteredItems = useMemo(() => {
    const ratingsActive = anyAppliedRatingSelected;
    const catsActive = anyAppliedCategorySelected;
    const timeActive = applied.appliedTimeFilter !== "all";

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
  }, [
    items,
    anyAppliedRatingSelected,
    anyAppliedCategorySelected,
    applied.appliedTimeFilter,
    cutoffMs,
    applied.appliedRatings,
    applied.appliedCategoryIds,
  ]);

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
      const label =
        applied.appliedTimeFilter === "7d"
          ? lang === "no"
            ? "Siste 7 dager"
            : "Last 7 days"
          : applied.appliedTimeFilter === "30d"
            ? lang === "no"
              ? "Siste 30 dager"
              : "Last 30 days"
            : lang === "no"
              ? "Siste år"
              : "Last year";
      parts.push(`⏱ ${label}`);
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

  const clearDraftFilters = () => {
    setDraftRatings({});
    setDraftCategoryIds({});
    setDraftTimeFilter("all");
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

  // If no items at all (raw), keep existing empty state
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
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 12px",
            cursor: "pointer",
          }}
          aria-expanded={filtersOpen}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span aria-hidden>🔎</span>
            <span
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
                minWidth: 0,
              }}
            >
              {activeSummary.map((p) => (
                <span key={p} className="badge" style={{ whiteSpace: "nowrap" }}>
                  {p}
                </span>
              ))}
            </span>
          </span>
          <span aria-hidden style={{ opacity: 0.85 }}>{filtersOpen ? "▴" : "▾"}</span>
        </button>

        {filtersOpen ? (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              right: 0,
              zIndex: 30,
              borderRadius: 16,
              padding: 12,
              boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
              background: "rgba(20,20,20,0.98)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "grid",
              gap: 12,
            }}
          >
            {/* Time */}
            <div style={{ display: "grid", gap: 8 }}>
              <div className="label" style={{ margin: 0 }}>
                {lang === "no" ? "Tid" : "Time"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {([
                  ["all", lang === "no" ? "Alle" : "All"],
                  ["7d", lang === "no" ? "Siste 7 dager" : "Last 7 days"],
                  ["30d", lang === "no" ? "Siste 30 dager" : "Last 30 days"],
                  ["365d", lang === "no" ? "Siste år" : "Last year"],
                ] as Array<[TimeFilterKey, string]>).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`pill ${draftTimeFilter === k ? "active" : ""}`}
                    onClick={() => setDraftTimeFilter(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rating */}
            <div style={{ display: "grid", gap: 8 }}>
              <div className="label" style={{ margin: 0 }}>
                {lang === "no" ? "Vurdering" : "Rating"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ratingOptions.map((r) => (
                  <label
                    key={r}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!draftRatings[r]}
                      onChange={() => toggleDraftRating(r)}
                      style={{ transform: "scale(1.1)" }}
                    />
                    <span>{r}</span>
                  </label>
                ))}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.12)",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                  title={lang === "no" ? "Huskets uten vurdering" : "Huskets without rating"}
                >
                  <input
                    type="checkbox"
                    checked={!!draftRatings["__none__"]}
                    onChange={() => setDraftRatings((p) => ({ ...p, __none__: !p.__none__ }))}
                    style={{ transform: "scale(1.1)" }}
                  />
                  <span>{lang === "no" ? "Ingen" : "None"}</span>
                </label>
              </div>
            </div>

            {/* Categories */}
            <div style={{ display: "grid", gap: 8 }}>
              <div className="label" style={{ margin: 0 }}>
                {lang === "no" ? "Kategori" : "Category"}
              </div>
              {cats.length === 0 ? (
                <div className="smallHelp">{tGet(dict, "capture.noCategories")}</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {cats.map((c) => (
                    <label
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.12)",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!draftCategoryIds[c.id]}
                        onChange={() => toggleDraftCategory(c.id)}
                        style={{ transform: "scale(1.1)" }}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                    title={lang === "no" ? "Huskets uten kategori" : "Huskets without category"}
                  >
                    <input
                      type="checkbox"
                      checked={!!draftCategoryIds["__none__"]}
                      onChange={() =>
                        setDraftCategoryIds((p) => ({ ...p, __none__: !p.__none__ }))
                      }
                      style={{ transform: "scale(1.1)" }}
                    />
                    <span>{lang === "no" ? "Ingen" : "None"}</span>
                  </label>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
              <button type="button" className="flatBtn danger" onClick={clearDraftFilters}>
                {lang === "no" ? "Nullstill" : "Clear"}
              </button>

              {/* Applies filters ONLY for the current life, then closes modal */}
              <button type="button" className="flatBtn confirm" onClick={applyFiltersAndClose}>
                {lang === "no" ? "Aktiver filtre" : "Apply filters"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {filteredItems.length === 0 ? (
        <div className="smallHelp">
          {lang === "no" ? "Ingen treff på valgte filtre." : "No matches for selected filters."}
        </div>
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
              {thumbUrls[it.id] ? (
                <img className="thumbImg" src={thumbUrls[it.id]} alt="" />
              ) : (
                <div className="capturePreview">Loading…</div>
              )}
              <div className="thumbMeta">
                <span>{formatThumbDate(it.createdAt, lang)}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {it.gps ? <span title={tGet(dict, "album.gps")}>🌍</span> : null}
                  {categoryLabel(it.categoryId) ? (
                    <span className="badge">{categoryLabel(it.categoryId)}</span>
                  ) : null}
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
          startIndex={viewer.index}
          onClose={() => setViewer({ open: false, index: 0 })}
        />
      ) : null}
    </div>
  );
}
