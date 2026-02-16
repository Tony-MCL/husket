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

export function SettingsDrawer({
  dict,
  open,
  activeLife,
  settings,
  onClose,
  onChange,
  onRequirePremium,
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
    display: open ? "block" : "none",
  };

  const drawerStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.header,
    color: MCL_HUSKET_THEME.colors.darkSurface,
    borderLeft: "none",
    boxShadow: MCL_HUSKET_THEME.elevation.elev2,
    display: open ? "block" : "none",
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

  const drawerTitleStyle: React.CSSProperties = {
    ...textA,
    fontWeight: 900,
  };

  const actionTextStyle: React.CSSProperties = {
    ...textB,
    color: "rgba(27, 26, 23, 0.78)",
  };

  const lineRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
  };

  const lineLeft: React.CSSProperties = {
    display: "grid",
    gap: 2,
    minWidth: 0,
  };

  const lineTitle: React.CSSProperties = {
    ...textA,
    fontWeight: 800,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const lineSub: React.CSSProperties = {
    ...textB,
    opacity: 0.78,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const toggleWrapStyle: React.CSSProperties = {
    display: "flex",
    gap: 8,
    alignItems: "center",
  };

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    ...textB,
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${active ? "rgba(27, 26, 23, 0.12)" : "rgba(27, 26, 23, 0.14)"}`,
    background: active ? "rgba(27, 26, 23, 0.92)" : "rgba(255,255,255,0.65)",
    color: active ? "rgba(247, 243, 237, 0.92)" : "rgba(27, 26, 23, 0.86)",
    cursor: "pointer",
  });

  const topbarSelectStyle: React.CSSProperties = {
    ...textB,
    padding: "6px 10px",
    borderRadius: 12,
    border: "1px solid rgba(27, 26, 23, 0.14)",
    background: "rgba(255,255,255,0.65)",
    color: "rgba(27, 26, 23, 0.92)",
  };

  const disclosureBtnStyle: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    padding: "10px 0",
    border: "none",
    background: "transparent",
    color: MCL_HUSKET_THEME.colors.darkSurface,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  };

  const openCategories = openSection === "categories";
  const openLives = openSection === "lives";

  const toggleSection = (s: "categories" | "lives") => setOpenSection((cur) => (cur === s ? null : s));

  const categoriesSummary = useMemo(() => {
    const disabled = activeCats.reduce((acc, c) => acc + (activeDisabledMap[c.id] ? 1 : 0), 0);
    const enabled = activeCats.length - disabled;
    return `${enabled}/${activeCats.length}`;
  }, [activeCats, activeDisabledMap]);

  if (!open) return null;

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

        {/* Sharing (Sky) master toggle */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>{settings.language === "no" ? "Deling (Sky)" : "Sharing (Sky)"}</div>
          </div>

          <div style={toggleWrapStyle}>
            <button
              type="button"
              className="flatBtn"
              style={toggleBtnStyle(settings.shareEnabled === true)}
              onClick={() => update({ shareEnabled: true })}
              aria-pressed={settings.shareEnabled === true}
            >
              ON
            </button>
            <button
              type="button"
              className="flatBtn"
              style={toggleBtnStyle(settings.shareEnabled !== true)}
              onClick={() => update({ shareEnabled: false })}
              aria-pressed={settings.shareEnabled !== true}
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
              {openCategories ? "▾" : "▸"}
            </span>
          </span>
        </button>

        {openCategories ? (
          <div style={{ display: "grid", gap: 10, paddingBottom: 12 }}>
            {activeCats.map((c) => {
              const enabled = !activeDisabledMap[c.id];
              const editable = isEditableCategoryLabel(activeLife, c.id);
              const premiumOnly = isPremiumOnlyCategory(activeLife, c.id);

              return (
                <div key={c.id} style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ ...textA, fontWeight: 800 }}>
                      {c.label}
                      {!settings.premium && premiumOnly ? <span style={{ opacity: 0.75 }}> (Premium)</span> : null}
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

                  {editable ? (
                    <input
                      value={c.label}
                      onChange={(e) => updateCategoryLabel(activeLife, c.id, e.target.value)}
                      style={topbarSelectStyle}
                      disabled={!activeLifeEnabled}
                    />
                  ) : null}
                </div>
              );
            })}

            {activeLifeIsCustom ? (
              <div style={{ display: "grid", gap: 8, paddingTop: 6 }}>
                <div style={{ ...textB, opacity: 0.8 }}>Legg til opptil 5 egne kategorier.</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    value={customCatText}
                    onChange={(e) => setCustomCatText(e.target.value)}
                    placeholder="Kategori…"
                    style={{ ...topbarSelectStyle, flex: 1 }}
                    disabled={!activeLifeEnabled}
                  />
                  <button
                    type="button"
                    className="flatBtn"
                    style={toggleBtnStyle(true)}
                    onClick={() => addCustomCategoryForCustomLife(activeLife)}
                    disabled={!activeLifeEnabled}
                  >
                    +
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="hr" style={hrStyle} />

        {/* Lives */}
        <button
          type="button"
          onClick={() => toggleSection("lives")}
          style={disclosureBtnStyle}
          aria-expanded={openLives}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ ...lineTitle }}>{tGet(dict, "settings.lives")}</span>
          </span>

          <span aria-hidden style={{ opacity: 0.85 }}>
            {openLives ? "▾" : "▸"}
          </span>
        </button>

        {openLives ? (
          <div style={{ display: "grid", gap: 12, paddingBottom: 12 }}>
            {(["private", "custom1", "custom2", "work"] as LifeKey[]).map((lk) => {
              const enabled =
                lk === "private"
                  ? settings.lives.enabledPrivate
                  : lk === "work"
                  ? settings.lives.enabledWork
                  : lk === "custom1"
                  ? settings.lives.enabledCustom1
                  : settings.lives.enabledCustom2;

              const title =
                lk === "private"
                  ? tGet(dict, "life.private")
                  : lk === "work"
                  ? tGet(dict, "life.work")
                  : lk === "custom1"
                  ? settings.lives.custom1Name
                  : settings.lives.custom2Name;

              const isCustom = lk === "custom1" || lk === "custom2";

              return (
                <div key={lk} style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ ...textA, fontWeight: 800 }}>
                      {title}
                      {!settings.premium && isCustom ? <span style={{ opacity: 0.75 }}> (Premium)</span> : null}
                    </div>

                    <div style={toggleWrapStyle}>
                      <button
                        type="button"
                        className="flatBtn"
                        style={toggleBtnStyle(enabled)}
                        onClick={() => setLifeEnabled(lk, true)}
                        aria-pressed={enabled}
                      >
                        ON
                      </button>
                      <button
                        type="button"
                        className="flatBtn"
                        style={toggleBtnStyle(!enabled)}
                        onClick={() => setLifeEnabled(lk, false)}
                        aria-pressed={!enabled}
                      >
                        OFF
                      </button>
                    </div>
                  </div>

                  {isCustom ? (
                    <input
                      value={lk === "custom1" ? settings.lives.custom1Name : settings.lives.custom2Name}
                      onChange={(e) => updateLifeName(lk as any, e.target.value)}
                      style={topbarSelectStyle}
                      disabled={!enabled}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </aside>
    </>
  );
}
