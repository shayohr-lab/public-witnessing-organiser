import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { Button, Card, Empty, Field, Input, Sheet, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { supabase, errorText } from "@/lib/supabase";
import { addDays, dowShort, fmtDate, fmtDay, fmtTime, mondayOf, slotStart, todayISO, whatsappLink } from "@/lib/format";
import { useLive } from "@/lib/useLive";
import type { BoardRow, Location } from "@/lib/types";

interface Closure { id: string; closed_on: string; reason: string | null; location_id: string; locations: { name: string } | null }

export default function Overview({ pending, onGoRegistrations }: { pending: number; onGoRegistrations: () => void }) {
  const toast = useToast();
  const thisWeek = mondayOf(todayISO());
  const [week, setWeek] = useState(thisWeek);
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [approved, setApproved] = useState(0);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [closures, setClosures] = useState<Closure[]>([]);
  const [closeOpen, setCloseOpen] = useState(false);

  const load = useCallback(async () => {
    const [b, p, c] = await Promise.all([
      supabase.rpc("week_board", { p_from: week, p_to: addDays(week, 5) }),
      supabase.from("profiles").select("id, phone").eq("status", "approved"),
      supabase.from("closures").select("id, closed_on, reason, location_id, locations(name)").gte("closed_on", todayISO()).order("closed_on"),
    ]);
    if (b.error) toast(errorText(b.error), "error");
    setRows((b.data as BoardRow[]) ?? []);
    setApproved(p.data?.length ?? 0);
    setPhones(Object.fromEntries((p.data ?? []).map((x) => [x.id, x.phone])));
    setClosures((c.data as unknown as Closure[]) ?? []);
  }, [week, toast]);
  useEffect(() => {
    load();
  }, [load]);
  useLive("bookings", load, 60000);

  const stats = useMemo(() => {
    const r = rows ?? [];
    const open = r.filter((x) => !x.closed);
    const covered = open.filter((x) => x.booked >= 2).length;
    const alone = r.filter((x) => x.booked === 1 && !x.is_past && !x.closed);
    const soon = alone.filter((x) => slotStart(x.slot_date, x.start_time).getTime() - Date.now() < 48 * 3600000).length;
    const active = new Set(r.flatMap((x) => x.publishers.map((p) => p.id))).size;
    return { total: open.length, covered, alone, soon, active };
  }, [rows]);

  const locs = useMemo(() => {
    const m = new Map<string, string>();
    (rows ?? []).forEach((r) => m.set(r.location_id, r.location_name));
    return [...m.entries()];
  }, [rows]);
  const days = Array.from({ length: 6 }, (_, i) => addDays(week, i));

  async function reopen(id: string) {
    const { error } = await supabase.from("closures").delete().eq("id", id);
    if (error) return toast(errorText(error), "error");
    toast("Location re-opened. Cancelled bookings were not restored.", "info");
    load();
  }

  if (!rows) return <Spinner />;
  const pct = stats.total ? Math.round((stats.covered / stats.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">{week === thisWeek ? "This week" : "Week"}</h1>
          <div className="mt-1 flex items-center gap-1 text-sm text-muted">
            <button aria-label="Previous week" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white disabled:opacity-30" disabled={week <= thisWeek} onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={18} /></button>
            Mon {fmtDate(week)} – Sat {fmtDate(addDays(week, 5))}
            <button aria-label="Next week" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white" onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.open(`${import.meta.env.BASE_URL}print?week=${week}&location=all`, "_blank")}>Export week (PDF)</Button>
          <Button variant="secondary" onClick={() => setCloseOpen(true)}>Close a location / day</Button>
        </div>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <Stat title="Slots covered (2–3 publishers)" value={`${stats.covered}`} sub={`of ${stats.total} · ${pct}%`} />
        <Stat title="Publisher alone — needs companion" value={`${stats.alone.length}`} sub={`${stats.soon} within 48 h`} amber={stats.alone.length > 0} />
        <Stat title="Active publishers this week" value={`${stats.active}`} sub={`of ${approved} approved`} />
        <button onClick={onGoRegistrations} className="text-left"><Stat title="Registrations waiting" value={`${pending}`} sub={pending ? "Review now →" : "All done"} /></button>
      </div>

      <div className="flex flex-wrap gap-5">
        <Card className="min-w-0 flex-[3_1_460px] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-extrabold">Coverage by day</h2>
            <div className="flex gap-3 text-xs font-semibold text-muted">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary" />5–6 covered</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#8DB7C4]" />3–4</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#E5ECEE]" />0–2</span>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[540px] border-separate border-spacing-1.5 text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="text-left font-bold">Location</th>
                  {days.map((d) => <th key={d} className="font-bold">{dowShort(d)} {d.slice(8)}</th>)}
                  <th className="w-16 pr-1 text-right font-bold">Week</th>
                </tr>
              </thead>
              <tbody>
                {locs.map(([id, name]) => {
                  const lr = rows.filter((r) => r.location_id === id);
                  const tot = lr.filter((r) => !r.closed).length;
                  const cov = lr.filter((r) => !r.closed && r.booked >= 2).length;
                  return (
                    <tr key={id}>
                      <td className="font-extrabold">{name}</td>
                      {days.map((d) => {
                        const dr = lr.filter((r) => r.slot_date === d);
                        const closed = dr.length > 0 && dr.every((r) => r.closed);
                        const n = dr.filter((r) => r.booked >= 2).length;
                        const bg = closed ? "bg-ground border border-dashed border-line2 text-muted" : n >= 5 ? "bg-primary text-white" : n >= 3 ? "bg-[#8DB7C4]" : "bg-[#E5ECEE]";
                        return <td key={d} className={`h-10 rounded-lg text-center text-[13px] font-extrabold ${bg}`}>{closed ? "Closed" : `${n}/${dr.length}`}</td>;
                      })}
                      <td className="pr-1 text-right font-extrabold">{tot ? Math.round((cov / tot) * 100) : 0}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Each cell: slots with 2–3 publishers, out of the day's slots.</p>
        </Card>

        <Card className="min-w-0 flex-[2_1_320px] border-amber-line p-5">
          <h2 className="text-[17px] font-extrabold">Needs a companion</h2>
          <div className="mt-2">
            {stats.alone.length === 0 ? (
              <Empty>No one is alone this week.</Empty>
            ) : (
              stats.alone.map((a) => {
                const p = a.publishers[0];
                const msg = `Hi ${p.full_name.split(" ")[0]}, I saw you're alone at ${a.location_name} on ${fmtDay(a.slot_date)} at ${fmtTime(a.start_time)}. Shall I help you find a companion?`;
                return (
                  <div key={a.slot_date + a.location_id + a.time_slot_id} className="flex items-center gap-2.5 border-t border-[#ECEEEA] py-2.5 first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-extrabold">{fmtDay(a.slot_date)} · {fmtTime(a.start_time)}</div>
                      <div className="text-xs text-muted">{a.location_name} · {p.full_name} alone</div>
                    </div>
                    {phones[p.id] ? (
                      <a href={whatsappLink(phones[p.id], msg)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${p.full_name}`} className="flex h-10 items-center gap-1.5 rounded-xl border border-line2 px-3 text-xs font-bold">
                        <MessageCircle size={16} aria-hidden="true" /> WhatsApp
                      </a>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">You're notified in the app when a companion cancels. Unpaired bookings are released automatically 1 hour before the start.</p>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-[17px] font-extrabold">Upcoming closures</h2>
        <div className="mt-2">
          {closures.length === 0 ? (
            <p className="text-sm text-muted">No locations are closed.</p>
          ) : (
            closures.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border-t border-[#ECEEEA] py-2.5 first:border-t-0">
                <div className="min-w-0 flex-1 text-sm"><b>{c.locations?.name}</b> · {fmtDay(c.closed_on)}{c.reason ? ` · ${c.reason}` : ""}</div>
                <Button variant="secondary" className="h-10 text-[13px]" onClick={() => reopen(c.id)}>Re-open</Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <CloseDaySheet open={closeOpen} onClose={() => setCloseOpen(false)} onDone={load} />
    </div>
  );
}

function Stat({ title, value, sub, amber }: { title: string; value: string; sub: string; amber?: boolean }) {
  return (
    <Card className={`h-full p-4 ${amber ? "border-amber-line" : ""}`}>
      <div className={`text-[13px] font-semibold ${amber ? "text-amber-ink" : "text-muted"}`}>{title}</div>
      <div className="mt-1.5 text-[30px] font-extrabold leading-none">
        {value} <span className="text-[15px] font-semibold text-muted">{sub}</span>
      </div>
    </Card>
  );
}

function CloseDaySheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [locs, setLocs] = useState<Location[]>([]);
  const [loc, setLoc] = useState("");
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      supabase.from("locations").select("*").eq("active", true).order("sort_order").then(({ data }) => {
        setLocs((data as Location[]) ?? []);
        if (data?.[0]) setLoc((l) => l || data[0].id);
      });
  }, [open]);
  async function save() {
    setBusy(true);
    const { data, error } = await supabase.rpc("close_location_day", { p_location: loc, p_date: date, p_reason: reason || null });
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    toast(`Closed. ${data ?? 0} booking${data === 1 ? "" : "s"} cancelled — everyone affected was notified.`);
    setReason("");
    onClose();
    onDone();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Close a location for a day">
      <div className="flex flex-col gap-3.5">
        <Field label="Location">
          <select value={loc} onChange={(e) => setLoc(e.target.value)} className="h-12 rounded-xl border border-line2 bg-white px-3 font-semibold">
            {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><Input type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Reason" hint="(shown to publishers)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Heavy rain expected" /></Field>
        <p className="text-xs text-muted">All bookings at this location on that day are cancelled and the publishers are notified.</p>
        <Button variant="danger" busy={busy} onClick={save} disabled={!loc || !date}>Close location for this day</Button>
      </div>
    </Sheet>
  );
}
