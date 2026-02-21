// ===============================
// src/components/BottomNav.tsx
// ===============================
import React from "react";
import type { RouteKey } from "../app/routes";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { HUSKET_TYPO } from "../theme/typography";

type Props = {
  dict: I18nDict;
  route: RouteKey;
  onRouteChange: (r: RouteKey) => void;
};

export function BottomNav({ dict, route, onRouteChange }: Props) {
  const BAR_HEIGHT = 56;

  const navStyle: React.CSSProperties = {
    background: "var(--header)", // same as TopBar
    borderTop: "1px solid var(--line)",
    color: "var(--darkSurface)",
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
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    border: "1px solid var(--line)",
    background: active ? "var(--altSurface)" : "transparent",
    color: active ? "var(--textOnDark)" : "var(--darkSurface)",
    borderRadius: 999,
    padding: "10px 14px",
    cursor: "pointer",
    flex: "1 1 auto",
    maxWidth: 260,
    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: HUSKET_TYPO.A.fontWeight,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,
    whiteSpace: "nowrap",
  });

  return (
    <div className="bottomNav" style={navStyle}>
      <div style={innerStyle}>
        <button type="button" style={btnStyle(route === "capture")} onClick={() => onRouteChange("capture")}>
          {tGet(dict, "nav.new")}
        </button>
        <button type="button" style={btnStyle(route === "album")} onClick={() => onRouteChange("album")}>
          {tGet(dict, "nav.album")}
        </button>
      </div>
    </div>
  );
}
