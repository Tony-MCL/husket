// ===============================
// functions/src/index.ts
// ===============================
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";

setGlobalOptions({ region: "europe-west1" });

admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

type Plan = "standard" | "premium" | "sky";

type HusketRelayPayload = {
  type: "husket";
  husketId: string;
  capturedAt: admin.firestore.Timestamp;
  comment: string; // max 100
  ratingPackKey: string;
  ratingValue: string;
  categoryLabel: string | null;
  gps:
    | {
        lat: number;
        lng: number;
        acc: number;
        ts: admin.firestore.Timestamp;
      }
    | null;
  image: {
    storagePath: string; // required
  };
};

function assertAuthed(ctx: any): string {
  const uid = ctx?.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Not signed in.");
  return uid;
}

function asNonEmptyString(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new HttpsError("invalid-argument", `Missing/invalid ${field}.`);
  }
  return v.trim();
}

function asOptionalString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function clampComment(comment: string): string {
  if (comment.length <= 100) return comment;
  return comment.slice(0, 100);
}

function nowTs(): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.now();
}

function addDays(ts: admin.firestore.Timestamp, days: number): admin.firestore.Timestamp {
  const ms = ts.toMillis() + days * 24 * 60 * 60 * 1000;
  return admin.firestore.Timestamp.fromMillis(ms);
}

function yyyymmFromNow(ts: admin.firestore.Timestamp): string {
  const d = new Date(ts.toMillis());
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}${String(m).padStart(2, "0")}`;
}

function randomInviteCode(length = 10): string {
  // Unngå lett-forvekslbare tegn (0,O,1,I,L)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = admin.firestore().app?.options ? admin.firestore : null; // no-op to silence lint
  const buf = Buffer.alloc(length);
  admin.crypto?.randomBytes?.(length); // if present (not required)
  // Bruk Node crypto direkte (alltid tilgjengelig i runtime)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require("crypto") as typeof import("crypto");
  const rnd = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    buf[i] = rnd[i] % alphabet.length;
  }
  return Array.from(buf).map((b) => alphabet[b]).join("");
}

async function getUserPlan(uid: string): Promise<Plan> {
  const snap = await db.doc(`users/${uid}`).get();
  const plan = (snap.exists ? (snap.data()?.plan as unknown) : undefined) as unknown;
  if (plan === "standard" || plan === "premium" || plan === "sky") return plan;
  // Default: standard hvis ikke satt ennå
  return "standard";
}

async function ensureCanSendToContact(senderUid: string, recipientUid: string): Promise<void> {
  const ref = db.doc(`users/${senderUid}/contacts/${recipientUid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Contact not found.");
  }
  const data = snap.data() || {};
  if (data.blocked === true) {
    throw new HttpsError("failed-precondition", "Contact is blocked.");
  }
  if (data.canSendTo !== true) {
    throw new HttpsError("failed-precondition", "Sending to this contact is not allowed.");
  }
}

