// ===============================
// src/components/ViewHusketModal.tsx
// ===============================
import React, { useEffect, useMemo, useState } from "react";
import type { Husket, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { HusketSwipeDeck } from "./HusketSwipeDeck";

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

  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        paddingBottom: `calc(${DEFAULT_BOTTOM_PANEL_PX}px + env(safe-area-inset-bottom))`,
      }}
    >
      {/* Top bar stays, but footer/bottombar is now behind the modal because zIndex is high */}
      <div className="viewerTop">
        <button className="flatBtn" onClick={close} type="button">
          ✕
        </button>

        <div className="badge">
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
