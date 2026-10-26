import type { Language } from "./i18n";
export const locale = (language: Language) => language === "en" ? "en-GB" : "tr-TR";
const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(language: string, time = false) {
  const key = language + String(time);
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(language, time
    ? { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }
    : { timeZone: "Europe/Istanbul", day: "2-digit", month: "short", year: "numeric" }));
  return cache.get(key)!;
}
export function stamp(value: string | Date | null | undefined, language: Language) {
  if (!value) return "—";
  const date = new Date(value);
  return formatter(locale(language)).format(date) + " · " + formatter(locale(language), true).format(date);
}
export const localDate = (value: string | Date = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date(value));
export function currentSchedule() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  return { date: localDate(), slot: hour < 8 ? "00:00-08:00" : hour < 16 ? "08:00-16:00" : "16:00-00:00" };
}
export function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}
export const boardKinds = ["TASK", "VALVE", "ATTENTION"];
