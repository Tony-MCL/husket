// ===============================
// src/components/TopBar.tsx
// ===============================
import React from "react";
import type { LifeKey, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";

type Props = {
  dict: I18nDict;
  settings: Settings;
  life: LifeKey;
  onLifeChange: (life: LifeKey) => void;
  onOpenSettings: () => void;
};

export function TopBar({ dict, settings, life, onLifeChange, onOpenSettings }: Props) {
  const lives: { key: LifeKey; label: string; enabled: boolean }[] = [
    { key: "private", label: settings.lives.privateName, enabled: true },
    { key: "work", label: settings.lives.workName, enabled: true },
    { key: "custom1", label: settings.lives.custom1Name, enabled: settings.lives.enabledCustom1 },
    { key: "custom2", label: settings.lives.custom2Name, enabled: settings.lives.enabledCustom2 },
  ];

  const visible = lives.filter((x) => x.enabled);

  return (
    <div className="topRow">
      <div className="lifeTabs" role="tablist" aria-label="Lives">
        {visible.map((x) => (
          <button
            key={x.key}
            className={`lifeTab ${life === x.key ? "active" : ""}`}
            onClick={() => onLifeChange(x.key)}
            type="button"
          >
            {x.key === "private" ? tGet(dict, "top.private") : x.key === "work" ? tGet(dict, "top.work") : x.label}
          </button>
        ))}
      </div>

      <button className="hamburger" onClick={onOpenSettings} type="button" aria-label={tGet(dict, "top.menu")}>
        <div className="hamburgerLines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </button>
    </div>
  );
}


