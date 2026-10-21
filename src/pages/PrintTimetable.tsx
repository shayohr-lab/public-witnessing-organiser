import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { addDays, dowShort, fmtDate, fmtRange, mondayOf, todayISO } from "@/lib/format";
import type { BoardRow } from "@/lib/types";

export default function PrintTimetable() {
  const [params] = useSearchParams();
  const week = params.get("week") || mondayOf(todayISO());
  const loc = params.get("location") || "all";
  const [rows, setRows] = useState<BoardRow[] | null>(null);

  useEffect(() => {
    supabase.rpc("week_board", { p_from: week, p_to: addDays(week, 5) }).then(({ data }) => setRows((data as BoardRow[]) ?? []));
  }, [week]);

  const days = Array.from({ length: 6 }, (_, i) => addDays(week, i));
  const byLoc = useMemo(() => {
    const m = new Map<string, { name: string; rows: BoardRow[] }>();
    (rows ?? []).filter((r) => loc === "all" || r.location_id === loc).forEach((r) => {
      if (!m.has(r.location_id)) m.set(r.location_id, { name: r.location_name, rows: [] });
      m.get(r.location_id)!.rows.push(r);
    });
    return [...m.values()];
  }, [rows, loc]);

  if (!rows) return <Spinner />;

  return (
    <div className="mx-auto max-w-[1100px] bg-white p-6 text-ink">
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <Link to="/settings" className="rounded-xl border border-line2 px-4 py-2.5 text-sm font-bold">← Back</Link>
        <button onClick={() => window.print()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Print / Save as PDF</button>
        <span className="text-xs text-muted">In the print dialog choose "Save as PDF".</span>
      </div>
      <h1 className="text-xl font-extrabold">Public Witnessing Timetable — Week {fmtDate(week)} – {fmtDate(addDays(week, 5))}</h1>
      {byLoc.map((l) => {
        const slots = [...new Map(l.rows.map((r) => [r.time_slot_id, r])).values()].sort((a, b) => a.start_time.localeCompare(b.start_time));
        return (
          <section key={l.name} className="mt-5 break-inside-avoid">
            <h2 className="mb-2 text-base font-extrabold text-primary">{l.name}</h2>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="border border-line bg-ink p-1.5 text-left text-white">Time</th>
                  {days.map((d) => <th key={d} className="border border-line bg-ink p-1.5 text-left text-white">{dowShort(d)} {fmtDate(d)}</th>)}
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => (
                  <tr key={s.time_slot_id}>
                    <td className="whitespace-nowrap border border-line p-1.5 font-bold">{fmtRange(s.start_time, s.end_time)}</td>
                    {days.map((d) => {
                      const c = l.rows.find((r) => r.slot_date === d && r.time_slot_id === s.time_slot_id);
                      return (
                        <td key={d} className="border border-line p-1.5 align-top">
                          {c?.closed ? <i className="text-muted">Closed</i> : c?.publishers.length ? c.publishers.map((p) => p.full_name).join(", ") : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
