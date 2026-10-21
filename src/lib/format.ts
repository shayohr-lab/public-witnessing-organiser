import { TIME_ZONE } from "./config";

/** Today's date in Dar es Salaam as YYYY-MM-DD. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

/** 1 = Monday … 7 = Sunday */
export function isoDow(iso: string): number {
  const d = parseISO(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

export function mondayOf(iso: string): string {
  return addDays(iso, 1 - isoDow(iso));
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** 28/10/26 */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/** Wed 28/10/26 */
export function fmtDay(iso: string): string {
  return `${DOW[isoDow(iso) - 1]} ${fmtDate(iso)}`;
}

export function dowShort(iso: string): string {
  return DOW[isoDow(iso) - 1];
}

export function dowLong(iso: string): string {
  return DOW_LONG[isoDow(iso) - 1];
}

/** "06:30:00" → "6:30 AM" */
export function fmtTime(t: string): string {
  const [hh, mm] = t.split(":").map(Number);
  const ampm = hh >= 12 ? "PM" : "AM";
  const h = hh % 12 === 0 ? 12 : hh % 12;
  return `${h}:${String(mm).padStart(2, "0")} ${ampm}`;
}

export function fmtRange(start: string, end: string): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

/** Session start as a real instant (Dar es Salaam is UTC+3 all year). */
export function slotStart(dateISO: string, time: string): Date {
  return new Date(`${dateISO}T${time.slice(0, 5)}:00+03:00`);
}

export function timeAgo(ts: string): string {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
  return fmtDate(d);
}

/** Keeps digits; 07xxxxxxxx → 2557xxxxxxxx; 9 digits → 255 + digits. */
export function phoneDigits(input: string): string {
  let d = (input || "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("0")) d = "255" + d.slice(1);
  if (d.length === 9) d = "255" + d;
  return d;
}

/** +255 712 345 678 */
export function fmtPhone(p?: string | null): string {
  const d = phoneDigits(p || "");
  if (d.length === 12 && d.startsWith("255")) return `+255 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  return p || "";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** wa.me link with a prefilled message. */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const d = phoneDigits(phone || "");
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
