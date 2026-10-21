import type { BoardRow } from "./types";
import type { PillTone } from "@/components/ui";
import { MAX_PER_SLOT } from "./config";

export interface SlotStatus {
  label: string;
  tone: PillTone;
  action: "Book" | "Join" | "View" | null;
  actionTone: "primary" | "amber" | "soft";
}

export function slotStatus(r: BoardRow): SlotStatus {
  if (r.closed) return { label: "Closed", tone: "danger", action: null, actionTone: "primary" };
  if (r.is_mine) {
    const alone = r.booked === 1;
    return {
      label: alone ? "You're alone · 1/3" : `You're booked · ${r.booked}/3`,
      tone: alone ? "amber" : "mine",
      action: "View",
      actionTone: "soft",
    };
  }
  if (r.is_past) return { label: `${r.booked}/3 · finished`, tone: "full", action: null, actionTone: "primary" };
  if (r.booked >= MAX_PER_SLOT) return { label: "Full · 3/3", tone: "full", action: null, actionTone: "primary" };
  if (r.booked === 0) return { label: "Open · 0/3", tone: "open", action: "Book", actionTone: "primary" };
  if (r.booked === 1) return { label: "Needs a companion · 1/3", tone: "amber", action: "Join", actionTone: "amber" };
  return { label: "Ready · 2/3", tone: "ok", action: "Join", actionTone: "primary" };
}
