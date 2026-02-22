// ===============================
// src/components/ViewHusketModal.tsx
// ===============================
import React, { useEffect, useState } from "react";
import type { Husket, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { HusketSwipeDeck } from "./HusketSwipeDeck";
import { MCL_HUSKET_THEME } from "../theme";
import { HUSKET_TYPO } from "../theme/typography";

type Props = {
  dict: I18nDict;
  settings: Settings;
  items: Husket[];
  index: number;
  onSetIndex: (nextIndex: number) => void;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
};

const DEFAULT_BOTTOM_PANEL_PX = 78;

export function ViewHusketModal({
  dict,
  settings,
  items,
  index,
  onSetIndex,
  onDelete,
  onClose,
}: Props) {
  const cur = items[index];

  const [busyDelete, setBusyDelete] = useState(false);

  const canOlder = index < items.length - 1;
  const canNewer = index > 0;

  const textA: React.CSSProperties = {
    fontSize: HUSKET_TYPO.A.fontSize,
    fontWeight: HUSKET_TYPO.A.fontWeight,
    lineHeight: HUSKET_TYPO.A.lineHeight,
    letterSpacing: HUSKET_TYPO.A.letterSpacing,
  };

  const close = () => {
    if (busyDelete) return;
    onClose();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
    // Right => older, Left => newer (as you requested)
    if (e.key === "ArrowRight" && canOlder) onSetIndex(index + 1);
    if (e.key === "ArrowLeft" && canNewer) onSetIndex(index - 1);
  };

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, canOlder, canNewer, busyDelete]);

  const deleteCurrent = async () => {
    if (!cur || busyDelete) return;

    setBusyDelete(true);
    try {
      await onDelete(cur.id);
      // parent should update items + index; if empty: close.
    } finally {
      setBusyDelete(false);
    }
  };

  if (!cur) return null;

  const topBarStyle: React.CSSProperties = {
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 12px",
    boxSizing: "border-box",

    // ✅ Theme-match (same as TopBar/BottomNav/Deck)
    background: "var(--header)",

    borderBottom: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const topRightBadgeStyle: React.CSSProperties = {
    ...textA,
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    borderRadius: 999,
    padding: "6px 10px",
    background: "transparent",
    color: MCL_HUSKET_THEME.colors.darkSurface,
    whiteSpace: "nowrap",
  };

  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,

        // ✅ Theme-match (same as TopBar/BottomNav/Deck)
        background: "var(--header)",

        color: MCL_HUSKET_THEME.colors.darkSurface,

        // Keep bottom panel space for swipe deck
        paddingBottom: `calc(${DEFAULT_BOTTOM_PANEL_PX}px + env(safe-area-inset-bottom))`,
      }}
    >
      {/* Top bar */}
      <div className="viewerTop" style={topBarStyle}>
        <button className="flatBtn" onClick={close} type="button" disabled={busyDelete} style={textA}>
          ✕
        </button>

        <div className="badge" style={topRightBadgeStyle}>
          {index + 1}/{items.length}
        </div>
      </div>

      <div style={{ height: "calc(100% - 56px)" }}>
        <HusketSwipeDeck
          dict={dict}
          settings={settings}
          items={items}
          index={index}
          onSetIndex={onSetIndex}
          onClose={close}
          onDeleteCurrent={() => void deleteCurrent()}
        />
      </div>
    </div>
  );
}
