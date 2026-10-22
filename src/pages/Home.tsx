import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarCheck, ChevronLeft, ChevronRight, Mail, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import SlotSheet from "@/components/SlotSheet";
import PersonSheet from "@/components/PersonSheet";
import { Pill, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { supabase, errorText } from "@/lib/supabase";
import { addDays, dowLong, dowShort, firstName, fmtDate, fmtDay, fmtRange, fmtTime, isoDow, mondayOf, slotStart, todayISO } from "@/lib/format";
import { isBookable, slotStatus } from "@/lib/slots";
import { useLive } from "@/lib/useLive";
import { useAuth } from "@/lib/auth";
import { loadMyBookings, type MyBooking } from "@/lib/myBookings";
import { WEEKS_AHEAD } from "@/lib/config";
import type { BoardRow } from "@/lib/types";

function readPref(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** A day worth opening: something I can still book, or one of my own sessions still to come. */
function usefulDay(rows: BoardRow[], d: string): boolean {
  return rows.some((r) => r.slot_date === d && (isBookable(r) || (r.is_mine && !r.is_past)));
}

export default function Home() {
  const toast = useToast();
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const thisMonday = mondayOf(today);
  const firstDay = isoDow(today) === 7 ? addDays(today, 1) : today;

  const [weekStart, setWeekStart] = useState(mondayOf(firstDay));
  const [day, setDay] = useState(firstDay);
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [locId, setLocId] = useState<string | null>(params.get("location") || readPref("pwo.defaultLocation"));
  const [open, setOpen] = useState<BoardRow | null>(null);
  const [person, setPerson] = useState<{ id: string; full_name: string } | null>(null);
  const [nextUp, setNextUp] = useState<MyBooking | null>(null);
  const [invites, setInvites] = useState(0);
  const [hideBanner, setHideBanner] = useState(false);
  // open Home on a day that can still be booked, not on a day that is already finished
  const autoPick = useRef(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("week_board", { p_from: weekStart, p_to: addDays(weekStart, 5) });
    if (error) {
      toast(errorText(error), "error");
      setRows([]);
      return;
    }
    setRows(data as BoardRow[]);
  }, [weekStart, toast]);

  const loadMine = useCallback(async () => {
    if (!profile) return;
    const [mine, inv] = await Promise.all([
      loadMyBookings(profile.id).catch(() => [] as MyBooking[]),
      supabase.from("invitations").select("id", { count: "exact", head: true }).eq("to_id", profile.id).eq("status", "pending"),
    ]);
    setNextUp(mine.find((b) => slotStart(b.slot_date, b.end_time).getTime() > Date.now()) ?? null);
    setInvites(inv.count ?? 0);
  }, [profile]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);
  useEffect(() => {
    loadMine();
  }, [loadMine]);
  const reloadAll = useCallback(() => { load(); loadMine(); }, [load, loadMine]);
  useLive("bookings", reloadAll, 60000);

  useEffect(() => {
    if (!rows || !autoPick.current) return;
    const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)).filter((d) => d >= today);
    const pick = days.find((d) => usefulDay(rows, d));
    if (pick) {
      autoPick.current = false;
      setDay(pick);
    } else if (weekStart === mondayOf(firstDay)) {
      // nothing left this week: show next week
      const nextWeek = addDays(weekStart, 7);
      setWeekStart(nextWeek);
      setDay(nextWeek);
    } else autoPick.current = false;
  }, [rows, weekStart, today, firstDay]);

  const locations = useMemo(() => {
    const seen = new Map<string, string>();
    (rows ?? []).forEach((r) => seen.set(r.location_id, r.location_name));
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  useEffect(() => {
    if (locations.length && (!locId || !locations.some((l) => l.id === locId))) setLocId(locations[0].id);
  }, [locations, locId]);

  const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  const myDays = new Set((rows ?? []).filter((r) => r.is_mine).map((r) => r.slot_date));
  const slots = (rows ?? []).filter((r) => r.slot_date === day && r.location_id === locId);
  const locName = locations.find((l) => l.id === locId)?.name ?? "";

  const minWeek = thisMonday;
  const maxWeek = mondayOf(addDays(today, WEEKS_AHEAD * 7));
  function moveWeek(n: number) {
    const w = addDays(weekStart, n * 7);
    if (w < minWeek || w > maxWeek) return;
    autoPick.current = true;
    setWeekStart(w);
    setDay(w < today && w === thisMonday ? firstDay : w);
  }

  function pickLoc(id: string) {
    setLocId(id);
    params.delete("location");
    setParams(params, { replace: true });
  }

  /** "Booked at Kibada" → show that location at the same time. */
  function goToLocation(name: string, slotId: string) {
    const target = locations.find((l) => l.name === name);
    if (!target) return;
    pickLoc(target.id);
    setTimeout(() => document.getElementById(`slot-${slotId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  function goToBooking(b: MyBooking) {
    autoPick.current = false;
    setWeekStart(mondayOf(b.slot_date));
    setDay(b.slot_date);
    pickLoc(b.location_id);
  }

  return (
    <AppShell title="Schedule">
      {invites > 0 && !hideBanner ? (
        <div className="mb-3 flex items-center gap-2.5 rounded-2xl border border-primary bg-primary-soft py-2 pl-3.5 pr-1.5">
          <Mail size={18} className="flex-none text-primary" aria-hidden="true" />
          <Link to="/invites" className="flex-1 py-1.5 text-[13px] font-bold text-primary-dark">
            You have {invites} invitation{invites === 1 ? "" : "s"} waiting — tap to answer
          </Link>
          <button aria-label="Hide" onClick={() => setHideBanner(true)} className="flex h-9 w-9 items-center justify-center rounded-lg text-primary-dark">
            <X size={16} />
          </button>
        </div>
      ) : null}

      {nextUp ? (
        <button onClick={() => goToBooking(nextUp)} className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-left text-white">
          <CalendarCheck size={20} className="flex-none text-[#F2B45C]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold tracking-[0.06em] text-[#F2B45C]">YOUR NEXT SESSION</div>
            <div className="text-sm font-bold">{fmtDay(nextUp.slot_date)} · {fmtRange(nextUp.start_time, nextUp.end_time)}</div>
            <div className="text-xs font-semibold text-[#B9C4C8]">{nextUp.location_name}</div>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${nextUp.count === 1 ? "bg-amber-soft text-amber-ink" : "bg-ok-soft text-ok-ink"}`}>
            {nextUp.count}/3
          </span>
        </button>
      ) : null}

      <div className="flex items-center justify-between">
        <button aria-label="Previous week" onClick={() => moveWeek(-1)} disabled={weekStart <= minWeek} className="flex h-11 w-11 items-center justify-center rounded-xl disabled:opacity-30">
          <ChevronLeft size={22} />
        </button>
        <div className="text-sm font-bold">Week {fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 5))}</div>
        <button aria-label="Next week" onClick={() => moveWeek(1)} disabled={weekStart >= maxWeek} className="flex h-11 w-11 items-center justify-center rounded-xl disabled:opacity-30">
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-6 gap-1.5" role="tablist" aria-label="Day">
        {days.map((d) => {
          const on = d === day;
          const done = d < today || (rows !== null && d === today && !usefulDay(rows, d) && !myDays.has(d));
          return (
            <button
              key={d}
              role="tab"
              aria-selected={on}
              aria-label={`${dowLong(d)} ${fmtDate(d)}${myDays.has(d) ? ", you have a booking" : ""}`}
              onClick={() => { autoPick.current = false; setDay(d); }}
              className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl border ${on ? "border-primary bg-primary text-white" : "border-line bg-white"} ${done && !on ? "opacity-50" : ""}`}
            >
              <span className="text-[11px] font-semibold opacity-85">{dowShort(d)}</span>
              <span className="text-[17px] font-extrabold">{d.slice(8)}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${myDays.has(d) ? (on ? "bg-[#F2B45C]" : "bg-amber-strong") : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Location">
        {locations.map((l) => (
          <button
            key={l.id}
            role="tab"
            aria-selected={l.id === locId}
            onClick={() => pickLoc(l.id)}
            className={`h-11 flex-1 whitespace-nowrap rounded-full border px-4 text-[13px] font-bold ${l.id === locId ? "border-ink bg-ink text-white" : "border-line2"}`}
          >
            {l.name}
          </button>
        ))}
      </div>

      <div className="mt-3 flex justify-between text-xs font-semibold text-muted">
        <span>{dowLong(day)} {fmtDate(day)} · {locName}</span>
        <span>2–3 publishers per slot</span>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {rows === null ? (
          <Spinner label="Loading schedule" />
        ) : isoDow(day) === 7 ? null : slots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No sessions for this day.</p>
        ) : (
          slots.map((r) => {
            const st = slotStatus(r);
            const dim = r.closed || (r.is_past && !r.is_mine) || (!st.action && !r.is_mine);
            const invitedBy = r.invited_by ?? [];
            return (
              <div
                key={r.time_slot_id}
                id={`slot-${r.time_slot_id}`}
                className={`flex min-h-[64px] items-center gap-2.5 rounded-2xl py-2 pl-3.5 pr-2.5 ${dim ? "bg-[#EEF0EC]" : "bg-white"} ${r.is_mine ? "border-2 border-primary" : "border border-line"}`}
              >
                <div className="w-[74px] flex-none">
                  <div className="text-sm font-extrabold">{fmtTime(r.start_time)}</div>
                  <div className="text-[11px] font-semibold text-muted">to {fmtTime(r.end_time)}</div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="self-start"><Pill tone={st.tone}>{st.label}</Pill></span>
                  <span className="text-xs text-muted">
                    {r.closed ? (
                      "Location closed this day"
                    ) : r.publishers.length ? (
                      r.publishers.map((p, i) => (
                        <Fragment key={p.id}>
                          {i > 0 ? (i === r.publishers.length - 1 ? " & " : ", ") : null}
                          <button
                            onClick={() => setPerson(p)}
                            className="font-semibold text-open-ink underline decoration-line2 underline-offset-2 hover:text-primary"
                            aria-label={`See ${p.full_name}'s bookings this month`}
                          >
                            {firstName(p.full_name)}
                          </button>
                        </Fragment>
                      ))
                    ) : r.is_past ? (
                      "—"
                    ) : isBookable(r) ? (
                      "Be the first — invite a companion"
                    ) : (
                      "—"
                    )}
                  </span>
                  {invitedBy.length && !r.is_mine ? (
                    <Link to="/invites" className="self-start text-xs font-bold text-primary">
                      {joinInviters(invitedBy.map((i) => i.full_name))} invited you · Respond →
                    </Link>
                  ) : null}
                </div>
                {st.action ? (
                  <button
                    onClick={() => (r.mine_elsewhere && !r.is_mine ? goToLocation(r.mine_elsewhere, r.time_slot_id) : setOpen(r))}
                    className={`h-11 min-w-[64px] rounded-xl px-3 text-[13px] font-extrabold ${
                      st.actionTone === "amber" ? "bg-amber-strong text-white" : st.actionTone === "soft" ? "bg-primary-soft text-primary-dark" : "bg-primary text-white"
                    }`}
                  >
                    {st.action}
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <SlotSheet row={open} rows={rows ?? []} onClose={() => setOpen(null)} onChanged={reloadAll} />
      <PersonSheet person={person} month={day} onClose={() => setPerson(null)} />
    </AppShell>
  );
}

function joinInviters(names: string[]): string {
  return names.length > 1 ? `${names[0]} and ${names.length - 1} other${names.length > 2 ? "s" : ""}` : names[0];
}
