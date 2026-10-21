import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, MapPin } from "lucide-react";
import { supabase, errorText } from "@/lib/supabase";
import { fmtDay, fmtRange } from "@/lib/format";
import type { BoardRow } from "@/lib/types";
import { Avatar, Button, Pill, Sheet } from "./ui";
import { slotStatus } from "@/lib/slots";
import InvitePanel, { canInvite } from "./InvitePanel";
import { useToast } from "./Toast";

/** Book / join / view one slot. After booking an empty slot it offers the invite step. */
export default function SlotSheet({ row, onClose, onChanged }: { row: BoardRow | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"details" | "invite">("details");
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!row) return null;
  const st = slotStatus(row);
  const mine = row.is_mine;
  const others = row.publishers;
  const close = () => {
    setStage("details");
    setConfirmCancel(false);
    onClose();
  };

  async function book() {
    if (!row) return;
    setBusy(true);
    const { error } = await supabase.rpc("book_slot", { p_location: row.location_id, p_date: row.slot_date, p_slot: row.time_slot_id });
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    toast("Booking confirmed");
    onChanged();
    if (row.booked === 0 && canInvite(row.slot_date)) setStage("invite");
    else close();
  }

  async function cancel() {
    if (!row?.my_booking_id) return;
    setBusy(true);
    const { error } = await supabase.rpc("cancel_booking", { p_booking: row.my_booking_id });
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    toast("Booking cancelled", "info");
    onChanged();
    close();
  }

  const title = stage === "invite" ? "Invite a companion" : mine ? "Your session" : st.action === "Join" ? "Join this session" : "Book this slot";

  return (
    <Sheet open onClose={close} title={title}>
      <div className="text-sm font-semibold text-muted">
        {fmtDay(row.slot_date)} · {fmtRange(row.start_time, row.end_time)}
      </div>

      {stage === "invite" ? (
        <div className="mt-4">
          <InvitePanel slot={row} onDone={close} />
          <Button variant="ghost" className="mt-2 w-full" onClick={close}>Not now</Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3.5">
          <div className="flex items-center gap-3 rounded-2xl bg-ground px-4 py-3">
            <MapPin size={20} className="text-primary" aria-hidden="true" />
            <div className="flex-1 font-bold">{row.location_name}</div>
            <Pill tone={st.tone}>{st.label}</Pill>
          </div>

          {others.length ? (
            <div className="rounded-2xl border border-line">
              {others.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
                  <Avatar name={p.full_name} />
                  <span className="text-sm font-bold">{p.full_name}</span>
                </div>
              ))}
            </div>
          ) : null}

          {!mine && row.booked === 0 ? (
            <div className="flex gap-2.5 rounded-2xl bg-amber-soft px-4 py-3 text-[#5E3906]">
              <AlertTriangle size={20} className="mt-0.5 flex-none text-amber-ink" aria-hidden="true" />
              <div className="text-[13px] leading-snug">
                <b>No one else is booked yet.</b> Sessions need at least 2 publishers — invite a companion after booking.
              </div>
            </div>
          ) : null}

          {mine && row.booked === 1 ? (
            <div className="flex gap-2.5 rounded-2xl bg-amber-soft px-4 py-3 text-[#5E3906]">
              <AlertTriangle size={20} className="mt-0.5 flex-none text-amber-ink" aria-hidden="true" />
              <div className="text-[13px] leading-snug">
                <b>You're alone in this slot.</b> If no one joins, it is released automatically 1 hour before the start.
              </div>
            </div>
          ) : null}

          {mine ? (
            <div className="mt-1 flex flex-col gap-2.5">
              {row.booked === 1 && row.my_booking_id ? (
                <Button variant="amber" onClick={() => nav(`/alone/${row.my_booking_id}`)}>Find a companion</Button>
              ) : null}
              {row.booked < 3 && canInvite(row.slot_date) ? (
                <Button variant="secondary" onClick={() => setStage("invite")}>Invite someone</Button>
              ) : null}
              {confirmCancel ? (
                <div className="rounded-2xl border border-danger/30 bg-danger-soft p-3">
                  <p className="text-sm font-semibold text-danger">Cancel this booking? {row.booked === 2 ? "Your companion will be left alone." : ""}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep it</Button>
                    <Button variant="danger" busy={busy} onClick={cancel}>Yes, cancel</Button>
                  </div>
                </div>
              ) : (
                <Button variant="danger" onClick={() => setConfirmCancel(true)}>Cancel my booking</Button>
              )}
            </div>
          ) : st.action ? (
            <div className="mt-1 grid grid-cols-[1fr_2fr] gap-2.5">
              <Button variant="secondary" onClick={close}>Cancel</Button>
              <Button variant={st.action === "Join" && row.booked === 1 ? "amber" : "primary"} busy={busy} onClick={book}>
                {st.action === "Join" ? "Join session" : "Confirm booking"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">This slot can't be booked.</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
