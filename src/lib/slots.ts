import type { BoardRow } from "./types";
import type { PillTone } from "@/components/ui";
import { MAX_PER_SLOT } from "./config";

export interface SlotStatus {
  label: string;
  tone: PillTone;
  action: "Book" | "Join" | "View" | null;
  actionTone: "primary" | "amber" | "soft";
}

/** Can I book or join this slot now? Uses the database's answer when it has one. */
export function isBookable(r: BoardRow): boolean {
  if (typeof r.bookable === "boolean") return r.bookable;
  return !r.closed && !r.is_past && !r.is_mine && r.booked < MAX_PER_SLOT;
}

export function slotStatus(r: BoardRow): SlotStatus {
  const none = { action: null, actionTone: "primary" as const };
  if (r.closed) return { label: "Closed", tone: "danger", ...none };
  if (r.is_mine) {
    const alone = r.booked === 1;
    return {
      label: alone ? "You're alone · 1/3" : `You're booked · ${r.booked}/3`,
      tone: alone ? "amber" : "mine",
      action: "View",
      actionTone: "soft",
    };
  }
  if (r.mine_elsewhere) return { label: `Booked at ${r.mine_elsewhere}`, tone: "info", action: "View", actionTone: "soft" };
  if (r.is_past) return { label: `Finished · ${r.booked}/3`, tone: "full", ...none };
  if (r.booked >= MAX_PER_SLOT) return { label: "Full · 3/3", tone: "full", ...none };
  if (!isBookable(r)) return { label: r.booked === 0 ? "Booking closed" : `Booking closed · ${r.booked}/3`, tone: "full", ...none };
  if (r.booked === 0) return { label: "Open · 0/3", tone: "open", action: "Book", actionTone: "primary" };
  if (r.booked === 1) return { label: "Needs a companion · 1/3", tone: "amber", action: "Join", actionTone: "amber" };
  return { label: "Ready · 2/3", tone: "ok", action: "Join", actionTone: "primary" };
}
