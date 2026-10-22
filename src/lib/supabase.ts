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
  // Supabase's password-strength message lists every allowed character; say it simply
  if (m && /^Password should contain at least one character of each/i.test(m))
    return "The password must have a capital letter, a small letter, a number and a symbol such as ! @ # $ (for example: Mjimwema#2026).";
  if (m && /^Password should be at least/i.test(m)) return "The password must be at least 8 characters long.";
  return m || "Something went wrong";
}
