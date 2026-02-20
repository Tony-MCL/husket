// ===============================
// src/screens/SharedWithMeScreen.tsx
// ===============================
import React from "react";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { HUSKET_TYPO } from "../theme/typography";

export function SharedWithMeScreen({ dict }: { dict: I18nDict }) {
  const textA: React.CSSProperties = {
    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: HUSKET_TYPO.A.fontWeight,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,
  };

  const textB: React.CSSProperties = {
    fontSize: HUSKET_TYPO.B.fontSize,
    fontWeight: HUSKET_TYPO.B.fontWeight,
    lineHeight: HUSKET_TYPO.B.lineHeight,
    letterSpacing: HUSKET_TYPO.B.letterSpacing,
  };

  return (
    <div>
      <div style={{ ...textA, marginBottom: 8 }}>{tGet(dict, "shared.title")}</div>
      <div className="smallHelp" style={textB}>
        {tGet(dict, "shared.placeholder")}
      </div>
    </div>
  );
}
