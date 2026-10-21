import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { Button, Card, Empty, Pill, Sheet, Spinner, type PillTone } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { supabase, errorText } from "@/lib/supabase";
import { fmtPhone, phoneDigits } from "@/lib/format";
import type { MemberStatus, Profile } from "@/lib/types";

const STATUS: Record<MemberStatus, [PillTone, string]> = {
  approved: ["ok", "Approved"],
  pending: ["amber", "Pending"],
  declined: ["danger", "Declined"],
  deactivated: ["full", "Deactivated"],
};

export default function Publishers() {
  const toast = useToast();
  const { profile: me } = useAuth();
  const [items, setItems] = useState<Profile[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | MemberStatus>("approved");
  const [confirm, setConfirm] = useState<{ p: Profile; action: "deactivate" | "reset" | "role" } | null>(null);
  const [temp, setTemp] = useState<{ name: string; pw: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    setItems((data as Profile[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const d = phoneDigits(q);
    return (items ?? []).filter(
      (p) => (filter === "all" || p.status === filter) && (!t || p.full_name.toLowerCase().includes(t) || (d.length > 3 && p.phone.includes(d))),
    );
  }, [items, q, filter]);

  async function setStatus(p: Profile, status: MemberStatus) {
    setBusy(true);
    const { error } = await supabase.rpc("set_member_status", { p_user: p.id, p_status: status });
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    toast(status === "deactivated" ? `${p.full_name} deactivated` : `${p.full_name} is active again`, "info");
    setConfirm(null);
    load();
  }

  async function setRole(p: Profile) {
    setBusy(true);
    const role = p.role === "overseer" ? "publisher" : "overseer";
    const { error } = await supabase.rpc("set_member_role", { p_user: p.id, p_role: role });
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    toast(`${p.full_name} is now ${role === "overseer" ? "a Service Overseer" : "a publisher"}`);
    setConfirm(null);
    load();
  }

  async function resetPassword(p: Profile) {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-reset-password", { body: { user_id: p.id } });
    setBusy(false);
    setConfirm(null);
    if (error || !data?.temp_password) {
      let msg = data?.error || errorText(error);
      try {
        const ctx = (error as { context?: Response })?.context;
        if (ctx) msg = (await ctx.json()).error || msg;
      } catch { /* ignore */ }
      return toast(msg.includes("Failed to send") || msg.includes("not found") ? "Password reset is not set up yet (the admin-reset-password function is missing)." : msg, "error");
    }
    setTemp({ name: p.full_name, pw: data.temp_password });
  }

  return (
    <div>
      <h1 className="text-[26px] font-extrabold tracking-tight">Publishers</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or phone"
          aria-label="Search publishers"
          className="h-11 min-w-0 flex-[1_1_240px] rounded-xl border border-line2 bg-white px-3.5 text-sm font-medium outline-none focus:border-primary"
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter by status" className="h-11 rounded-xl border border-line2 bg-white px-3 text-sm font-semibold">
          <option value="approved">Approved</option>
          <option value="all">Everyone</option>
          <option value="pending">Pending</option>
          <option value="deactivated">Deactivated</option>
          <option value="declined">Declined</option>
        </select>
      </div>

      <div className="mt-4">
        {items === null ? (
          <Spinner />
        ) : shown.length === 0 ? (
          <Empty>No one matches.</Empty>
        ) : (
          <Card>
            {shown.map((p) => {
              const [tone, label] = STATUS[p.status];
              const self = p.id === me?.id;
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 border-b border-[#ECEEEA] px-4 py-3 last:border-b-0">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-extrabold">
                      {p.full_name}
                      {self ? <span className="text-xs font-semibold text-muted">(you)</span> : null}
                    </div>
                    <div className="text-[13px] text-muted">{fmtPhone(p.phone)}{p.email ? ` · ${p.email}` : ""}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone={tone}>{label}</Pill>
                    {p.role === "overseer" ? <Pill tone="info">Service Overseer</Pill> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.status !== "pending" && !self ? (
                      <Button variant="secondary" className="h-10 text-[13px]" onClick={() => setConfirm({ p, action: "reset" })}>Reset password</Button>
                    ) : null}
                    {p.status === "approved" && !self ? (
                      <Button variant="secondary" className="h-10 text-[13px]" onClick={() => setConfirm({ p, action: "role" })}>
                        {p.role === "overseer" ? "Make publisher" : "Make Service Overseer"}
                      </Button>
                    ) : null}
                    {p.status === "approved" && !self ? (
                      <Button variant="danger" className="h-10 text-[13px]" onClick={() => setConfirm({ p, action: "deactivate" })}>Deactivate</Button>
                    ) : null}
                    {(p.status === "deactivated" || p.status === "declined") ? (
                      <Button className="h-10 text-[13px]" busy={busy} onClick={() => setStatus(p, "approved")}>Re-activate</Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.action === "reset" ? "Reset password?" : confirm?.action === "role" ? "Change role?" : "Deactivate publisher?"}>
        {confirm ? (
          <>
            <p className="text-[15px] text-open-ink">
              {confirm.action === "reset"
                ? `A new temporary password will be created for ${confirm.p.full_name}. Their old password stops working.`
                : confirm.action === "role"
                  ? confirm.p.role === "overseer"
                    ? `${confirm.p.full_name} will no longer have access to this console.`
                    : `${confirm.p.full_name} will be able to approve members, close locations and post announcements.`
                  : `${confirm.p.full_name} won't be able to book, and their future bookings will be cancelled. You can re-activate them later.`}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant={confirm.action === "deactivate" ? "danger" : "primary"}
                busy={busy}
                onClick={() => (confirm.action === "reset" ? resetPassword(confirm.p) : confirm.action === "role" ? setRole(confirm.p) : setStatus(confirm.p, "deactivated"))}
              >
                {confirm.action === "reset" ? "Reset" : confirm.action === "role" ? "Change role" : "Deactivate"}
              </Button>
            </div>
          </>
        ) : null}
      </Sheet>

      <Sheet open={!!temp} onClose={() => setTemp(null)} title="Temporary password">
        {temp ? (
          <>
            <p className="text-sm text-open-ink">Give this to <b>{temp.name}</b> in person. They can change it in Profile → Change password.</p>
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-ground p-4">
              <code className="flex-1 select-all text-2xl font-extrabold tracking-wider">{temp.pw}</code>
              <Button variant="secondary" aria-label="Copy password" onClick={() => { navigator.clipboard?.writeText(temp.pw); toast("Copied"); }}>
                <Copy size={18} />
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">This password is shown only once.</p>
            <Button className="mt-4 w-full" onClick={() => setTemp(null)}>Done</Button>
          </>
        ) : null}
      </Sheet>
    </div>
  );
}
