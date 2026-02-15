// ===============================
// src/screens/SharedWithMeScreen.tsx
// ===============================
import React, { useEffect, useMemo, useState } from "react";
import type { Husket, Settings } from "../domain/types";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { HUSKET_TYPO } from "../theme/typography";
import { MCL_HUSKET_THEME } from "../theme";
import { useToast } from "../components/ToastHost";

import { auth, db, functions } from "../firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { getImageUrl } from "../data/husketRepo";
import { getEffectiveRatingPack } from "../domain/settingsCore";

type ContactRow = {
  contactUid: string;
  label: string | null;
  createdAt?: any;
};

type Props = {
  dict: I18nDict;
  settings: Settings;

  // When album pick returns a husket, App sets this
  husketToSend: Husket | null;
  onClearHusketToSend: () => void;

  // Trigger Album pick flow
  onStartSendFlow: () => void;
};

function toBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const ab = await blob.arrayBuffer();
  return toBase64(ab);
}

export function SharedWithMeScreen({ dict, settings, husketToSend, onClearHusketToSend, onStartSendFlow }: Props) {
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

  const card: React.CSSProperties = {
    border: `1px solid rgba(247, 243, 237, 0.14)`,
    borderRadius: 16,
    padding: 12,
    background: "transparent",
  };

  const primaryBtn: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.header,
    color: "rgba(27, 26, 23, 0.92)",
    border: "1px solid rgba(247, 243, 237, 0.14)",
    boxShadow: "none",
  };

  const ghostBtn: React.CSSProperties = {
    background: "transparent",
    color: "rgba(247, 243, 237, 0.92)",
    border: "1px solid rgba(247, 243, 237, 0.14)",
    boxShadow: "none",
  };

  // --- Invite code input ---
  const [inviteCode, setInviteCode] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // --- Contacts ---
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactsErr, setContactsErr] = useState<string | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const qRef = query(collection(db, `users/${uid}/contacts`), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const rows: ContactRow[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          rows.push({
            contactUid: d.id,
            label: typeof data.label === "string" ? data.label : null,
            createdAt: data.createdAt,
          });
        });
        setContacts(rows);
        setContactsErr(null);
      },
      (err) => {
        setContactsErr(err?.message ?? "Unknown error");
      }
    );

    return () => unsub();
  }, []);

  const onAddContact = async () => {
    const code = inviteCode.trim();
    if (!code) {
      toast.show("Skriv inn invitasjonskode.");
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.show("Ikke innlogget. Prøv igjen.");
      return;
    }

    setIsAdding(true);
    try {
      const fn = httpsCallable(functions, "resolveInviteCode");
      const res = await fn({ code });
      const contactUid = (res.data as any)?.contactUid as string | undefined;

      if (contactUid) {
        toast.show("Kontakt lagt til ✅");
        setInviteCode("");
      } else {
        toast.show("Kunne ikke legge til kontakt.");
      }
    } catch (e: any) {
      toast.show(e?.message ? `Feil: ${e.message}` : "Feil ved legg til kontakt");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setIsAdding(false);
    }
  };

  // --- Send modal ---
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // open modal automatically when a husket is selected for sending
  useEffect(() => {
    if (husketToSend) setSendOpen(true);
  }, [husketToSend]);

  const selectedSummary = useMemo(() => {
    if (!husketToSend) return "";
    const hasRating = husketToSend.ratingValue ? `⭐ ${husketToSend.ratingValue}` : "";
    const hasComment = husketToSend.comment ? `💬 ${husketToSend.comment}` : "";
    return [hasRating, hasComment].filter(Boolean).join(" · ");
  }, [husketToSend]);

  const categoryLabelFor = (h: Husket): string | null => {
    const cats = settings.categories[h.life] ?? [];
    const c = cats.find((x) => x.id === h.categoryId);
    return c?.label ?? null;
  };

  const ratingPackKeyFor = (h: Husket): string => {
    // permissive on server, but we still send something consistent
    const pack = getEffectiveRatingPack(settings, h.life);
    return pack;
  };

  const sendToRecipient = async (recipientUid: string) => {
    if (!husketToSend) return;

    const senderUid = auth.currentUser?.uid;
    if (!senderUid) {
      toast.show("Ikke innlogget. Prøv igjen.");
      return;
    }

    setSending(true);
    try {
      // 1) load image blob from local store via object URL
      const url = await getImageUrl(husketToSend.imageKey);
      if (!url) {
        toast.show("Fant ikke bilde lokalt for sending.");
        return;
      }

      const blob = await fetch(url).then((r) => r.blob());
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }

      const b64 = await blobToBase64(blob);

      // 2) build payload expected by Cloud Function
      const payload = {
        type: "husket",
        husketId: husketToSend.id,
        capturedAt: husketToSend.createdAt,
        comment: husketToSend.comment ?? "",
        ratingPackKey: ratingPackKeyFor(husketToSend),
        ratingValue: husketToSend.ratingValue ?? "",
        categoryLabel: categoryLabelFor(husketToSend),
        gps: husketToSend.gps
          ? { lat: husketToSend.gps.lat, lng: husketToSend.gps.lng, acc: husketToSend.gps.acc, ts: husketToSend.gps.ts }
          : null,
        image: { storagePath: "client-placeholder" }, // server overwrites
      };

      // 3) call send function
      const fn = httpsCallable(functions, "sendHusketToContact");
      const res = await fn({
        recipientUid,
        husket: payload,
        imageBase64: b64,
      });

      const relayId = (res.data as any)?.relayId as string | undefined;
      toast.show(relayId ? "Sendt ✅" : "Sendt (men mangler relayId?)");

      // close & clear pending husket
      setSendOpen(false);
      onClearHusketToSend();
    } catch (e: any) {
      toast.show(e?.message ? `Send feilet: ${e.message}` : "Send feilet");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const closeSend = () => {
    setSendOpen(false);
    onClearHusketToSend();
  };

  // Modal styles
  const modalBackdrop: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "grid",
    placeItems: "center",
    zIndex: 9999,
    padding: 16,
  };

  const modalCard: React.CSSProperties = {
    width: "min(520px, 100%)",
    borderRadius: 18,
    background: MCL_HUSKET_THEME.colors.header,
    color: MCL_HUSKET_THEME.colors.darkSurface,
    border: "1px solid rgba(27, 26, 23, 0.12)",
    padding: 14,
    boxShadow: MCL_HUSKET_THEME.elevation.elev2,
  };

  const modalTitle: React.CSSProperties = {
    ...textA,
    marginBottom: 8,
    color: MCL_HUSKET_THEME.colors.darkSurface,
  };

  const modalHelp: React.CSSProperties = {
    ...textB,
    marginBottom: 10,
    color: "rgba(27, 26, 23, 0.78)",
  };

  const modalRow: React.CSSProperties = {
    display: "flex",
    gap: 10,
    justifyContent: "space-between",
    marginTop: 12,
  };

  const dangerBtn: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: MCL_HUSKET_THEME.colors.danger,
    cursor: "pointer",
    ...textA,
  };

  const listItemBtn: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(27, 26, 23, 0.14)",
    background: "rgba(255,255,255,0.65)",
    cursor: "pointer",
    ...textB,
  };

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 720, margin: "0 auto" }}>
      <div style={textA}>{tGet(dict, "shared.title")}</div>

      {/* Invite code + add */}
      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ ...textB, opacity: 0.85 }}>
          Invitasjonskode (legg til kontakt)
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Skriv kode…"
            style={{
              flex: "1 1 220px",
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(247, 243, 237, 0.14)",
              background: "transparent",
              color: "rgba(247, 243, 237, 0.92)",
              ...textB,
              outline: "none",
            }}
          />

          <button
            type="button"
            className="flatBtn primary"
            style={{ ...primaryBtn, minWidth: 160 }}
            onClick={() => void onAddContact()}
            disabled={isAdding}
          >
            {isAdding ? "Legger til…" : "Legg til"}
          </button>
        </div>
      </div>

      {/* Contacts */}
      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ ...textB, opacity: 0.85 }}>Kontakter</div>

        {contactsErr ? (
          <div className="smallHelp" style={textB}>
            Kunne ikke lese kontakter: {contactsErr}
          </div>
        ) : contacts.length === 0 ? (
          <div className="smallHelp" style={textB}>
            Ingen kontakter enda. Legg til med invitasjonskode.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {contacts.map((c) => (
              <div
                key={c.contactUid}
                style={{
                  padding: "8px 10px",
                  borderRadius: 14,
                  border: "1px solid rgba(247, 243, 237, 0.14)",
                  ...textB,
                }}
              >
                <div style={{ fontWeight: 700 }}>{c.label ?? c.contactUid}</div>
                {c.label ? <div style={{ opacity: 0.7 }}>{c.contactUid}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Send */}
      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ ...textB, opacity: 0.85 }}>Deling</div>

        <button type="button" className="flatBtn" style={ghostBtn} onClick={onStartSendFlow}>
          {tGet(dict, "shared.sendButton")}
        </button>

        <div className="smallHelp" style={textB}>
          Velg en husket i album → velg mottaker → send.
        </div>
      </div>

      {/* Placeholder inbox (vi bygger “innboksen” etter at sending er 100%) */}
      <div className="smallHelp" style={textB}>
        {tGet(dict, "shared.placeholder")}
      </div>

      {/* Send modal */}
      {sendOpen && husketToSend ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Velg mottaker</div>
            <div style={modalHelp}>
              Du sender: <strong>{selectedSummary || "Husket"}</strong>
            </div>

            {contacts.length === 0 ? (
              <div style={modalHelp}>Ingen kontakter. Legg til med invitasjonskode først.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {contacts.map((c) => (
                  <button
                    key={c.contactUid}
                    type="button"
                    style={listItemBtn}
                    onClick={() => void sendToRecipient(c.contactUid)}
                    disabled={sending}
                    title="Send"
                  >
                    <div style={{ fontWeight: 800 }}>
                      {c.label ?? c.contactUid}
                    </div>
                    {c.label ? <div style={{ opacity: 0.7 }}>{c.contactUid}</div> : null}
                  </button>
                ))}
              </div>
            )}

            <div style={modalRow}>
              <button type="button" onClick={closeSend} style={dangerBtn} disabled={sending}>
                Avbryt
              </button>

              <div style={{ ...textB, opacity: 0.75 }}>
                {sending ? "Sender…" : ""}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
