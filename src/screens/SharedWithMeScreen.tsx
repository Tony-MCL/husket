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

import { auth, db, functions, storage } from "../firebase";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref as sRef } from "firebase/storage";

import { getImageBlobByKey, importHusketFromSky } from "../data/husketRepo";
import { getEffectiveRatingPack } from "../domain/settingsCore";

type ContactRow = {
  contactUid: string;
  label: string | null;
  createdAt?: any;
};

type RelayRow = {
  relayId: string;
  senderUid: string;
  recipientUid: string;
  status: "pending" | "opened" | "resolved";
  createdAtMs: number;
  openedAtMs: number | null;
  expiresAtMs: number | null;
  imagePath: string;
  payload: {
    husketId: string;
    capturedAt: number;
    comment: string;
    ratingPackKey: string;
    ratingValue: string;
    categoryLabel: string | null;
    gps: null | { lat: number; lng: number; acc?: number; ts?: number };
  };
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

function tsToMs(x: any): number {
  if (!x) return 0;
  if (typeof x === "number") return x;
  if (typeof x?.toMillis === "function") return x.toMillis();
  return 0;
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
      (err) => setContactsErr(err?.message ?? "Unknown error")
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
      const blob = await getImageBlobByKey(husketToSend.imageKey);
      if (!blob) {
        toast.show("Fant ikke bilde lokalt for sending.");
        return;
      }

      const b64 = await blobToBase64(blob);

      const payload = {
        type: "husket",
        husketId: husketToSend.id,
        capturedAt: husketToSend.createdAt,
        comment: husketToSend.comment ?? "",
        ratingPackKey: ratingPackKeyFor(husketToSend),
        ratingValue: husketToSend.ratingValue ?? "",
        categoryLabel: categoryLabelFor(husketToSend),
        gps: husketToSend.gps
          ? {
              lat: husketToSend.gps.lat,
              lng: husketToSend.gps.lng,
              ...(typeof (husketToSend.gps as any).acc === "number" ? { acc: (husketToSend.gps as any).acc } : {}),
              ...(typeof (husketToSend.gps as any).ts === "number" ? { ts: (husketToSend.gps as any).ts } : {}),
            }
          : null,
        image: { storagePath: "client-placeholder" }, // server overwrites
      };

      const fn = httpsCallable(functions, "sendHusketToContact");
      const res = await fn({ recipientUid, husket: payload, imageBase64: b64 });

      const relayId = (res.data as any)?.relayId as string | undefined;
      toast.show(relayId ? "Sendt ✅" : "Sendt (men mangler relayId?)");

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

  // --- Inbox (relay) ---
  const [relay, setRelay] = useState<RelayRow[]>([]);
  const [relayErr, setRelayErr] = useState<string | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const qRef = query(
      collection(db, "relay"),
      where("recipientUid", "==", uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const rows: RelayRow[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          const payload = data?.payload ?? {};
          rows.push({
            relayId: d.id,
            senderUid: String(data?.senderUid ?? ""),
            recipientUid: String(data?.recipientUid ?? ""),
            status: (data?.status ?? "pending") as any,
            createdAtMs: tsToMs(data?.createdAt),
            openedAtMs: data?.openedAt ? tsToMs(data?.openedAt) : null,
            expiresAtMs: data?.expiresAt ? tsToMs(data?.expiresAt) : null,
            imagePath: String(data?.image?.storagePath ?? payload?.image?.storagePath ?? ""),
            payload: {
              husketId: String(payload?.husketId ?? ""),
              capturedAt: typeof payload?.capturedAt === "number" ? payload.capturedAt : 0,
              comment: typeof payload?.comment === "string" ? payload.comment : "",
              ratingPackKey: typeof payload?.ratingPackKey === "string" ? payload.ratingPackKey : "",
              ratingValue: typeof payload?.ratingValue === "string" ? payload.ratingValue : "",
              categoryLabel: payload?.categoryLabel === null ? null : typeof payload?.categoryLabel === "string" ? payload.categoryLabel : null,
              gps:
                payload?.gps == null
                  ? null
                  : {
                      lat: Number(payload?.gps?.lat ?? 0),
                      lng: Number(payload?.gps?.lng ?? 0),
                      ...(typeof payload?.gps?.acc === "number" ? { acc: payload.gps.acc } : {}),
                      ...(typeof payload?.gps?.ts === "number" ? { ts: payload.gps.ts } : {}),
                    },
            },
          });
        });

        setRelay(rows);
        setRelayErr(null);
      },
      (err) => setRelayErr(err?.message ?? "Unknown error")
    );

    return () => unsub();
  }, []);

  const [openRelay, setOpenRelay] = useState<RelayRow | null>(null);
  const [openImgUrl, setOpenImgUrl] = useState<string | null>(null);
  const [openBusy, setOpenBusy] = useState(false);

  const formatDate = (ms: number) => {
    if (!ms) return "";
    const d = new Date(ms);
    return d.toLocaleString(settings.language === "no" ? "nb-NO" : "en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openRelayItem = async (row: RelayRow) => {
    setOpenRelay(row);
    setOpenImgUrl(null);

    // 1) mark opened
    try {
      const fn = httpsCallable(functions, "openRelayItem");
      await fn({ relayId: row.relayId });
    } catch {
      // ignore (still allow view)
    }

    // 2) load image preview
    if (row.imagePath) {
      try {
        const url = await getDownloadURL(sRef(storage, row.imagePath));
        setOpenImgUrl(url);
      } catch {
        setOpenImgUrl(null);
      }
    }
  };

  const closeRelayModal = () => {
    setOpenRelay(null);
    setOpenImgUrl(null);
    setOpenBusy(false);
  };

  const discardRelay = async () => {
    if (!openRelay) return;
    setOpenBusy(true);
    try {
      const fn = httpsCallable(functions, "resolveRelayItem");
      await fn({ relayId: openRelay.relayId, action: "discard" });
      toast.show("Forkastet ✅");
      closeRelayModal();
    } catch (e: any) {
      toast.show(e?.message ? `Feil: ${e.message}` : "Kunne ikke forkaste");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setOpenBusy(false);
    }
  };

  const saveRelay = async () => {
    if (!openRelay) return;

    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.show("Ikke innlogget. Prøv igjen.");
      return;
    }

    setOpenBusy(true);
    try {
      // 1) resolve (server creates users/{uid}/huskets/{newId} and copies image)
      const fn = httpsCallable(functions, "resolveRelayItem");
      const res = await fn({ relayId: openRelay.relayId, action: "save" });
      const savedId = (res.data as any)?.savedHusketId as string | undefined;

      if (!savedId) {
        toast.show("Lagret i sky (men mangler id).");
        closeRelayModal();
        return;
      }

      // 2) download image from the *user husket* path (known convention from functions)
      const destPath = `users/${uid}/huskets/${savedId}.jpg`;
      const dlUrl = await getDownloadURL(sRef(storage, destPath));
      const blob = await fetch(dlUrl).then((r) => r.blob());

      // 3) import locally so it appears in Album
      const capturedAt = openRelay.payload.capturedAt || Date.now();

      await importHusketFromSky({
        id: savedId,
        husket: {
          life: "private", // ✅ simple + predictable for now
          createdAt: capturedAt,
          ratingValue: openRelay.payload.ratingValue || null,
          comment: openRelay.payload.comment || null,
          categoryId: null, // we only have label snapshot on server
          gps: openRelay.payload.gps ?? null,
        },
        imageBlob: blob,
      });

      toast.show("Mottatt ✅ (lagt i album)");
      closeRelayModal();
    } catch (e: any) {
      toast.show(e?.message ? `Feil: ${e.message}` : "Kunne ikke lagre");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setOpenBusy(false);
    }
  };

  // Modal styles (shared)
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
    width: "min(560px, 100%)",
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
    alignItems: "center",
  };

  const dangerBtn: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: MCL_HUSKET_THEME.colors.danger,
    cursor: "pointer",
    ...textA,
  };

  const okBtn: React.CSSProperties = {
    ...textA,
    border: "none",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    background: "rgba(27,26,23,0.92)",
    color: "rgba(247,243,237,0.92)",
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
        <div style={{ ...textB, opacity: 0.85 }}>Invitasjonskode (legg til kontakt)</div>

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

      {/* Inbox */}
      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ ...textB, opacity: 0.85 }}>Innboks</div>

        {relayErr ? (
          <div className="smallHelp" style={textB}>
            Kunne ikke lese sky-innboksen: {relayErr}
          </div>
        ) : relay.length === 0 ? (
          <div className="smallHelp" style={textB}>
            Ingen mottatte husketer enda.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {relay.map((r) => (
              <button
                key={r.relayId}
                type="button"
                style={{
                  ...ghostBtn,
                  ...textB,
                  padding: "10px 12px",
                  borderRadius: 14,
                  textAlign: "left",
                  cursor: "pointer",
                  display: "grid",
                  gap: 4,
                }}
                onClick={() => void openRelayItem(r)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 800 }}>
                    {r.status === "opened" ? "📬 Åpnet" : "📩 Ny"}
                  </div>
                  <div style={{ opacity: 0.75 }}>{formatDate(r.createdAtMs)}</div>
                </div>

                <div style={{ opacity: 0.9 }}>
                  {r.payload.ratingValue ? `⭐ ${r.payload.ratingValue}` : "Ingen rating"}{" "}
                  {r.payload.comment ? `· 💬 ${r.payload.comment}` : ""}
                </div>

                <div style={{ opacity: 0.7, fontSize: 12 }}>
                  Fra: {r.senderUid}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Placeholder text (existing i18n) */}
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
                    <div style={{ fontWeight: 800 }}>{c.label ?? c.contactUid}</div>
                    {c.label ? <div style={{ opacity: 0.7 }}>{c.contactUid}</div> : null}
                  </button>
                ))}
              </div>
            )}

            <div style={modalRow}>
              <button type="button" onClick={closeSend} style={dangerBtn} disabled={sending}>
                Avbryt
              </button>

              <div style={{ ...textB, opacity: 0.75 }}>{sending ? "Sender…" : ""}</div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Inbox item modal */}
      {openRelay ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Mottatt husket</div>

            <div style={modalHelp}>
              {openRelay.payload.ratingValue ? `⭐ ${openRelay.payload.ratingValue}` : "Ingen rating"}
              {openRelay.payload.comment ? ` · 💬 ${openRelay.payload.comment}` : ""}
            </div>

            {openImgUrl ? (
              <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(27,26,23,0.12)" }}>
                <img src={openImgUrl} alt="" style={{ width: "100%", height: "auto", display: "block" }} />
              </div>
            ) : (
              <div style={modalHelp}>Bilde lastes…</div>
            )}

            <div style={{ ...modalHelp, marginTop: 10, marginBottom: 0 }}>
              Fra: <strong>{openRelay.senderUid}</strong>
              <div style={{ opacity: 0.75 }}>Mottatt: {formatDate(openRelay.createdAtMs)}</div>
            </div>

            <div style={modalRow}>
              <button type="button" onClick={closeRelayModal} style={dangerBtn} disabled={openBusy}>
                Lukk
              </button>

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => void discardRelay()} style={dangerBtn} disabled={openBusy}>
                  Forkast
                </button>

                <button type="button" onClick={() => void saveRelay()} style={okBtn} disabled={openBusy}>
                  {openBusy ? "Jobber…" : "Lagre i album"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
