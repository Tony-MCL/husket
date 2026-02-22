// ===============================
// src/components/BottomNav.tsx
// ===============================
import React from "react";
import type { RouteKey } from "../app/routes";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { MCL_HUSKET_THEME } from "../theme";
import { HUSKET_TYPO } from "../theme/typography";

type Props = {
  dict: I18nDict;
  route: RouteKey;
  onRouteChange: (r: RouteKey) => void;
};

export function BottomNav({ dict, route, onRouteChange }: Props) {
  const BAR_HEIGHT = 56;

  const navStyle: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.header, // same as TopBar
    borderTop: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    color: MCL_HUSKET_THEME.colors.darkSurface,
    minHeight: BAR_HEIGHT,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px 12px",
    boxSizing: "border-box",
  };

  const innerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",

    // ✅ litt mer luft mellom knapper
    gap: 12,

    width: "100%",

    // ✅ fjern evt. "gruppe-ramme" fra global CSS
    border: "none",
    outline: "none",
    boxShadow: "none",
    background: "transparent",
    borderRadius: 0,
  };

  const btnBase: React.CSSProperties = {
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    borderRadius: 999,
    padding: "6px 10px",
    background: "transparent",
    color: MCL_HUSKET_THEME.colors.darkSurface,
    whiteSpace: "nowrap",

    // Typography (A)
    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: HUSKET_TYPO.A.fontWeight,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,

    // ✅ Kill "pop" fra CSS (.bottomBtn.active transform/scale)
    transform: "none",
    transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
  };

  const btnActive: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.altSurface,
    border: `1px solid ${MCL_HUSKET_THEME.colors.altSurface}`,
    color: MCL_HUSKET_THEME.colors.textOnDark,

    // ✅ Lås typografi også i active (hvis global CSS prøver å endre)
    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: HUSKET_TYPO.A.fontWeight,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,

    transform: "none",
  };

  return (
    <div className="bottomNav" role="navigation" aria-label="Bottom navigation" style={navStyle}>
      <div className="bottomNavInner" style={innerStyle}>
        <button
          className={`bottomBtn ${route === "capture" ? "active" : ""}`}
          onClick={() => onRouteChange("capture")}
          type="button"
          style={{ ...btnBase, ...(route === "capture" ? btnActive : null) }}
        >
          {tGet(dict, "nav.new")}
        </button>

        <button
          id="bottomNavAlbumBtn"
          data-nav="album"
          className={`bottomBtn ${route === "album" ? "active" : ""}`}
          onClick={() => onRouteChange("album")}
          type="button"
          style={{ ...btnBase, ...(route === "album" ? btnActive : null) }}
        >
          {tGet(dict, "nav.album")}
        </button>
      </div>
    </div>
  );
}
