export type Role = "publisher" | "assistant" | "overseer";
export type ServiceType = "publisher" | "auxiliary_pioneer" | "regular_pioneer" | "fulltime_pioneer";
export type MemberStatus = "pending" | "approved" | "declined" | "deactivated";

export interface Profile {
  id: string;
  congregation_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  role: Role;
  service_type: ServiceType;
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
  archived?: boolean;
  sort_order: number;
}

export interface TimeSlot {
  id: string;
  start_time: string;
  end_time: string;
  active: boolean;
  archived?: boolean;
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
  /** v1.1: the day can still be booked (before the morning cut-off) */
  booking_open?: boolean;
  /** v1.1: I can book or join this exact slot now */
  bookable?: boolean;
  /** v1.1: location where I'm booked at this same date and time */
  mine_elsewhere?: string | null;
  /** v1.1: pending invitations to me for this slot */
  invited_by?: { invitation_id: string; id: string; full_name: string }[];
}

export interface Preapproval {
  id: string;
  full_name: string;
  phone: string;
  service_type: ServiceType;
  created_at: string;
  used_at: string | null;
  join_code: string | null;
  expires_at: string | null;
}

export interface MonthBooking {
  booking_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  location_name: string;
  booked: number;
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
