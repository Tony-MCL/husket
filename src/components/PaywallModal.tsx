// ===============================
// src/components/PaywallModal.tsx
// ===============================
import React from "react";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";

type Props = {
  dict: I18nDict;
  open: boolean;
  onCancel: () => void;
  onActivate: () => void;
};

export function PaywallModal({ dict, open, onCancel, onActivate }: Props) {
  if (!open) return null;
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modalBox">
        <h3 className="modalTitle">{tGet(dict, "paywall.title")}</h3>
        <div className="smallHelp">{tGet(dict, "paywall.body")}</div>
        <div className="modalActions">
          <button className="flatBtn danger" onClick={onCancel} type="button">
            {tGet(dict, "paywall.cancel")}
          </button>
          <button className="flatBtn confirm" onClick={onActivate} type="button">
            {tGet(dict, "paywall.activate")}
          </button>
        </div>
      </div>
    </div>
  );
}