function validatePayload(input: any): Omit<HusketRelayPayload, "image"> & { image: { storagePath: string } } {
  if (!input || typeof input !== "object") {
    throw new HttpsError("invalid-argument", "Missing payload.");
  }
  if (input.type !== "husket") {
    throw new HttpsError("invalid-argument", "payload.type must be 'husket'.");
  }

  const husketId = asNonEmptyString(input.husketId, "payload.husketId");
  const ratingPackKey = asNonEmptyString(input.ratingPackKey, "payload.ratingPackKey");
  const ratingValue = asNonEmptyString(input.ratingValue, "payload.ratingValue");

  const commentRaw = typeof input.comment === "string" ? input.comment : "";
  const comment = clampComment(commentRaw);

  const categoryLabel = input.categoryLabel === null ? null : asOptionalString(input.categoryLabel);

  // capturedAt: accept number(ms) or ISO or Timestamp-like
  let capturedAt: admin.firestore.Timestamp;
  if (input.capturedAt?.toMillis && typeof input.capturedAt.toMillis === "function") {
    capturedAt = input.capturedAt as admin.firestore.Timestamp;
  } else if (typeof input.capturedAt === "number") {
    capturedAt = admin.firestore.Timestamp.fromMillis(input.capturedAt);
  } else if (typeof input.capturedAt === "string") {
    const ms = Date.parse(input.capturedAt);
    if (Number.isNaN(ms)) throw new HttpsError("invalid-argument", "Invalid payload.capturedAt.");
    capturedAt = admin.firestore.Timestamp.fromMillis(ms);
  } else {
    throw new HttpsError("invalid-argument", "Missing/invalid payload.capturedAt.");
  }

  let gps: HusketRelayPayload["gps"] = null;
  if (input.gps && typeof input.gps === "object") {
    const lat = Number(input.gps.lat);
    const lng = Number(input.gps.lng);
    const acc = Number(input.gps.acc);
    const tsIn = input.gps.ts;
    let ts: admin.firestore.Timestamp;
    if (tsIn?.toMillis && typeof tsIn.toMillis === "function") {
      ts = tsIn as admin.firestore.Timestamp;
    } else if (typeof tsIn === "number") {
      ts = admin.firestore.Timestamp.fromMillis(tsIn);
    } else {
      ts = capturedAt;
    }
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Number.isFinite(acc) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      gps = { lat, lng, acc, ts };
    }
  }

  return {
    type: "husket",
    husketId,
    capturedAt,
    comment,
    ratingPackKey,
    ratingValue,
    categoryLabel,
    gps,
    image: { storagePath: "" } // settes av server ved lagring
  };
}

async function uploadRelayImage(recipientUid: string, relayId: string, imageBase64: string): Promise<string> {
  const storagePath = `relay/${recipientUid}/${relayId}.jpg`; // matches storage/relay/{recipientUid}/{relayId}.jpg
  const file = bucket.file(storagePath);
  const bytes = Buffer.from(imageBase64, "base64");

  // Minimal content-type; vi låser dette til jpg nå
  await file.save(bytes, {
    contentType: "image/jpeg",
    resumable: false,
    metadata: {
      cacheControl: "private, max-age=0, no-transform"
    }
  });

  return storagePath;
}

async function copyRelayImageToUserHusket(recipientUid: string, relayStoragePath: string, newHusketId: string) {
  const src = bucket.file(relayStoragePath);
  const destPath = `users/${recipientUid}/huskets/${newHusketId}.jpg`;
  const dest = bucket.file(destPath);

  await src.copy(dest);
  return destPath;
}

// ------------------------------------------------------------
// A) createInviteCode (NY) - produksjonsklar
// ------------------------------------------------------------
export const createInviteCode = onCall(async (request) => {
  const uid = assertAuthed(request);
  const userRef = db.doc(`users/${uid}`);

  // Idempotent: returner eksisterende aktiv kode hvis den finnes og ikke er revoked
  const userSnap = await userRef.get();
  const existingCode = userSnap.exists ? (userSnap.data()?.inviteCode as unknown) : undefined;

  if (typeof existingCode === "string" && existingCode.trim().length > 0) {
    const code = existingCode.trim();
    const codeSnap = await db.doc(`inviteCodes/${code}`).get();
    const data = codeSnap.exists ? codeSnap.data() : null;
    if (data && data.ownerUid === uid && !data.revokedAt) {
      return { code };
    }
  }

  // Lag ny kode, sørg for unik
  const createdAt = nowTs();

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomInviteCode(10);
    const codeRef = db.doc(`inviteCodes/${code}`);

    const ok = await db.runTransaction(async (tx) => {
      const snap = await tx.get(codeRef);
      if (snap.exists) return false;

      tx.set(codeRef, {
        ownerUid: uid,
        createdAt,
        revokedAt: null
      });

      tx.set(
        userRef,
        {
          inviteCode: code,
          inviteCodeUpdatedAt: createdAt
        },
        { merge: true }
      );

      return true;
    });

    if (ok) return { code };
  }

  throw new HttpsError("internal", "Could not generate invite code. Try again.");
});

