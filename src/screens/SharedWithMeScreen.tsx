// ===============================
// src/screens/SharedWithMeScreen.tsx
// ===============================
import React, { useEffect, useMemo, useState } from "react";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { HUSKET_TYPO } from "../theme/typography";
import { MCL_HUSKET_THEME } from "../theme";
import { useToast } from "../components/ToastHost";

import { collection, onSnapshot, orderBy, query, where, type Timestamp as FsTimestamp } from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { httpsCallable } from "firebase/functions";

import { auth, db, functions, storage } from "../firebase";

type RelayStatus = "pending" | "opened" | "resolved";

type RelayDoc = {
  senderUid: string;
  recipientUid: string;
  createdAt?: FsTimestamp;
  openedAt?: FsTimestamp | null;
  expiresAt?: FsTimestamp;
  status: RelayStatus;
  payload: any;
  image?: { storagePath?: string };
};

type RelayItem = {
  id: string;
  doc: RelayDoc;
  imageUrl: string | null;
};

function fmtDateTime(ts?: any): string {
  try {
    const d = ts?.toDate ? ts.toDate() : null;
    if (!d) return "";
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return "";
  }
}

export function SharedWithMeScreen({ dict }: { dict: I18nDict }) {
  const toast = useToast();

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

  const cardStyle: React.CSSProperties = {
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    borderRadius: 16,
    padding: 12,
    background: "rgba(255,255,255,0.02)",
    display: "flex",
    gap: 12,
    alignItems: "stretch",
  };

  const btnStyle: React.CSSProperties = {
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    borderRadius: 999,
    padding: "8px 12px",
    background: "transparent",
    color: MCL_HUSKET_THEME.colors.textOnDark,
    cursor: "pointer",
    fontSize: HUSKET_TYPO.B.fontSize,
    fontWeight: HUSKET_TYPO.B.fontWeight,
    lineHeight: HUSKET_TYPO.B.lineHeight,
    letterSpacing: HUSKET_TYPO.B.letterSpacing,
    whiteSpace: "nowrap",
  };

  const btnPrimaryStyle: React.CSSProperties = {
    ...btnStyle,
    background: MCL_HUSKET_THEME.colors.altSurface,
    borderColor: MCL_HUSKET_THEME.colors.altSurface,
  };

  const [items, setItems] = useState<RelayItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [openId, setOpenId] = useState<string | null>(null);
  const openItem = useMemo(() => items.find((x) => x.id === openId) ?? null, [items, openId]);

  // Lytt til relay-inbox for current user
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(collection(db, "relay"), where("recipientUid", "==", uid), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, doc: d.data() as RelayDoc }));

        // last inn bilde-URLer parallelt, men trygt
        const resolved: RelayItem[] = await Promise.all(
          docs.map(async (x) => {
            const path = x.doc?.image?.storagePath;
            if (!path) return { id: x.id, doc: x.doc, imageUrl: null };
            try {
              const url = await getDownloadURL(storageRef(storage, path));
              return { id: x.id, doc: x.doc, imageUrl: url };
            } catch {
              return { id: x.id, doc: x.doc, imageUrl: null };
            }
          })
        );

        setItems(resolved);
        setLoading(false);
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        toast.show("Kunne ikke lese Sky-innboksen (relay).");
        setItems([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [toast]);

  const callOpenRelayItem = async (relayId: string) => {
    const fn = httpsCallable(functions, "openRelayItem");
    await fn({ relayId });
  };

  const callResolveRelayItem = async (relayId: string, action: "save" | "discard") => {
    const fn = httpsCallable(functions, "resolveRelayItem");
    const res = await fn({ relayId, action });
    return res.data as any;
  };

  const handleOpen = async (relayId: string) => {
    try {
      setOpenId(relayId);
      await callOpenRelayItem(relayId);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(e);
      toast.show("Kunne ikke åpne elementet.");
    }
  };

  const handleSave = async (relayId: string) => {
    try {
      const res = await callResolveRelayItem(relayId, "save");
      const savedId = (res as any)?.savedHusketId;
      toast.show(savedId ? "Lagret i albumet ditt." : "Lagret.");
      setOpenId(null);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(e);
      toast.show("Kunne ikke lagre (resolveRelayItem).");
    }
  };

  const handleDiscard = async (relayId: string) => {
    try {
      await callResolveRelayItem(relayId, "discard");
      toast.show("Forkastet.");
      setOpenId(null);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(e);
      toast.show("Kunne ikke forkaste (resolveRelayItem).");
    }
  };

  return (
    <div style={{ padding: 12 }}>
      <div style={{ ...textA, marginBottom: 8 }}>{tGet(dict, "shared.title")}</div>

      {loading ? (
        <div className="smallHelp" style={{ ...textB, opacity: 0.8 }}>
          Laster…
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="smallHelp" style={textB}>
          {tGet(dict, "shared.placeholder")}
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {items.map((x) => {
            const p = x.doc?.payload || {};
            const comment = typeof p.comment === "string" ? p.comment : "";
            const cat = typeof p.categoryLabel === "string" ? p.categoryLabel : p.categoryLabelSnapshot || null;
            const rating = p.ratingValue ? String(p.ratingValue) : "";
            const pack = p.ratingPackKey ? String(p.ratingPackKey) : "";
            const created = fmtDateTime(x.doc.createdAt);

            return (
              <div key={x.id} style={cardStyle}>
                <div
                  style={{
                    width: 92,
                    minWidth: 92,
                    height: 92,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
                    background: "rgba(0,0,0,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {x.imageUrl ? (
                    <img src={x.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ ...textB, opacity: 0.7 }}>Bilde</div>
                  )}
                </div>

                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div style={{ ...textB, opacity: 0.85, marginBottom: 4 }}>{created}</div>
                  <div style={{ ...textA, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cat ? cat : "Uten kategori"}
                  </div>
                  <div style={{ ...textB, opacity: 0.9, marginBottom: 6 }}>
                    {pack && rating ? `Vurdering: ${pack} / ${rating}` : pack || rating ? `Vurdering: ${pack}${rating ? ` ${rating}` : ""}` : "Vurdering: –"}
                  </div>
                  {comment ? (
                    <div style={{ ...textB, opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {comment}
                    </div>
                  ) : (
                    <div style={{ ...textB, opacity: 0.6 }}>Ingen kommentar</div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button type="button" style={btnPrimaryStyle} onClick={() => handleOpen(x.id)}>
                      Åpne
                    </button>
                    <button type="button" style={btnStyle} onClick={() => handleDiscard(x.id)}>
                      Forkast
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Viewer / modal */}
      {openItem ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            zIndex: 9999,
          }}
          onClick={() => setOpenId(null)}
        >
          <div
            style={{
              width: "min(520px, 100%)",
              maxHeight: "85vh",
              overflow: "auto",
              background: MCL_HUSKET_THEME.colors.altSurface,
              border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
              borderRadius: 18,
              padding: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <div style={textA}>Delt husket</div>
              <button type="button" style={btnStyle} onClick={() => setOpenId(null)}>
                Lukk
              </button>
            </div>

            <div
              style={{
                width: "100%",
                aspectRatio: "4 / 3",
                borderRadius: 14,
                overflow: "hidden",
                border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
                background: "rgba(0,0,0,0.15)",
                marginBottom: 10,
              }}
            >
              {openItem.imageUrl ? (
                <img src={openItem.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ ...textB, opacity: 0.7, padding: 12 }}>Bilde kunne ikke lastes</div>
              )}
            </div>

            {(() => {
              const p = openItem.doc?.payload || {};
              const comment = typeof p.comment === "string" ? p.comment : "";
              const cat = typeof p.categoryLabel === "string" ? p.categoryLabel : p.categoryLabelSnapshot || null;
              const rating = p.ratingValue ? String(p.ratingValue) : "";
              const pack = p.ratingPackKey ? String(p.ratingPackKey) : "";
              const capturedAt = p.capturedAt ? new Date(Number(p.capturedAt)) : null;

              return (
                <div>
                  <div style={{ ...textB, opacity: 0.85, marginBottom: 6 }}>
                    {capturedAt ? new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(capturedAt) : ""}
                  </div>
                  <div style={{ ...textA, marginBottom: 6 }}>{cat ? cat : "Uten kategori"}</div>
                  <div style={{ ...textB, opacity: 0.9, marginBottom: 10 }}>
                    {pack && rating ? `Vurdering: ${pack} / ${rating}` : pack || rating ? `Vurdering: ${pack}${rating ? ` ${rating}` : ""}` : "Vurdering: –"}
                  </div>

                  {comment ? (
                    <div style={{ ...textB, opacity: 0.95, whiteSpace: "pre-wrap" }}>{comment}</div>
                  ) : (
                    <div style={{ ...textB, opacity: 0.6 }}>Ingen kommentar</div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                    <button type="button" style={btnPrimaryStyle} onClick={() => handleSave(openItem.id)}>
                      Lagre i album
                    </button>
                    <button type="button" style={btnStyle} onClick={() => handleDiscard(openItem.id)}>
                      Forkast
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
