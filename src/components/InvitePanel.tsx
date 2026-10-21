import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase, errorText } from "@/lib/supabase";
import { daysBetween, firstName, fmtDay, fmtTime, todayISO, whatsappLink } from "@/lib/format";
import { Avatar, Button, Empty, Spinner } from "./ui";
import { useToast } from "./Toast";

export interface SlotRef {
  location_id: string;
  location_name: string;
  time_slot_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
}

/** Can invitations still be sent for this date? (at least 2 days before) */
export function canInvite(dateISO: string): boolean {
  return daysBetween(todayISO(), dateISO) >= 2;
}

/** Pick up to `max` free publishers and send them an invitation (+ optional WhatsApp share). */
export default function InvitePanel({ slot, max = 2, onDone }: { slot: SlotRef; max?: number; onDone: () => void }) {
  const toast = useToast();
  const [people, setPeople] = useState<{ id: string; full_name: string }[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [wa, setWa] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .rpc("available_companions", { p_date: slot.slot_date, p_slot: slot.time_slot_id })
      .then(({ data, error }) => {
        if (error) toast(errorText(error), "error");
        setPeople((data as { id: string; full_name: string }[]) ?? []);
      });
  }, [slot.slot_date, slot.time_slot_id, toast]);

  const firstPicked = people?.find((p) => p.id === picked[0]);
  const defaultMsg = `Hi ${firstPicked ? firstName(firstPicked.full_name) : ""}, would you like to join me for public witnessing on ${fmtDay(slot.slot_date)}, ${fmtTime(slot.start_time)}–${fmtTime(slot.end_time)} at ${slot.location_name}?`.replace("Hi ,", "Hi,");
  const message = msg || defaultMsg;

  const shown = useMemo(
    () => (people ?? []).filter((p) => p.full_name.toLowerCase().includes(q.trim().toLowerCase())),
    [people, q],
  );

  function toggle(id: string) {
    setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= max ? xs : [...xs, id]));
  }

  async function send() {
    if (!picked.length) return toast("Choose at least one person", "error");
    setBusy(true);
    let sent = 0;
    for (const id of picked) {
      const { error } = await supabase.rpc("send_invitation", {
        p_to: id,
        p_location: slot.location_id,
        p_date: slot.slot_date,
        p_slot: slot.time_slot_id,
        p_message: message,
      });
      if (error) toast(errorText(error), "error");
      else sent++;
    }
    if (sent && wa) {
      const { data } = await supabase.from("profiles").select("phone").eq("id", picked[0]).maybeSingle();
      if (data?.phone) window.open(whatsappLink(data.phone, message), "_blank", "noopener");
    }
    setBusy(false);
    if (sent) {
      toast(sent === 1 ? "Invitation sent" : `${sent} invitations sent`);
      onDone();
    }
  }

  if (!people) return <Spinner label="Finding free publishers" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[15px] font-extrabold">Invite a companion</div>
        <div className="text-xs font-semibold text-muted">Free at this time · up to {max}</div>
      </div>
      {people.length === 0 ? (
        <Empty>No other approved publisher is free at this time.</Empty>
      ) : (
        <>
          <label className="relative block">
            <span className="sr-only">Search publishers</span>
            <Search size={18} className="absolute left-3.5 top-3.5 text-muted" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search approved publishers"
              className="h-12 w-full rounded-xl border border-line2 bg-white pl-10 pr-3 text-base font-medium outline-none focus:border-primary"
            />
          </label>
          <div className="max-h-56 overflow-y-auto rounded-2xl border border-line">
            {shown.map((p) => {
              const on = picked.includes(p.id);
              return (
                <label key={p.id} className={`flex min-h-[52px] cursor-pointer items-center gap-3 border-b border-line px-3.5 py-2 last:border-b-0 ${on ? "bg-primary-soft" : ""}`}>
                  <Avatar name={p.full_name} strong={on} />
                  <span className="flex-1 text-sm font-bold">{p.full_name}</span>
                  <input type="checkbox" checked={on} onChange={() => toggle(p.id)} className="h-[22px] w-[22px] accent-[#1D5C70]" />
                </label>
              );
            })}
          </div>
        </>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Message
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMsg(e.target.value)}
          className="resize-none rounded-xl border border-line2 px-3.5 py-2.5 text-sm font-medium leading-snug outline-none focus:border-primary"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">Send via</span>
        <span className="flex h-9 items-center rounded-full bg-primary-soft px-3 text-[13px] font-bold text-primary-dark">App</span>
        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-primary-soft px-3 text-[13px] font-bold text-primary-dark">
          <input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} className="h-4 w-4 accent-[#1D5C70]" />
          WhatsApp share
        </label>
        <span className="flex h-9 items-center rounded-full border border-dashed border-line2 px-3 text-xs font-bold text-muted">SMS · coming soon</span>
      </div>
      <Button busy={busy} onClick={send} disabled={!picked.length}>
        {picked.length ? `Send invitation${picked.length > 1 ? "s" : ""}` : "Choose someone to invite"}
      </Button>
    </div>
  );
}