// ------------------------------------------------------------
// B) resolveInviteCode
// Input: { code: string }
// Output: { contactUid: string }
// ------------------------------------------------------------
export const resolveInviteCode = onCall(async (request) => {
  const myUid = assertAuthed(request);
  const codeIn = asNonEmptyString(request.data?.code, "code").toUpperCase();

  const codeSnap = await db.doc(`inviteCodes/${codeIn}`).get();
  if (!codeSnap.exists) throw new HttpsError("not-found", "Invalid code.");

  const data = codeSnap.data() || {};
  const ownerUid = data.ownerUid as string | undefined;
  const revokedAt = data.revokedAt as admin.firestore.Timestamp | null | undefined;

  if (!ownerUid) throw new HttpsError("not-found", "Invalid code.");
  if (ownerUid === myUid) throw new HttpsError("failed-precondition", "Cannot add yourself as contact.");
  if (revokedAt) throw new HttpsError("failed-precondition", "Code is revoked.");

  // Håndhev kontakt-limit for Standard
  const myPlan = await getUserPlan(myUid);
  if (myPlan === "standard") {
    const contactsSnap = await db.collection(`users/${myUid}/contacts`).get();
    if (contactsSnap.size >= 10) {
      throw new HttpsError("resource-exhausted", "Contact limit reached (Standard).");
    }
  }

  // Opprett/oppdater kontakt (server-only; klient får ikke lov via rules)
  const contactRef = db.doc(`users/${myUid}/contacts/${ownerUid}`);
  await contactRef.set(
    {
      contactUid: ownerUid,
      canSendTo: true,
      createdAt: nowTs(),
      blocked: false
    },
    { merge: true }
  );

  return { contactUid: ownerUid };
});

// ------------------------------------------------------------
// C) sendHusketToContact
// Input: { recipientUid: string, husket: payload, imageBase64: string }
// Output: { relayId: string }
// ------------------------------------------------------------
export const sendHusketToContact = onCall(async (request) => {
  const senderUid = assertAuthed(request);

  const recipientUid = asNonEmptyString(request.data?.recipientUid, "recipientUid");
  if (recipientUid === senderUid) throw new HttpsError("failed-precondition", "Cannot send to yourself.");

  const senderPlan = await getUserPlan(senderUid);
  if (senderPlan !== "sky") {
    throw new HttpsError("permission-denied", "Sending requires Sky plan.");
  }

  // Sjekk kontakt finnes og kan sende
  await ensureCanSendToContact(senderUid, recipientUid);

  // Valider payload
  const husketIn = request.data?.husket;
  const payloadBase = validatePayload(husketIn);

  // Image: base64 (prod-ready simplest)
  const imageBase64 = asNonEmptyString(request.data?.imageBase64, "imageBase64");

  const createdAt = nowTs();
  const expiresAt = addDays(createdAt, 14);
  const relayRef = db.collection("relay").doc();
  const relayId = relayRef.id;

  // Håndhev Standard-mottakers månedslimit (25/mnd)
  const recipientPlan = await getUserPlan(recipientUid);
  const yyyymm = yyyymmFromNow(createdAt);
  const counterRef = db.doc(`users/${recipientUid}/counters/${yyyymm}`);

  // Lagre bilde i relay storage først (slik at relay doc peker på faktisk path)
  const relayStoragePath = await uploadRelayImage(recipientUid, relayId, imageBase64);

  const relayDoc = {
    senderUid,
    recipientUid,
    createdAt,
    expiresAt,
    openedAt: null as admin.firestore.Timestamp | null,
    status: "pending" as "pending" | "opened" | "resolved",
    payload: {
      ...payloadBase,
      image: { storagePath: relayStoragePath }
    }
  };

  await db.runTransaction(async (tx) => {
    if (recipientPlan === "standard") {
      const cSnap = await tx.get(counterRef);
      const receivedCount = (cSnap.exists ? Number(cSnap.data()?.receivedCount || 0) : 0) || 0;
      if (receivedCount >= 25) {
        throw new HttpsError("resource-exhausted", "Monthly receive limit reached (Standard).");
      }
      tx.set(
        counterRef,
        {
          receivedCount: receivedCount + 1,
          updatedAt: createdAt
        },
        { merge: true }
      );
    }

    tx.create(relayRef, relayDoc);
  });

  return { relayId };
});

