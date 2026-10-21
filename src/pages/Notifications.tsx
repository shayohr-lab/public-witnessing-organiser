import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SubPage } from "@/components/AppShell";
import { Button, Empty, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import { useLive } from "@/lib/useLive";
import type { Notification } from "@/lib/types";

export default function Notifications() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Notification[] | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(50);
    setItems((data as Notification[]) ?? []);
  }, [profile]);
  useEffect(() => {
    load();
  }, [load]);
  useLive("notifications", load, 45000, profile ? `user_id=eq.${profile.id}` : undefined);

  async function open(n: Notification) {
    if (!n.read_at) await supabase.rpc("mark_notifications_read", { p_ids: [n.id] });
    const link = n.link === "/admin" && profile?.role !== "overseer" ? "/home" : n.link;
    if (link) nav(link);
    else load();
  }

  async function readAll() {
    await supabase.rpc("mark_notifications_read", { p_ids: null });
    load();
  }

  const unread = (items ?? []).filter((n) => !n.read_at).length;

  return (
    <SubPage title="Notifications" back="/home">
      {unread ? (
        <div className="mb-2 flex justify-end">
          <Button variant="ghost" className="h-10 text-sm" onClick={readAll}>Mark all read</Button>
        </div>
      ) : null}
      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty>No notifications yet.</Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {items.map((n) => (
            <button key={n.id} onClick={() => open(n)} className={`flex w-full gap-3 border-b border-[#ECEEEA] px-4 py-3 text-left last:border-b-0 ${n.read_at ? "" : "bg-primary-soft/60"}`}>
              <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${n.read_at ? "bg-transparent" : "bg-primary"}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{n.title}</span>
                {n.body ? <span className="mt-0.5 block text-[13px] leading-snug text-muted">{n.body}</span> : null}
                <span className="mt-1 block text-xs text-muted">{timeAgo(n.created_at)}{n.read_at ? "" : " · new"}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </SubPage>
  );
}
