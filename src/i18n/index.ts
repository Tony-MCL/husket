// ===============================
// src/i18n/index.ts
// ===============================
import type { LanguageCode } from "../domain/types";
import { en } from "./strings.en";
import { no } from "./strings.no";

export type I18nDict = typeof en;

function detectDeviceLanguage(): "no" | "en" {
  const lang = (navigator.language || "en").toLowerCase();
  if (lang.startsWith("no") || lang.startsWith("nb") || lang.startsWith("nn"))
    return "no";
  return "en";
}

export function getDict(language: LanguageCode): I18nDict {
  if (language === "no") return no;
  if (language === "en") return en;
  return detectDeviceLanguage() === "no" ? no : en;
}

export function tGet(dict: I18nDict, path: string): string {
  const parts = path.split(".");
  let cur: any = dict;
  for (const p of parts) {
    cur = cur?.[p];
  }
  return typeof cur === "string" ? cur : path;
}


