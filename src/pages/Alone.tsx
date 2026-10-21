import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Check } from "lucide-react";
import { SubPage } from "@/components/AppShell";
import InvitePanel, { canInvite } from "@/components/InvitePanel";
import { Button, Empty, Sheet, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { supabase, errorText } from "@/lib/supabase";
import { fmtDate, fmtDay, fmtRange, fmtTime } from "@/lib/format";
import { loadMyBookings, type MyBooking } from "@/lib/myBookings";
import type { Alternative } from "@/lib/types";

export default function Alone() {
  const { bookingId } = useParams();
  const { profile } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [b, setB] = useState<MyBooking | null | undefined>(undefined);
  const [alts, setAlts] = useState<Alternative[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const mine = await loadMyBookings(profile.id).catch(() => []);
    const found = mine.find((x) => x.id === bookingId) ?? null;
    setB(found);
    if (found) {
      const { data } = await supabase.rpc("same_day_alternatives", { p_date: found.slot_date });
      setAlts(((data as Alternative[]) ?? []).filter((a) => !(a.location_id === found.location_id && a.time_slot_id === found.time_slot_id)));
    }
  }, [bookingId, profile]);
  useEffect(() => {
    load();
  }, [load]);

  async function move(a: Alternative) {
    if (!b) return;
    setBusy(a.location_id + a.time_slot_id);
    const { error } = await supabase.rpc("move_booking", { p_booking: b.id, p_location: a.location_id, p_slot: a.time_slot_id });
    setBusy(null);
    if (error) return toast(errorText(error), "error");
    toast(`Moved to ${a.location_name}, ${fmtTime(a.start_time)}`);
    nav("/profile");
  }

  async function askAll() {
    if (!b) return;
    setBusy("ask");
    const { data, error } = await supabase.rpc("ask_all_free", { p_booking: b.id });
    setBusy(null);
    if (error) return toast(errorText(error), "error");
    toast(data ? `Sent to ${data} publisher${data === 1 ? "" : "s"}` : "No one else is free at that time", data ? "ok" : "info");
  }

  async function cancel() {
    if (!b) return;
    setBusy("cancel");
    const { error } = await supabase.rpc("cancel_booking", { p_booking: b.id });
    setBusy(null);
    if (error) return toast(errorText(error), "error");
    toast("Booking cancelled", "info");
    nav("/home");
  }

  if (b === undefined) return <SubPage title="Find a companion" back="/profile"><Spinner /></SubPage>;
  if (b === null)
    return (
      <SubPage title="Find a companion" back="/profile">
        <Empty>This booking is no longer active. <Link to="/home" className="font-bold">Open the schedule</Link></Empty>
      </SubPage>
    );

  const [sh, sm] = b.start_time.split(":").map(Number);
  const releaseTime = fmtTime(`${String(Math.max(0, sh - 1)).padStart(2, "0")}:${String(sm).padStart(2, "0")}`);

  if (b.count > 1)
    return (
      <SubPage title="Find a companion" back="/profile">
        <div className="flex items-center gap-3 rounded-2xl bg-ok-soft px-4 py-4 text-ok-ink">
          <Check size={22} aria-hidden="true" />
          <div className="text-sm font-bold">You have a companion now: {b.companions.join(", ")}.</div>
        </div>
        <Button className="mt-4 w-full" onClick={() => nav("/profile")}>Back to my sessions</Button>
      </SubPage>
    );

  return (
    <SubPage title={`${fmtDay(b.slot_date)} · ${b.location_name}`} back="/profile">
      <div className="rounded-[18px] bg-amber-soft p-4 text-[#5E3906]">
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={22} className="text-amber-ink" aria-hidden="true" />
          <div className="text-base font-extrabold text-[#4A2D04]">You're alone in this slot</div>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed">
          {fmtRange(b.start_time, b.end_time)}. Your booking is still active. Join a pair below or bring a companion. If no one is found, it's released
          automatically at <b>{releaseTime} on {fmtDate(b.slot_date)}</b> (1 hour before the start).
        </p>
        <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-xs font-bold">
          <Check size={16} aria-hidden="true" /> Your Service Overseer can see this and may help.
        </div>
      </div>

      <div className="mt-5 flex items-baseline justify-between">
        <div className="text-[15px] font-extrabold">Join others on the same day</div>
        <div className="text-xs font-semibold text-muted">Any location</div>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {alts.length === 0 ? (
          <Empty>No other sessions with people on this day yet.</Empty>
        ) : (
          alts.map((a) => (
            <div key={a.location_id + a.time_slot_id} className={`flex items-center gap-2.5 rounded-2xl border bg-white py-2.5 pl-3.5 pr-2.5 ${a.booked === 1 ? "border-amber-line" : "border-line"}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold">{a.location_name} · {fmtTime(a.start_time)}</div>
                <div className="truncate text-xs text-muted">{a.publishers.join(" & ")} · {a.booked}/3{a.booked === 1 ? " · also alone" : ""}</div>
              </div>
              <Button variant={a.booked === 1 ? "amber" : "primary"} className="h-11 px-3 text-[13px]" busy={busy === a.location_id + a.time_slot_id} onClick={() => move(a)}>
                {a.booked === 1 ? "Pair up" : "Move here"}
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 text-[15px] font-extrabold">Or keep your slot</div>
      <div className="mt-2 grid grid-cols-2 gap-2.5">
        {canInvite(b.slot_date) ? <Button variant="secondary" onClick={() => setInvite(true)}>Invite someone</Button> : null}
        <Button variant="secondary" busy={busy === "ask"} onClick={askAll} className={canInvite(b.slot_date) ? "" : "col-span-2"}>Ask all free</Button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">"Ask all free" sends an app notification to every approved publisher who is free at {fmtTime(b.start_time)}.</p>

      <Button variant="ghost" className="mt-6 w-full text-danger" busy={busy === "cancel"} onClick={cancel}>Cancel my booking</Button>

      <Sheet open={invite} onClose={() => setInvite(false)} title="Invite a companion">
        <InvitePanel slot={b} onDone={() => { setInvite(false); load(); }} />
      </Sheet>
    </SubPage>
  );
}
