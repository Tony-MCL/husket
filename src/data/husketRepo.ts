// ===============================
// src/data/husketRepo.ts
// ===============================
import type { Husket, LifeKey } from "../domain/types";
import { readJson, writeJson } from "../storage/local";
import { idbGetBlob, idbPutBlob } from "../storage/idb";

const KEY = "husket.items.v1";
const KEY_RECEIVED = "husket.received.items.v1";

export type HusketStore = {
  version: 1;
  items: Husket[];
};

export type ReceivedHusketStore = {
  version: 1;
  items: Husket[];
};

function loadStore(): HusketStore {
  const existing = readJson<HusketStore>(KEY);
  if (existing && existing.version === 1) return existing;
  const fresh: HusketStore = { version: 1, items: [] };
  writeJson(KEY, fresh);
  return fresh;
}

function saveStore(store: HusketStore): void {
  writeJson(KEY, store);
}

function loadReceivedStore(): ReceivedHusketStore {
  const existing = readJson<ReceivedHusketStore>(KEY_RECEIVED);
  if (existing && existing.version === 1) return existing;
  const fresh: ReceivedHusketStore = { version: 1, items: [] };
  writeJson(KEY_RECEIVED, fresh);
  return fresh;
}

function saveReceivedStore(store: ReceivedHusketStore): void {
  writeJson(KEY_RECEIVED, store);
}

export function listHuskets(life?: LifeKey): Husket[] {
  const store = loadStore();
  const items = store.items.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (!life) return items;
  return items.filter((x) => x.life === life);
}

export function countAllHuskets(): number {
  const store = loadStore();
  return store.items.length;
}

export function listReceivedHuskets(): Husket[] {
  const store = loadReceivedStore();
  return store.items.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export async function getImageBlobByKey(imageKey: string): Promise<Blob | null> {
  return idbGetBlob(imageKey);
}

export async function getImageUrl(imageKey: string): Promise<string | null> {
  const blob = await idbGetBlob(imageKey);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function getReceivedImageUrl(imageKey: string): Promise<string | null> {
  // Same storage mechanism as regular huskets (idb), but kept as a named helper
  // so callers can be explicit about intent.
  return getImageUrl(imageKey);
}

export async function createHusket(input: Omit<Husket, "id" | "imageKey">, imageBlob: Blob): Promise<Husket> {
  const store = loadStore();
  const id = crypto.randomUUID();
  const imageKey = `img:${id}`;

  const full: Husket = { ...input, id, imageKey };
  store.items.push(full);
  saveStore(store);

  await idbPutBlob(imageKey, imageBlob);

  return full;
}

export async function deleteHusketById(id: string): Promise<Husket | null> {
  const store = loadStore();
  const idx = store.items.findIndex((x) => x.id === id);
  if (idx === -1) return null;

  const [removed] = store.items.splice(idx, 1);
  saveStore(store);

  return removed ?? null;
}

/**
 * Deletes a received husket metadata entry from the local received store.
 * Note: image blob cleanup is intentionally not done here yet.
 */
export async function deleteReceivedHusketById(id: string): Promise<Husket | null> {
  const store = loadReceivedStore();
  const idx = store.items.findIndex((x) => x.id === id);
  if (idx === -1) return null;

  const [removed] = store.items.splice(idx, 1);
  saveReceivedStore(store);

  return removed ?? null;
}

export async function importHusketFromSky(input: {
  id: string;
  husket: Omit<Husket, "id" | "imageKey">;
  imageBlob: Blob;
}): Promise<Husket> {
  const store = loadStore();

  const existing = store.items.find((x) => x.id === input.id);
  if (existing) return existing;

  const imageKey = `skyimg:${input.id}`;
  const full: Husket = { ...input.husket, id: input.id, imageKey };

  await idbPutBlob(imageKey, input.imageBlob);

  store.items.push(full);
  saveStore(store);

  return full;
}

/**
 * ✅ NEW: Import a received Husket (Sky sharing) into a separate local store.
 * This prevents mixing received items with the user's own memories.
 */
export async function importReceivedHusketFromSky(input: {
  id: string;
  husket: Omit<Husket, "id" | "imageKey">;
  imageBlob: Blob;
}): Promise<Husket> {
  const store = loadReceivedStore();

  const existing = store.items.find((x) => x.id === input.id);
  if (existing) return existing;

  const imageKey = `skyrecvimg:${input.id}`;
  const full: Husket = { ...input.husket, id: input.id, imageKey };

  await idbPutBlob(imageKey, input.imageBlob);

  store.items.push(full);
  saveReceivedStore(store);

  return full;
}
