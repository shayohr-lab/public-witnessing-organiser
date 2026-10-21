import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the two Supabase values were provided at build time. */
export const isConfigured = Boolean(url && key);

export const supabase = createClient(url ?? "http://localhost", key ?? "missing-key", {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Turns any thrown/returned Supabase error into the readable message from the database. */
export function errorText(e: unknown): string {
  if (!e) return "Something went wrong";
  if (typeof e === "string") return e;
  const m = (e as { message?: string }).message;
  return m || "Something went wrong";
}
