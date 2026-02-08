// ===============================
// src/screens/SharedWithMeScreen.tsx
// ===============================
import React from "react";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";

export function SharedWithMeScreen({ dict }: { dict: I18nDict }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{tGet(dict, "shared.title")}</div>
      <div className="smallHelp">{tGet(dict, "shared.placeholder")}</div>
    </div>
  );
}


