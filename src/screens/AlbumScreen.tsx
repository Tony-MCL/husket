// ===============================
// src/screens/AlbumScreen.tsx
// ===============================
import React, { useEffect, useMemo, useState } from "react";
import type { Husket, LifeKey, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { listHuskets, getImageUrl } from "../data/husketRepo";
import { ViewHusketModal } from "../components/ViewHusketModal";

type Props = {
  dict: I18nDict;
  life: LifeKey;
  settings: Settings;
};

function formatThumbDate(ts: number, lang: "no" | "en") {
  const d = new Date(ts);
  if (lang === "no") {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}.${mm}.${yy}`;
  }
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

export function AlbumScreen({ dict, life, settings }: Props) {
  const [items, setItems] = useState<Husket[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });

  const lang: "no" | "en" = useMemo(() => {
    if (settings.language === "no") return "no";
    if (settings.language === "en") return "en";
    const n = (navigator.language || "en").toLowerCase();
    return n.startsWith("no") || n.startsWith("nb") || n.startsWith("nn") ? "no" : "en";
  }, [settings.language]);

  const cats = settings.categories[life] ?? [];

  const categoryLabel = (id: string | null) => {
    if (!id) return null;
    return cats.find((c) => c.id === id)?.label ?? null;
  };

  useEffect(() => {
    const next = listHuskets(life);
    setItems(next);

    let cancelled = false;
    (async () => {
      const urls: Record<string, string> = {};
      for (const it of next.slice(0, 60)) {
        const u = await getImageUrl(it.imageKey);
        if (cancelled) return;
        if (u) urls[it.id] = u;
      }
      if (cancelled) return;
      setThumbUrls((prev) => {
        // revoke old urls that are replaced
        for (const k of Object.keys(prev)) {
          if (!urls[k]) URL.revokeObjectURL(prev[k]);
        }
        return urls;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [life]);

  useEffect(() => {
    return () => {
      for (const u of Object.values(thumbUrls)) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items.length === 0) {
    return <div className="smallHelp">{tGet(dict, "album.empty")}</div>;
  }

  return (
    <div>
      <div className="albumGrid">
        {items.map((it, index) => (
          <button
            key={it.id}
            className="thumb"
            onClick={() => setViewer({ open: true, index })}
            type="button"
            style={{ padding: 0, textAlign: "left", cursor: "pointer" }}
          >
            {thumbUrls[it.id] ? <img className="thumbImg" src={thumbUrls[it.id]} alt="" /> : <div className="capturePreview">Loading…</div>}
            <div className="thumbMeta">
              <span>{formatThumbDate(it.createdAt, lang)}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {it.gps ? <span title={tGet(dict, "album.gps")}>🌍</span> : null}
                {categoryLabel(it.categoryId) ? <span className="badge">{categoryLabel(it.categoryId)}</span> : null}
              </span>
            </div>
          </button>
        ))}
      </div>

      {viewer.open ? (
        <ViewHusketModal
          dict={dict}
          settings={settings}
          items={items}
          startIndex={viewer.index}
          onClose={() => setViewer({ open: false, index: 0 })}
        />
      ) : null}
    </div>
  );
}


