// ===============================
// src/components/SettingsDrawer.tsx
// ===============================
import React, { useEffect, useMemo, useState } from "react";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import type { CategoryId, LifeKey, RatingPackKey, Settings } from "../domain/types";
import { getEffectiveRatingPack, setRatingPackForLife } from "../domain/settingsCore";
import { MCL_HUSKET_THEME } from "../theme";
import { HUSKET_TYPO } from "../theme/typography";
import { isPremiumRatingPack, listSelectableRatingPacks, RATING_PACKS } from "../domain/ratingPacks";
import { PREMIUM_CATEGORY_IDS_BY_LIFE, PRIVATE_CUSTOM_CATEGORY_ID, WORK_CUSTOM_CATEGORY_ID } from "../data/defaults";

type Props = {
  dict: I18nDict;
  open: boolean;
  activeLife: LifeKey;
  settings: Settings;
  onClose: () => void;
  onChange: (next: Settings) => void;
  onRequirePremium: () => void;

  // ✅ allow changing active life from SettingsDrawer
  onSetActiveLife: (life: LifeKey) => void;
};

function clamp100(s: string): string {
  return s.length > 100 ? s.slice(0, 100) : s;
}

function isCustomLife(life: LifeKey): life is "custom1" | "custom2" {
  return life === "custom1" || life === "custom2";
}

function isEditableCategoryLabel(life: LifeKey, id: string): boolean {
  if (life === "private") return id === PRIVATE_CUSTOM_CATEGORY_ID;
  if (life === "work") return id === WORK_CUSTOM_CATEGORY_ID;

  if (life === "custom1") return id.startsWith("custom1.custom.");
  if (life === "custom2") return id.startsWith("custom2.custom.");

  return false;
}

function getLifeLabel(dict: I18nDict, settings: Settings, key: LifeKey): string {
  if (key === "private") return tGet(dict, "top.private");
  if (key === "work") return tGet(dict, "top.work");

  if (key === "custom1") {
    const raw = settings.lives.custom1Name?.trim() || "";
    if (raw.startsWith("start.")) return tGet(dict, raw);
    return raw.length > 0 ? raw : tGet(dict, "start.custom1");
  }

  const raw = settings.lives.custom2Name?.trim() || "";
  if (raw.startsWith("start.")) return tGet(dict, raw);
  return raw.length > 0 ? raw : tGet(dict, "start.custom2");
}

function getCategoryIcon(categoryId: string): string {
  const map: Record<string, string> = {
    // Private (standard)
    "p.foodDrink": "🍽️",
    "p.travel": "✈️",
    "p.people": "👥",
    "p.things": "📦",
    "p.hobby": "🎨",
    "p.other": "🏷️",

    // Private (premium)
    "p.restaurants": "🍽️",
    "p.bars": "🍸",
    "p.hotels": "🏨",
    "p.health": "🩺",
    "p.training": "💪",
    "p.media": "🎬",
    "p.ideas": "💡",
    "p.experiences": "✨",
    "p.places": "📍",
    [PRIVATE_CUSTOM_CATEGORY_ID]: "✨",

    // Work (standard)
    "w.place": "📍",
    "w.task": "✅",
    "w.issue": "⚠️",
    "w.note": "📝",
    "w.meeting": "📅",
    "w.other": "🏷️",

    // Work (premium)
    "w.siteVisit": "👷",
    "w.safety": "🦺",
    "w.quality": "📏",
    "w.progress": "📈",
    "w.docs": "📄",
    "w.delivery": "📦",
    "w.client": "🤝",
    "w.plan": "🗺️",
    "w.risk": "🧯",
    [WORK_CUSTOM_CATEGORY_ID]: "✨",
  };

  if (categoryId in map) return map[categoryId];
  if (categoryId.includes(".custom.")) return "✨";
  return "🏷️";
}