// ------------------------------------------------------------
// D) openRelayItem
// Input: { relayId: string }
// Output: { ok: true }
// ------------------------------------------------------------
export const openRelayItem = onCall(async (request) => {
  const myUid = assertAuthed(request);
  const relayId = asNonEmptyString(request.data?.relayId, "relayId");

  const ref = db.doc(`relay/${relayId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Relay not found.");

    const data = snap.data() || {};
    if (data.recipientUid !== myUid) throw new HttpsError("permission-denied", "Not allowed.");

    if (!data.openedAt) {
      tx.update(ref, {
        openedAt: nowTs(),
        status: "opened"
      });
    }
  });

  return { ok: true };
});

// ------------------------------------------------------------
// E) resolveRelayItem
// Input: { relayId: string, action: "save" | "discard" }
// Output: { savedHusketId?: string }
// ------------------------------------------------------------
export const resolveRelayItem = onCall(async (request) => {
  const myUid = assertAuthed(request);

  const relayId = asNonEmptyString(request.data?.relayId, "relayId");
  const action = asNonEmptyString(request.data?.action, "action") as "save" | "discard";
  if (action !== "save" && action !== "discard") {
    throw new HttpsError("invalid-argument", "action must be 'save' or 'discard'.");
  }

  const relayRef = db.doc(`relay/${relayId}`);

  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(relayRef);
    if (!snap.exists) throw new HttpsError("not-found", "Relay not found.");

    const relay = snap.data() as any;
    if (relay.recipientUid !== myUid) throw new HttpsError("permission-denied", "Not allowed.");

    if (action === "discard") {
      tx.delete(relayRef);
      return { savedHusketId: undefined as string | undefined, relayStoragePath: relay?.payload?.image?.storagePath as string | undefined };
    }

    // SAVE
    const newId = db.collection(`users/${myUid}/huskets`).doc().id;
    const createdAt = nowTs();

    const relayPayload = relay.payload as HusketRelayPayload;
    if (!relayPayload?.image?.storagePath) {
      throw new HttpsError("internal", "Relay image path missing.");
    }

    const destImagePath = `users/${myUid}/huskets/${newId}.jpg`;

    tx.set(db.doc(`users/${myUid}/huskets/${newId}`), {
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      life: relay.life ?? "private",
      comment: relayPayload.comment ?? "",
      ratingPackKey: relayPayload.ratingPackKey,
      ratingValue: relayPayload.ratingValue,
      categoryLabelSnapshot: relayPayload.categoryLabel ?? null,
      gps: relayPayload.gps ?? null,
      image: {
        storagePath: destImagePath
      }
    });

    tx.delete(relayRef);

    return { savedHusketId: newId, relayStoragePath: relayPayload.image.storagePath };
  });

  // Copy image after transaction (storage er utenfor Firestore transaction)
  if (action === "save" && res.savedHusketId && res.relayStoragePath) {
    await copyRelayImageToUserHusket(myUid, res.relayStoragePath, res.savedHusketId);
    // (valgfritt) slett relay-bilde direkte; lifecycle tar det ellers
    try {
      await bucket.file(res.relayStoragePath).delete({ ignoreNotFound: true });
    } catch {
      // ignore
    }
    return { savedHusketId: res.savedHusketId };
  }

  if (action === "discard" && res.relayStoragePath) {
    // Slett relay-bildet hvis mulig (ellers lifecycle)
    try {
      await bucket.file(res.relayStoragePath).delete({ ignoreNotFound: true });
    } catch {
      // ignore
    }
  }

  return {};
});
