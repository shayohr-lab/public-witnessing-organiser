import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MessageCircle } from "lucide-react";
import { Button, Card, Empty, Field, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { supabase, errorText } from "@/lib/supabase";
import { firstName, fmtPhone, phoneDigits, timeAgo, whatsappLink } from "@/lib/format";
import { useCongregation } from "@/lib/congregation";
import { SERVICE_LABEL, SERVICE_TYPES } from "@/lib/roles";
import { APP_URL } from "@/lib/config";
import type { Preapproval, Profile, ServiceType } from "@/lib/types";

function inviteText(name: string, phone: string, congregation: string, code: string | null): string {
  const link = code ? `${APP_URL}register?code=${code}` : APP_URL;
  return (
    `Hi ${firstName(name)}, you are invited to use the Public Witnessing Organizer` +
    `${congregation ? ` for ${congregation}` : ""}. Open ${link}, tap Register and use this number (${fmtPhone(phone)}). ` +
    (code
      ? `Your join code is ${code}. With it your account is approved automatically. Please don't share this code.`
      : `Your Service Overseer will approve your account.`)
  );
}

/** Opens a link in a tab that cannot reach back into this page. */
function openSafely(tab: Window | null, link: string) {
  if (tab) {
    tab.opener = null;
    tab.location.href = link;
  } else window.location.href = link;
}

export default function Registrations({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const { name: congregation } = useCongregation();
  const [items, setItems] = useState<Profile[] | null>(null);
  const [pre, setPre] = useState<Preapproval[]>([]);
  const [preError, setPreError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<ServiceType>("publisher");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [a0, b] = await Promise.all([
      supabase.rpc("staff_profiles", { p_status: "pending" }),
      supabase.from("preapprovals").select("*").is("used_at", null).order("created_at", { ascending: false }),
    ]);
    // before the v1.2 database update staff_profiles() does not exist yet
    const a = a0.error ? await supabase.from("profiles").select("*").eq("status", "pending").order("created_at") : a0;
    setItems((a.data as Profile[]) ?? []);
    setPre((b.data as Preapproval[]) ?? []);
    setPreError(!!b.error);
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

  async function preregister(e: FormEvent) {
    e.preventDefault();
    if (fullName.trim().length < 2) return toast("Please enter the full name", "error");
    if (!/^255[67]\d{8}$/.test(phoneDigits(phone))) return toast("Please enter a valid Tanzanian mobile number", "error");
    // open the WhatsApp tab now, while the tap still counts as a user action (phones block pop-ups later)
    const tab = window.open("", "_blank");
    setSaving(true);
    const { data, error } = await supabase.rpc("preregister_publisher", {
      p_full_name: fullName.trim(),
      p_phone: phoneDigits(phone),
      p_service_type: type,
    });
    setSaving(false);
    if (error) {
      tab?.close();
      return toast(errorText(error), "error");
    }
    // the database makes a new join code on every pre-registration
    const { data: row } = await supabase.from("preapprovals").select("join_code").eq("phone", String(data)).maybeSingle();
    const code = (row as { join_code: string | null } | null)?.join_code ?? null;
    openSafely(tab, whatsappLink(String(data), inviteText(fullName, String(data), congregation, code)));
    toast(`${fullName.trim()} pre-registered`);
    setFullName("");
    setPhone("");
    setType("publisher");
    load();
  }

  async function removePre(p: Preapproval) {
    if (!window.confirm(`Remove ${p.full_name} from the pre-registered list?`)) return;
    const { error } = await supabase.from("preapprovals").delete().eq("id", p.id);
    if (error) return toast(errorText(error), "error");
    toast("Removed", "info");
    load();
  }

  return (
    <div className="flex flex-col gap-6">
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

      <div className="flex flex-wrap gap-5">
        <Card className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 self-start p-5">
          <h2 className="text-[17px] font-extrabold">Pre-register a publisher</h2>
          <p className="-mt-1 text-sm text-muted">
            Add their name and number, then send them the app link and a join code on WhatsApp. When they register with this number and the code they are approved automatically. The code works for 14 days.
          </p>
          <form onSubmit={preregister} className="flex flex-col gap-3">
            <Field label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Debbie Mushi" /></Field>
            <Field label="Mobile number">
              <div className="flex gap-2">
                <span className="flex h-12 items-center rounded-xl border border-line2 bg-white px-3 font-semibold">+255</span>
                <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="7XX XXX XXX" />
              </div>
            </Field>
            <Field label="Service type">
              <select value={type} onChange={(e) => setType(e.target.value as ServiceType)} className="h-12 rounded-xl border border-line2 bg-white px-3 font-semibold">
                {SERVICE_TYPES.map((t) => <option key={t} value={t}>{SERVICE_LABEL[t]}</option>)}
              </select>
            </Field>
            <Button type="submit" busy={saving}>
              <MessageCircle size={18} aria-hidden="true" /> Pre-register &amp; send WhatsApp
            </Button>
          </form>
        </Card>

        <div className="min-w-0 flex-[1_1_360px]">
          <h2 className="text-[17px] font-extrabold">Pre-registered, not signed up yet</h2>
          <div className="mt-2">
            {preError ? (
              <Empty>Pre-registration needs the v1.1 database update.</Empty>
            ) : pre.length === 0 ? (
              <Empty>No one is waiting to sign up.</Empty>
            ) : (
              <Card>
                {pre.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 border-b border-[#ECEEEA] px-4 py-3 last:border-b-0">
                    <div className="min-w-[180px] flex-1">
                      <div className="font-extrabold">{p.full_name}</div>
                      <div className="text-[13px] text-muted">{fmtPhone(p.phone)} · {SERVICE_LABEL[p.service_type]} · added {timeAgo(p.created_at)}</div>
                      <div className="text-[13px] text-muted">
                        {p.expires_at && new Date(p.expires_at) < new Date()
                          ? "Join code expired — pre-register again to send a new one"
                          : p.join_code ? `Join code ${p.join_code}` : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={whatsappLink(p.phone, inviteText(p.full_name, p.phone, congregation, p.join_code))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-10 items-center gap-1.5 rounded-xl border border-line2 bg-white px-3 text-[13px] font-bold"
                      >
                        <MessageCircle size={16} aria-hidden="true" /> Send again
                      </a>
                      <Button variant="danger" className="h-10 text-[13px]" onClick={() => removePre(p)}>Remove</Button>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
