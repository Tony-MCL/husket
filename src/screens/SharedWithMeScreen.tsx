// ===============================
// src/screens/SharedWithMeScreen.tsx
// ===============================
import React, { useEffect, useMemo, useState } from "react";
import type { I18nDict } from "../i18n";
import { tGet } from "../i18n";
import { HUSKET_TYPO } from "../theme/typography";
import { useToast } from "../components/ToastHost";

import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db, functions } from "../firebase";

type ContactRow = {
  contactUid: string;
  label: string | null;
  canSendTo: boolean;
  blocked: boolean;
  createdAtMs: number;
};

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

  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  const [myCode, setMyCode] = useState<string>("");
  const [codeInput, setCodeInput] = useState<string>("");

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState<boolean>(true);

  const [busyCreate, setBusyCreate] = useState(false);
  const [busyResolve, setBusyResolve] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setContacts([]);
      setContactsLoading(false);
      return;
    }

    setContactsLoading(true);

    const qy = query(collection(db, `users/${uid}/contacts`), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows: ContactRow[] = snap.docs.map((d) => {
          const data = d.data() as any;

          const createdAtMs =
            typeof data?.createdAt?.toMillis === "function" ? data.createdAt.toMillis() : 0;

          return {
            contactUid: (data?.contactUid as string) || d.id,
            label: typeof data?.label === "string" ? data.label : null,
            canSendTo: data?.canSendTo === true,
            blocked: data?.blocked === true,
            createdAtMs,
          };
        });

        setContacts(rows);
        setContactsLoading(false);
      },
      (err) => {
        setContactsLoading(false);
        toast.show(`Kunne ikke lese kontakter: ${err?.message ?? "Ukjent feil"}`);
        // eslint-disable-next-line no-console
        console.error(err);
      }
    );

    return () => unsub();
  }, [uid, toast]);

  const canUse = Boolean(uid);

  const createInviteCode = async () => {
    if (!canUse) {
      toast.show("Du er ikke innlogget enda.");
      return;
    }

    try {
      setBusyCreate(true);
      const fn = httpsCallable(functions, "createInviteCode");
      const res = await fn({});
      const code =
        (res.data as any)?.code ?? (typeof res.data === "string" ? (res.data as string) : "");

      if (!code) {
        toast.show("Fikk ingen kode tilbake.");
        return;
      }

      setMyCode(code);
      const copied = await copyToClipboard(code);
      toast.show(copied ? `Invite code: ${code} (kopiert)` : `Invite code: ${code}`);
    } catch (err: any) {
      toast.show(`Kunne ikke lage invite code: ${err?.message ?? "Ukjent feil"}`);
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setBusyCreate(false);
    }
  };

  const resolveInviteCode = async () => {
    if (!canUse) {
      toast.show("Du er ikke innlogget enda.");
      return;
    }

    const code = codeInput.trim();
    if (!code) {
      toast.show("Lim inn en invite code først.");
      return;
    }

    try {
      setBusyResolve(true);
      const fn = httpsCallable(functions, "resolveInviteCode");
      const res = await fn({ code });

      const contactUid =
        (res.data as any)?.contactUid ?? (typeof res.data === "string" ? (res.data as string) : "");

      setCodeInput("");

      if (!contactUid) {
        toast.show("Kontakt lagt til, men fikk ingen uid tilbake.");
        return;
      }

      toast.show("Kontakt lagt til.");
    } catch (err: any) {
      toast.show(`Kunne ikke legge til kontakt: ${err?.message ?? "Ukjent feil"}`);
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setBusyResolve(false);
    }
  };

  const sortedContacts = useMemo(() => {
    const arr = [...contacts];
    arr.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    return arr;
  }, [contacts]);

  const boxStyle: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.08)",
    color: "inherit",
    padding: "10px 12px",
    fontSize: HUSKET_TYPO.B.fontSize,
    lineHeight: HUSKET_TYPO.B.lineHeight,
    outline: "none",
  };

  const btnStyle: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 999,
    padding: "10px 12px",
    background: "rgba(0,0,0,0.12)",
    color: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: HUSKET_TYPO.B.fontSize,
    fontWeight: HUSKET_TYPO.B.fontWeight,
    lineHeight: HUSKET_TYPO.B.lineHeight,
  };

  const btnPrimaryStyle: React.CSSProperties = {
    ...btnStyle,
    background: "rgba(255,255,255,0.12)",
  };

  return (
    <div style={{ padding: 12 }}>
      <div style={{ ...textA, marginBottom: 8 }}>{tGet(dict, "shared.title")}</div>
      <div className="smallHelp" style={textB}>
        {tGet(dict, "shared.placeholder")}
      </div>

      <div style={boxStyle}>
        <div style={{ ...textA, marginBottom: 8 }}>Invite code</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" style={btnPrimaryStyle} onClick={createInviteCode} disabled={!canUse || busyCreate}>
            {busyCreate ? "Lager..." : "Lag / hent min kode"}
          </button>

          {myCode ? (
            <button
              type="button"
              style={btnStyle}
              onClick={async () => {
                const ok = await copyToClipboard(myCode);
                toast.show(ok ? "Kopiert." : "Kunne ikke kopiere.");
              }}
            >
              Kopier
            </button>
          ) : null}
        </div>

        {myCode ? (
          <div style={{ ...textB, marginTop: 10, wordBreak: "break-all", opacity: 0.95 }}>
            {myCode}
          </div>
        ) : (
          <div style={{ ...textB, marginTop: 10, opacity: 0.7 }}>
            (Trykk “Lag / hent min kode”)
          </div>
        )}
      </div>

      <div style={boxStyle}>
        <div style={{ ...textA, marginBottom: 8 }}>Legg til kontakt</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Lim inn invite code"
            style={inputStyle}
            disabled={!canUse || busyResolve}
          />
          <button
            type="button"
            style={btnPrimaryStyle}
            onClick={resolveInviteCode}
            disabled={!canUse || busyResolve}
          >
            {busyResolve ? "Legger til..." : "Legg til"}
          </button>
        </div>
      </div>

      <div style={boxStyle}>
        <div style={{ ...textA, marginBottom: 8 }}>Kontakter</div>

        {!uid ? (
          <div style={{ ...textB, opacity: 0.75 }}>Logger inn...</div>
        ) : contactsLoading ? (
          <div style={{ ...textB, opacity: 0.75 }}>Laster...</div>
        ) : sortedContacts.length === 0 ? (
          <div style={{ ...textB, opacity: 0.75 }}>(Ingen kontakter enda)</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {sortedContacts.map((c) => (
              <div
                key={c.contactUid}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...textA, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.label || c.contactUid}
                  </div>
                  {c.label ? (
                    <div style={{ ...textB, opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.contactUid}
                    </div>
                  ) : null}
                </div>

                <div style={{ ...textB, opacity: 0.85, whiteSpace: "nowrap" }}>
                  {c.blocked ? "Blokkert" : c.canSendTo ? "Kan sende" : "Kan ikke sende"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
