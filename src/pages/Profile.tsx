import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import InvitePanel, { canInvite } from "@/components/InvitePanel";
import { Button, Card, Empty, Field, Input, Pill, SectionLabel, Sheet, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { supabase, errorText } from "@/lib/supabase";
import { fmtDay, fmtPhone, fmtRange, initials, phoneDigits } from "@/lib/format";
import { loadMyBookings, type MyBooking } from "@/lib/myBookings";
import { useLive } from "@/lib/useLive";

export default function Profile() {
  const { profile, refreshProfile, signOut } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [items, setItems] = useState<MyBooking[] | null>(null);
  const [cancelId, setCancelId] = useState<MyBooking | null>(null);
  const [inviteFor, setInviteFor] = useState<MyBooking | null>(null);
  const [edit, setEdit] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setItems(await loadMyBookings(profile.id));
    } catch (e) {
      toast(errorText(e), "error");
      setItems([]);
    }
  }, [profile, toast]);
  useEffect(() => {
    load();
  }, [load]);
  useLive("bookings", load, 60000);

  async function doCancel() {
    if (!cancelId) return;
    setBusy(true);
    const { error } = await supabase.rpc("cancel_booking", { p_booking: cancelId.id });
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    toast("Booking cancelled", "info");
    setCancelId(null);
    load();
  }

  if (!profile) return null;

  return (
    <AppShell title="Profile">
      <Card className="flex items-center gap-3.5 p-4">
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-primary text-xl font-extrabold text-white" aria-hidden="true">
          {initials(profile.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-extrabold">{profile.full_name}</div>
          <div className="text-[13px] text-muted">{fmtPhone(profile.phone)}{profile.email ? ` · ${profile.email}` : ""}</div>
          <div className="mt-1.5 flex gap-1.5">
            <Pill tone="ok">Approved publisher</Pill>
            {profile.role === "overseer" ? <Pill tone="info">Service Overseer</Pill> : null}
          </div>
        </div>
      </Card>
      <div className="mt-2 flex gap-4">
        <button onClick={() => setEdit(true)} className="py-2 text-sm font-bold text-primary">Edit details</button>
        <button onClick={() => setPwOpen(true)} className="py-2 text-sm font-bold text-primary">Change password</button>
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <SectionLabel>MY UPCOMING SESSIONS</SectionLabel>
        <span className="text-xs font-semibold text-muted">{items?.length ?? 0} booked</span>
      </div>
      <div className="mt-2 flex flex-col gap-2.5">
        {items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty>
            No sessions booked. <Link to="/home" className="font-bold">Open the schedule</Link>
          </Empty>
        ) : (
          items.map((b) => {
            const alone = b.count === 1;
            return (
              <Card key={b.id} className={`p-4 ${alone ? "border-amber-line" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[15px] font-extrabold">{fmtDay(b.slot_date)} · {fmtRange(b.start_time, b.end_time)}</div>
                    <div className="text-[13px] text-muted">
                      {b.location_name} · {b.companions.length ? `with ${b.companions.join(", ")}` : "no companion yet"}
                    </div>
                  </div>
                  <Pill tone={alone ? "amber" : "ok"}>{alone ? "Needs companion" : "Ready"}</Pill>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4">
                  {alone ? <button onClick={() => nav(`/alone/${b.id}`)} className="py-2 text-[13px] font-bold text-amber-strong">Find a companion</button> : null}
                  {b.count < 3 && canInvite(b.slot_date) ? <button onClick={() => setInviteFor(b)} className="py-2 text-[13px] font-bold text-primary">Invite someone</button> : null}
                  <button onClick={() => setCancelId(b)} className="py-2 text-[13px] font-bold text-danger">Cancel booking</button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <Button variant="secondary" className="mt-6 w-full" onClick={async () => { await signOut(); nav("/", { replace: true }); }}>
        Sign out
      </Button>

      <Sheet open={!!cancelId} onClose={() => setCancelId(null)} title="Cancel this booking?">
        {cancelId ? (
          <>
            <p className="text-[15px] text-open-ink">
              {fmtDay(cancelId.slot_date)} · {fmtRange(cancelId.start_time, cancelId.end_time)} · {cancelId.location_name}
            </p>
            {cancelId.count === 2 ? <p className="mt-2 text-sm font-semibold text-amber-ink">{cancelId.companions[0]} will be left alone and will be told.</p> : null}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <Button variant="secondary" onClick={() => setCancelId(null)}>Keep it</Button>
              <Button variant="danger" busy={busy} onClick={doCancel}>Yes, cancel</Button>
            </div>
          </>
        ) : null}
      </Sheet>

      <Sheet open={!!inviteFor} onClose={() => setInviteFor(null)} title="Invite a companion">
        {inviteFor ? (
          <>
            <p className="mb-4 text-sm font-semibold text-muted">{fmtDay(inviteFor.slot_date)} · {fmtRange(inviteFor.start_time, inviteFor.end_time)} · {inviteFor.location_name}</p>
            <InvitePanel slot={inviteFor} max={3 - inviteFor.count} onDone={() => { setInviteFor(null); load(); }} />
          </>
        ) : null}
      </Sheet>

      <EditSheet open={edit} onClose={() => setEdit(false)} onSaved={refreshProfile} />
      <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </AppShell>
  );
}

function EditSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && profile) { setName(profile.full_name); setPhone(profile.phone); setEmail(profile.email ?? ""); }
  }, [open, profile]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!/^255[67]\d{8}$/.test(phoneDigits(phone))) return toast("Please enter a valid Tanzanian mobile number", "error");
    setBusy(true);
    const { error } = await supabase.rpc("update_my_profile", { p_full_name: name, p_phone: phoneDigits(phone), p_email: email });
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    toast("Details saved");
    onSaved();
    onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Edit details">
      <form onSubmit={save} className="flex flex-col gap-3.5">
        <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Mobile number"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Contact email" hint="(optional)"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <p className="text-xs text-muted">Changing your mobile number also changes the number you sign in with.</p>
        <Button type="submit" busy={busy}>Save</Button>
      </form>
    </Sheet>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast("Password must be at least 8 characters", "error");
    if (pw !== pw2) return toast("The two passwords don't match", "error");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    toast("Password changed");
    setPw(""); setPw2("");
    onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Change password">
      <form onSubmit={save} className="flex flex-col gap-3.5">
        <Field label="New password"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        <Button type="submit" busy={busy}>Change password</Button>
      </form>
    </Sheet>
  );
}
