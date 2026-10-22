import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, MapPin } from "lucide-react";
import { supabase, errorText } from "@/lib/supabase";
import { fmtDay, fmtRange, fmtTime } from "@/lib/format";
import { useCongregation } from "@/lib/congregation";
import type { BoardRow } from "@/lib/types";
import { Avatar, Button, Pill, Sheet } from "./ui";
import { isBookable, slotStatus } from "@/lib/slots";
import InvitePanel, { canInvite } from "./InvitePanel";
import { useToast } from "./Toast";

const keyOf = (r: BoardRow) => `${r.slot_date}|${r.location_id}|${r.time_slot_id}`;

/**
 * Book / join / view one slot.
 * After booking it shows a success step: invite a companion (if you were first) and
 * "Book the next session too?" so back-to-back sessions can be booked one after another.
 */
export default function SlotSheet({
  row,
  rows,
  onClose,
  onChanged,
}: {
  row: BoardRow | null;
  rows: BoardRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const nav = useNavigate();
  const { booking_cutoff } = useCongregation();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"details" | "done" | "invite">("details");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [curKey, setCurKey] = useState<string | null>(null);
  const [wasEmpty, setWasEmpty] = useState(false);

  useEffect(() => {
    setCurKey(row ? keyOf(row) : null);
    setStage("details");
    setConfirmCancel(false);
  }, [row]);

  if (!row) return null;
  // always show the freshest data for the slot on screen
  const cur = rows.find((r) => keyOf(r) === curKey) ?? row;
  const st = slotStatus(cur);
  const mine = cur.is_mine;
  const canBook = isBookable(cur);
  const next = rows
    .filter((r) => r.slot_date === cur.slot_date && r.location_id === cur.location_id && r.start_time >= cur.end_time)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];

  const close = () => {
    setStage("details");
    setConfirmCancel(false);
    onClose();
  };

  async function book(target: BoardRow) {
    setBusy(true);
    const { error } = await supabase.rpc("book_slot", { p_location: target.location_id, p_date: target.slot_date, p_slot: target.time_slot_id });
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    toast(`Booked ${fmtTime(target.start_time)} – ${fmtTime(target.end_time)}`);
    setWasEmpty(target.booked === 0);
    setCurKey(keyOf(target));
    setStage("done");
    onChanged();
  }

  async function cancel() {
    if (!cur.my_booking_id) return;
    setBusy(true);
    const { error } = await supabase.rpc("cancel_booking", { p_booking: cur.my_booking_id });
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    toast("Booking cancelled", "info");
    onChanged();
    close();
  }

  const title =
    stage === "invite" ? "Invite a companion" : stage === "done" ? "Booking confirmed" : mine ? "Your session" : st.action === "Join" ? "Join this session" : "Book this slot";
  const cutoff = fmtTime(booking_cutoff);

  return (
    <Sheet open onClose={close} title={title}>
      <div className="text-sm font-semibold text-muted">
        {fmtDay(cur.slot_date)} · {fmtRange(cur.start_time, cur.end_time)} · {cur.location_name}
      </div>

      {stage === "invite" ? (
        <div className="mt-4">
          <InvitePanel slot={cur} max={Math.max(1, 3 - Math.max(cur.booked, 1))} onDone={() => setStage("done")} />
          <Button variant="ghost" className="mt-2 w-full" onClick={() => setStage("done")}>Not now</Button>
        </div>
      ) : stage === "done" ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex gap-2.5 rounded-2xl bg-ok-soft px-4 py-3 text-ok-ink">
            <CheckCircle2 size={20} className="mt-0.5 flex-none" aria-hidden="true" />
            <div className="text-[13px] leading-snug">
              <b>You're booked.</b> {cur.booked >= 2 ? `${cur.booked} publishers in this session.` : "Sessions need at least 2 publishers."}
            </div>
          </div>

          {wasEmpty && canInvite(cur.slot_date) ? (
            <Button variant="secondary" onClick={() => setStage("invite")}>Invite a companion</Button>
          ) : wasEmpty ? (
            <p className="text-xs text-muted">Invitations close 2 days before the session. Use "Find a companion" from the schedule instead.</p>
          ) : null}

          {next && !next.is_mine && isBookable(next) ? (
            <div className="rounded-2xl border border-line p-3.5">
              <div className="text-sm font-extrabold">Book the next session too?</div>
              <div className="mt-0.5 text-xs text-muted">
                {fmtRange(next.start_time, next.end_time)} · {cur.location_name} · {next.booked}/3 booked
              </div>
              <Button className="mt-2.5 w-full" busy={busy} onClick={() => book(next)}>
                Book {fmtTime(next.start_time)} – {fmtTime(next.end_time)}
              </Button>
            </div>
          ) : null}

          <Button variant={next && isBookable(next) ? "ghost" : "primary"} onClick={close}>Done</Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3.5">
          <div className="flex items-center gap-3 rounded-2xl bg-ground px-4 py-3">
            <MapPin size={20} className="text-primary" aria-hidden="true" />
            <div className="flex-1 font-bold">{cur.location_name}</div>
            <Pill tone={st.tone}>{st.label}</Pill>
          </div>

          {cur.publishers.length ? (
            <div className="rounded-2xl border border-line">
              {cur.publishers.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
                  <Avatar name={p.full_name} />
                  <span className="text-sm font-bold">{p.full_name}</span>
                </div>
              ))}
            </div>
          ) : null}

          {cur.invited_by?.length ? (
            <div className="rounded-2xl bg-primary-soft px-4 py-3 text-[13px] text-primary-dark">
              <b>{cur.invited_by.map((i) => i.full_name).join(", ")}</b> invited you to this session.{" "}
              <button className="font-extrabold underline" onClick={() => nav("/invites")}>Answer the invitation</button>
            </div>
          ) : null}

          {!mine && !cur.is_past && canBook ? (
            <div className="flex items-center gap-2 text-xs font-semibold text-muted">
              <Clock size={14} aria-hidden="true" />
              {cur.booking_open === false
                ? "Booking for this day has closed, but you can still join a publisher who is alone."
                : `Booking for ${fmtDay(cur.slot_date)} closes at ${cutoff} that morning.`}
            </div>
          ) : null}

          {!mine && cur.booked === 0 && canBook ? (
            <div className="flex gap-2.5 rounded-2xl bg-amber-soft px-4 py-3 text-[#5E3906]">
              <AlertTriangle size={20} className="mt-0.5 flex-none text-amber-ink" aria-hidden="true" />
              <div className="text-[13px] leading-snug">
                <b>No one else is booked yet.</b> Sessions need at least 2 publishers — invite a companion after booking.
              </div>
            </div>
          ) : null}

          {mine && cur.booked === 1 && !cur.is_past ? (
            <div className="flex gap-2.5 rounded-2xl bg-amber-soft px-4 py-3 text-[#5E3906]">
              <AlertTriangle size={20} className="mt-0.5 flex-none text-amber-ink" aria-hidden="true" />
              <div className="text-[13px] leading-snug">
                <b>You're alone in this slot.</b> If no one joins, it is released automatically 1 hour before the start.
              </div>
            </div>
          ) : null}

          {mine && cur.is_past ? (
            <p className="text-sm text-muted">This session has finished.</p>
          ) : mine ? (
            <div className="mt-1 flex flex-col gap-2.5">
              {cur.booked === 1 && cur.my_booking_id ? (
                <Button variant="amber" onClick={() => nav(`/alone/${cur.my_booking_id}`)}>Find a companion</Button>
              ) : null}
              {cur.booked < 3 && canInvite(cur.slot_date) ? (
                <Button variant="secondary" onClick={() => setStage("invite")}>Invite someone</Button>
              ) : null}
              {next && !next.is_mine && isBookable(next) ? (
                <Button variant="secondary" busy={busy} onClick={() => book(next)}>
                  Also book {fmtTime(next.start_time)} – {fmtTime(next.end_time)}
                </Button>
              ) : null}
              {confirmCancel ? (
                <div className="rounded-2xl border border-danger/30 bg-danger-soft p-3">
                  <p className="text-sm font-semibold text-danger">Cancel this booking? {cur.booked === 2 ? "Your companion will be left alone." : ""}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep it</Button>
                    <Button variant="danger" busy={busy} onClick={cancel}>Yes, cancel</Button>
                  </div>
                </div>
              ) : (
                <Button variant="danger" onClick={() => setConfirmCancel(true)}>Cancel my booking</Button>
              )}
            </div>
          ) : st.action && st.action !== "View" ? (
            <div className="mt-1 grid grid-cols-[1fr_2fr] gap-2.5">
              <Button variant="secondary" onClick={close}>Cancel</Button>
              <Button variant={st.action === "Join" && cur.booked === 1 ? "amber" : "primary"} busy={busy} onClick={() => book(cur)}>
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
