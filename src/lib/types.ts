export type Role = "publisher" | "overseer";
export type MemberStatus = "pending" | "approved" | "declined" | "deactivated";

export interface Profile {
  id: string;
  congregation_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  role: Role;
  status: MemberStatus;
  consent_at: string | null;
  created_at: string;
}

export interface Location {
  id: string;
  congregation_id: string;
  name: string;
  description: string | null;
  cart_storage: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  sort_order: number;
}

export interface TimeSlot {
  id: string;
  start_time: string;
  end_time: string;
  active: boolean;
}

export interface BoardRow {
  slot_date: string;
  location_id: string;
  location_name: string;
  time_slot_id: string;
  start_time: string;
  end_time: string;
  booked: number;
  publishers: { id: string; full_name: string }[];
  is_mine: boolean;
  my_booking_id: string | null;
  closed: boolean;
  is_past: boolean;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  pinned: boolean;
  created_at: string;
}

export interface Alternative {
  location_id: string;
  location_name: string;
  time_slot_id: string;
  start_time: string;
  end_time: string;
  booked: number;
  publishers: string[];
}
