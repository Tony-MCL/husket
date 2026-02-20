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

    if (settings.lives.enabledPrivate) {
      list.push({ key: "private", label: tGet(dict, "top.private") });
    }
    if (settings.lives.enabledWork) {
      list.push({ key: "work", label: tGet(dict, "top.work") });
    }
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

    // Safety fallback: always allow private
    if (list.length === 0) {
      list.push({ key: "private", label: tGet(dict, "top.private") });
    }

    return list;
  }, [dict, settings]);

  const shellStyle: React.CSSProperties = {
    minHeight: "100vh",
    width: "100%",
    display: "grid",
    placeItems: "center",
    padding: 18,
    background: MCL_HUSKET_THEME.colors.bg,
    color: MCL_HUSKET_THEME.colors.text,
  };

  const cardStyle: React.CSSProperties = {
    width: "min(520px, 92vw)",
    borderRadius: 18,
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    background: "rgba(255,255,255,0.78)",
    boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
    padding: 14,
    display: "grid",
    gap: 12,
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: HUSKET_TYPO.A.fontWeight,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,
    color: "rgba(27,26,23,0.92)",
  };

  const helpStyle: React.CSSProperties = {
    margin: 0,
    color: "rgba(27,26,23,0.70)",
    fontSize: 12,
    fontWeight: 650,
    lineHeight: 1.25,
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
    marginTop: 4,
  };

  const btnStyle: React.CSSProperties = {
    width: "100%",
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    borderRadius: 16,
    padding: "14px 12px",
    background: "transparent",
    color: "rgba(27,26,23,0.90)",
    cursor: "pointer",

    fontSize: HUSKET_TYPO.B.fontSize,
    fontWeight: HUSKET_TYPO.B.fontWeight,
    lineHeight: HUSKET_TYPO.B.lineHeight,
    letterSpacing: HUSKET_TYPO.B.letterSpacing,
    textAlign: "left",
  };

  const pillStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    borderRadius: 999,
    padding: "6px 10px",
    background: "rgba(27, 26, 23, 0.04)",
    fontSize: 12,
    fontWeight: 800,
  };

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>{tGet(dict, "start.title")}</h1>
        <p style={helpStyle}>{tGet(dict, "start.subtitle")}</p>

        <div style={gridStyle}>
          {choices.map((c) => (
            <button key={c.key} type="button" style={btnStyle} onClick={() => onPick(c.key)}>
              <span style={pillStyle}>{c.label}</span>
            </button>
          ))}
        </div>

        <p style={helpStyle}>{tGet(dict, "start.hint")}</p>
      </div>
    </div>
  );
}
