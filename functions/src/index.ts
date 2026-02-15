/* ===============================
   functions/src/index.ts
   Husket Sky v1 – Callables (LÅST)
   =============================== */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import crypto from "crypto";

initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();

type Plan = "standard" | "premium" | "sky";
type RelayStatus = "pending" | "opened" | "resolved";

type HusketPayload = {
  type: "husket";
  husketId: string;
  capturedAt: number; // millis
  comment: string; // max 100, can be empty
  ratingPackKey: string;
  ratingValue: string;
  categoryLabel: string | null;
  gps: null | { lat: number; lng: number; acc?: number; ts?: number };
  image: {
    storagePath: string; // required (server will set to relay path)
  };
};

function requireAuth(ctx: any): string {
  const uid = ctx.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");
  return uid;
}

function nowTs(): Timestamp {
  return Timestamp.now();
}

function yyyymmFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

function clampString(s: unknown, maxLen: number): string {
  if (typeof s !== "string") return "";
  const trimmed = s.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function requireString(x: unknown, fieldName: string): string {
  if (typeof x !== "string" || x.trim().length === 0) {
    throw new HttpsError("invalid-argument", `Missing/invalid ${fieldName}.`);
  }
  return x.trim();
}

function requireObject(x: unknown, fieldName: string): Record<string, unknown> {
  if (!x || typeof x !== "object") {
    throw new HttpsError("invalid-argument", `Missing/invalid ${fieldName}.`);
  }
  return x as Record<string, unknown>;
}

function assertAllowedPackKey(packKey: string): string {
  // LÅST: schema says string. We keep it permissive for now.
  return packKey;
}

function validatePayload(raw: unknown): HusketPayload {
  const o = requireObject(raw, "husket");

  const type = o.type;
  if (type !== "husket") {
    throw new HttpsError("invalid-argument", "payload.type must be 'husket'.");
  }

  const husketId = requireString(o.husketId, "husket.husketId");

  const capturedAt = o.capturedAt;
  if (typeof capturedAt !== "number" || !Number.isFinite(capturedAt) || capturedAt <= 0) {
    throw new HttpsError("invalid-argument", "husket.capturedAt must be millis timestamp.");
  }

  const comment = clampString(o.comment, 100);

  const ratingPackKey = assertAllowedPackKey(requireString(o.ratingPackKey, "husket.ratingPackKey"));
  const ratingValue = requireString(o.ratingValue, "husket.ratingValue");

  const categoryLabelRaw = o.categoryLabel;
  const categoryLabel =
    categoryLabelRaw === null ? null : typeof categoryLabelRaw === "string" ? clampString(categoryLabelRaw, 60) : null;

  const gpsRaw = o.gps;
  let gps: HusketPayload["gps"] = null;
  if (gpsRaw !== null && gpsRaw !== undefined) {
    const g = requireObject(gpsRaw, "husket.gps");
    const lat = g.lat;
    const lng = g.lng;
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new HttpsError("invalid-argument", "husket.gps.lat/lng must be numbers.");
    }
    const acc = typeof g.acc === "number" ? g.acc : undefined;
    const ts = typeof g.ts === "number" ? g.ts : undefined;
    gps = { lat, lng, ...(acc !== undefined ? { acc } : {}), ...(ts !== undefined ? { ts } : {}) };
  }

  const imageRaw = requireObject(o.image, "husket.image");
  const storagePath = requireString(imageRaw.storagePath, "husket.image.storagePath");

  return {
    type: "husket",
    husketId,
    capturedAt,
    comment,
    ratingPackKey,
    ratingValue,
    categoryLabel,
    gps,
    image: { storagePath }
  };
}

async function getUserPlan(uid: string): Promise<Plan> {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return "standard";
  const data = snap.data() || {};
  const plan = data.plan;
  if (plan === "standard" || plan === "premium" || plan === "sky") return plan;
  return "standard";
}

async function assertHasSky(uid: string): Promise<void> {
  const plan = await getUserPlan(uid);
  if (plan !== "sky") {
    throw new HttpsError("permission-denied", "Sky plan required to send.");
  }
}

