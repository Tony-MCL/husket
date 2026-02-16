// ===============================
// src/data/receivedRepo.ts
// ===============================
import { readJson, writeJson } from "../storage/local";
import { idbGetBlob, idbPutBlob } from "../storage/idb";

export type ReceivedHusket = {
  id: string;
  receivedAt: number;
  fromUid: string;

  // Original captured time from sender (if provided)
  capturedAt: number;

  // Immutable display fields
  ratingValue: string | null;
  comment: string | null;
  categoryLabel: string | null;
  gps: null | { lat: number; lng: number; acc?: number; ts?: number };

  // Local image key (idb)
  imageKey: string;
};

type ReceivedStore = {
  version: 1;
  items: ReceivedHusket[];
};

const KEY = "husket.received.v1";

function loadStore(): ReceivedStore {
  const existing = readJson<ReceivedStore>(KEY);
  if (existing && existing.version === 1) return existing;
  const fresh: ReceivedStore = { version: 1, items: [] };
  writeJson(KEY, fresh);
  return fresh;
}

function saveStore(store: ReceivedStore): void {
  writeJson(KEY, store);
}

export function listReceived(): ReceivedHusket[] {
  const store = loadStore();
  return store.items.slice().sort((a, b) => b.receivedAt - a.receivedAt);
}

export async function getReceivedImageUrl(imageKey: string): Promise<string | null> {
  const blob = await idbGetBlob(imageKey);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function addReceivedFromRelay(input: {
  id: string;
  receivedAt: number;
  fromUid: string;
  payload: {
    husketId: string;
    capturedAt: number;
    comment: string;
    ratingPackKey: string;
    ratingValue: string;
    categoryLabel: string | null;
    gps: null | { lat: number; lng: number; acc?: number; ts?: number };
  };
  imageBlob: Blob;
}): Promise<ReceivedHusket> {
  const store = loadStore();

  const existing = store.items.find((x) => x.id === input.id);
  if (existing) return existing;

  const imageKey = `recvimg:${input.id}`;
  await idbPutBlob(imageKey, input.imageBlob);

  const item: ReceivedHusket = {
    id: input.id,
    receivedAt: input.receivedAt,
    fromUid: input.fromUid,
    capturedAt: input.payload.capturedAt || 0,
    ratingValue: input.payload.ratingValue || null,
    comment: input.payload.comment || null,
    categoryLabel: input.payload.categoryLabel ?? null,
    gps: input.payload.gps ?? null,
    imageKey,
  };

  store.items.push(item);
  saveStore(store);

  return item;
}

export async function deleteReceivedById(id: string): Promise<ReceivedHusket | null> {
  const store = loadStore();
  const idx = store.items.findIndex((x) => x.id === id);
  if (idx === -1) return null;

  const [removed] = store.items.splice(idx, 1);
  saveStore(store);

  return removed ?? null;
}
