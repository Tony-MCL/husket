// ===============================
// src/components/BottomNav.tsx
// ===============================
import React from "react";
import type { RouteKey } from "../app/routes";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { MCL_HUSKET_THEME } from "../theme";

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
    gap: 8,
    width: "100%",
  };

  const btnBase: React.CSSProperties = {
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    borderRadius: 999,
    padding: "6px 10px", // smaller pills
    background: "transparent",
    color: MCL_HUSKET_THEME.colors.darkSurface,
    fontWeight: 800,
    fontSize: 13, // one notch down
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  const btnActive: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.altSurface,
    border: `1px solid ${MCL_HUSKET_THEME.colors.altSurface}`,
    color: MCL_HUSKET_THEME.colors.textOnDark,
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
          className={`bottomBtn ${route === "album" ? "active" : ""}`}
          onClick={() => onRouteChange("album")}
          type="button"
          style={{ ...btnBase, ...(route === "album" ? btnActive : null) }}
        >
          {tGet(dict, "nav.album")}
        </button>

        <button
          className={`bottomBtn ${route === "shared" ? "active" : ""}`}
          onClick={() => onRouteChange("shared")}
          type="button"
          style={{ ...btnBase, ...(route === "shared" ? btnActive : null) }}
        >
          {tGet(dict, "nav.shared")}
        </button>
      </div>
    </div>
  );
}
