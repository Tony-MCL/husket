// ===============================
// src/screens/SharedWithMeScreen.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { HUSKET_TYPO } from "../theme/typography";
import { MCL_HUSKET_THEME } from "../theme";

import type { Husket } from "../domain/types";
import { getImageBlobByKey } from "../data/husketRepo";

import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
  limit,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";

import { auth, db, functions, storage } from "../firebase";
import { useToast } from "../components/ToastHost";

type RelayItem = {
  id: string;
  senderUid: string;
  recipientUid: string;
  createdAtMs: number;
  openedAtMs: number | null;
  status: "pending" | "opened" | "resolved";
  payload: any; // HusketPayload-ish
  imagePath: string;
};

type ContactRow = {
  uid: string;
  canSendTo: boolean;
  blocked: boolean;
  label: string | null;
};

function toMs(x: any): number {
  // Firestore Timestamp -> .toMillis()
  try {
    if (x && typeof x.toMillis === "function") return x.toMillis();
  } catch {}
  if (typeof x === "number") return x;
  return Date.now();
}

async function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Failed to read image"));
    fr.onload = () => resolve(String(fr.result || ""));
    fr.readAsDataURL(blob);
  });
}

export function SharedWithMeScreen(props: {
  dict: I18nDict;

  // ✅ NEW: drive the “send husket” flow via App
  onStartSendFlow: () => void;
}) {
  const { dict, onStartSendFlow } = props;
  const toast = useToast();

  const [uid, setUid] = useState<string | null>(null);

  const [relay, setRelay] = useState<RelayItem[]>([]);
  const [relayThumbs, setRelayThumbs] = useState<Record<string, string>>({});

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  const [sendOpen, setSendOpen] = useState(false);
  const [pendingHusket, setPendingHusket] = useState<Husket | null>(null);
  const [sending, setSending] = useState(false);

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

  const panelStyle: React.CSSProperties = {
    border: `1px solid rgba(247, 243, 237, 0.18)`,
    borderRadius: 16,
    padding: 12,
    display: "grid",
    gap: 10,
    background: "rgba(247, 243, 237, 0.04)",
  };

  const btnStyle: React.CSSProperties = {
    border: `1px solid rgba(247, 243, 237, 0.18)`,
    borderRadius: 16,
    padding: "10px 12px",
    background: "transparent",
    color: MCL_HUSKET_THEME.colors.textOnDark,
    cursor: "pointer",
    ...textA,
  };

  const btnPrimaryStyle: React.CSSProperties = {
    ...btnStyle,
    background: MCL_HUSKET_THEME.colors.header,
    color: "rgba(27, 26, 23, 0.92)",
  };

  const btnDangerStyle: React.CSSProperties = {
    ...btnStyle,
    color: MCL_HUSKET_THEME.colors.danger,
  };

  const modalBackdrop: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "grid",
    placeItems: "center",
    zIndex: 2000,
    padding: 16,
  };

  const modalBox: React.CSSProperties = {
    width: "min(560px, 92vw)",
    borderRadius: 18,
    background: MCL_HUSKET_THEME.colors.header,
    color: MCL_HUSKET_THEME.colors.darkSurface,
    boxShadow: MCL_HUSKET_THEME.elevation.elev2,
    padding: 14,
    display: "grid",
    gap: 12,
  };

  const inputStyle: React.CSSProperties = {
    ...textA,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(27, 26, 23, 0.18)",
    background: "rgba(255,255,255,0.85)",
    outline: "none",
  };

  // ----------------------------
  // Auth: ensure we have a user
  // ----------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u?.uid) {
        setUid(u.uid);
        return;
      }
      try {
        const res = await signInAnonymously(auth);
        setUid(res.user.uid);
      } catch (e: any) {
        toast.show(`Auth failed: ${e?.message ?? "Unknown error"}`);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------
  // Listen: relay inbox
  // ----------------------------
  useEffect(() => {
    if (!uid) return;

    let unsub: Unsubscribe | null = null;

    try {
      const qy = query(
        collection(db, "relay"),
        where("recipientUid", "==", uid),
        orderBy("createdAt", "desc"),
        limit(50)
      );

      unsub = onSnapshot(
        qy,
        (snap) => {
          const next: RelayItem[] = snap.docs.map((d) => {
            const data: any = d.data() || {};
            return {
              id: d.id,
              senderUid: String(data.senderUid || ""),
              recipientUid: String(data.recipientUid || ""),
              createdAtMs: toMs(data.createdAt),
              openedAtMs: data.openedAt ? toMs(data.openedAt) : null,
              status: (data.status as any) || "pending",
              payload: data.payload,
              imagePath: String(data?.image?.storagePath || ""),
            };
          });
          setRelay(next);
        },
        (err) => {
          toast.show("Kunne ikke lese sky-innboksen");
          // eslint-disable-next-line no-console
          console.error(err);
        }
      );
    } catch (e) {
      toast.show("Kunne ikke lese sky-innboksen");
      // eslint-disable-next-line no-console
      console.error(e);
    }

    return () => {
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Relay thumbs
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const urls: Record<string, string> = {};
      for (const item of relay.slice(0, 30)) {
        if (!item.imagePath) continue;
        try {
          const url = await getDownloadURL(storageRef(storage, item.imagePath));
          if (cancelled) return;
          urls[item.id] = url;
        } catch {
          // ignore (rules might block, or not uploaded yet)
        }
      }

      if (cancelled) return;
      setRelayThumbs((prev) => {
        // we don't revoke these (download URLs), keep it simple
        return urls;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [relay]);

  // ----------------------------
  // Listen: contacts
  // ----------------------------
  useEffect(() => {
    if (!uid) return;

    const qy = query(collection(db, `users/${uid}/contacts`), orderBy("createdAt", "desc"), limit(200));

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next: ContactRow[] = snap.docs.map((d) => {
          const x: any = d.data() || {};
          return {
            uid: d.id,
            canSendTo: x.canSendTo === true,
            blocked: x.blocked === true,
            label: typeof x.label === "string" ? x.label : null,
          };
        });
        setContacts(next);
      },
      (err) => {
        // if rules block read, we tell it (but rules should allow owner read)
        toast.show("Kunne ikke lese kontakter");
        // eslint-disable-next-line no-console
        console.error(err);
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const canSendContacts = useMemo(() => {
    return contacts.filter((c) => c.canSendTo && !c.blocked);
  }, [contacts]);

  // ----------------------------
  // Callables
  // ----------------------------
  const fnResolveInviteCode = useMemo(() => httpsCallable(functions, "resolveInviteCode"), []);
  const fnSendHusketToContact = useMemo(() => httpsCallable(functions, "sendHusketToContact"), []);
  const fnOpenRelayItem = useMemo(() => httpsCallable(functions, "openRelayItem"), []);
  const fnResolveRelayItem = useMemo(() => httpsCallable(functions, "resolveRelayItem"), []);

  const addContactByInvite = async () => {
    const code = inviteCode.trim();
    if (!code) {
      toast.show("Skriv inn invitasjonskode");
      return;
    }
    try {
      const res = await fnResolveInviteCode({ code });
      const contactUid = (res.data as any)?.contactUid;
      toast.show(contactUid ? "Kontakt lagt til" : "Kontakt lagt til");
      setInviteOpen(false);
      setInviteCode("");
    } catch (e: any) {
      toast.show(`Kunne ikke legge til kontakt: ${e?.message ?? "Ukjent feil"}`);
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };

  // ----------------------------
  // SEND FLOW (from App)
  // ----------------------------
  const beginSend = (husket: Husket) => {
    setPendingHusket(husket);
    setSendOpen(true);
  };

  const sendToContact = async (recipientUid: string) => {
    if (!pendingHusket) return;

    try {
      setSending(true);

      const blob = await getImageBlobByKey(pendingHusket.imageKey);
      if (!blob) {
        toast.show("Fant ikke bildet til husket-en");
        return;
      }

      const imageBase64 = await blobToBase64DataUrl(blob);

      const payload = {
        type: "husket",
        husketId: pendingHusket.id,
        capturedAt: pendingHusket.createdAt,
        comment: pendingHusket.comment ?? "",
        ratingPackKey: "emoji", // permissive on server (you can tighten later)
        ratingValue: pendingHusket.ratingValue ?? "",
        categoryLabel: null, // you can map label later if you want
        gps: pendingHusket.gps ? { lat: pendingHusket.gps.lat, lng: pendingHusket.gps.lng } : null,
        image: { storagePath: "client-placeholder" }, // server overwrites
      };

      await fnSendHusketToContact({
        recipientUid,
        husket: payload,
        imageBase64,
      });

      toast.show("Sendt ✅");
      setSendOpen(false);
      setPendingHusket(null);
    } catch (e: any) {
      toast.show(`Kunne ikke sende: ${e?.message ?? "Ukjent feil"}`);
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  // Expose beginSend to App via window hook (simple + safe)
  // App will call: (window as any).__husketSkyPick = (husket) => beginSend(husket)
  useEffect(() => {
    (window as any).__husketSkyPick = (husket: Husket) => beginSend(husket);
    return () => {
      try {
        delete (window as any).__husketSkyPick;
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHusket]);

  // ----------------------------
  // Relay actions
  // ----------------------------
  const openItem = async (relayId: string) => {
    try {
      await fnOpenRelayItem({ relayId });
    } catch (e) {
      // ignore (best-effort)
    }
  };

  const discardItem = async (relayId: string) => {
    try {
      await fnResolveRelayItem({ relayId, action: "discard" });
      toast.show("Forkastet");
    } catch (e: any) {
      toast.show(`Kunne ikke forkaste: ${e?.message ?? "Ukjent feil"}`);
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };

  const saveItem = async (relayId: string) => {
    try {
      await fnResolveRelayItem({ relayId, action: "save" });
      toast.show("Lagret ✅");
    } catch (e: any) {
      toast.show(`Kunne ikke lagre: ${e?.message ?? "Ukjent feil"}`);
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };

  const headerRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={headerRow}>
        <div style={textA}>{tGet(dict, "shared.title")}</div>
      </div>

      {/* Actions */}
      <div style={{ display: "grid", gap: 10 }}>
        <button type="button" style={btnPrimaryStyle} onClick={onStartSendFlow}>
          {tGet(dict, "shared.sendButton") || "Send en husket"}
        </button>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={btnStyle} onClick={() => setInviteOpen(true)}>
            {tGet(dict, "shared.addContact") || "Legg til kontakt"}
          </button>
        </div>
      </div>

      {/* Contacts */}
      <div style={panelStyle}>
        <div style={textA}>{tGet(dict, "shared.contacts") || "Kontakter"}</div>
        {contacts.length === 0 ? (
          <div style={{ ...textB, opacity: 0.75 }}>
            {tGet(dict, "shared.noContacts") || "Ingen kontakter enda. Legg til med invitasjonskode."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {contacts.map((c) => (
              <div
                key={c.uid}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "8px 10px",
                  borderRadius: 14,
                  border: "1px solid rgba(247, 243, 237, 0.14)",
                }}
              >
                <div style={{ ...textB, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.label ? c.label : c.uid}
                </div>
                <div style={{ ...textB, opacity: 0.8 }}>
                  {c.blocked ? "🚫" : c.canSendTo ? "✅" : "⛔"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inbox */}
      <div style={panelStyle}>
        <div style={textA}>{tGet(dict, "shared.inbox") || "Sky-innboks"}</div>

        {relay.length === 0 ? (
          <div className="smallHelp" style={{ ...textB, opacity: 0.75 }}>
            {tGet(dict, "shared.placeholder") || "Tomt her foreløpig."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {relay.map((x) => (
              <div
                key={x.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr",
                  gap: 10,
                  padding: 10,
                  borderRadius: 16,
                  border: "1px solid rgba(247, 243, 237, 0.14)",
                  background: "rgba(247, 243, 237, 0.03)",
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "rgba(247, 243, 237, 0.06)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {relayThumbs[x.id] ? (
                    <img src={relayThumbs[x.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ ...textB, opacity: 0.7 }}>…</span>
                  )}
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ ...textB, opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {x.senderUid ? `Fra: ${x.senderUid}` : "Fra: ?"}
                    </div>
                    <div style={{ ...textB, opacity: 0.7 }}>
                      {x.status === "pending" ? "🟦" : x.status === "opened" ? "🟨" : "✅"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button type="button" style={btnStyle} onClick={() => void openItem(x.id)}>
                      Åpne
                    </button>
                    <button type="button" style={btnPrimaryStyle} onClick={() => void saveItem(x.id)}>
                      Lagre
                    </button>
                    <button type="button" style={btnDangerStyle} onClick={() => void discardItem(x.id)}>
                      Forkast
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite modal */}
      {inviteOpen ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalBox}>
            <div style={{ ...textA, marginBottom: 4 }}>Legg til kontakt</div>
            <div style={{ ...textB, opacity: 0.85 }}>
              Lim inn invitasjonskode du har fått fra den andre personen.
            </div>

            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Invitasjonskode"
              style={inputStyle}
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
              <button type="button" style={{ ...btnStyle }} onClick={() => setInviteOpen(false)}>
                Avbryt
              </button>
              <button type="button" style={{ ...btnPrimaryStyle }} onClick={() => void addContactByInvite()}>
                Legg til
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Send modal */}
      {sendOpen && pendingHusket ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalBox}>
            <div style={{ ...textA, marginBottom: 4 }}>Send husket</div>
            <div style={{ ...textB, opacity: 0.85 }}>
              Velg hvem du vil sende til.
            </div>

            {canSendContacts.length === 0 ? (
              <div style={{ ...textB }}>
                Ingen kontakter du kan sende til enda. Legg til med invitasjonskode først.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {canSendContacts.map((c) => (
                  <button
                    key={c.uid}
                    type="button"
                    style={btnPrimaryStyle}
                    disabled={sending}
                    onClick={() => void sendToContact(c.uid)}
                  >
                    {c.label ? c.label : c.uid}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
              <button
                type="button"
                style={btnStyle}
                onClick={() => {
                  setSendOpen(false);
                  setPendingHusket(null);
                }}
                disabled={sending}
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
