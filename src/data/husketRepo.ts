// ===============================
// src/data/husketRepo.ts
// ===============================
import type { Husket } from "../domain/types";
import { readJson, writeJson } from "../storage/local";
import { idbGetBlob, idbPutBlob } from "../storage/idb";

const KEY = "husket.items.v1";

export type HusketStore = {
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

export function listHuskets(life: Husket["life"]): Husket[] {
  const store = loadStore();
  return store.items
    .filter((x) => x.life === life)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function countAllHuskets(): number {
  const store = loadStore();
  return store.items.length;
}

export async function getImageUrl(imageKey: string): Promise<string | null> {
  const blob = await idbGetBlob(imageKey);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function createHusket(input: {
  husket: Omit<Husket, "id">;
  imageBlob: Blob;
}): Promise<Husket> {
  const store = loadStore();
  const id = crypto.randomUUID();
  const full: Husket = { ...input.husket, id };

  await idbPutBlob(full.imageKey, input.imageBlob);

  store.items.push(full);
  saveStore(store);

  return full;
}

export async function getHusketById(id: string): Promise<Husket | null> {
  const store = loadStore();
  return store.items.find((x) => x.id === id) ?? null;
}


