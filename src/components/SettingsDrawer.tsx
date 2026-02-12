// ===============================
// src/components/SettingsDrawer.tsx
// ===============================
import React, { useMemo, useState } from "react";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import type { CategoryDef, LifeKey, RatingPackKey, Settings } from "../domain/types";
import { MCL_HUSKET_THEME } from "../theme";

type Props = {
  dict: I18nDict;
  open: boolean;
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

export function SettingsDrawer({ dict, open, settings, onClose, onChange, onRequirePremium }: Props) {
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
    if (life !== "custom1" && life !== "custom2") return;

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

  const toggleCategoryGpsOverride = (categoryId: string) => {
    const current = settings.categoryGpsOverrides[categoryId];
    const nextVal = current === undefined ? false : !current;
    const next: Settings = {
      ...settings,
      categoryGpsOverrides: { ...settings.categoryGpsOverrides, [categoryId]: nextVal },
    };
    onChange(next);
  };

  if (!open) return null;

  const overlayStyle: React.CSSProperties = {
    background: "rgba(27, 26, 23, 0.35)", // warm dim
  };

  // Drawer matches TopBar/BottomNav
  const drawerStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.header,
    color: MCL_HUSKET_THEME.colors.darkSurface,
    borderLeft: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    boxShadow: MCL_HUSKET_THEME.elevation.elev2,
  };

  const hrStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.outline,
  };

  // Section box: “mørk mokka” (same family as active pills)
  const sectionStyle: React.CSSProperties = {
    border: `1px solid ${MCL_HUSKET_THEME.colors.altSurface}`,
    borderRadius: 14,
    padding: 10,
    background: MCL_HUSKET_THEME.colors.altSurface,
    color: MCL_HUSKET_THEME.colors.textOnDark,
  };

  // Rows inside section: slightly lighter for structure, still “dark family”
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

  // Optional: make “title row” always readable on header background
  const headerRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    color: MCL_HUSKET_THEME.colors.darkSurface,
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
          <div style={{ fontWeight: 800 }}>{tGet(dict, "settings.title")}</div>
          <button className="flatBtn" onClick={onClose} type="button">
            {tGet(dict, "settings.close")}
          </button>
        </div>

        <div className="hr" style={hrStyle} />

        <div className="label">{tGet(dict, "settings.language")}</div>
        <select
          className="select"
          value={settings.language}
          onChange={(e) => update({ language: e.target.value as Settings["language"] })}
        >
          <option value="auto">{tGet(dict, "settings.languageAuto")}</option>
          <option value="no">Norsk</option>
          <option value="en">English</option>
        </select>

        <div className="label">{tGet(dict, "settings.ratingPack")}</div>
        <select
          className="select"
          value={settings.ratingPack}
          onChange={(e) => {
            const next = e.target.value as RatingPackKey;
            if (next === "tens" && !settings.premium) return onRequirePremium();
            update({ ratingPack: next });
          }}
        >
          {ratingOptions.map((k) => (
            <option key={k} value={k}>
              {ratingPackLabels[k]}
            </option>
          ))}
        </select>

        <div className="label">{tGet(dict, "settings.gpsGlobal")}</div>
        <button
          className={`flatBtn ${settings.gpsGlobalEnabled ? "confirm" : ""}`}
          onClick={() => update({ gpsGlobalEnabled: !settings.gpsGlobalEnabled })}
          type="button"
        >
          {settings.gpsGlobalEnabled ? "ON" : "OFF"}
        </button>

        <div className="hr" style={hrStyle} />

        <div className="label">{tGet(dict, "settings.premium")}</div>
        <div className="smallHelp" style={{ marginBottom: 8 }}>
          {settings.premium ? tGet(dict, "settings.premiumOn") : tGet(dict, "settings.premiumOff")}
        </div>
        <div className="smallHelp" style={{ marginBottom: 10 }}>
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
        >
          {tGet(dict, "settings.buyPremium")}
        </button>

        <div className="hr" style={hrStyle} />

        <div className="label">{tGet(dict, "settings.lives")}</div>
        <div className="smallHelp">{tGet(dict, "settings.customLives")}</div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {(["custom1", "custom2"] as const).map((life) => {
            const enabled = life === "custom1" ? settings.lives.enabledCustom1 : settings.lives.enabledCustom2;
            const name = life === "custom1" ? settings.lives.custom1Name : settings.lives.custom2Name;

            return (
              <div key={life} style={sectionStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 800 }}>{life.toUpperCase()}</div>
                  <button
                    className={`flatBtn ${enabled ? "confirm" : ""}`}
                    onClick={() => setLifeEnabled(life, !enabled)}
                    type="button"
                    disabled={customLivesDisabled}
                    title={customLivesDisabled ? "Premium" : ""}
                  >
                    {tGet(dict, "settings.enable")} {enabled ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="label">{tGet(dict, "settings.name")}</div>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setLifeName(life, e.target.value)}
                  disabled={!settings.premium}
                />

                <div className="label">{tGet(dict, "settings.categories")}</div>
                <div className="smallHelp">{tGet(dict, "settings.customCats")}</div>

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    className="input"
                    value={customCatText}
                    onChange={(e) => setCustomCatText(e.target.value)}
                    placeholder="Legg til…"
                    disabled={!canUseCustom || !enabled}
                  />
                  <button className="flatBtn" onClick={() => addCustomCategory(life)} type="button" disabled={!canUseCustom || !enabled}>
                    +
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {(settings.categories[life] ?? []).map((c) => (
                    <div key={c.id} style={rowStyle}>
                      <div style={{ display: "grid" }}>
                        <div style={{ fontSize: 13 }}>{c.label}</div>
                        <div className="smallHelp">
                          {tGet(dict, "settings.gpsPerCat")}:{" "}
                          {settings.categoryGpsOverrides[c.id] === undefined
                            ? c.gpsEligible
                              ? "ON (default)"
                              : "OFF (default)"
                            : settings.categoryGpsOverrides[c.id]
                              ? "ON (override)"
                              : "OFF (override)"}
                        </div>
                      </div>
                      <button className="flatBtn" onClick={() => toggleCategoryGpsOverride(c.id)} type="button" disabled={!enabled}>
                        Toggle
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
