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

import { getImageBlobByKey } from "../data/husketRepo";
import { addReceivedFromRelay, deleteReceivedById, getReceivedImageUrl, listReceived, type ReceivedHusket } from "../data/receivedRepo";
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

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallthrough
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function tsToMs(x: any): number {
  if (!x) return 0;
  if (typeof x === "number") return x;
  if (typeof x?.toMillis === "function") return x.toMillis();
  return 0;
}

function nowMs(): number {
  return Date.now();
}

export function SharedWithMeScreen({ dict, settings, husketToSend, onClearHusketToSend, onStartSendFlow }: Props) {
  const toast = useToast();

  // ---- Typography ----
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

  const rowBtn: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid rgba(247, 243, 237, 0.14)",
    background: "transparent",
    color: "rgba(247, 243, 237, 0.92)",
    cursor: "pointer",
    boxShadow: "none",
  };

  const badge: React.CSSProperties = {
    minWidth: 24,
    height: 22,
    borderRadius: 999,
    background: "rgba(247, 243, 237, 0.16)",
    color: "rgba(247, 243, 237, 0.92)",
    display: "grid",
    placeItems: "center",
    padding: "0 8px",
    ...textB,
    fontWeight: 800,
  };

  const primaryBtn: React.CSSProperties = {
    background: MCL_HUSKET_THEME.colors.header,
    color: "rgba(27, 26, 23, 0.92)",
    border: "1px solid rgba(27, 26, 23, 0.12)",
    boxShadow: "none",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    ...textA,
  };

  const dangerBtn: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: MCL_HUSKET_THEME.colors.danger,
    cursor: "pointer",
    ...textA,
  };

  // ---- Modal styles (shared) ----
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(27, 26, 23, 0.14)",
    background: "rgba(255,255,255,0.65)",
    color: "rgba(27, 26, 23, 0.92)",
    ...textB,
    outline: "none",
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

  // -------------------------------
  // Contacts
  // -------------------------------
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactsErr, setContactsErr] = useState<string | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);

  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);

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
    const code = inviteCodeInput.trim();
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
        setInviteCodeInput("");
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

  // -------------------------------
  // My invite code (renewable)
  // -------------------------------
  const [myCodeOpen, setMyCodeOpen] = useState(false);
  const [myCode, setMyCode] = useState<string>("");
  const [myCodeBusy, setMyCodeBusy] = useState(false);

  const renewMyInviteCode = async () => {
    setMyCodeBusy(true);
    try {
      const fn = httpsCallable(functions, "createInviteCode");
      const res = await fn({});
      const code = (res.data as any)?.code ?? (typeof res.data === "string" ? (res.data as string) : "");
      if (!code) {
        toast.show("Kunne ikke hente invitasjonskode.");
        return;
      }
      setMyCode(code);
      const copied = await copyToClipboard(code);
      toast.show(copied ? "Invitasjonskode kopiert ✅" : "Invitasjonskode klar");
    } catch (e: any) {
      toast.show(e?.message ? `Feil: ${e.message}` : "Kunne ikke hente invitasjonskode");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setMyCodeBusy(false);
    }
  };

  // -------------------------------
  // Send flow (pick first, then choose recipient, then confirm)
  // -------------------------------
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [selectedRecipientUid, setSelectedRecipientUid] = useState<string | null>(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (husketToSend) {
      setRecipientOpen(true);
      setSelectedRecipientUid(null);
      setConfirmSendOpen(false);
    }
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

  const closeRecipientPicker = () => {
    setRecipientOpen(false);
    setConfirmSendOpen(false);
    setSelectedRecipientUid(null);
    onClearHusketToSend();
  };

  const openConfirmSend = () => {
    if (!selectedRecipientUid) return;
    setConfirmSendOpen(true);
  };

  const sendNow = async () => {
    if (!husketToSend) return;
    if (!selectedRecipientUid) return;

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
      const res = await fn({ recipientUid: selectedRecipientUid, husket: payload, imageBase64: b64 });

      const relayId = (res.data as any)?.relayId as string | undefined;
      toast.show(relayId ? "Sendt ✅" : "Sendt ✅");

      setRecipientOpen(false);
      setConfirmSendOpen(false);
      setSelectedRecipientUid(null);
      onClearHusketToSend();
    } catch (e: any) {
      toast.show(e?.message ? `Send feilet: ${e.message}` : "Send feilet");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  // -------------------------------
  // Inbox (relay)
  // -------------------------------
  const [relay, setRelay] = useState<RelayRow[]>([]);
  const [relayErr, setRelayErr] = useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const qRef = query(collection(db, "relay"), where("recipientUid", "==", uid), orderBy("createdAt", "desc"));

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

  const isExpired = (r: RelayRow): boolean => {
    if (!r.expiresAtMs) return false;
    return nowMs() > r.expiresAtMs;
  };

  const newRelayCount = useMemo(() => relay.filter((r) => !isExpired(r) && r.status !== "resolved").length, [relay]);

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

  // Forced decision modal (no close)
  const [decisionRelay, setDecisionRelay] = useState<RelayRow | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);

  const openDecision = (r: RelayRow) => {
    setDecisionRelay(r);
  };

  const discardRelay = async (relayId: string) => {
    setDecisionBusy(true);
    try {
      const fn = httpsCallable(functions, "resolveRelayItem");
      await fn({ relayId, action: "discard" });
      toast.show("Slettet ✅");
      setDecisionRelay(null);
    } catch (e: any) {
      toast.show(e?.message ? `Feil: ${e.message}` : "Kunne ikke slette");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setDecisionBusy(false);
    }
  };

  const saveRelay = async (r: RelayRow) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.show("Ikke innlogget. Prøv igjen.");
      return;
    }

    setDecisionBusy(true);
    try {
      // 1) resolve server-side (copies to user bucket and sets relay resolved)
      const fn = httpsCallable(functions, "resolveRelayItem");
      const res = await fn({ relayId: r.relayId, action: "save" });
      const savedId = (res.data as any)?.savedHusketId as string | undefined;

      if (!savedId) {
        toast.show("Kunne ikke lagre (mangler id).");
        return;
      }

      // 2) download image from the user husket path
      const destPath = `users/${uid}/huskets/${savedId}.jpg`;
      const dlUrl = await getDownloadURL(sRef(storage, destPath));
      const blob = await fetch(dlUrl).then((x) => x.blob());

      // 3) store locally in the dedicated Received album (not in normal album)
      await addReceivedFromRelay({
        id: savedId,
        receivedAt: r.createdAtMs || Date.now(),
        fromUid: r.senderUid,
        payload: r.payload,
        imageBlob: blob,
      });

      toast.show("Lagret i Delt med meg ✅");
      setDecisionRelay(null);
    } catch (e: any) {
      toast.show(e?.message ? `Feil: ${e.message}` : "Kunne ikke lagre");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setDecisionBusy(false);
    }
  };

  const removeExpired = async (relayId: string) => {
    try {
      const fn = httpsCallable(functions, "resolveRelayItem");
      await fn({ relayId, action: "discard" });
      toast.show("Utløpt fjernet");
    } catch (e: any) {
      toast.show(e?.message ? `Feil: ${e.message}` : "Kunne ikke fjerne");
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };

  // -------------------------------
  // Received gallery (local)
  // -------------------------------
  const [receivedOpen, setReceivedOpen] = useState(false);
  const [received, setReceived] = useState<ReceivedHusket[]>(() => listReceived());

  // Lightweight polling update whenever modals close/open or relay changes
  useEffect(() => {
    setReceived(listReceived());
  }, [receivedOpen, decisionRelay, relay.length]);

  const [viewReceived, setViewReceived] = useState<ReceivedHusket | null>(null);
  const [viewReceivedUrl, setViewReceivedUrl] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!viewReceived) {
        setViewReceivedUrl(null);
        return;
      }
      const url = await getReceivedImageUrl(viewReceived.imageKey);
      setViewReceivedUrl(url);
    };
    void run();
  }, [viewReceived]);

  const deleteReceived = async (id: string) => {
    const removed = await deleteReceivedById(id);
    if (removed) {
      toast.show("Slettet ✅");
      setReceived(listReceived());
      setViewReceived(null);
    }
  };

  // -------------------------------
  // Main rows
  // -------------------------------
  const title = settings.language === "no" ? "Deling" : "Sharing";

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 720, margin: "0 auto" }}>
      <div style={textA}>{title}</div>

      <div style={{ ...card, display: "grid", gap: 10 }}>
        <button type="button" style={{ ...rowBtn, ...textB }} onClick={() => setContactsOpen(true)}>
          <span>Kontakter</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {contacts.length ? <span style={badge}>{contacts.length}</span> : null}
            <span style={{ opacity: 0.75 }}>›</span>
          </span>
        </button>

        <button type="button" style={{ ...rowBtn, ...textB }} onClick={() => setMyCodeOpen(true)}>
          <span>Invitasjonskode</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ opacity: 0.75 }}>›</span>
          </span>
        </button>

        <button type="button" style={{ ...rowBtn, ...textB }} onClick={onStartSendFlow}>
          <span>Send husk’et</span>
          <span style={{ opacity: 0.75 }}>›</span>
        </button>

        <button type="button" style={{ ...rowBtn, ...textB }} onClick={() => setInboxOpen(true)}>
          <span>Innboks</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {newRelayCount ? <span style={badge}>{newRelayCount}</span> : null}
            <span style={{ opacity: 0.75 }}>›</span>
          </span>
        </button>

        <button type="button" style={{ ...rowBtn, ...textB }} onClick={() => setReceivedOpen(true)}>
          <span>Delt med meg</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {received.length ? <span style={badge}>{received.length}</span> : null}
            <span style={{ opacity: 0.75 }}>›</span>
          </span>
        </button>
      </div>

      {/* Keep existing i18n placeholder (safe to remove later) */}
      <div className="smallHelp" style={textB}>
        {tGet(dict, "shared.placeholder")}
      </div>

      {/* Contacts modal */}
      {contactsOpen ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Kontakter</div>
            <div style={modalHelp}>Legg til ny kontakt med invitasjonskode.</div>

            <div style={{ display: "grid", gap: 10 }}>
              <input
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value)}
                placeholder="Skriv kode…"
                style={inputStyle}
              />

              <button type="button" style={primaryBtn} onClick={() => void onAddContact()} disabled={isAdding}>
                {isAdding ? "Legger til…" : "Legg til kontakt"}
              </button>

              {contactsErr ? (
                <div style={modalHelp}>Kunne ikke lese kontakter: {contactsErr}</div>
              ) : contacts.length === 0 ? (
                <div style={modalHelp}>Ingen kontakter enda.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {contacts.map((c) => (
                    <div
                      key={c.contactUid}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(27, 26, 23, 0.14)",
                        background: "rgba(255,255,255,0.65)",
                        ...textB,
                        color: "rgba(27, 26, 23, 0.92)",
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>{c.label ?? c.contactUid}</div>
                      {c.label ? <div style={{ opacity: 0.7 }}>{c.contactUid}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={modalRow}>
              <button type="button" onClick={() => setContactsOpen(false)} style={dangerBtn}>
                Lukk
              </button>
              <div />
            </div>
          </div>
        </div>
      ) : null}

      {/* Invite code modal */}
      {myCodeOpen ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Invitasjonskode</div>
            <div style={modalHelp}>Del denne koden med den som skal legge deg til.</div>

            <div style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(27, 26, 23, 0.14)",
                  background: "rgba(255,255,255,0.65)",
                  ...textA,
                  color: "rgba(27, 26, 23, 0.92)",
                  userSelect: "text",
                  overflowWrap: "anywhere",
                }}
              >
                {myCode || "(ingen kode ennå)"}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={primaryBtn}
                  onClick={() => void renewMyInviteCode()}
                  disabled={myCodeBusy}
                >
                  {myCodeBusy ? "Henter…" : "Forny"}
                </button>

                <button
                  type="button"
                  style={{ ...primaryBtn, background: "rgba(27,26,23,0.92)", color: "rgba(247,243,237,0.92)" }}
                  onClick={() =>
                    void (async () => {
                      if (!myCode) {
                        toast.show("Ingen kode å kopiere");
                        return;
                      }
                      const ok = await copyToClipboard(myCode);
                      toast.show(ok ? "Kopiert ✅" : "Kunne ikke kopiere");
                    })()
                  }
                  disabled={!myCode}
                >
                  Kopier
                </button>
              </div>
            </div>

            <div style={modalRow}>
              <button type="button" onClick={() => setMyCodeOpen(false)} style={dangerBtn}>
                Lukk
              </button>
              <div />
            </div>
          </div>
        </div>
      ) : null}

      {/* Recipient picker (after album pick) */}
      {recipientOpen && husketToSend ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Velg mottaker</div>
            <div style={modalHelp}>
              Valgt husk’et: <strong>{selectedSummary || "Husket"}</strong>
            </div>

            {contacts.length === 0 ? (
              <div style={modalHelp}>Ingen kontakter. Legg til kontakt først.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {contacts.map((c) => {
                  const checked = selectedRecipientUid === c.contactUid;
                  return (
                    <button
                      key={c.contactUid}
                      type="button"
                      style={{
                        ...listItemBtn,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        opacity: sending ? 0.65 : 1,
                      }}
                      onClick={() => setSelectedRecipientUid(c.contactUid)}
                      disabled={sending}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>{c.label ?? c.contactUid}</div>
                        {c.label ? <div style={{ opacity: 0.7 }}>{c.contactUid}</div> : null}
                      </div>
                      <div style={{ fontSize: 18 }}>{checked ? "◉" : "○"}</div>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={modalRow}>
              <button type="button" onClick={closeRecipientPicker} style={dangerBtn} disabled={sending}>
                Avbryt
              </button>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ ...textB, opacity: 0.75 }}>{sending ? "Sender…" : ""}</div>
                <button
                  type="button"
                  style={primaryBtn}
                  onClick={openConfirmSend}
                  disabled={!selectedRecipientUid || sending}
                >
                  Neste
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Confirm send dialog */}
      {confirmSendOpen && husketToSend ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Send?</div>
            <div style={modalHelp}>
              Mottaker: <strong>{selectedRecipientUid ?? ""}</strong>
              <div style={{ opacity: 0.8, marginTop: 6 }}>Husk’et: {selectedSummary || "Husket"}</div>
            </div>

            <div style={modalRow}>
              <button type="button" onClick={() => setConfirmSendOpen(false)} style={dangerBtn} disabled={sending}>
                Avbryt
              </button>

              <button type="button" onClick={() => void sendNow()} style={primaryBtn} disabled={sending}>
                {sending ? "Sender…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Inbox modal */}
      {inboxOpen ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Innboks</div>
            <div style={modalHelp}>Nye, uåpnede husketer. Du må velge Lagre eller Slett.</div>

            {relayErr ? (
              <div style={modalHelp}>Kunne ikke lese innboksen: {relayErr}</div>
            ) : relay.length === 0 ? (
              <div style={modalHelp}>Ingen mottatte husketer.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {relay.map((r) => {
                  const expired = isExpired(r);
                  return (
                    <div
                      key={r.relayId}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(27, 26, 23, 0.14)",
                        background: "rgba(255,255,255,0.65)",
                        ...textB,
                        color: "rgba(27, 26, 23, 0.92)",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>{expired ? "⏳ Utløpt" : "📩 Ny"}</div>
                        <div style={{ opacity: 0.75 }}>{formatDate(r.createdAtMs)}</div>
                      </div>

                      <div style={{ opacity: 0.85 }}>
                        Fra: <strong>{r.senderUid}</strong>
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                        {expired ? (
                          <button
                            type="button"
                            style={{ ...primaryBtn, padding: "8px 10px" }}
                            onClick={() => void removeExpired(r.relayId)}
                          >
                            Fjern
                          </button>
                        ) : (
                          <button
                            type="button"
                            style={{ ...primaryBtn, padding: "8px 10px" }}
                            onClick={() => openDecision(r)}
                          >
                            Åpne
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={modalRow}>
              <button type="button" onClick={() => setInboxOpen(false)} style={dangerBtn}>
                Lukk
              </button>
              <div />
            </div>
          </div>
        </div>
      ) : null}

      {/* Forced decision modal (no close) */}
      {decisionRelay ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Mottatt husket</div>
            <div style={modalHelp}>
              Fra: <strong>{decisionRelay.senderUid}</strong>
              <div style={{ opacity: 0.8, marginTop: 6 }}>Mottatt: {formatDate(decisionRelay.createdAtMs)}</div>
            </div>

            <div style={modalHelp}>Velg Lagre eller Slett.</div>

            <div style={modalRow}>
              <button
                type="button"
                onClick={() => void discardRelay(decisionRelay.relayId)}
                style={dangerBtn}
                disabled={decisionBusy}
              >
                Slett
              </button>

              <button type="button" onClick={() => void saveRelay(decisionRelay)} style={primaryBtn} disabled={decisionBusy}>
                {decisionBusy ? "Jobber…" : "Lagre"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Received gallery modal */}
      {receivedOpen ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Delt med meg</div>
            <div style={modalHelp}>Mottatte husketer (read-only).</div>

            {received.length === 0 ? (
              <div style={modalHelp}>Ingen lagrede mottak ennå.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {received.map((x) => (
                  <button key={x.id} type="button" style={listItemBtn} onClick={() => setViewReceived(x)}>
                    <div style={{ fontWeight: 900 }}>{x.fromUid}</div>
                    <div style={{ opacity: 0.75 }}>Mottatt: {formatDate(x.receivedAt)}</div>
                  </button>
                ))}
              </div>
            )}

            <div style={modalRow}>
              <button type="button" onClick={() => setReceivedOpen(false)} style={dangerBtn}>
                Lukk
              </button>
              <div />
            </div>
          </div>
        </div>
      ) : null}

      {/* View received modal */}
      {viewReceived ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Delt husket</div>
            <div style={modalHelp}>
              Fra: <strong>{viewReceived.fromUid}</strong>
              <div style={{ opacity: 0.75 }}>Mottatt: {formatDate(viewReceived.receivedAt)}</div>
            </div>

            {viewReceivedUrl ? (
              <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(27,26,23,0.12)" }}>
                <img src={viewReceivedUrl} alt="" style={{ width: "100%", height: "auto", display: "block" }} />
              </div>
            ) : (
              <div style={modalHelp}>Bilde mangler.</div>
            )}

            {viewReceived.comment ? <div style={{ ...modalHelp, marginTop: 10, marginBottom: 0 }}>💬 {viewReceived.comment}</div> : null}
            {viewReceived.ratingValue ? <div style={{ ...modalHelp, marginTop: 8, marginBottom: 0 }}>⭐ {viewReceived.ratingValue}</div> : null}

            <div style={modalRow}>
              <button type="button" onClick={() => void deleteReceived(viewReceived.id)} style={dangerBtn}>
                Slett
              </button>

              <button
                type="button"
                onClick={() => setViewReceived(null)}
                style={{ ...primaryBtn, background: "rgba(27,26,23,0.92)", color: "rgba(247,243,237,0.92)" }}
              >
                Lukk
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Existing i18n title key still referenced elsewhere; keep */}
      <div style={{ display: "none" }}>{tGet(dict, "shared.title")}</div>
    </div>
  );
}
