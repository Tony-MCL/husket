// ===============================
// src/components/SettingsDrawer.tsx
// ===============================
import React, { useMemo, useState } from "react";
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
  if (key === "custom1") return settings.lives.custom1Name?.trim() || tGet(dict, "start.custom1");
  return settings.lives.custom2Name?.trim() || tGet(dict, "start.custom2");
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

  const ratingOptions: RatingPackKey[] = useMemo(() => {
    return listSelectableRatingPacks({ premium: settings.premium });
  }, [settings.premium]);

  const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  const enabledLivesCount = useMemo(() => {
    const s = settings.lives;
    return [s.enabledPrivate, s.enabledCustom1, s.enabledCustom2, s.enabledWork].filter(Boolean).length;
  }, [settings.lives]);

  const setLifeEnabled = (life: LifeKey, enabled: boolean) => {
    // Never allow turning off the last enabled life
    if (!enabled && enabledLivesCount <= 1) return;

    // Custom lives are premium-only
    if ((life === "custom1" || life === "custom2") && !settings.premium) return onRequirePremium();

    const nextLives = { ...settings.lives };

    if (life === "private") nextLives.enabledPrivate = enabled;
    if (life === "work") nextLives.enabledWork = enabled;
    if (life === "custom1") nextLives.enabledCustom1 = enabled;
    if (life === "custom2") nextLives.enabledCustom2 = enabled;

    onChange({ ...settings, lives: nextLives });
  };

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
    const fallback = isPrivateWorkCustom ? "Egendefinert" : list[idx].label;

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

    const enabled = life === "custom1" ? settings.lives.enabledCustom1 : settings.lives.enabledCustom2;
    if (!enabled) return;

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
  const activeLifeEnabled = useMemo(() => {
    if (activeLife === "private") return settings.lives.enabledPrivate;
    if (activeLife === "work") return settings.lives.enabledWork;
    if (activeLife === "custom1") return settings.lives.enabledCustom1;
    return settings.lives.enabledCustom2;
  }, [activeLife, settings.lives]);

  // ✅ Enabled lives for switching active life
  const enabledLifeKeys = useMemo<LifeKey[]>(() => {
    const s = settings.lives;
    const list: LifeKey[] = [];
    if (s.enabledPrivate) list.push("private");
    if (s.enabledCustom1) list.push("custom1");
    if (s.enabledCustom2) list.push("custom2");
    if (s.enabledWork) list.push("work");
    return list.length ? list : (["private"] as LifeKey[]);
  }, [settings.lives]);

  const setActiveLifeFromDrawer = (nextLife: LifeKey) => {
    // Premium lock for custom lives (in case something weird becomes visible)
    if ((nextLife === "custom1" || nextLife === "custom2") && !settings.premium) {
      onRequirePremium();
      return;
    }

    // Must be enabled
    if (!enabledLifeKeys.includes(nextLife)) return;

    onSetActiveLife(nextLife);
    // ✅ do NOT close drawer (keeps behavior predictable)
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

  const livesSummary = useMemo(() => {
    return `${enabledLivesCount}/4`;
  }, [enabledLivesCount]);

  const activeLifeLabel = useMemo(() => getLifeLabel(dict, settings, activeLife), [dict, settings, activeLife]);

  if (!open) return null;

  const custom1Locked = !settings.premium;
  const custom2Locked = !settings.premium;

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

        {/* ✅ Lives: disclosure line (same style as categories) + active shown on the line */}
        <button
          type="button"
          onClick={() => toggleSection("lives")}
          style={disclosureBtnStyle}
          aria-expanded={openLives}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ ...lineTitle }}>Liv</span>
          </span>

          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ ...lineSub, maxWidth: 160 }}>{activeLifeLabel} aktiv</span>
            <span style={{ ...lineSub }}>{livesSummary}</span>
            <span aria-hidden style={{ opacity: 0.85 }}>
              {openLives ? "▴" : "▾"}
            </span>
          </span>
        </button>

        {openLives ? (
          <div style={panelStyle}>
            {/* PRIVATE */}
            <div style={panelRow}>
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <div style={panelTitle}>Privat</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Enabled */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: settings.lives.enabledPrivate && enabledLivesCount <= 1 ? "not-allowed" : "pointer",
                  }}
                  title={settings.lives.enabledPrivate && enabledLivesCount <= 1 ? "Må ha minst ett liv aktivt" : ""}
                >
                  <input
                    type="checkbox"
                    checked={settings.lives.enabledPrivate}
                    onChange={(e) => setLifeEnabled("private", e.target.checked)}
                    disabled={settings.lives.enabledPrivate && enabledLivesCount <= 1}
                  />
                </label>

                {/* Active */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: settings.lives.enabledPrivate ? "pointer" : "not-allowed",
                  }}
                  title={!settings.lives.enabledPrivate ? "Må være aktivert" : ""}
                >
                  <input
                    type="radio"
                    name="activeLife"
                    checked={activeLife === "private"}
                    onChange={() => setActiveLifeFromDrawer("private")}
                    disabled={!settings.lives.enabledPrivate}
                  />
                </label>
              </div>
            </div>

            {/* WORK */}
            <div style={panelRow}>
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <div style={panelTitle}>Jobb</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Enabled */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: settings.lives.enabledWork && enabledLivesCount <= 1 ? "not-allowed" : "pointer",
                  }}
                  title={settings.lives.enabledWork && enabledLivesCount <= 1 ? "Må ha minst ett liv aktivt" : ""}
                >
                  <input
                    type="checkbox"
                    checked={settings.lives.enabledWork}
                    onChange={(e) => setLifeEnabled("work", e.target.checked)}
                    disabled={settings.lives.enabledWork && enabledLivesCount <= 1}
                  />
                </label>

                {/* Active */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: settings.lives.enabledWork ? "pointer" : "not-allowed",
                  }}
                  title={!settings.lives.enabledWork ? "Må være aktivert" : ""}
                >
                  <input
                    type="radio"
                    name="activeLife"
                    checked={activeLife === "work"}
                    onChange={() => setActiveLifeFromDrawer("work")}
                    disabled={!settings.lives.enabledWork}
                  />
                </label>
              </div>
            </div>

            {/* CUSTOM 1 */}
            <div style={panelRow}>
              <div style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
                <input
                  className="input"
                  value={settings.lives.custom1Name}
                  onChange={(e) => updateLifeName("custom1", e.target.value)}
                  placeholder="Egendefinert…"
                  disabled={custom1Locked}
                  onClick={() => {
                    if (custom1Locked) onRequirePremium();
                  }}
                  style={{ padding: "8px 10px" }}
                  title={custom1Locked ? "Premium" : ""}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Enabled */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor:
                      custom1Locked || (settings.lives.enabledCustom1 && enabledLivesCount <= 1)
                        ? "not-allowed"
                        : "pointer",
                  }}
                  title={
                    custom1Locked
                      ? "Premium"
                      : settings.lives.enabledCustom1 && enabledLivesCount <= 1
                      ? "Må ha minst ett liv aktivt"
                      : ""
                  }
                >
                  <input
                    type="checkbox"
                    checked={settings.lives.enabledCustom1}
                    onChange={(e) => setLifeEnabled("custom1", e.target.checked)}
                    disabled={custom1Locked || (settings.lives.enabledCustom1 && enabledLivesCount <= 1)}
                  />
                </label>

                {/* Active */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: settings.lives.enabledCustom1 ? "pointer" : "not-allowed",
                  }}
                  title={!settings.lives.enabledCustom1 ? "Må være aktivert" : ""}
                >
                  <input
                    type="radio"
                    name="activeLife"
                    checked={activeLife === "custom1"}
                    onChange={() => setActiveLifeFromDrawer("custom1")}
                    disabled={!settings.lives.enabledCustom1}
                    onClick={() => {
                      if (custom1Locked) onRequirePremium();
                    }}
                  />
                </label>
              </div>
            </div>

            {/* CUSTOM 2 */}
            <div style={panelRowLast}>
              <div style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
                <input
                  className="input"
                  value={settings.lives.custom2Name}
                  onChange={(e) => updateLifeName("custom2", e.target.value)}
                  placeholder="Egendefinert…"
                  disabled={custom2Locked}
                  onClick={() => {
                    if (custom2Locked) onRequirePremium();
                  }}
                  style={{ padding: "8px 10px" }}
                  title={custom2Locked ? "Premium" : ""}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Enabled */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor:
                      custom2Locked || (settings.lives.enabledCustom2 && enabledLivesCount <= 1)
                        ? "not-allowed"
                        : "pointer",
                  }}
                  title={
                    custom2Locked
                      ? "Premium"
                      : settings.lives.enabledCustom2 && enabledLivesCount <= 1
                      ? "Må ha minst ett liv aktivt"
                      : ""
                  }
                >
                  <input
                    type="checkbox"
                    checked={settings.lives.enabledCustom2}
                    onChange={(e) => setLifeEnabled("custom2", e.target.checked)}
                    disabled={custom2Locked || (settings.lives.enabledCustom2 && enabledLivesCount <= 1)}
                  />
                </label>

                {/* Active */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: settings.lives.enabledCustom2 ? "pointer" : "not-allowed",
                  }}
                  title={!settings.lives.enabledCustom2 ? "Må være aktivert" : ""}
                >
                  <input
                    type="radio"
                    name="activeLife"
                    checked={activeLife === "custom2"}
                    onChange={() => setActiveLifeFromDrawer("custom2")}
                    disabled={!settings.lives.enabledCustom2}
                    onClick={() => {
                      if (custom2Locked) onRequirePremium();
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}

        <div className="hr" style={hrStyle} />

        {/* ✅ Theme (global) */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>Tema</div>
          </div>

          <select
            className="select"
            style={topbarSelectStyle}
            value={settings.themeKey}
            onChange={(e) => update({ themeKey: e.target.value as Settings["themeKey"] })}
          >
            <option value="fjord">Fjord</option>
          </select>
        </div>

        <div className="hr" style={hrStyle} />

        {/* Language (global) */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>{tGet(dict, "settings.language")}</div>
          </div>

          <select
            className="select"
            style={topbarSelectStyle}
            value={settings.language}
            onChange={(e) => update({ language: e.target.value as Settings["language"] })}
          >
            <option value="auto">{tGet(dict, "settings.languageAuto")}</option>
            <option value="no">Norsk</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="hr" style={hrStyle} />

        {/* GPS (global) */}
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
              ON
            </button>
            <button
              type="button"
              className="flatBtn"
              style={toggleBtnStyle(!settings.gpsGlobalEnabled)}
              onClick={() => update({ gpsGlobalEnabled: false })}
              aria-pressed={!settings.gpsGlobalEnabled}
            >
              OFF
            </button>
          </div>
        </div>

        <div className="hr" style={hrStyle} />

        {/* Rating pack (per active life) */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>{tGet(dict, "settings.ratingPack")}</div>
          </div>

          <select
            className="select"
            style={topbarSelectStyle}
            value={activeRatingPack}
            onChange={(e) => {
              const next = e.target.value as RatingPackKey;
              if (isPremiumRatingPack(next) && !settings.premium) return onRequirePremium();
              onChange(setRatingPackForLife(settings, activeLife, next));
            }}
            disabled={!activeLifeEnabled}
            title={!activeLifeEnabled ? "OFF" : ""}
          >
            {ratingOptions.map((k) => (
              <option key={k} value={k}>
                {RATING_PACKS[k]?.label ?? k}
              </option>
            ))}
          </select>
        </div>

        <div className="hr" style={hrStyle} />

        {/* Categories (per active life) */}
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
              Maks {maxActiveCats} aktive kategorier per liv.
            </div>

            <div className="smallHelp" style={{ ...panelHelp, marginTop: 6 }}>
              Endringer her vil kun påvirke nye huskets, huskets du allerede har lagret vil ikke påvirkes.
            </div>

            {activeLifeIsCustom ? (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input
                  className="input"
                  value={customCatText}
                  onChange={(e) => setCustomCatText(e.target.value)}
                  placeholder="Legg til…"
                  disabled={!settings.premium || !activeLifeEnabled}
                />
                <button
                  className="flatBtn"
                  onClick={() => addCustomCategoryForCustomLife(activeLife)}
                  type="button"
                  disabled={!settings.premium || !activeLifeEnabled}
                  style={actionTextStyle}
                  title={!settings.premium ? "Premium" : !activeLifeEnabled ? "OFF" : ""}
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

                  return (
                    <div key={c.id} style={row}>
                      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        {canEditLabel ? (
                          <input
                            className="input"
                            value={c.label}
                            onChange={(e) => updateCategoryLabel(activeLife, c.id, e.target.value)}
                            onBlur={(e) => updateCategoryLabel(activeLife, c.id, e.target.value)}
                            style={{ padding: "8px 10px" }}
                          />
                        ) : (
                          <div style={panelTitle}>
                            {c.label}
                            {premiumOnly ? " ★" : ""}
                          </div>
                        )}
                      </div>

                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: locked || lifeLocked ? "not-allowed" : "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => setCategoryEnabledForLife(activeLife, c.id as CategoryId, e.target.checked)}
                          disabled={locked || lifeLocked}
                          title={locked ? "Premium" : lifeLocked ? "OFF" : ""}
                        />
                      </label>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        <div className="hr" style={hrStyle} />

        {/* Premium (global) */}
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
      </aside>
    </>
  );
}
