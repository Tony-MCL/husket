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

import {
  deleteReceivedHusketById,
  getImageBlobByKey,
  getReceivedImageUrl,
  importReceivedHusketFromSky,
  listReceivedHuskets,
} from "../data/husketRepo";
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

function formatDate(settings: Settings, ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleString(settings.language === "no" ? "nb-NO" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  const ghostBtn: React.CSSProperties = {
    background: "transparent",
    color: "rgba(247, 243, 237, 0.92)",
    border: "1px solid rgba(247, 243, 237, 0.14)",
    boxShadow: "none",
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

  // --------------------------------
  // Invite code (your code)
  // --------------------------------
  const [myInviteCode, setMyInviteCode] = useState<string>("");
  const [myInviteBusy, setMyInviteBusy] = useState(false);

  const refreshInviteCode = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.show("Ikke innlogget. Prøv igjen.");
      return;
    }

    setMyInviteBusy(true);
    try {
      const fn = httpsCallable(functions, "createInviteCode");
      const res = await fn({});
      const code = String((res.data as any)?.code ?? "");
      if (!code) {
        toast.show("Kunne ikke hente invitasjonskode.");
        return;
      }
      setMyInviteCode(code);
      toast.show("Invitasjonskode klar ✅");
    } catch (e: any) {
      toast.show(e?.message ? `Feil: ${e.message}` : "Feil ved invitasjonskode");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setMyInviteBusy(false);
    }
  };

  useEffect(() => {
    void refreshInviteCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyMyInviteCode = async () => {
    const code = myInviteCode.trim();
    if (!code) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        toast.show("Kopiert ✅");
        return;
      }
    } catch {
      // fall through
    }

    toast.show("Kunne ikke kopiere automatisk.");
  };

  // --------------------------------
  // Contacts
  // --------------------------------
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

  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);

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

  // --------------------------------
  // Send flow (pick -> choose recipient -> send)
  // --------------------------------
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedRecipientUid, setSelectedRecipientUid] = useState<string>("");

  useEffect(() => {
    if (husketToSend) {
      setSelectedRecipientUid("");
      setSendOpen(true);
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
    return getEffectiveRatingPack(settings, h.life);
  };

  const closeSend = () => {
    setSendOpen(false);
    onClearHusketToSend();
  };

  const sendSelected = async () => {
    if (!husketToSend) return;

    const recipientUid = selectedRecipientUid.trim();
    if (!recipientUid) return;

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
        image: { storagePath: "client-placeholder" },
      };

      const fn = httpsCallable(functions, "sendHusketToContact");
      const res = await fn({ recipientUid, husket: payload, imageBase64: b64 });

      const relayId = (res.data as any)?.relayId as string | undefined;
      toast.show(relayId ? "Sendt ✅" : "Sendt");

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

  // --------------------------------
  // Inbox (relay)
  // --------------------------------
  const [relay, setRelay] = useState<RelayRow[]>([]);
  const [relayErr, setRelayErr] = useState<string | null>(null);

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
              categoryLabel:
                payload?.categoryLabel === null
                  ? null
                  : typeof payload?.categoryLabel === "string"
                    ? payload.categoryLabel
                    : null,
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

  const nowMs = Date.now();

  const inboxPending = useMemo(() => {
    return relay.filter((r) => r.status === "pending" && (!r.expiresAtMs || r.expiresAtMs > nowMs));
  }, [relay, nowMs]);

  const inboxExpired = useMemo(() => {
    return relay.filter((r) => r.status === "pending" && !!r.expiresAtMs && r.expiresAtMs <= nowMs);
  }, [relay, nowMs]);

  const [inboxAction, setInboxAction] = useState<RelayRow | null>(null);
  const [inboxBusy, setInboxBusy] = useState(false);

  const closeInboxAction = () => {
    // Intentionally not exposed via UI button for pending items.
    setInboxAction(null);
    setInboxBusy(false);
  };

  const discardRelay = async (row: RelayRow) => {
    setInboxBusy(true);
    try {
      const fn = httpsCallable(functions, "resolveRelayItem");
      await fn({ relayId: row.relayId, action: "discard" });
      toast.show("Slettet ✅");
      closeInboxAction();
    } catch (e: any) {
      toast.show(e?.message ? `Feil: ${e.message}` : "Kunne ikke slette");
      // eslint-disable-next-line no-console
      console.error(e);
      setInboxBusy(false);
    }
  };

  const saveRelay = async (row: RelayRow) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.show("Ikke innlogget. Prøv igjen.");
      return;
    }

    setInboxBusy(true);
    try {
      // 1) resolve (server creates users/{uid}/huskets/{newId} and copies image)
      const fn = httpsCallable(functions, "resolveRelayItem");
      const res = await fn({ relayId: row.relayId, action: "save" });
      const savedId = (res.data as any)?.savedHusketId as string | undefined;

      if (!savedId) {
        toast.show("Lagret (men mangler id).\nPrøv å oppdatere siden.");
        closeInboxAction();
        return;
      }

      // 2) download image from the *user husket* path (known convention from functions)
      const destPath = `users/${uid}/huskets/${savedId}.jpg`;
      const dlUrl = await getDownloadURL(sRef(storage, destPath));
      const blob = await fetch(dlUrl).then((r) => r.blob());

      // 3) store locally in a separate "received" bucket
      const capturedAt = row.payload.capturedAt || Date.now();

      await importReceivedHusketFromSky({
        id: savedId,
        husket: {
          life: "private", // not shown in main album; life is irrelevant in received bucket
          createdAt: capturedAt,
          ratingValue: row.payload.ratingValue || null,
          comment: row.payload.comment || null,
          categoryId: null,
          gps: row.payload.gps ?? null,
        },
        imageBlob: blob,
      });

      toast.show("Lagret ✅ (Delt med meg)");
      closeInboxAction();
    } catch (e: any) {
      toast.show(e?.message ? `Feil: ${e.message}` : "Kunne ikke lagre");
      // eslint-disable-next-line no-console
      console.error(e);
      setInboxBusy(false);
    }
  };

  // --------------------------------
  // Received (local)
  // --------------------------------
  const [received, setReceived] = useState<Husket[]>(() => listReceivedHuskets());
  const [receivedUrls, setReceivedUrls] = useState<Record<string, string>>({});

  const refreshReceived = () => {
    setReceived(listReceivedHuskets());
  };

  useEffect(() => {
    refreshReceived();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      const next: Record<string, string> = {};
      for (const h of received) {
        const url = await getReceivedImageUrl(h.imageKey);
        if (url) next[h.id] = url;
      }
      if (!alive) return;
      setReceivedUrls(next);
    };

    void run();

    return () => {
      alive = false;
    };
  }, [received]);

  const [openReceived, setOpenReceived] = useState<Husket | null>(null);
  const [openReceivedBusy, setOpenReceivedBusy] = useState(false);

  const onDeleteReceived = async (h: Husket) => {
    setOpenReceivedBusy(true);
    try {
      await deleteReceivedHusketById(h.id);
      toast.show("Slettet ✅");
      setOpenReceived(null);
      refreshReceived();
    } catch (e: any) {
      toast.show(e?.message ? `Feil: ${e.message}` : "Kunne ikke slette");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setOpenReceivedBusy(false);
    }
  };

  // --------------------------------
  // Layout helpers
  // --------------------------------
  const lineRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 0",
  };

  const lineLeft: React.CSSProperties = {
    display: "grid",
    gap: 2,
    minWidth: 0,
  };

  const lineTitle: React.CSSProperties = {
    ...textB,
    color: "rgba(247, 243, 237, 0.92)",
  };

  const lineSub: React.CSSProperties = {
    ...textB,
    color: "rgba(247, 243, 237, 0.92)",
    opacity: 0.7,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const hrStyle: React.CSSProperties = {
    height: 1,
    background: "rgba(247, 243, 237, 0.14)",
    border: "none",
    margin: 0,
  };

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 720, margin: "0 auto" }}>
      <div style={textA}>{tGet(dict, "shared.title")}</div>

      {/* Sharing Center */}
      <div style={{ ...card, padding: 12 }}>
        {/* 1) Contacts */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>Kontakter</div>
            <div style={lineSub}>{contacts.length === 0 ? "Ingen" : `${contacts.length} stk`}</div>
          </div>

          <button type="button" className="flatBtn" style={{ ...ghostBtn, minWidth: 130 }} onClick={() => setContactsModalOpen(true)}>
            Åpne
          </button>
        </div>

        <hr style={hrStyle} />

        {/* 2) Invite code */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>Invitasjonskode</div>
            <div style={lineSub}>{myInviteCode ? myInviteCode : myInviteBusy ? "Henter…" : ""}</div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" className="flatBtn" style={ghostBtn} onClick={() => void copyMyInviteCode()} disabled={!myInviteCode}>
              Kopier
            </button>
            <button type="button" className="flatBtn" style={ghostBtn} onClick={() => void refreshInviteCode()} disabled={myInviteBusy}>
              {myInviteBusy ? "…" : "Forny"}
            </button>
          </div>
        </div>

        <hr style={hrStyle} />

        {/* 3) Send husk'et */}
        <div style={lineRow}>
          <div style={lineLeft}>
            <div style={lineTitle}>Send husk’et</div>
            <div style={lineSub}>Velg i album → velg mottaker → send</div>
          </div>

          <button type="button" className="flatBtn" style={{ ...ghostBtn, minWidth: 130 }} onClick={onStartSendFlow}>
            Velg
          </button>
        </div>

        <hr style={hrStyle} />

        {/* 4) Inbox */}
        <div style={{ ...lineRow, paddingBottom: 0 }}>
          <div style={lineLeft}>
            <div style={lineTitle}>Innboks</div>
            <div style={lineSub}>{inboxPending.length === 0 ? "Ingen nye" : `${inboxPending.length} ny`}</div>
          </div>
        </div>

        {relayErr ? (
          <div className="smallHelp" style={{ ...textB, marginTop: 8 }}>
            Kunne ikke lese innboks: {relayErr}
          </div>
        ) : inboxPending.length === 0 ? (
          <div className="smallHelp" style={{ ...textB, marginTop: 8 }}>
            Ingen mottatte husketer.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {inboxPending.map((r) => (
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
                onClick={() => setInboxAction(r)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 800 }}>📩 Ny</div>
                  <div style={{ opacity: 0.75 }}>{formatDate(settings, r.createdAtMs)}</div>
                </div>

                <div style={{ opacity: 0.9 }}>Fra: {r.senderUid}</div>
              </button>
            ))}
          </div>
        )}

        {inboxExpired.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...textB, opacity: 0.8, marginBottom: 8 }}>Utløpt</div>
            <div style={{ display: "grid", gap: 8 }}>
              {inboxExpired.map((r) => (
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
                    opacity: 0.8,
                  }}
                  onClick={() => void discardRelay(r)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 800 }}>⏳ Utløpt</div>
                    <div style={{ opacity: 0.75 }}>{formatDate(settings, r.expiresAtMs ?? 0)}</div>
                  </div>
                  <div style={{ opacity: 0.9 }}>Trykk for å fjerne</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Delt med meg (local received album) */}
      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ ...textB, opacity: 0.85 }}>Delt med meg</div>

        {received.length === 0 ? (
          <div className="smallHelp" style={textB}>
            Ingen lagrede husketer.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
            }}
          >
            {received.map((h) => {
              const url = receivedUrls[h.id];
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setOpenReceived(h)}
                  style={{
                    ...ghostBtn,
                    padding: 0,
                    overflow: "hidden",
                    borderRadius: 16,
                    textAlign: "left",
                    cursor: "pointer",
                    display: "grid",
                    gap: 0,
                  }}
                  title="Åpne"
                >
                  {url ? (
                    <img src={url} alt="" style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ height: 110, display: "grid", placeItems: "center", opacity: 0.75, ...textB }}>…</div>
                  )}

                  <div style={{ padding: 10, display: "grid", gap: 4 }}>
                    <div style={{ fontWeight: 800, ...textB }}>{h.ratingValue ? `⭐ ${h.ratingValue}` : "Husket"}</div>
                    <div style={{ ...textB, opacity: 0.75, fontSize: 12 }}>{formatDate(settings, h.createdAt)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Existing i18n placeholder (kept) */}
      <div className="smallHelp" style={textB}>
        {tGet(dict, "shared.placeholder")}
      </div>

      {/* Contacts modal */}
      {contactsModalOpen ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Kontakter</div>
            <div style={modalHelp}>Ny kontakt: skriv inn invitasjonskode.</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value)}
                placeholder="Skriv kode…"
                style={{
                  flex: "1 1 220px",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(27, 26, 23, 0.14)",
                  background: "rgba(255,255,255,0.65)",
                  color: "rgba(27, 26, 23, 0.92)",
                  ...textB,
                  outline: "none",
                }}
              />

              <button type="button" style={okBtn} onClick={() => void onAddContact()} disabled={isAdding}>
                {isAdding ? "Legger til…" : "Legg til"}
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {contactsErr ? (
                <div style={modalHelp}>Kunne ikke lese kontakter: {contactsErr}</div>
              ) : contacts.length === 0 ? (
                <div style={modalHelp}>Ingen kontakter enda.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {contacts.map((c) => (
                    <div
                      key={c.contactUid}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(27, 26, 23, 0.14)",
                        background: "rgba(255,255,255,0.65)",
                        ...textB,
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
              <button type="button" onClick={() => setContactsModalOpen(false)} style={dangerBtn}>
                Lukk
              </button>
              <div />
            </div>
          </div>
        </div>
      ) : null}

      {/* Send modal (choose recipient, then send) */}
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
                {contacts.map((c) => {
                  const checked = selectedRecipientUid === c.contactUid;
                  return (
                    <label
                      key={c.contactUid}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(27, 26, 23, 0.14)",
                        background: "rgba(255,255,255,0.65)",
                        cursor: sending ? "not-allowed" : "pointer",
                        opacity: sending ? 0.7 : 1,
                      }}
                    >
                      <input
                        type="radio"
                        name="recipient"
                        checked={checked}
                        onChange={() => setSelectedRecipientUid(c.contactUid)}
                        disabled={sending}
                      />
                      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, ...textB }}>{c.label ?? c.contactUid}</div>
                        {c.label ? <div style={{ opacity: 0.7, ...textB }}>{c.contactUid}</div> : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div style={modalRow}>
              <button type="button" onClick={closeSend} style={dangerBtn} disabled={sending}>
                Avbryt
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ ...textB, opacity: 0.75 }}>{sending ? "Sender…" : ""}</div>
                <button type="button" onClick={() => void sendSelected()} style={okBtn} disabled={sending || !selectedRecipientUid}>
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Inbox action modal: no close, only Save/Delete */}
      {inboxAction ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Mottatt husket</div>
            <div style={modalHelp}>
              Fra: <strong>{inboxAction.senderUid}</strong>
              <div style={{ opacity: 0.75 }}>Mottatt: {formatDate(settings, inboxAction.createdAtMs)}</div>
            </div>

            <div style={modalRow}>
              <button type="button" onClick={() => void discardRelay(inboxAction)} style={dangerBtn} disabled={inboxBusy}>
                Slett
              </button>

              <button type="button" onClick={() => void saveRelay(inboxAction)} style={okBtn} disabled={inboxBusy}>
                {inboxBusy ? "Jobber…" : "Lagre"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Received viewer modal: close + delete */}
      {openReceived ? (
        <div style={modalBackdrop} role="dialog" aria-modal="true">
          <div style={modalCard}>
            <div style={modalTitle}>Delt husket</div>

            <div style={modalHelp}>
              {openReceived.ratingValue ? `⭐ ${openReceived.ratingValue}` : ""}
              {openReceived.comment ? ` · 💬 ${openReceived.comment}` : ""}
            </div>

            {receivedUrls[openReceived.id] ? (
              <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(27,26,23,0.12)" }}>
                <img src={receivedUrls[openReceived.id]} alt="" style={{ width: "100%", height: "auto", display: "block" }} />
              </div>
            ) : (
              <div style={modalHelp}>Bilde lastes…</div>
            )}

            <div style={{ ...modalHelp, marginTop: 10, marginBottom: 0, opacity: 0.75 }}>{formatDate(settings, openReceived.createdAt)}</div>

            <div style={modalRow}>
              <button type="button" onClick={() => setOpenReceived(null)} style={dangerBtn} disabled={openReceivedBusy}>
                Lukk
              </button>

              <button type="button" onClick={() => void onDeleteReceived(openReceived)} style={dangerBtn} disabled={openReceivedBusy}>
                {openReceivedBusy ? "…" : "Slett"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
