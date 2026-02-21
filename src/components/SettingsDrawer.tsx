// ===============================
// src/components/SettingsDrawer.tsx
// ===============================
import React, { useMemo, useState } from "react";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import type { CategoryId, LifeKey, RatingPackKey, Settings } from "../domain/types";
import { getEffectiveRatingPack, setRatingPackForLife } from "../domain/settingsCore";
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

  // ✅ NEW: allow changing active life from SettingsDrawer
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

    const isPrivateWorkCustom = categoryId === PRIVATE_CUSTOM_CATEGORY_ID || categoryId === WORK_CUSTOM_CATEGORY_ID;
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
    onClose();
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
    background: "var(--header)",
    color: "var(--darkSurface)",
    borderLeft: "none",
    boxShadow: "var(--shadow2)",
  };

  const hrStyle: React.CSSProperties = {
    background: "var(--line2)",
  };

  const headerRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    color: "var(--darkSurface)",
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
    color: "var(--darkSurface)",
  };

  const lineSub: React.CSSProperties = {
    ...textB,
    color: "var(--darkSurface)",
    opacity: 0.75,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const topbarSelectStyle: React.CSSProperties = {
    background: "var(--header)",
    color: "var(--darkSurface)",
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
    color: "var(--darkSurface)",
  };

  const panelStyle: React.CSSProperties = {
    marginTop: 6,
    padding: 10,
    borderRadius: 14,
    background: "rgba(255, 250, 244, 0.18)",
    color: "var(--darkSurface)",
    border: "none",
  };

  const panelRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 0",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "none",
    outline: "none",
    background: "rgba(255,255,255,0.16)",
    color: "var(--darkSurface)",
    boxSizing: "border-box",
  };

  const flatBtnStyle: React.CSSProperties = {
    ...textA,
    border: "none",
    borderRadius: 999,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.16)",
    color: "var(--darkSurface)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const toggleWrapStyle: React.CSSProperties = {
    display: "flex",
    gap: 8,
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  };

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    ...flatBtnStyle,
    background: active ? "rgba(15, 47, 54, 0.85)" : "rgba(255,255,255,0.16)",
    color: active ? "var(--textOnDark)" : "var(--darkSurface)",
  });

  const closeBtnStyle: React.CSSProperties = {
    ...textA,
    border: "none",
    borderRadius: 12,
    background: "transparent",
    color: "var(--darkSurface)",
    padding: "10px 12px",
    cursor: "pointer",
  };

  const pillStyle: React.CSSProperties = {
    ...textB,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.16)",
    color: "var(--darkSurface)",
  };

  const warnPillStyle: React.CSSProperties = {
    ...pillStyle,
    background: "rgba(194, 59, 59, 0.18)",
  };

  const toggleSection = (key: "categories" | "lives") => setOpenSection((cur) => (cur === key ? null : key));

  if (!open) return null;

  return (
    <div className="drawerOverlay" style={overlayStyle} onClick={onClose} role="presentation">
      <div className="drawer" style={drawerStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={headerRowStyle}>
          <div style={drawerTitleStyle}>{tGet(dict, "settings.title")}</div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            {tGet(dict, "settings.close")}
          </button>
        </div>

        <div className="hr" style={hrStyle} />

        {/* Premium */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>{tGet(dict, "settings.premium")}</div>
            <div style={lineSub}>{tGet(dict, "settings.premiumDesc")}</div>
          </div>

          <div style={toggleWrapStyle}>
            <button
              type="button"
              className="flatBtn"
              style={toggleBtnStyle(!settings.premium)}
              onClick={() => update({ premium: false })}
              aria-pressed={!settings.premium}
            >
              {tGet(dict, "settings.premiumOff")}
            </button>
            <button
              type="button"
              className="flatBtn"
              style={toggleBtnStyle(settings.premium)}
              onClick={() => update({ premium: true })}
              aria-pressed={settings.premium}
            >
              {tGet(dict, "settings.premiumOn")}
            </button>

            {!settings.premium ? (
              <button type="button" className="flatBtn" style={flatBtnStyle} onClick={onRequirePremium}>
                {tGet(dict, "settings.buyPremium")}
              </button>
            ) : null}
          </div>
        </div>

        <div className="hr" style={hrStyle} />

        {/* Active life switching */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>{tGet(dict, "settings.lives")}</div>
            <div style={lineSub}>{getLifeLabel(dict, settings, activeLife)}</div>
          </div>

          <div style={toggleWrapStyle}>
            {enabledLifeKeys.map((k) => {
              const label = getLifeLabel(dict, settings, k);
              const isActive = activeLife === k;

              return (
                <button
                  key={k}
                  type="button"
                  className="flatBtn"
                  style={toggleBtnStyle(isActive)}
                  onClick={() => setActiveLifeFromDrawer(k)}
                  aria-pressed={isActive}
                >
                  {label}
                </button>
              );
            })}
          </div>
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

        {/* Theme (global) */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>Theme</div>
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
        <button type="button" onClick={() => toggleSection("categories")} style={disclosureBtnStyle} aria-expanded={openSection === "categories"}>
          <span>{tGet(dict, "settings.categories")}</span>
          <span aria-hidden="true">{openSection === "categories" ? "–" : "+"}</span>
        </button>

        {openSection === "categories" ? (
          <div style={panelStyle}>
            {/* Active categories list */}
            {activeCats.map((c) => {
              const disabled = !!activeDisabledMap[c.id];
              const enabled = !disabled;

              const canEditLabel = isEditableCategoryLabel(activeLife, c.id);

              return (
                <div key={c.id} style={panelRow}>
                  <div style={{ display: "grid", gap: 6, minWidth: 0, flex: "1 1 auto" }}>
                    {canEditLabel ? (
                      <input
                        value={c.label}
                        onChange={(e) => updateCategoryLabel(activeLife, c.id, e.target.value)}
                        style={inputStyle}
                        placeholder="Navn"
                        disabled={!activeLifeEnabled}
                      />
                    ) : (
                      <div style={labelStyle}>{c.label}</div>
                    )}

                    {!activeLifeEnabled ? (
                      <span style={warnPillStyle}>OFF</span>
                    ) : settings.premium ? null : isPremiumOnlyCategory(activeLife, c.id) ? (
                      <span style={warnPillStyle}>PRO</span>
                    ) : null}
                  </div>

                  <div style={toggleWrapStyle}>
                    <button
                      type="button"
                      className="flatBtn"
                      style={toggleBtnStyle(enabled)}
                      onClick={() => setCategoryEnabledForLife(activeLife, c.id, true)}
                      aria-pressed={enabled}
                      disabled={!activeLifeEnabled}
                    >
                      ON
                    </button>
                    <button
                      type="button"
                      className="flatBtn"
                      style={toggleBtnStyle(!enabled)}
                      onClick={() => setCategoryEnabledForLife(activeLife, c.id, false)}
                      aria-pressed={!enabled}
                      disabled={!activeLifeEnabled}
                    >
                      OFF
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Custom categories for custom lives */}
            {activeLifeIsCustom ? (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <div style={smallHelpStyle}>Legg til (maks 5)</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={customCatText}
                    onChange={(e) => setCustomCatText(e.target.value)}
                    style={inputStyle}
                    placeholder="Ny kategori"
                    disabled={!activeLifeEnabled}
                  />
                  <button
                    type="button"
                    style={flatBtnStyle}
                    onClick={() => addCustomCategoryForCustomLife(activeLife)}
                    disabled={!activeLifeEnabled}
                  >
                    +
                  </button>
                </div>
              </div>
            ) : null}

            {/* Active cap info */}
            <div style={{ marginTop: 12 }}>
              <span style={pillStyle}>
                Max aktive: {maxActiveCats} {settings.premium ? "(PRO)" : ""}
              </span>
            </div>
          </div>
        ) : null}

        {/* Lives */}
        <button type="button" onClick={() => toggleSection("lives")} style={disclosureBtnStyle} aria-expanded={openSection === "lives"}>
          <span>{tGet(dict, "settings.lives")}</span>
          <span aria-hidden="true">{openSection === "lives" ? "–" : "+"}</span>
        </button>

        {openSection === "lives" ? (
          <div style={panelStyle}>
            {(["private", "custom1", "custom2", "work"] as LifeKey[]).map((k) => {
              const label = getLifeLabel(dict, settings, k);
              const enabled =
                k === "private"
                  ? settings.lives.enabledPrivate
                  : k === "work"
                  ? settings.lives.enabledWork
                  : k === "custom1"
                  ? settings.lives.enabledCustom1
                  : settings.lives.enabledCustom2;

              const isCustom = k === "custom1" || k === "custom2";

              return (
                <div key={k} style={panelRow}>
                  <div style={{ display: "grid", gap: 6, minWidth: 0, flex: "1 1 auto" }}>
                    <div style={labelStyle}>{label}</div>

                    {isCustom ? (
                      <input
                        value={k === "custom1" ? settings.lives.custom1Name : settings.lives.custom2Name}
                        onChange={(e) => updateLifeName(k as "custom1" | "custom2", e.target.value)}
                        style={inputStyle}
                        placeholder={k === "custom1" ? "Custom 1" : "Custom 2"}
                        disabled={!settings.premium}
                      />
                    ) : null}
                  </div>

                  <div style={toggleWrapStyle}>
                    {!settings.premium && isCustom ? <span style={warnPillStyle}>PRO</span> : null}

                    <button
                      type="button"
                      className="flatBtn"
                      style={toggleBtnStyle(enabled)}
                      onClick={() => setLifeEnabled(k, true)}
                      aria-pressed={enabled}
                    >
                      ON
                    </button>
                    <button
                      type="button"
                      className="flatBtn"
                      style={toggleBtnStyle(!enabled)}
                      onClick={() => setLifeEnabled(k, false)}
                      aria-pressed={!enabled}
                    >
                      OFF
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div style={{ height: 10 }} />
      </div>
    </div>
  );
}
