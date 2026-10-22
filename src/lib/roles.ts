import type { Profile, Role, ServiceType } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  overseer: "Super Admin (Elder)",
  assistant: "MT Assistant",
  publisher: "Publisher",
};

export const SERVICE_LABEL: Record<ServiceType, string> = {
  publisher: "Publisher",
  auxiliary_pioneer: "Auxiliary pioneer",
  regular_pioneer: "Regular pioneer",
  fulltime_pioneer: "Full-time pioneer",
};

export const SERVICE_TYPES = Object.keys(SERVICE_LABEL) as ServiceType[];
export const ROLES: Role[] = ["publisher", "assistant", "overseer"];

/** Super Admin (Elder): full console. */
export function isSuperAdmin(p?: Profile | null): boolean {
  return !!p && p.status === "approved" && p.role === "overseer";
}

/** Super Admin or MT Assistant: can open the console. */
export function isStaff(p?: Profile | null): boolean {
  return !!p && p.status === "approved" && (p.role === "overseer" || p.role === "assistant");
}

/** Pioneers may invite the same companion more than once a week. */
export function isPioneer(p?: Profile | null): boolean {
  return !!p && !!p.service_type && p.service_type !== "publisher";
}
