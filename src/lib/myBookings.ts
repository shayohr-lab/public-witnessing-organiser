import { supabase } from "./supabase";
import { addDays, todayISO } from "./format";

export interface MyBooking {
  id: string;
  slot_date: string;
  location_id: string;
  location_name: string;
  time_slot_id: string;
  start_time: string;
  end_time: string;
  companions: string[];
  count: number;
}

interface Row {
  id: string;
  slot_date: string;
  location_id: string;
  time_slot_id: string;
  publisher_id: string;
  locations: { name: string } | null;
  time_slots: { start_time: string; end_time: string } | null;
  profiles: { full_name: string } | null;
}

/** My active bookings from today onwards, with who else is in each slot. */
export async function loadMyBookings(userId: string): Promise<MyBooking[]> {
  const today = todayISO();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, slot_date, location_id, time_slot_id, publisher_id, locations(name), time_slots(start_time,end_time), profiles!bookings_publisher_id_fkey(full_name)")
    .eq("status", "active")
    .gte("slot_date", today)
    .lte("slot_date", addDays(today, 35))
    .order("slot_date");
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];
  const key = (r: Row) => `${r.slot_date}|${r.location_id}|${r.time_slot_id}`;
  const groups = new Map<string, Row[]>();
  rows.forEach((r) => groups.set(key(r), [...(groups.get(key(r)) ?? []), r]));
  return rows
    .filter((r) => r.publisher_id === userId)
    .map((r) => {
      const g = groups.get(key(r)) ?? [];
      return {
        id: r.id,
        slot_date: r.slot_date,
        location_id: r.location_id,
        location_name: r.locations?.name ?? "",
        time_slot_id: r.time_slot_id,
        start_time: r.time_slots?.start_time ?? "",
        end_time: r.time_slots?.end_time ?? "",
        companions: g.filter((x) => x.publisher_id !== userId).map((x) => x.profiles?.full_name ?? ""),
        count: g.length,
      };
    })
    .sort((a, b) => (a.slot_date + a.start_time).localeCompare(b.slot_date + b.start_time));
}
