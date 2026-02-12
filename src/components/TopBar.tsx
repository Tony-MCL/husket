// ===============================
// src/components/TopBar.tsx
// ===============================
import React, { useMemo } from "react";
import type { LifeKey, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { MCL_HUSKET_THEME } from "../theme";

type Props = {
  dict: I18nDict;
  settings: Settings;
  life: LifeKey;
  onLifeChange: (life: LifeKey) => void;
  onOpenSettings: () => void;
};

type LifeTab = {
  key: LifeKey;
  label: string;
  enabled: boolean;
};

function getLifeLabel(dict: I18nDict, settings: Settings, key: LifeKey): string {
  if (key === "private") return tGet(dict, "top.private");
  if (key === "work") return tGet(dict, "top.work");
  if (key === "custom1") return settings.lives.custom1Name || "Custom 1";
  return settings.lives.custom2Name || "Custom 2";
}

export function TopBar({ dict, settings, life, onLifeChange, onOpenSettings }: Props) {
  const lives: LifeTab[] = useMemo(() => {
    const tabs: LifeTab[] = [
      { key: "private", label: getLifeLabel(dict, settings, "private"), enabled: true },
      { key: "custom1", label: getLifeLabel(dict, settings, "custom1"), enabled: !!settings.lives.enabledCustom1 },
      { key: "custom2", label: getLifeLabel(dict, settings, "custom2"), enabled: !!settings.lives.enabledCustom2 },
      { key: "work", label: getLifeLabel(dict, settings, "work"), enabled: true },
    ];
    return tabs.filter((t) => t.enabled);
  }, [dict, settings]);

  const BAR_HEIGHT = 56;

  const headerStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.header,
    borderBottom: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    color: MCL_HUSKET_THEME.colors.darkSurface,
    minHeight: BAR_HEIGHT,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    boxSizing: "border-box",
  };

  const tabsWrapStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "nowrap",
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    paddingBottom: 2,
  };

  const tabBaseStyle: React.CSSProperties = {
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    borderRadius: 999,
    padding: "6px 10px",
    background: "transparent",
    color: MCL_HUSKET_THEME.colors.darkSurface,
    fontWeight: 700,
    fontSize: 13,
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  const tabActiveStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.altSurface,
    border: `1px solid ${MCL_HUSKET_THEME.colors.altSurface}`,
    color: MCL_HUSKET_THEME.colors.textOnDark,
  };

  const burgerStyle: React.CSSProperties = {
    border: `1px solid ${MCL_HUSKET_THEME.colors.altSurface}`,
    borderRadius: 12,
    background: MCL_HUSKET_THEME.colors.altSurface, // match active pills
    padding: 10,
    width: 42,
    height: 42,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    flex: "0 0 auto",
  };

  const burgerLinesStyle: React.CSSProperties = {
    color: MCL_HUSKET_THEME.colors.textOnDark,
  };

  return (
    <div className="topRow" style={headerStyle}>
      <div className="lifeTabs" role="tablist" aria-label="Lives" style={tabsWrapStyle}>
        {lives.map((x) => (
          <button
            key={x.key}
            className={`lifeTab ${life === x.key ? "active" : ""}`}
            onClick={() => onLifeChange(x.key)}
            type="button"
            style={{ ...tabBaseStyle, ...(life === x.key ? tabActiveStyle : null) }}
          >
            {x.label}
          </button>
        ))}
      </div>

      <button
        className="hamburger"
        onClick={onOpenSettings}
        type="button"
        aria-label={tGet(dict, "top.menu")}
        style={burgerStyle}
      >
        <div className="hamburgerLines" aria-hidden="true" style={burgerLinesStyle}>
          <span />
          <span />
          <span />
        </div>
      </button>
    </div>
  );
}
