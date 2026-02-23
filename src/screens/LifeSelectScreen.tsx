// ===============================
// src/screens/LifeSelectScreen.tsx
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
  onPick: (life: LifeKey) => void;
};

type LifeChoice = {
  key: LifeKey;
  label: string;
};

export function LifeSelectScreen({ dict, settings, onPick }: Props) {
  const choices = useMemo<LifeChoice[]>(() => {
    const list: LifeChoice[] = [];

    if (settings.lives.enabledPrivate) list.push({ key: "private", label: tGet(dict, "top.private") });
    if (settings.lives.enabledWork) list.push({ key: "work", label: tGet(dict, "top.work") });

    if (settings.lives.enabledCustom1) {
      list.push({
        key: "custom1",
        label: settings.lives.custom1Name?.trim() || tGet(dict, "start.custom1"),
      });
    }
    if (settings.lives.enabledCustom2) {
      list.push({
        key: "custom2",
        label: settings.lives.custom2Name?.trim() || tGet(dict, "start.custom2"),
      });
    }

    // Safety fallback
    if (list.length === 0) list.push({ key: "private", label: tGet(dict, "top.private") });

    return list;
  }, [dict, settings]);

  const shellStyle: React.CSSProperties = {
    minHeight: "100svh",
    width: "100%",
    display: "grid",
    placeItems: "center",
    padding: 18,
    boxSizing: "border-box",
    color: MCL_HUSKET_THEME.colors.textOnDark,
  };

  const centerStyle: React.CSSProperties = {
    width: "min(520px, 92vw)",
    display: "grid",
    placeItems: "center",
    gap: 18,
    textAlign: "center",
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: 900,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,
  };

  const buttonsWrapStyle: React.CSSProperties = {
    display: "grid",
    gap: 12,
    justifyItems: "center",
    alignItems: "center",
    marginTop: 6,
  };

  // Flat buttons: no border, no card, no chip background
  const flatBtnStyle: React.CSSProperties = {
    width: "min(320px, 86vw)",
    background: "transparent",
    border: "none",
    padding: "14px 10px",
    cursor: "pointer",
    color: MCL_HUSKET_THEME.colors.textOnDark,

    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 0.2,
  };

  return (
    <div className="bootShell" style={shellStyle}>
      <div style={centerStyle}>
        <h1 style={titleStyle}>{tGet(dict, "start.title")}</h1>

        <div style={buttonsWrapStyle}>
          {choices.map((c) => (
            <button key={c.key} type="button" style={flatBtnStyle} onClick={() => onPick(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
