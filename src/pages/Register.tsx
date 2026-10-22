import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, errorText } from "@/lib/supabase";
import { AUTH_EMAIL_DOMAIN } from "@/lib/config";
import { phoneDigits } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { Button, Field, Input } from "@/components/ui";
import { useToast } from "@/components/Toast";

export default function Register() {
  const nav = useNavigate();
  const toast = useToast();
  const { refreshProfile } = useAuth();
  const [f, setF] = useState({ name: "", phone: "", email: "", pw: "", pw2: "", consent: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const digits = phoneDigits(f.phone);
    if (f.name.trim().length < 2) return setErr("Please enter your full name.");
    if (!/^255[67]\d{8}$/.test(digits)) return setErr("Please enter a valid Tanzanian mobile number, e.g. 0712 345 678.");
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return setErr("That email address doesn't look right.");
    if (f.pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (f.pw !== f.pw2) return setErr("The two passwords don't match.");
    if (!f.consent) return setErr("Please tick the agreement box to continue.");

    setBusy(true);
    const { data: existing } = await supabase.rpc("login_email_for", { p_identifier: digits });
    if (existing) {
      setBusy(false);
      return setErr("This mobile number is already registered. Please sign in instead.");
    }
    const email = f.email.trim().toLowerCase() || `${digits}@${AUTH_EMAIL_DOMAIN}`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password: f.pw,
      options: { data: { full_name: f.name.trim(), phone: digits, email: f.email.trim().toLowerCase(), consent: true } },
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    if (!data.session) {
      // Email confirmation is switched on in Supabase. Tell the person what to do.
      toast("Account created. Please sign in.", "info");
      return nav("/login");
    }
    await refreshProfile();
    nav("/pending", { replace: true });
  }

  return (
    <div className="mx-auto max-w-[480px] px-6 pb-10 pt-4">
      <Link to="/" aria-label="Back" className="-ml-3 flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </Link>
      <h1 className="mt-2 text-[26px] font-extrabold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-muted">You can sign in later with your mobile number or email.</p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
        <Field label="Full name">
          <Input autoComplete="name" value={f.name} onChange={set("name")} placeholder="First and last name" required />
        </Field>
        <Field label="Mobile number">
          <div className="flex gap-2">
            <span className="flex h-12 items-center rounded-xl border border-line2 bg-white px-3 font-semibold">+255</span>
            <Input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} placeholder="7XX XXX XXX" required />
          </div>
        </Field>
        <Field label="Email" hint="(optional)">
          <Input type="email" autoComplete="email" value={f.email} onChange={set("email")} placeholder="name@example.com" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Password">
            <Input type="password" autoComplete="new-password" value={f.pw} onChange={set("pw")} required />
          </Field>
          <Field label="Confirm">
            <Input type="password" autoComplete="new-password" value={f.pw2} onChange={set("pw2")} required />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-muted">At least 8 characters, with a capital letter, a small letter, a number and a symbol (e.g. ! @ #).</p>

        <label className="flex items-start gap-3 text-sm leading-snug text-open-ink">
          <input type="checkbox" checked={f.consent} onChange={set("consent")} className="mt-0.5 h-5 w-5 flex-none accent-[#1D5C70]" />
          I agree that my name and mobile number are shown to approved publishers in my congregation, only to arrange witnessing sessions.
        </label>

        {err ? <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger">{err}</p> : null}

        <Button type="submit" busy={busy} className="mt-2 h-14 rounded-2xl text-base">
          Submit for approval
        </Button>
        <p className="text-center text-sm text-muted">
          Already registered? <Link to="/login" className="font-bold">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
