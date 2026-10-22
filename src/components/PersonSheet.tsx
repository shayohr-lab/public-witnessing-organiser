import { useEffect, useState } from "react";
import { supabase, errorText } from "@/lib/supabase";
import { firstOfMonth, fmtDay, fmtMonth, fmtRange } from "@/lib/format";
import type { MonthBooking } from "@/lib/types";
import { Avatar, Empty, Pill, Sheet, Spinner } from "./ui";

/** One publisher's bookings in the month being viewed (opened by tapping a name). */
export default function PersonSheet({
  person,
  month,
  onClose,
}: {
  person: { id: string; full_name: string } | null;
  month: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MonthBooking[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!person) return;
    setItems(null);
    setErr("");
    supabase.rpc("publisher_month_bookings", { p_user: person.id, p_month: firstOfMonth(month) }).then(({ data, error }) => {
      if (error) {
        setErr(error.code === "PGRST202" ? "This needs the v1.1 database update." : errorText(error));
        setItems([]);
      } else setItems((data as MonthBooking[]) ?? []);
    });
  }, [person, month]);

  if (!person) return null;
  const upcoming = items?.filter((b) => !b.is_past).length ?? 0;

  return (
    <Sheet open onClose={onClose} title={person.full_name}>
      <div className="flex items-center gap-3">
        <Avatar name={person.full_name} strong />
        <div className="text-sm font-semibold text-muted">
          Bookings in {fmtMonth(month)}
          {items && items.length ? ` · ${items.length} total, ${upcoming} still to come` : ""}
        </div>
      </div>
      <div className="mt-4">
        {items === null ? (
          <Spinner />
        ) : err ? (
          <Empty>{err}</Empty>
        ) : items.length === 0 ? (
          <Empty>No bookings this month.</Empty>
        ) : (
          <div className="rounded-2xl border border-line">
            {items.map((b) => (
              <div key={b.booking_id} className={`flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0 ${b.is_past ? "opacity-55" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold">{fmtDay(b.slot_date)}</div>
                  <div className="text-xs text-muted">{fmtRange(b.start_time, b.end_time)} · {b.location_name}</div>
                </div>
                <Pill tone={b.is_past ? "full" : b.booked === 1 ? "amber" : "ok"}>{b.is_past ? "Done" : `${b.booked}/3`}</Pill>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
