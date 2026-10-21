import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

/**
 * Calls `onChange` whenever rows in `table` change (Supabase Realtime),
 * and also every `pollMs` as a fallback for weak connections.
 */
export function useLive(table: string, onChange: () => void, pollMs = 60000, filter?: string) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const channel = supabase
      .channel(`live-${table}-${filter ?? "all"}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, () => cb.current())
      .subscribe();
    const t = window.setInterval(() => cb.current(), pollMs);
    const onFocus = () => cb.current();
    window.addEventListener("focus", onFocus);
    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [table, pollMs, filter]);
}
