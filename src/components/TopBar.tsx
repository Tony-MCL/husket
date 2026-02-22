// ===============================
// src/components/TopBar.tsx
// ===============================
import React, { useMemo } from "react";
import type { LifeKey, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { MCL_HUSKET_THEME } from "../theme";
import { HUSKET_TYPO } from "../theme/typography";

type Props = {
  dict: I18nDict;
  settings: Settings;
  life: LifeKey;
  onLifeChange: (life: LifeKey) => void;
  onOpenSettings: () => void;
};

function getLifeLabel(dict: I18nDict, settings: Settings, key: LifeKey): string {
  if (key === "private") return tGet(dict, "top.private");
  if (key === "work") return tGet(dict, "top.work");
  if (key === "custom1") return settings.lives.custom1Name?.trim() || tGet(dict, "start.custom1");
  return settings.lives.custom2Name?.trim() || tGet(dict, "start.custom2");
}

export function TopBar({ dict, settings, life, onLifeChange: _onLifeChange, onOpenSettings }: Props) {
  const activeLifeLabel = useMemo(() => getLifeLabel(dict, settings, life), [dict, settings, life]);

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

  const lifeLabelStyle: React.CSSProperties = {
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    borderRadius: 999,
    padding: "8px 12px",
    background: MCL_HUSKET_THEME.colors.altSurface,
    color: MCL_HUSKET_THEME.colors.textOnDark,
    whiteSpace: "nowrap",
    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: HUSKET_TYPO.A.fontWeight,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,
  };

  const burgerStyle: React.CSSProperties = {
    border: "none",
    borderRadius: 12,
    background: "transparent",
    padding: 10,
    width: 42,
    height: 42,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    flex: "0 0 auto",
    cursor: "pointer",
  };

  const burgerLinesStyle: React.CSSProperties = {
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  return (
    <div className="topRow" style={headerStyle}>
      <div style={lifeLabelStyle} aria-label={tGet(dict, "a11y.activeLife")}>
        {activeLifeLabel}
      </div>

      <button className="hamburger" onClick={onOpenSettings} type="button" aria-label={tGet(dict, "top.menu")} style={burgerStyle}>
        <div className="hamburgerLines" aria-hidden="true" style={burgerLinesStyle}>
          <span />
          <span />
          <span />
        </div>
      </button>
    </div>
  );
}
