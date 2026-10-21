import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { supabase, errorText } from "@/lib/supabase";
import { fmtPhone, timeAgo } from "@/lib/format";
import type { Profile } from "@/lib/types";

export default function Registrations({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<Profile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").eq("status", "pending").order("created_at");
    setItems((data as Profile[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function decide(p: Profile, status: "approved" | "declined") {
    setBusy(p.id + status);
    const { error } = await supabase.rpc("set_member_status", { p_user: p.id, p_status: status });
    setBusy(null);
    if (error) return toast(errorText(error), "error");
    toast(status === "approved" ? `${p.full_name} approved` : `${p.full_name} declined`, status === "approved" ? "ok" : "info");
    load();
    onChanged();
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[26px] font-extrabold tracking-tight">Registrations</h1>
        <span className="text-sm text-muted">Approval is once per publisher, not per session.</span>
      </div>
      <div className="mt-4">
        {items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty>No registrations waiting.</Empty>
        ) : (
          <Card>
            {items.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 border-b border-[#ECEEEA] px-4 py-3.5 last:border-b-0">
                <div className="min-w-[200px] flex-1">
                  <div className="font-extrabold">{p.full_name}</div>
                  <div className="text-[13px] text-muted">{fmtPhone(p.phone)}{p.email ? ` · ${p.email}` : ""} · registered {timeAgo(p.created_at)}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="danger" className="h-10 text-[13px]" busy={busy === p.id + "declined"} onClick={() => decide(p, "declined")}>Decline</Button>
                  <Button className="h-10 text-[13px]" busy={busy === p.id + "approved"} onClick={() => decide(p, "approved")}>Approve</Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
