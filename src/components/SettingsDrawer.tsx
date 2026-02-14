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
import { PREMIUM_CATEGORY_IDS_BY_LIFE, PRIVATE_CUSTOM_CATEGORY_ID } from "../data/defaults";

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

function isPrivateCustomCategoryId(id: string): boolean {
  return id === PRIVATE_CUSTOM_CATEGORY_ID;
}

export function SettingsDrawer({ dict, open, activeLife, settings, onClose, onChange, onRequirePremium }: Props) {
  // IMPORTANT: DO NOT early-return before hooks (prevents React #310 on open/close)
  const [customCatText, setCustomCatText] = useState<string>("");

  // Collapsible sections (one-line when closed)
  const [openSection, setOpenSection] = useState<null | "categories" | "lives">(null);

  const ratingOptions: RatingPackKey[] = useMemo(() => {
    return listSelectableRatingPacks({ premium: settings.premium });
  }, [settings.premium]);

  const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  const setLifeEnabled = (life: "custom1" | "custom2", enabled: boolean) => {
    if (!settings.premium) return onRequirePremium();
    const next: Settings = {
      ...settings,
      lives: {
        ...settings.lives,
        enabledCustom1: life === "custom1" ? enabled : settings.lives.enabledCustom1,
        enabledCustom2: life === "custom2" ? enabled : settings.lives.enabledCustom2,
      },
    };
    onChange(next);
  };

  const setLifeName = (life: "custom1" | "custom2", name: string) => {
    if (!settings.premium) return onRequirePremium();
    const next: Settings = {
      ...settings,
      lives: {
        ...settings.lives,
        custom1Name: life === "custom1" ? clamp100(name) : settings.lives.custom1Name,
        custom2Name: life === "custom2" ? clamp100(name) : settings.lives.custom2Name,
      },
    };
    onChange(next);
  };

  const updateCategoryLabel = (life: LifeKey, categoryId: string, nextLabel: string) => {
    const list = settings.categories[life] ?? [];
    const idx = list.findIndex((c) => c.id === categoryId);
    if (idx < 0) return;

    const clean = clamp100(nextLabel.trim());
    const fallback = categoryId === PRIVATE_CUSTOM_CATEGORY_ID ? "Egendefinert" : list[idx].label;
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
    if (customCount >= 3) return;

    const newId = `${life}.custom.${crypto.randomUUID().slice(0, 8)}`;
    const nextCat = { id: newId, label: clamp100(label), gpsEligible: true };

    const next: Settings = {
      ...settings,
      categories: {
        ...settings.categories,
        [life]: [...existing, nextCat],
      },
    };

    // Ensure new category is enabled by default for this life
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

  // Standard: 4, Premium: 5
  const maxActiveCats = settings.premium ? 5 : 4;

  // Per-life enable/disable categories (max 4 standard / 5 premium)
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
    if (!activeLifeIsCustom) return true;
    return activeLife === "custom1" ? settings.lives.enabledCustom1 : settings.lives.enabledCustom2;
  }, [activeLife, activeLifeIsCustom, settings.lives.enabledCustom1, settings.lives.enabledCustom2]);

  const customLivesDisabled = !settings.premium;

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

  // Drawer: match TopBar (no harsh borders)
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

  // One-line row container (flat)
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

  // Expand/collapse button (looks like a line, not a big button)
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

  // Panel for expanded content (subtle tint on header background)
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

  const lifeStatusSummary = useMemo(() => {
    const c1 = settings.lives.enabledCustom1 ? "ON" : "OFF";
    const c2 = settings.lives.enabledCustom2 ? "ON" : "OFF";
    return `1: ${c1}  ·  2: ${c2}`;
  }, [settings.lives.enabledCustom1, settings.lives.enabledCustom2]);

  // NOW we can safely return null if not open (hooks already executed)
  if (!open) return null;

  return (
    <>
      <div className="drawerOverlay" onClick={onClose} style={overlayStyle} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={tGet(dict, "settings.title")} style={drawerStyle}>
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
            disabled={activeLifeIsCustom ? !activeLifeEnabled : false}
            title={activeLifeIsCustom && !activeLifeEnabled ? "OFF" : ""}
          >
            {ratingOptions.map((k) => (
              <option key={k} value={k}>
                {RATING_PACKS[k]?.label ?? k}
              </option>
            ))}
          </select>
        </div>

        {/* Categories (per active life) — one line + expandable */}
        <button type="button" onClick={() => toggleSection("categories")} style={disclosureBtnStyle} aria-expanded={openCategories}>
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

            {/* Add category only for custom lives (and only if premium + life enabled) */}
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
                  const lifeLocked = activeLifeIsCustom ? !activeLifeEnabled : false;

                  return (
                    <div key={c.id} style={row}>
                      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        {isPrivateCustomCategoryId(c.id) && settings.premium ? (
                          <input
                            className="input"
                            value={c.label}
                            onChange={(e) => updateCategoryLabel(activeLife, c.id, e.target.value)}
                            onBlur={(e) => updateCategoryLabel(activeLife, c.id, e.target.value)}
                            disabled={lifeLocked}
                            style={{ padding: "8px 10px" }}
                            title={lifeLocked ? "OFF" : ""}
                          />
                        ) : (
                          <div style={panelTitle}>
                            {c.label}
                            {premiumOnly ? " ★" : ""}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        <div className="hr" style={hrStyle} />

        {/* GPS (global) */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>{tGet(dict, "settings.gpsGlobal")}</div>
          </div>

          <select
            className="select"
            style={topbarSelectStyle}
            value={settings.gpsGlobalEnabled ? "on" : "off"}
            onChange={(e) => update({ gpsGlobalEnabled: e.target.value === "on" })}
          >
            <option value="on">ON</option>
            <option value="off">OFF</option>
          </select>
        </div>

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

        <div className="hr" style={hrStyle} />

        {/* Lives (global) — one line + expandable */}
        <button type="button" onClick={() => toggleSection("lives")} style={disclosureBtnStyle} aria-expanded={openLives}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={lineTitle}>{tGet(dict, "settings.lives")}</span>
          </span>

          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={lineSub}>{lifeStatusSummary}</span>
            <span aria-hidden style={{ opacity: 0.85 }}>
              {openLives ? "▴" : "▾"}
            </span>
          </span>
        </button>

        {openLives ? (
          <div style={panelStyle}>
            <div className="smallHelp" style={panelHelp}>
              {tGet(dict, "settings.customLives")}
            </div>

            {(["custom1", "custom2"] as const).map((lifeKey, idx) => {
              const enabled = lifeKey === "custom1" ? settings.lives.enabledCustom1 : settings.lives.enabledCustom2;
              const name = lifeKey === "custom1" ? settings.lives.custom1Name : settings.lives.custom2Name;
              const row = idx === 1 ? panelRowLast : panelRow;

              const title = lifeKey === "custom1" ? "Tilpasset liv 1" : "Tilpasset liv 2";

              return (
                <div key={lifeKey} style={row}>
                  <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                    <div style={panelTitle}>{title}</div>
                    <div style={panelHelp}>
                      {tGet(dict, "settings.name")}: {name}
                    </div>
                  </div>

                  <select
                    className="select"
                    style={topbarSelectStyle}
                    value={enabled ? "on" : "off"}
                    onChange={(e) => setLifeEnabled(lifeKey, e.target.value === "on")}
                    disabled={customLivesDisabled}
                    title={customLivesDisabled ? "Premium" : ""}
                  >
                    <option value="off">OFF</option>
                    <option value="on">ON</option>
                  </select>
                </div>
              );
            })}

            {/* Names editable only for Premium */}
            {settings.premium ? (
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                <div style={{ ...panelTitle }}>{tGet(dict, "settings.name")}</div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div className="label" style={labelStyle}>
                    Tilpasset liv 1
                  </div>
                  <input className="input" value={settings.lives.custom1Name} onChange={(e) => setLifeName("custom1", e.target.value)} />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div className="label" style={labelStyle}>
                    Tilpasset liv 2
                  </div>
                  <input className="input" value={settings.lives.custom2Name} onChange={(e) => setLifeName("custom2", e.target.value)} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>
    </>
  );
}
