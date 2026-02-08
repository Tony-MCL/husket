// ===============================
// src/components/BottomNav.tsx
// ===============================
import React from "react";
import type { RouteKey } from "../app/routes";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";

type Props = {
  dict: I18nDict;
  route: RouteKey;
  onRouteChange: (r: RouteKey) => void;
};

export function BottomNav({ dict, route, onRouteChange }: Props) {
  return (
    <div className="bottomNav" role="navigation" aria-label="Bottom navigation">
      <div className="bottomNavInner">
        <button
          className={`bottomBtn ${route === "capture" ? "active" : ""}`}
          onClick={() => onRouteChange("capture")}
          type="button"
        >
          {tGet(dict, "nav.new")}
        </button>
        <button
          className={`bottomBtn ${route === "album" ? "active" : ""}`}
          onClick={() => onRouteChange("album")}
          type="button"
        >
          {tGet(dict, "nav.album")}
        </button>
        <button
          className={`bottomBtn ${route === "shared" ? "active" : ""}`}
          onClick={() => onRouteChange("shared")}
          type="button"
        >
          {tGet(dict, "nav.shared")}
        </button>
      </div>
    </div>
  );
}


