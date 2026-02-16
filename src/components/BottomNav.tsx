// ===============================
// src/components/BottomNav.tsx
// ===============================
import React, { useEffect, useRef } from "react";
import type { RouteKey } from "../app/routes";
import type { Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { MCL_HUSKET_THEME } from "../theme";
import { HUSKET_TYPO } from "../theme/typography";
import { useFlyToTarget } from "../animation/useFlyToTarget";

type Props = {
  dict: I18nDict;
  settings: Settings;
  route: RouteKey;
  onRouteChange: (r: RouteKey) => void;
};

export const FLY_TARGET_ALBUM = "bottomnav:album";
export const FLY_TARGET_SHARED = "bottomnav:shared";

export function BottomNav({ dict, settings, route, onRouteChange }: Props) {
  const { registerTarget } = useFlyToTarget();

  const albumBtnRef = useRef<HTMLButtonElement | null>(null);
  const sharedBtnRef = useRef<HTMLButtonElement | null>(null);

  const showSharing = !!settings.sharingEnabled;

  useEffect(() => {
    registerTarget(FLY_TARGET_ALBUM, albumBtnRef.current);
    registerTarget(FLY_TARGET_SHARED, showSharing ? sharedBtnRef.current : null);

    return () => {
      registerTarget(FLY_TARGET_ALBUM, null);
      registerTarget(FLY_TARGET_SHARED, null);
    };
  }, [registerTarget, showSharing]);

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

    gap: 12,

    width: "100%",

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

    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: HUSKET_TYPO.A.fontWeight,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,

    transform: "none",
    transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
  };

  const btnActive: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.altSurface,
    border: `1px solid ${MCL_HUSKET_THEME.colors.altSurface}`,
    color: MCL_HUSKET_THEME.colors.textOnDark,

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
          className={`bottomBtn ${route === "album" ? "active" : ""}`}
          onClick={() => onRouteChange("album")}
          type="button"
          ref={albumBtnRef}
          style={{ ...btnBase, ...(route === "album" ? btnActive : null) }}
        >
          {tGet(dict, "nav.album")}
        </button>

        {showSharing ? (
          <button
            className={`bottomBtn ${route === "shared" ? "active" : ""}`}
            onClick={() => onRouteChange("shared")}
            type="button"
            ref={sharedBtnRef}
            style={{ ...btnBase, ...(route === "shared" ? btnActive : null) }}
          >
            {tGet(dict, "nav.shared")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
