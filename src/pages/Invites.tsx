import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { Avatar, Button, Card, Empty, Pill, SectionLabel, Spinner, type PillTone } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { supabase, errorText } from "@/lib/supabase";
import { addDays, fmtDate, fmtDay, fmtRange, timeAgo, todayISO } from "@/lib/format";
import { useLive } from "@/lib/useLive";

interface Inv {
  id: string;
  slot_date: string;
  message: string | null;
  status: "pending" | "accepted" | "declined" | "expired" | "cancelled";
  response_comment: string | null;
  created_at: string;
  from: { full_name: string } | null;
  to: { full_name: string } | null;
  locations: { name: string } | null;
  time_slots: { start_time: string; end_time: string } | null;
}

const SELECT =
  "id, slot_date, message, status, response_comment, created_at, from:profiles!invitations_from_id_fkey(full_name), to:profiles!invitations_to_id_fkey(full_name), locations(name), time_slots(start_time,end_time)";

export default function Invites() {
  const { profile } = useAuth();
  const toast = useToast();
  const [incoming, setIncoming] = useState<Inv[] | null>(null);
  const [sent, setSent] = useState<Inv[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    const since = addDays(todayISO(), -30);
    const [a, b] = await Promise.all([
      supabase.from("invitations").select(SELECT).eq("to_id", profile.id).eq("status", "pending").order("slot_date"),
      supabase.from("invitations").select(SELECT).eq("from_id", profile.id).gte("slot_date", since).order("created_at", { ascending: false }).limit(30),
    ]);
    if (a.error || b.error) toast(errorText(a.error || b.error), "error");
    setIncoming((a.data as unknown as Inv[]) ?? []);
    setSent((b.data as unknown as Inv[]) ?? []);
  }, [profile, toast]);
  useEffect(() => {
    load();
  }, [load]);
  useLive("notifications", load, 60000, profile ? `user_id=eq.${profile.id}` : undefined);

  return (
    <AppShell title="Invitations">
      <SectionLabel>FOR YOU · {incoming?.length ?? 0}</SectionLabel>
      <div className="mt-2 flex flex-col gap-3">
        {incoming === null ? <Spinner /> : incoming.length === 0 ? <Empty>No invitations waiting for you.</Empty> : incoming.map((i) => <Incoming key={i.id} inv={i} onDone={load} />)}
      </div>

      <div className="mt-6"><SectionLabel>SENT BY YOU</SectionLabel></div>
      <div className="mt-2">
        {sent.length === 0 ? (
          <Empty>
            You haven't invited anyone recently. Book a slot on <Link to="/home" className="font-bold">the schedule</Link>, then invite a companion.
          </Empty>
        ) : (
          <Card>
            {sent.map((i) => {
              const tone: Record<Inv["status"], [PillTone, string]> = {
                pending: ["info", "Waiting"],
                accepted: ["ok", "Accepted"],
                declined: ["danger", "Declined"],
                expired: ["full", "Expired"],
                cancelled: ["full", "Cancelled"],
              };
              const [t, label] = tone[i.status];
              return (
                <div key={i.id} className="flex items-start gap-3 border-b border-[#ECEEEA] px-3.5 py-3 last:border-b-0">
                  <Avatar name={i.to?.full_name ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{i.to?.full_name}</div>
                    <div className="text-xs text-muted">
                      {fmtDay(i.slot_date)} · {i.time_slots ? fmtRange(i.time_slots.start_time, i.time_slots.end_time) : ""} · {i.locations?.name}
                    </div>
                    {i.response_comment ? <div className="mt-1 text-xs text-open-ink">"{i.response_comment}"</div> : null}
                    {i.status === "declined" ? <Link to="/profile" className="mt-1 inline-block py-1 text-[13px] font-extrabold">Invite someone else →</Link> : null}
                  </div>
                  <Pill tone={t}>{label}</Pill>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function Incoming({ inv, onDone }: { inv: Inv; onDone: () => void }) {
  const toast = useToast();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  async function respond(accept: boolean) {
    setBusy(accept ? "yes" : "no");
    const { error } = await supabase.rpc("respond_invitation", { p_invitation: inv.id, p_accept: accept, p_comment: comment || null });
    setBusy(null);
    if (error) return toast(errorText(error), "error");
    toast(accept ? "Accepted — you're booked" : "Invitation declined", accept ? "ok" : "info");
    onDone();
  }
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border-2 border-primary bg-white p-4">
      <div className="flex items-center gap-3">
        <Avatar name={inv.from?.full_name ?? "?"} strong />
        <div className="flex-1">
          <div className="text-[15px] font-extrabold">{inv.from?.full_name} invited you</div>
          <div className="text-xs text-muted">Sent {timeAgo(inv.created_at)} · reply before {fmtDate(inv.slot_date)}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-ground px-3 py-2.5">
        <div><div className="text-[11px] font-semibold text-muted">Date</div><div className="text-[13px] font-extrabold">{fmtDay(inv.slot_date)}</div></div>
        <div><div className="text-[11px] font-semibold text-muted">Time</div><div className="text-[13px] font-extrabold">{inv.time_slots ? fmtRange(inv.time_slots.start_time, inv.time_slots.end_time).replace(" – ", "–") : ""}</div></div>
        <div><div className="text-[11px] font-semibold text-muted">Location</div><div className="text-[13px] font-extrabold">{inv.locations?.name}</div></div>
      </div>
      {inv.message ? <div className="text-sm leading-relaxed text-open-ink">"{inv.message}"</div> : null}
      <label className="flex flex-col gap-1.5 text-[13px] font-bold">
        Add a comment <span className="sr-only">(optional)</span>
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. I'll bring the cart key" maxLength={300} className="h-11 rounded-xl border border-line2 px-3 text-sm font-medium outline-none focus:border-primary" />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" busy={busy === "no"} onClick={() => respond(false)}>Decline</Button>
        <Button busy={busy === "yes"} onClick={() => respond(true)}>Accept</Button>
      </div>
    </div>
  );
}
