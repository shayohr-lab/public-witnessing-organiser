import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AppShell from "@/components/AppShell";
import SlotSheet from "@/components/SlotSheet";
import { Pill, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { supabase, errorText } from "@/lib/supabase";
import { addDays, dowLong, dowShort, fmtDate, fmtTime, isoDow, mondayOf, todayISO } from "@/lib/format";
import { slotStatus } from "@/lib/slots";
import { useLive } from "@/lib/useLive";
import { useAuth } from "@/lib/auth";
import { WEEKS_AHEAD } from "@/lib/config";
import type { BoardRow } from "@/lib/types";

function readPref(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
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

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("week_board", { p_from: weekStart, p_to: addDays(weekStart, 5) });
    if (error) {
      toast(errorText(error), "error");
      setRows([]);
      return;
    }
    setRows(data as BoardRow[]);
  }, [weekStart, toast]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);
  useLive("bookings", load, 60000);

  const locations = useMemo(() => {
    const seen = new Map<string, string>();
    (rows ?? []).forEach((r) => seen.set(r.location_id, r.location_name));
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  useEffect(() => {
    if (locations.length && (!locId || !locations.some((l) => l.id === locId))) setLocId(locations[0].id);
  }, [locations, locId]);

  // keep the open sheet in sync with live data
  useEffect(() => {
    if (!open || !rows) return;
    const fresh = rows.find((r) => r.slot_date === open.slot_date && r.location_id === open.location_id && r.time_slot_id === open.time_slot_id);
    if (fresh && (fresh.booked !== open.booked || fresh.is_mine !== open.is_mine)) setOpen(fresh);
  }, [rows, open]);

  const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  const myDays = new Set((rows ?? []).filter((r) => r.is_mine).map((r) => r.slot_date));
  const slots = (rows ?? []).filter((r) => r.slot_date === day && r.location_id === locId);
  const locName = locations.find((l) => l.id === locId)?.name ?? "";

  const minWeek = thisMonday;
  const maxWeek = mondayOf(addDays(today, WEEKS_AHEAD * 7));
  function moveWeek(n: number) {
    const w = addDays(weekStart, n * 7);
    if (w < minWeek || w > maxWeek) return;
    setWeekStart(w);
    setDay(w < today && w === thisMonday ? firstDay : w);
  }

  function pickLoc(id: string) {
    setLocId(id);
    params.delete("location");
    setParams(params, { replace: true });
  }

  return (
    <AppShell title="Schedule">
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
          const past = d < today;
          return (
            <button
              key={d}
              role="tab"
              aria-selected={on}
              aria-label={`${dowLong(d)} ${fmtDate(d)}${myDays.has(d) ? ", you have a booking" : ""}`}
              onClick={() => setDay(d)}
              className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl border ${on ? "border-primary bg-primary text-white" : "border-line bg-white"} ${past && !on ? "opacity-50" : ""}`}
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
            const names = r.publishers.map((p) => (p.id === profile?.id ? "You" : p.full_name));
            const dim = r.is_past || r.closed || (!st.action && !r.is_mine);
            return (
              <div
                key={r.time_slot_id}
                className={`flex min-h-[64px] items-center gap-2.5 rounded-2xl py-2 pl-3.5 pr-2.5 ${dim ? "bg-[#EEF0EC]" : "bg-white"} ${r.is_mine ? "border-2 border-primary" : "border border-line"}`}
              >
                <div className="w-[74px] flex-none">
                  <div className="text-sm font-extrabold">{fmtTime(r.start_time)}</div>
                  <div className="text-[11px] font-semibold text-muted">to {fmtTime(r.end_time)}</div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="self-start"><Pill tone={st.tone}>{st.label}</Pill></span>
                  <span className="truncate text-xs text-muted">
                    {r.closed ? "Location closed today" : names.length ? names.join(", ") : r.is_past ? "—" : "Be the first — invite a companion"}
                  </span>
                </div>
                {st.action ? (
                  <button
                    onClick={() => setOpen(r)}
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

      <SlotSheet row={open} onClose={() => setOpen(null)} onChanged={load} />
    </AppShell>
  );
}
