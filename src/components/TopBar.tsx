// ===============================
// src/components/TopBar.tsx
// ===============================
import React, { useMemo } from "react";
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
      {
        key: "custom1",
        label: getLifeLabel(dict, settings, "custom1"),
        enabled: !!settings.lives.enabledCustom1,
      },
      {
        key: "custom2",
        label: getLifeLabel(dict, settings, "custom2"),
        enabled: !!settings.lives.enabledCustom2,
      },
      { key: "work", label: getLifeLabel(dict, settings, "work"), enabled: true },
    ];
    return tabs.filter((t) => t.enabled);
  }, [dict, settings]);

  return (
    <div className="topRow">
      <div className="lifeTabs" role="tablist" aria-label="Lives">
        {lives.map((x) => (
          <button
            key={x.key}
            className={`lifeTab ${life === x.key ? "active" : ""}`}
            onClick={() => onLifeChange(x.key)}
            type="button"
          >
            {x.label}
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
