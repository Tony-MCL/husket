// ===============================
// src/components/SettingsDrawer.tsx
// ===============================
import React, { useMemo, useState } from "react";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import type { CategoryDef, LifeKey, RatingPackKey, Settings } from "../domain/types";
import { getEffectiveRatingPack, setRatingPackForLife } from "../domain/settingsCore";
import { MCL_HUSKET_THEME } from "../theme";
import { HUSKET_TYPO } from "../theme/typography";

type Props = {
  dict: I18nDict;
  open: boolean;
  activeLife: LifeKey;
  settings: Settings;
  onClose: () => void;
  onChange: (next: Settings) => void;
  onRequirePremium: () => void;
};

const ratingPackLabels: Record<RatingPackKey, string> = {
  emoji: "😊 😐 😖",
  thumbs: "👍 👎",
  check: "✓  ✗  −",
  tens: "1/10 … 10/10",
};

function clamp100(s: string): string {
  return s.length > 100 ? s.slice(0, 100) : s;
}

function isCustomLife(life: LifeKey): life is "custom1" | "custom2" {
  return life === "custom1" || life === "custom2";
}

export function SettingsDrawer({ dict, open, activeLife, settings, onClose, onChange, onRequirePremium }: Props) {
  const [customCatText, setCustomCatText] = useState<string>("");

  const canUseCustom = settings.premium;

  const ratingOptions: RatingPackKey[] = useMemo(() => {
    if (settings.premium) return ["emoji", "thumbs", "check", "tens"];
    return ["emoji", "thumbs", "check"];
  }, [settings.premium]);

  const customLivesDisabled = !settings.premium;

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

  const addCustomCategory = (life: LifeKey) => {
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
    const nextCat: CategoryDef = { id: newId, label: clamp100(label), gpsEligible: true };

    const next: Settings = {
      ...settings,
      categories: {
        ...settings.categories,
        [life]: [...existing, nextCat],
      },
    };
    setCustomCatText("");
    onChange(next);
  };

  const setCategoryGpsOverride = (categoryId: string, mode: "default" | "on" | "off") => {
    const nextOverrides = { ...settings.categoryGpsOverrides };

    if (mode === "default") {
      if (categoryId in nextOverrides) delete nextOverrides[categoryId];
    } else {
      nextOverrides[categoryId] = mode === "on";
    }

    const next: Settings = {
      ...settings,
      categoryGpsOverrides: nextOverrides,
    };
    onChange(next);
  };

  const activeCats = useMemo(() => settings.categories[activeLife] ?? [], [settings.categories, activeLife]);
  const activeRatingPack = useMemo(() => getEffectiveRatingPack(settings, activeLife), [settings, activeLife]);

  const activeLifeIsCustom = isCustomLife(activeLife);
  const activeLifeEnabled = useMemo(() => {
    if (!activeLifeIsCustom) return true;
    return activeLife === "custom1" ? settings.lives.enabledCustom1 : settings.lives.enabledCustom2;
  }, [activeLife, activeLifeIsCustom, settings.lives.enabledCustom1, settings.lives.enabledCustom2]);

  if (!open) return null;

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
    borderLeft: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    boxShadow: MCL_HUSKET_THEME.elevation.elev2,
  };

  const hrStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.outline,
  };

  const sectionStyle: React.CSSProperties = {
    border: `1px solid ${MCL_HUSKET_THEME.colors.altSurface}`,
    borderRadius: 14,
    padding: 10,
    background: MCL_HUSKET_THEME.colors.altSurface,
    color: MCL_HUSKET_THEME.colors.textOnDark,
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    border: `1px solid rgba(247, 243, 237, 0.16)`,
    borderRadius: 14,
    padding: "8px 10px",
    background: "rgba(255, 250, 244, 0.06)",
    color: MCL_HUSKET_THEME.colors.textOnDark,
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

  const sectionTitleStyle: React.CSSProperties = { ...textA, color: MCL_HUSKET_THEME.colors.textOnDark };
  const rowTitleStyle: React.CSSProperties = { ...textB, color: MCL_HUSKET_THEME.colors.textOnDark };
  const rowHelpStyle: React.CSSProperties = { ...textB, color: MCL_HUSKET_THEME.colors.textOnDark, opacity: 0.9 };

  const topbarSelectStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.header,
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const getLifeLabel = (life: LifeKey) => {
    if (life === "private") return settings.lives.privateName;
    if (life === "work") return settings.lives.workName;
    if (life === "custom1") return settings.lives.custom1Name;
    return settings.lives.custom2Name;
  };

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

        <div className="label" style={labelStyle}>
          {tGet(dict, "settings.language")}
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

        <div className="label" style={labelStyle}>
          {tGet(dict, "settings.ratingPack")} ({getLifeLabel(activeLife)})
        </div>
        <select
          className="select"
          style={topbarSelectStyle}
          value={activeRatingPack}
          onChange={(e) => {
            const next = e.target.value as RatingPackKey;
            if (next === "tens" && !settings.premium) return onRequirePremium();
            onChange(setRatingPackForLife(settings, activeLife, next));
          }}
          disabled={activeLifeIsCustom ? !activeLifeEnabled : false}
          title={activeLifeIsCustom && !activeLifeEnabled ? "OFF" : ""}
        >
          {ratingOptions.map((k) => (
            <option key={k} value={k}>
              {ratingPackLabels[k]}
            </option>
          ))}
        </select>

        {/* Categories (per active life) — right under rating */}
        <div style={{ ...sectionStyle, marginTop: 10 }}>
          <div style={sectionTitleStyle}>
            {tGet(dict, "settings.categories")} ({getLifeLabel(activeLife)})
          </div>

          <div className="smallHelp" style={{ ...smallHelpStyle, marginTop: 6 }}>
            {tGet(dict, "settings.gpsPerCat")}
          </div>

          {activeLifeIsCustom ? (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                className="input"
                value={customCatText}
                onChange={(e) => setCustomCatText(e.target.value)}
                placeholder="Legg til…"
                disabled={!canUseCustom || !activeLifeEnabled}
              />
              <button
                className="flatBtn"
                onClick={() => addCustomCategory(activeLife)}
                type="button"
                disabled={!canUseCustom || !activeLifeEnabled}
                style={actionTextStyle}
              >
                +
              </button>
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {activeCats.map((c) => {
              const override = settings.categoryGpsOverrides[c.id];
              const mode: "default" | "on" | "off" = override === undefined ? "default" : override ? "on" : "off";

              return (
                <div key={c.id} style={rowStyle}>
                  <div style={{ display: "grid" }}>
                    <div style={rowTitleStyle}>{c.label}</div>
                    <div className="smallHelp" style={rowHelpStyle}>
                      {override === undefined ? (c.gpsEligible ? "ON (default)" : "OFF (default)") : override ? "ON (override)" : "OFF (override)"}
                    </div>
                  </div>

                  <select
                    className="select"
                    style={topbarSelectStyle}
                    value={mode}
                    onChange={(e) => setCategoryGpsOverride(c.id, e.target.value as "default" | "on" | "off")}
                    disabled={activeLifeIsCustom ? !activeLifeEnabled : false}
                  >
                    <option value="default">Default</option>
                    <option value="on">Force ON</option>
                    <option value="off">Force OFF</option>
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        <div className="label" style={{ ...labelStyle, marginTop: 12 }}>
          {tGet(dict, "settings.gpsGlobal")}
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

        <div className="hr" style={hrStyle} />

        <div className="label" style={labelStyle}>
          {tGet(dict, "settings.premium")}
        </div>
        <div className="smallHelp" style={{ ...smallHelpStyle, marginBottom: 8 }}>
          {settings.premium ? tGet(dict, "settings.premiumOn") : tGet(dict, "settings.premiumOff")}
        </div>
        <div className="smallHelp" style={{ ...smallHelpStyle, marginBottom: 10 }}>
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

        <div className="hr" style={hrStyle} />

        <div className="label" style={labelStyle}>
          {tGet(dict, "settings.lives")}
        </div>
        <div className="smallHelp" style={smallHelpStyle}>
          {tGet(dict, "settings.customLives")}
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {(["custom1", "custom2"] as const).map((life) => {
            const enabled = life === "custom1" ? settings.lives.enabledCustom1 : settings.lives.enabledCustom2;
            const name = life === "custom1" ? settings.lives.custom1Name : settings.lives.custom2Name;

            return (
              <div key={life} style={rowStyle}>
                <div style={{ display: "grid" }}>
                  <div style={rowTitleStyle}>{life === "custom1" ? "Tilpasset liv 1" : "Tilpasset liv 2"}</div>
                  <div className="smallHelp" style={rowHelpStyle}>
                    {tGet(dict, "settings.name")}: {name}
                  </div>
                </div>

                <select
                  className="select"
                  style={topbarSelectStyle}
                  value={enabled ? "on" : "off"}
                  onChange={(e) => setLifeEnabled(life, e.target.value === "on")}
                  disabled={customLivesDisabled}
                  title={customLivesDisabled ? "Premium" : ""}
                >
                  <option value="off">OFF</option>
                  <option value="on">ON</option>
                </select>
              </div>
            );
          })}
        </div>

        {settings.premium ? (
          <div style={{ ...sectionStyle, marginTop: 10 }}>
            <div style={sectionTitleStyle}>{tGet(dict, "settings.name")}</div>

            <div className="label" style={labelStyle}>
              Tilpasset liv 1
            </div>
            <input className="input" value={settings.lives.custom1Name} onChange={(e) => setLifeName("custom1", e.target.value)} />

            <div className="label" style={{ ...labelStyle, marginTop: 10 }}>
              Tilpasset liv 2
            </div>
            <input className="input" value={settings.lives.custom2Name} onChange={(e) => setLifeName("custom2", e.target.value)} />
          </div>
        ) : null}
      </aside>
    </>
  );
}