async function assertContactExists(senderUid: string, recipientUid: string): Promise<void> {
  const ref = db.doc(`users/${senderUid}/contacts/${recipientUid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Recipient is not in your contacts.");
  }
  const d = snap.data() || {};
  if (d.blocked === true) {
    throw new HttpsError("failed-precondition", "Contact is blocked.");
  }
  if (d.canSendTo !== true) {
    throw new HttpsError("failed-precondition", "You are not allowed to send to this contact.");
  }
}

async function countContacts(uid: string): Promise<number> {
  const q = db.collection(`users/${uid}/contacts`).count();
  const res = await q.get();
  return res.data().count;
}

async function assertContactLimitForStandard(uid: string): Promise<void> {
  const plan = await getUserPlan(uid);
  if (plan === "sky") return; // unlimited
  const currentCount = await countContacts(uid);
  if (currentCount >= 10) {
    throw new HttpsError("resource-exhausted", "Contact limit reached (max 10).");
  }
}

async function getReceivedCount(uid: string, yyyymm: string): Promise<number> {
  const ref = db.doc(`users/${uid}/counters/${yyyymm}`);
  const snap = await ref.get();
  if (!snap.exists) return 0;
  const d = snap.data() || {};
  return typeof d.receivedCount === "number" ? d.receivedCount : 0;
}

async function assertMonthlyLimitIfStandardRecipient(recipientUid: string): Promise<{ yyyymm: string }> {
  const plan = await getUserPlan(recipientUid);
  if (plan === "sky") return { yyyymm: yyyymmFromDate(new Date()) }; // unlimited receive
  const yyyymm = yyyymmFromDate(new Date());
  const current = await getReceivedCount(recipientUid, yyyymm);
  if (current >= 25) {
    throw new HttpsError("resource-exhausted", "Recipient monthly receive limit reached (25).");
  }
  return { yyyymm };
}

function relayDocPath(relayId: string): string {
  return `relay/${relayId}`;
}

function relayStoragePath(recipientUid: string, relayId: string): string {
  return `relay/${recipientUid}/${relayId}.jpg`;
}

function userHusketStoragePath(uid: string, husketId: string): string {
  return `users/${uid}/huskets/${husketId}.jpg`;
}

function addDays(ts: Timestamp, days: number): Timestamp {
  const ms = ts.toMillis() + days * 24 * 60 * 60 * 1000;
  return Timestamp.fromMillis(ms);
}

function decodeBase64Image(dataUrlOrBase64: string): Buffer {
  const s = dataUrlOrBase64.trim();
  const comma = s.indexOf(",");
  const b64 = s.startsWith("data:") && comma !== -1 ? s.slice(comma + 1) : s;

  if (b64.length < 64) {
    throw new HttpsError("invalid-argument", "imageBase64 is too small/invalid.");
  }

  try {
    return Buffer.from(b64, "base64");
  } catch {
    throw new HttpsError("invalid-argument", "imageBase64 must be valid base64.");
  }
}

function assertMaxBytes(buf: Buffer, maxBytes: number): void {
  if (buf.byteLength > maxBytes) {
    throw new HttpsError("invalid-argument", `Image too large. Max ${maxBytes} bytes.`);
  }
}

function randomInviteCode(length = 10): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // avoid 0,O,1,I,L
  const rnd = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[rnd[i] % alphabet.length];
  }
  return out;
}

/* =========================================================
   0) createInviteCode (NY)
   Output: { code: string }
   Server:
   - idempotent (return existing active code if present)
   - else create inviteCodes/{CODE} = { ownerUid, createdAt, revokedAt:null }
   - store users/{uid}.inviteCode for convenience
   ========================================================= */
export const createInviteCode = onCall({ region: "europe-west1" }, async (req) => {
  const myUid = requireAuth(req);

  const userRef = db.doc(`users/${myUid}`);
  const userSnap = await userRef.get();

  const existing = userSnap.exists ? (userSnap.data() || {}).inviteCode : null;
  if (typeof existing === "string" && existing.trim().length > 0) {
    const code = existing.trim().toUpperCase();
    const codeSnap = await db.doc(`inviteCodes/${code}`).get();
    const d = codeSnap.exists ? codeSnap.data() || {} : {};
    if (d.ownerUid === myUid && !d.revokedAt) {
      return { code };
    }
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomInviteCode(10);
    const codeRef = db.doc(`inviteCodes/${code}`);

    const ok = await db.runTransaction(async (tx) => {
      const snap = await tx.get(codeRef);
      if (snap.exists) return false;

      tx.set(codeRef, {
        ownerUid: myUid,
        createdAt: FieldValue.serverTimestamp(),
        revokedAt: null
      });

      tx.set(
        userRef,
        {
          inviteCode: code,
          inviteCodeUpdatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      return true;
    });

    if (ok) return { code };
  }

  throw new HttpsError("internal", "Could not generate invite code. Try again.");
});

/* =========================================================
   A) resolveInviteCode
   Input: { code: string }
   Output: { contactUid: string }
   ========================================================= */
export const resolveInviteCode = onCall({ region: "europe-west1" }, async (req) => {
  const myUid = requireAuth(req);

  const data = requireObject(req.data, "data");
  const code = requireString(data.code, "code").toUpperCase();

  const codeRef = db.doc(`inviteCodes/${code}`);
  const codeSnap = await codeRef.get();

  if (!codeSnap.exists) {
    throw new HttpsError("not-found", "Invalid invite code.");
  }

  const codeData = codeSnap.data() || {};
  const ownerUid = codeData.ownerUid;

  if (typeof ownerUid !== "string" || ownerUid.trim().length === 0) {
    throw new HttpsError("failed-precondition", "Invite code misconfigured.");
  }

  if (ownerUid === myUid) {
    throw new HttpsError("failed-precondition", "You cannot add yourself as a contact.");
  }

  if (codeData.revokedAt) {
    throw new HttpsError("failed-precondition", "Invite code revoked.");
  }

  await assertContactLimitForStandard(myUid);

  const contactRef = db.doc(`users/${myUid}/contacts/${ownerUid}`);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(contactRef);
    if (existing.exists) return;
    tx.set(contactRef, {
      contactUid: ownerUid,
      canSendTo: true,
      createdAt: FieldValue.serverTimestamp(),
      label: null,
      blocked: false
    });
  });

  return { contactUid: ownerUid };
});

/* =========================================================
   B) sendHusketToContact
   Input: { recipientUid: string, husket: payload, imageBase64: string }
   Output: { relayId: string }
   ========================================================= */
export const sendHusketToContact = onCall(
  { region: "europe-west1", timeoutSeconds: 60, memory: "512MiB" },
  async (req) => {
    const senderUid = requireAuth(req);
    await assertHasSky(senderUid);

    const data = requireObject(req.data, "data");
    const recipientUid = requireString(data.recipientUid, "recipientUid");

    if (recipientUid === senderUid) {
      throw new HttpsError("failed-precondition", "Cannot send to yourself.");
    }

    await assertContactExists(senderUid, recipientUid);

    const husket = validatePayload(data.husket);

    const imageBase64 = requireString(data.imageBase64, "imageBase64");
    const imageBuf = decodeBase64Image(imageBase64);
    assertMaxBytes(imageBuf, 6 * 1024 * 1024); // 6 MB

    const { yyyymm } = await assertMonthlyLimitIfStandardRecipient(recipientUid);

    const relayRef = db.collection("relay").doc();
    const relayId = relayRef.id;

    const createdAt = nowTs();
    const expiresAt = addDays(createdAt, 14);

    const relayPath = relayStoragePath(recipientUid, relayId);

    const relayPayload: HusketPayload = {
      ...husket,
      image: { storagePath: relayPath }
    };

    // Upload first
    const file = bucket.file(relayPath);
    await file.save(imageBuf, {
      contentType: "image/jpeg",
      resumable: false,
      metadata: { cacheControl: "private, max-age=3600" }
    });

    const counterRef = db.doc(`users/${recipientUid}/counters/${yyyymm}`);

    await db.runTransaction(async (tx) => {
      const recipientPlan = await getUserPlan(recipientUid);
      if (recipientPlan !== "sky") {
        const counterSnap = await tx.get(counterRef);
        const current =
          counterSnap.exists && typeof counterSnap.data()?.receivedCount === "number"
            ? (counterSnap.data()!.receivedCount as number)
            : 0;

        if (current >= 25) {
          throw new HttpsError("resource-exhausted", "Recipient monthly receive limit reached (25).");
        }

        tx.set(
          counterRef,
          {
            receivedCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }

      tx.set(relayRef, {
        senderUid,
        recipientUid,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
        openedAt: null,
        status: "pending" as RelayStatus,
        payload: relayPayload,
        image: { storagePath: relayPath }
      });
    });

    return { relayId };
  }
);

/* =========================================================
   C) openRelayItem
   ========================================================= */
export const openRelayItem = onCall({ region: "europe-west1" }, async (req) => {
  const myUid = requireAuth(req);

  const data = requireObject(req.data, "data");
  const relayId = requireString(data.relayId, "relayId");

  const ref = db.doc(relayDocPath(relayId));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Relay item not found.");

    const d = snap.data() || {};
    if (d.recipientUid !== myUid) throw new HttpsError("permission-denied", "Not your relay item.");

    if (!d.openedAt) {
      tx.update(ref, {
        openedAt: FieldValue.serverTimestamp(),
        status: "opened" as RelayStatus
      });
    }
  });

  return { ok: true };
});

/* =========================================================
   D) resolveRelayItem
   ========================================================= */
export const resolveRelayItem = onCall(
  { region: "europe-west1", timeoutSeconds: 60, memory: "512MiB" },
  async (req) => {
    const myUid = requireAuth(req);

    const data = requireObject(req.data, "data");
    const relayId = requireString(data.relayId, "relayId");

    const action = data.action;
    if (action !== "save" && action !== "discard") {
      throw new HttpsError("invalid-argument", "action must be 'save' or 'discard'.");
    }

    const relayRef = db.doc(relayDocPath(relayId));

    const relaySnap = await relayRef.get();
    if (!relaySnap.exists) throw new HttpsError("not-found", "Relay item not found.");

    const relay = relaySnap.data() || {};
    if (relay.recipientUid !== myUid) throw new HttpsError("permission-denied", "Not your relay item.");

    const relayImagePath = relay?.image?.storagePath;
    if (typeof relayImagePath !== "string" || relayImagePath.length === 0) {
      throw new HttpsError("failed-precondition", "Relay image path missing.");
    }

    const payload = relay.payload as HusketPayload | undefined;
    if (!payload || payload.type !== "husket") {
      throw new HttpsError("failed-precondition", "Relay payload missing/invalid.");
    }

    if (action === "discard") {
      await relayRef.delete().catch(() => undefined);
      await bucket.file(relayImagePath).delete({ ignoreNotFound: true }).catch(() => undefined);
      return { ok: true };
    }

    const newHusketRef = db.collection(`users/${myUid}/huskets`).doc();
    const newId = newHusketRef.id;

    const destPath = userHusketStoragePath(myUid, newId);

    await bucket.file(relayImagePath).copy(bucket.file(destPath));

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(relayRef);
      if (!snap.exists) throw new HttpsError("not-found", "Relay item not found.");
      const d = snap.data() || {};
      if (d.recipientUid !== myUid) throw new HttpsError("permission-denied", "Not your relay item.");

      tx.set(newHusketRef, {
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        deletedAt: null,
        life: null,
        comment: payload.comment ?? "",
        ratingPackKey: payload.ratingPackKey,
        ratingValue: payload.ratingValue,
        categoryLabelSnapshot: payload.categoryLabel ?? null,
        gps: payload.gps ?? null,
        capturedAt: Timestamp.fromMillis(payload.capturedAt),
        image: { storagePath: destPath }
      });

      tx.delete(relayRef);
    });

    await bucket.file(relayImagePath).delete({ ignoreNotFound: true }).catch(() => undefined);

    return { savedHusketId: newId };
  }
);