export function SettingsDrawer({
  dict,
  open,
  activeLife,
  settings,
  onClose,
  onChange,
  onRequirePremium,
  onSetActiveLife,
}: Props) {
  // IMPORTANT: DO NOT early-return before hooks
  const [customCatText, setCustomCatText] = useState<string>("");

  // Collapsible sections
  const [openSection, setOpenSection] = useState<null | "categories" | "lives">(null);

  // ✅ Force language to Auto (fallback handled by i18n layer)
  useEffect(() => {
    if (!open) return;
    if (settings.language !== "auto") {
      onChange({ ...settings, language: "auto" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings.language]);

  const ratingOptions: RatingPackKey[] = useMemo(() => {
    return listSelectableRatingPacks({ premium: settings.premium });
  }, [settings.premium]);

  const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  const updateLifeName = (life: "custom1" | "custom2", name: string) => {
    const clean = clamp100(name.trim());
    const nextLives = { ...settings.lives };

    if (life === "custom1") nextLives.custom1Name = clean;
    if (life === "custom2") nextLives.custom2Name = clean;

    onChange({ ...settings, lives: nextLives });
  };

  const updateCategoryLabel = (life: LifeKey, categoryId: string, nextLabel: string) => {
    const list = settings.categories[life] ?? [];
    const idx = list.findIndex((c) => c.id === categoryId);
    if (idx < 0) return;

    const clean = clamp100(nextLabel.trim());

    const isPrivateWorkCustom =
      categoryId === PRIVATE_CUSTOM_CATEGORY_ID || categoryId === WORK_CUSTOM_CATEGORY_ID;
    const fallback = isPrivateWorkCustom ? tGet(dict, "settings.customCategoryFallback") : list[idx].label;

    const label = clean.length > 0 ? clean : fallback;

    const nextList = list.slice();
    nextList[idx] = { ...nextList[idx], label };

    onChange({
      ...settings,
      categories: {
        ...settings.categories,
        [life]: nextList,
      },
    });
  };

  const addCustomCategoryForCustomLife = (life: LifeKey) => {
    if (!settings.premium) return onRequirePremium();
    if (!isCustomLife(life)) return;

    const label = customCatText.trim();
    if (!label) return;

    const existing = settings.categories[life] ?? [];
    const customCount = existing.filter((c) => c.id.startsWith(`${life}.custom.`)).length;
    if (customCount >= 5) return;

    const newId = `${life}.custom.${crypto.randomUUID().slice(0, 8)}`;
    const nextCat = { id: newId, label: clamp100(label), gpsEligible: true };

    const next: Settings = {
      ...settings,
      categories: {
        ...settings.categories,
        [life]: [...existing, nextCat],
      },
    };

    const nextDisabledByLife: NonNullable<Settings["disabledCategoryIdsByLife"]> = {
      ...(settings.disabledCategoryIdsByLife ?? {}),
    };
    const map: Record<string, true> = { ...(nextDisabledByLife[life] ?? {}) } as Record<string, true>;
    if (newId in map) delete map[newId];
    nextDisabledByLife[life] = map as Record<CategoryId, true>;

    setCustomCatText("");
    onChange({ ...next, disabledCategoryIdsByLife: nextDisabledByLife });
  };

  const isPremiumOnlyCategory = (life: LifeKey, categoryId: string): boolean => {
    const ids = PREMIUM_CATEGORY_IDS_BY_LIFE[life] ?? [];
    return ids.includes(categoryId);
  };

  const getVisibleCatsForLife = (life: LifeKey) => {
    const all = settings.categories[life] ?? [];
    if (settings.premium) return all;
    return all.filter((c) => !isPremiumOnlyCategory(life, c.id));
  };

  const maxActiveCats = settings.premium ? 5 : 4;
  const maxCatsHelp = useMemo(
    () => tGet(dict, "settings.maxCategoriesHelp").replace("{max}", String(maxActiveCats)),
    [dict, maxActiveCats]
  );

  const setCategoryEnabledForLife = (life: LifeKey, categoryId: CategoryId, enabled: boolean) => {
    if (!settings.premium && isPremiumOnlyCategory(life, categoryId)) {
      return onRequirePremium();
    }

    const visibleCats = getVisibleCatsForLife(life);
    const disabledMap = (settings.disabledCategoryIdsByLife?.[life] ?? {}) as Record<string, true>;

    if (enabled) {
      const enabledCount = visibleCats.reduce((acc, c) => acc + (disabledMap[c.id] ? 0 : 1), 0);
      if (enabledCount >= maxActiveCats) return;
    }

    const nextDisabledByLife: NonNullable<Settings["disabledCategoryIdsByLife"]> = {
      ...(settings.disabledCategoryIdsByLife ?? {}),
    };

    const nextMap: Record<string, true> = { ...(nextDisabledByLife[life] ?? {}) } as Record<string, true>;

    if (enabled) {
      if (categoryId in nextMap) delete nextMap[categoryId];
    } else {
      nextMap[categoryId] = true;
    }

    nextDisabledByLife[life] = nextMap as Record<CategoryId, true>;

    onChange({
      ...settings,
      disabledCategoryIdsByLife: nextDisabledByLife,
    });
  };

  const activeCatsAll = useMemo(() => settings.categories[activeLife] ?? [], [settings.categories, activeLife]);

  const activeCats = useMemo(() => {
    if (settings.premium) return activeCatsAll;
    return activeCatsAll.filter((c) => !isPremiumOnlyCategory(activeLife, c.id));
  }, [activeCatsAll, activeLife, settings.premium]);

  const activeDisabledMap = useMemo<Record<string, true>>(() => {
    const m = settings.disabledCategoryIdsByLife?.[activeLife] ?? {};
    return m as Record<string, true>;
  }, [settings.disabledCategoryIdsByLife, activeLife]);

  const activeRatingPack = useMemo(() => getEffectiveRatingPack(settings, activeLife), [settings, activeLife]);

  const activeLifeIsCustom = isCustomLife(activeLife);

  // ✅ Lives are now simply "available" (no enable/disable toggles)
  const availableLifeKeys = useMemo<LifeKey[]>(() => {
    const base: LifeKey[] = ["private", "work"];
    if (settings.premium) return [...base, "custom1", "custom2"];
    return base;
  }, [settings.premium]);

  const activeLifeEnabled = useMemo(() => {
    if (activeLifeIsCustom) return settings.premium;
    return true;
  }, [activeLifeIsCustom, settings.premium]);

  const setActiveLifeFromDrawer = (nextLife: LifeKey) => {
    if (isCustomLife(nextLife) && !settings.premium) {
      onRequirePremium();
      return;
    }
    if (!availableLifeKeys.includes(nextLife)) return;

    onSetActiveLife(nextLife);
    // ✅ do NOT close drawer
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

  const overlayStyle: React.CSSProperties = {
    background: "rgba(27, 26, 23, 0.35)",
  };

  const drawerStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.header,
    color: MCL_HUSKET_THEME.colors.darkSurface,
    borderLeft: "none",
    boxShadow: MCL_HUSKET_THEME.elevation.elev2,
  };

  const hrStyle: React.CSSProperties = {
    background: "rgba(27, 26, 23, 0.14)",
  };

  const headerRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const drawerTitleStyle: React.CSSProperties = { ...textA };
  const actionTextStyle: React.CSSProperties = { ...textA };
  const labelStyle: React.CSSProperties = { ...textB };
  const smallHelpStyle: React.CSSProperties = { ...textB };

  const lineRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 0",
  };

  const lineLeft: React.CSSProperties = {
    display: "grid",
    gap: 2,
    minWidth: 0,
  };

  const lineTitle: React.CSSProperties = {
    ...textB,
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const lineSub: React.CSSProperties = {
    ...textB,
    color: MCL_HUSKET_THEME.colors.darkSurface,
    opacity: 0.75,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const topbarSelectStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.header,
    color: MCL_HUSKET_THEME.colors.darkSurface,
    border: "none",
    outline: "none",
    boxShadow: "none",
  };

  const disclosureBtnStyle: React.CSSProperties = {
    ...textB,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "10px 0",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const panelStyle: React.CSSProperties = {
    marginTop: 6,
    padding: 10,
    borderRadius: 14,
    background: "rgba(255, 250, 244, 0.18)",
    color: MCL_HUSKET_THEME.colors.darkSurface,
    border: "none",
  };

  const panelRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 0",
    borderBottom: "1px solid rgba(27, 26, 23, 0.10)",
  };

  const panelRowLast: React.CSSProperties = {
    ...panelRow,
    borderBottom: "none",
  };

  const panelTitle: React.CSSProperties = {
    ...textB,
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const panelHelp: React.CSSProperties = {
    ...textB,
    color: MCL_HUSKET_THEME.colors.darkSurface,
    opacity: 0.75,
  };

  const toggleWrapStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  };

  const toggleBaseStyle: React.CSSProperties = {
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    borderRadius: 999,
    padding: "6px 10px",
    background: "transparent",
    color: MCL_HUSKET_THEME.colors.darkSurface,
    whiteSpace: "nowrap",
    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: HUSKET_TYPO.A.fontWeight,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,
    transform: "none",
    transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
  };

  const toggleActiveStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.altSurface,
    border: `1px solid ${MCL_HUSKET_THEME.colors.altSurface}`,
    color: MCL_HUSKET_THEME.colors.textOnDark,
    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: HUSKET_TYPO.A.fontWeight,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,
    transform: "none",
  };

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    ...toggleBaseStyle,
    ...(active ? toggleActiveStyle : null),
  });

  const openCategories = openSection === "categories";
  const openLives = openSection === "lives";

  const toggleSection = (k: "categories" | "lives") => {
    setOpenSection((prev) => (prev === k ? null : k));
  };

  const categoriesSummary = useMemo(() => {
    if (!activeCats || activeCats.length === 0) return tGet(dict, "capture.noCategories");
    const disabledCount = activeCats.filter((c) => !!activeDisabledMap[c.id]).length;
    const enabledCount = activeCats.length - disabledCount;
    return `${enabledCount}/${maxActiveCats}`;
  }, [activeCats, activeDisabledMap, dict, maxActiveCats]);

  const activeLifeLabel = useMemo(() => getLifeLabel(dict, settings, activeLife), [dict, settings, activeLife]);

  if (!open) return null;

  // ✅ Shared checkbox look (same as galleri menu)
  const checkBoxStyleBase: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    display: "grid",
    placeItems: "center",
    lineHeight: 1,
    userSelect: "none",
    flex: "0 0 auto",
  };

  const checkBoxStyle = (checked: boolean, disabled?: boolean): React.CSSProperties => ({
    ...checkBoxStyleBase,
    background: checked ? MCL_HUSKET_THEME.colors.altSurface : "transparent",
    border: checked
      ? `1px solid ${MCL_HUSKET_THEME.colors.altSurface}`
      : `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    color: checked ? MCL_HUSKET_THEME.colors.textOnDark : MCL_HUSKET_THEME.colors.darkSurface,
    fontSize: 14,
    fontWeight: 900,
    opacity: disabled ? 0.55 : 1,
  });

  const ghostBoxStyle = (disabled?: boolean): React.CSSProperties => ({
    ...checkBoxStyleBase,
    background: "transparent",
    color: MCL_HUSKET_THEME.colors.darkSurface,
    opacity: disabled ? 0.55 : 0.9,
    fontSize: 16,
    fontWeight: 900,
  });

  const rowButtonStyle = (disabled?: boolean): React.CSSProperties => ({
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 0,
    background: "transparent",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    textAlign: "left",
    color: MCL_HUSKET_THEME.colors.darkSurface,
  });

  const iconPillStyle: React.CSSProperties = {
    width: 22,
    height: 22,
    display: "grid",
    placeItems: "center",
    borderRadius: 6,
    background: "rgba(255, 250, 244, 0.22)",
    border: "1px solid rgba(27, 26, 23, 0.12)",
    flex: "0 0 auto",
    fontSize: 14,
    lineHeight: 1,
  };

  // ✅ Helper: show blank in input when the stored value is an i18n-key (so placeholder is visible)
  const customLifeInputValue = (life: "custom1" | "custom2"): string => {
    const raw = (life === "custom1" ? settings.lives.custom1Name : settings.lives.custom2Name) ?? "";
    const v = raw.trim();
    if (v.startsWith("start.")) return "";
    return v;
  };

  return (
    <>
      <div className="drawerOverlay" onClick={onClose} style={overlayStyle} />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={tGet(dict, "settings.title")}
        style={drawerStyle}
      >
        <div style={headerRowStyle}>
          <div style={drawerTitleStyle}>{tGet(dict, "settings.title")}</div>
          <button className="flatBtn" onClick={onClose} type="button" style={actionTextStyle}>
            {tGet(dict, "settings.close")}
          </button>
        </div>

        <div className="hr" style={hrStyle} />

        {/* 1) Galleri */}
        <button
          type="button"
          onClick={() => toggleSection("lives")}
          style={disclosureBtnStyle}
          aria-expanded={openLives}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ ...lineTitle }}>{tGet(dict, "settings.saveToTitle")}</span>
          </span>

          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ ...lineSub, maxWidth: 220 }}>
              {activeLifeLabel} {tGet(dict, "settings.galleryWord")}
            </span>
            <span aria-hidden style={{ opacity: 0.85 }}>
              {openLives ? "▴" : "▾"}
            </span>
          </span>
        </button>

        {openLives ? (
          <div style={panelStyle}>
            <div style={panelRow}>
              <button type="button" onClick={() => setActiveLifeFromDrawer("private")} style={rowButtonStyle(false)}>
                <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <div style={panelTitle}>{tGet(dict, "top.private")}</div>
                </div>
                <span aria-hidden style={checkBoxStyle(activeLife === "private")}>
                  {activeLife === "private" ? "✓" : ""}
                </span>
              </button>
            </div>

            <div style={settings.premium ? panelRow : panelRowLast}>
              <button type="button" onClick={() => setActiveLifeFromDrawer("work")} style={rowButtonStyle(false)}>
                <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <div style={panelTitle}>{tGet(dict, "top.work")}</div>
                </div>
                <span aria-hidden style={checkBoxStyle(activeLife === "work")}>{activeLife === "work" ? "✓" : ""}</span>
              </button>
            </div>

            {settings.premium ? (
              <>
                <div style={panelRow}>
                  <button type="button" onClick={() => setActiveLifeFromDrawer("custom1")} style={rowButtonStyle(false)}>
                    <div style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
                      <input
                        className="input"
                        value={customLifeInputValue("custom1")}
                        onChange={(e) => updateLifeName("custom1", e.target.value)}
                        placeholder={tGet(dict, "start.custom1")}
                        style={{ padding: "8px 10px" }}
                      />
                    </div>
                    <span aria-hidden style={checkBoxStyle(activeLife === "custom1")}>
                      {activeLife === "custom1" ? "✓" : ""}
                    </span>
                  </button>
                </div>

                <div style={panelRowLast}>
                  <button type="button" onClick={() => setActiveLifeFromDrawer("custom2")} style={rowButtonStyle(false)}>
                    <div style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
                      <input
                        className="input"
                        value={customLifeInputValue("custom2")}
                        onChange={(e) => updateLifeName("custom2", e.target.value)}
                        placeholder={tGet(dict, "start.custom2")}
                        style={{ padding: "8px 10px" }}
                      />
                    </div>
                    <span aria-hidden style={checkBoxStyle(activeLife === "custom2")}>
                      {activeLife === "custom2" ? "✓" : ""}
                    </span>
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="hr" style={hrStyle} />

        {/* 2) Kategorier (per active life) */}
        <button
          type="button"
          onClick={() => toggleSection("categories")}
          style={disclosureBtnStyle}
          aria-expanded={openCategories}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ ...lineTitle }}>{tGet(dict, "settings.categories")}</span>
          </span>

          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ ...lineSub }}>{categoriesSummary}</span>
            <span aria-hidden style={{ opacity: 0.85 }}>
              {openCategories ? "▴" : "▾"}
            </span>
          </span>
        </button>

        {openCategories ? (
          <div style={panelStyle}>
            <div className="smallHelp" style={panelHelp}>
              {maxCatsHelp}
            </div>

            <div className="smallHelp" style={{ ...panelHelp, marginTop: 6 }}>
              {tGet(dict, "settings.categoriesAffectNewOnly")}
            </div>

            {/* ✅ Custom-liv: add new custom categories with same visual language */}
            {activeLifeIsCustom ? (
              <div style={{ ...panelRow, marginTop: 10 }}>
                <div style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
                  <input
                    className="input"
                    value={customCatText}
                    onChange={(e) => setCustomCatText(e.target.value)}
                    placeholder={tGet(dict, "settings.addCategoryPlaceholder")}
                    disabled={!settings.premium || !activeLifeEnabled}
                    style={{ padding: "8px 10px" }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => addCustomCategoryForCustomLife(activeLife)}
                  disabled={!settings.premium || !activeLifeEnabled}
                  style={{
                    ...ghostBoxStyle(!settings.premium || !activeLifeEnabled),
                    cursor: !settings.premium || !activeLifeEnabled ? "not-allowed" : "pointer",
                    borderColor: !settings.premium ? MCL_HUSKET_THEME.colors.outline : MCL_HUSKET_THEME.colors.altSurface,
                  }}
                  title={!settings.premium ? tGet(dict, "settings.premium") : !activeLifeEnabled ? tGet(dict, "common.off") : ""}
                  aria-label={tGet(dict, "common.add")}
                >
                  +
                </button>
              </div>
            ) : null}

            <div style={{ display: "grid", gap: 0, marginTop: 10 }}>
              {activeCats.length === 0 ? (
                <div className="smallHelp" style={panelHelp}>
                  {tGet(dict, "capture.noCategories")}
                </div>
              ) : (
                activeCats.map((c, idx) => {
                  const row = idx === activeCats.length - 1 ? panelRowLast : panelRow;

                  const disabled = !!activeDisabledMap[c.id];
                  const enabled = !disabled;

                  const premiumOnly = isPremiumOnlyCategory(activeLife, c.id);
                  const locked = premiumOnly && !settings.premium;
                  const lifeLocked = !activeLifeEnabled;

                  const canEditLabel = isEditableCategoryLabel(activeLife, c.id) && settings.premium && !lifeLocked;

                  const rowDisabled = locked || lifeLocked;

                  const onToggle = () => {
                    if (lifeLocked) return;
                    if (locked) return onRequirePremium();
                    setCategoryEnabledForLife(activeLife, c.id as CategoryId, !enabled);
                  };

                  return (
                    <div key={c.id} style={row}>
                      <button type="button" onClick={onToggle} style={rowButtonStyle(rowDisabled)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                          <span aria-hidden style={iconPillStyle}>
                            {getCategoryIcon(c.id)}
                          </span>

                          <div style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
                            {canEditLabel ? (
                              <input
                                className="input"
                                value={c.label.startsWith("cats.") ? "" : c.label}
                                placeholder={tGet(dict, "settings.customCategoryPlaceholder")}
                                onChange={(e) => updateCategoryLabel(activeLife, c.id, e.target.value)}
                                onBlur={(e) => updateCategoryLabel(activeLife, c.id, e.target.value)}
                                style={{ padding: "8px 10px" }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div style={{ ...panelTitle, opacity: rowDisabled ? 0.65 : 1 }}>
                                {c.label.startsWith("cats.") ? tGet(dict, c.label) : c.label}
                                {premiumOnly ? " ★" : ""}
                              </div>
                            )}
                          </div>
                        </div>

                        <span aria-hidden style={checkBoxStyle(enabled, rowDisabled)}>
                          {enabled ? "✓" : ""}
                        </span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        <div className="hr" style={hrStyle} />

                {/* 3) Ratings (per active life) */}
                <div style={lineRow}>
                  <div style={{ ...lineLeft, flex: "0 0 auto" }}>
                    <div style={{ ...lineTitle, whiteSpace: "nowrap" }}>{tGet(dict, "settings.ratingPack")}</div>
                  </div>
        
                  <select
                    className="select"
                    style={{
                      ...topbarSelectStyle,
                      marginLeft: 12,          // ✅ sørger for tydelig luft mellom tekst og select
                      minWidth: 110,           // ✅ kan krympe litt hvis det trengs
                      maxWidth: 160,           // ✅ hindrer at den “vokser” og spiser labelen
                      width: 140,              // ✅ din gamle baseline
                      textAlign: "right",
                      flex: "1 1 auto",        // ✅ select får være fleksibel – men innenfor min/max
                    }}
                    value={activeRatingPack}
                    onChange={(e) => {
                      const next = e.target.value as RatingPackKey;
                      if (isPremiumRatingPack(next) && !settings.premium) return onRequirePremium();
                      onChange(setRatingPackForLife(settings, activeLife, next));
                    }}
                    disabled={!activeLifeEnabled}
                    title={!activeLifeEnabled ? tGet(dict, "common.off") : ""}
                  >
                    {ratingOptions.map((k) => (
                      <option key={k} value={k}>
                        {RATING_PACKS[k]?.label ?? k}
                      </option>
                    ))}
                  </select>
                </div>
          </select>
        </div>

        <div className="hr" style={hrStyle} />

        {/* 4) Tema (global) */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>{tGet(dict, "settings.theme")}</div>
          </div>

          <select
            className="select"
            style={topbarSelectStyle}
            value={settings.themeKey}
            onChange={(e) => update({ themeKey: e.target.value as Settings["themeKey"] })}
          >
            <option value="fjord">{tGet(dict, "themes.fjord")}</option>
          </select>
        </div>

        <div className="hr" style={hrStyle} />

        {/* 5) GPS (global) */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>{tGet(dict, "settings.gpsGlobal")}</div>
          </div>

          <div style={toggleWrapStyle}>
            <button
              type="button"
              className="flatBtn"
              style={toggleBtnStyle(settings.gpsGlobalEnabled)}
              onClick={() => update({ gpsGlobalEnabled: true })}
              aria-pressed={settings.gpsGlobalEnabled}
            >
              {tGet(dict, "common.on")}
            </button>
            <button
              type="button"
              className="flatBtn"
              style={toggleBtnStyle(!settings.gpsGlobalEnabled)}
              onClick={() => update({ gpsGlobalEnabled: false })}
              aria-pressed={!settings.gpsGlobalEnabled}
            >
              {tGet(dict, "common.off")}
            </button>
          </div>
        </div>

        <div className="hr" style={hrStyle} />

        {/* 6) Premium (global) */}
        <div style={{ padding: "10px 0" }}>
          <div className="label" style={labelStyle}>
            {tGet(dict, "settings.premium")}
          </div>

          <div className="smallHelp" style={{ ...smallHelpStyle, marginTop: 6 }}>
            {settings.premium ? tGet(dict, "settings.premiumOn") : tGet(dict, "settings.premiumOff")}
          </div>

          <div className="smallHelp" style={{ ...smallHelpStyle, marginTop: 6, marginBottom: 10 }}>
            {tGet(dict, "settings.premiumDesc")}
          </div>

          <button
            className="flatBtn primary"
            onClick={() => {
              const next: Settings = { ...settings, premium: !settings.premium };
              if (!next.premium) {
                next.lives.enabledCustom1 = false;
                next.lives.enabledCustom2 = false;
              }
              onChange(next);
            }}
            type="button"
            style={actionTextStyle}
          >
            {tGet(dict, "settings.buyPremium")}
          </button>
        </div>

        <div className="hr" style={hrStyle} />

        {/* 7) Terms&conditions */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>{tGet(dict, "settings.terms")}</div>
          </div>

          <button
            type="button"
            className="flatBtn"
            style={actionTextStyle}
            onClick={() => window.open("https://morningcoffeelabs.no/terms", "_blank", "noopener,noreferrer")}
          >
            {tGet(dict, "common.open")}
          </button>
        </div>

        <div className="hr" style={hrStyle} />

        {/* 8) Kontakt oss */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>{tGet(dict, "settings.contact")}</div>
          </div>

          <button
            type="button"
            className="flatBtn"
            style={actionTextStyle}
            onClick={() => window.open("https://morningcoffeelabs.no/contact", "_blank", "noopener,noreferrer")}
          >
            {tGet(dict, "common.open")}
          </button>
        </div>
      </aside>
    </>
  );
}
