import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { DEFAULT_BOOKING_CUTOFF } from "./config";

export interface CongregationInfo {
  name: string;
  /** "04:30:00" — booking for a day closes at this time that morning */
  booking_cutoff: string;
}

let cache: CongregationInfo | null = null;
let pending: Promise<CongregationInfo> | null = null;

async function fetchInfo(): Promise<CongregationInfo> {
  const { data, error } = await supabase.from("congregations").select("*").limit(1).maybeSingle();
  const row = (data ?? {}) as { name?: string; booking_cutoff?: string };
  const info = { name: row.name ?? "", booking_cutoff: row.booking_cutoff ?? DEFAULT_BOOKING_CUTOFF };
  if (!error) cache = info;
  return info;
}

/** Congregation name and booking cut-off, loaded once per visit. */
export function useCongregation(): CongregationInfo {
  const [info, setInfo] = useState<CongregationInfo>(cache ?? { name: "", booking_cutoff: DEFAULT_BOOKING_CUTOFF });
  useEffect(() => {
    if (cache) return;
    pending = pending ?? fetchInfo().finally(() => { pending = null; });
    let on = true;
    pending.then((i) => on && setInfo(i));
    return () => { on = false; };
  }, []);
  return info;
}
