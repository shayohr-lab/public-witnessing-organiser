import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, errorText } from "@/lib/supabase";
import { phoneDigits } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { homeFor } from "@/lib/routes";
import { Button, Field, Input, Logo, Sheet } from "@/components/ui";

export default function Login() {
  const nav = useNavigate();
  const { refreshProfile } = useAuth();
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [forgot, setForgot] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!id.trim() || !pw) return setErr("Please fill in both fields.");
    setBusy(true);
    const identifier = mode === "phone" ? phoneDigits(id) : id.trim();
    const { data: email, error: lookupErr } = await supabase.rpc("login_email_for", { p_identifier: identifier });
    if (lookupErr) {
      setBusy(false);
      return setErr(errorText(lookupErr));
    }
    if (!email) {
      setBusy(false);
      return setErr("No account found with that " + (mode === "phone" ? "mobile number." : "email."));
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email as string, password: pw });
    if (error) {
      setBusy(false);
      return setErr("Wrong password. Please try again, or ask your Service Overseer to reset it.");
    }
    const p = await refreshProfile();
    setBusy(false);
    nav(homeFor(p?.status), { replace: true });
  }

  const tab = (m: "phone" | "email", label: string) => (
    <button
      type="button"
      onClick={() => { setMode(m); setErr(""); }}
      aria-pressed={mode === m}
      className={`h-11 rounded-[10px] text-sm ${mode === m ? "bg-white font-bold shadow-sm" : "font-semibold text-muted"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col px-6 pb-8 pt-6">
      <div className="flex items-center gap-2.5">
        <Logo size={40} />
        <div className="text-[15px] font-extrabold leading-tight">Public Witnessing<br />Organizer</div>
      </div>
      <h1 className="mt-12 text-[30px] font-extrabold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-[15px] text-muted">Sign in to book cart sessions and coordinate with your companions.</p>

      <form onSubmit={submit} className="mt-7 flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#E6E9E3] p-1">
          {tab("phone", "Mobile number")}
          {tab("email", "Email")}
        </div>
        {mode === "phone" ? (
          <Field label="Mobile number">
            <div className="flex gap-2">
              <span className="flex h-12 items-center rounded-xl border border-line2 bg-white px-3 font-semibold">+255</span>
              <Input type="tel" inputMode="tel" autoComplete="tel" value={id} onChange={(e) => setId(e.target.value)} placeholder="7XX XXX XXX" />
            </div>
          </Field>
        ) : (
          <Field label="Email address">
            <Input type="email" autoComplete="email" value={id} onChange={(e) => setId(e.target.value)} placeholder="name@example.com" />
          </Field>
        )}
        <Field label="Password">
          <Input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <button type="button" onClick={() => setForgot(true)} className="-mt-1 self-end py-1 text-sm font-bold text-primary">
          Forgot password?
        </button>
        {err ? <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger">{err}</p> : null}
        <Button type="submit" busy={busy} className="h-14 rounded-2xl text-base">Sign in</Button>
      </form>

      <div className="flex-1" />
      <div className="mt-10 rounded-2xl border border-line bg-white p-4">
        <div className="text-[15px] font-bold">New publisher?</div>
        <div className="mt-1 text-sm text-muted">Create an account. Your Service Overseer approves it once, then you can book any open slot.</div>
        <Link to="/register" className="mt-2 inline-block py-1 font-bold">Create an account →</Link>
      </div>

      <Sheet open={forgot} onClose={() => setForgot(false)} title="Forgot your password?">
        <p className="text-[15px] leading-relaxed text-open-ink">
          Ask your Service Overseer to reset it. They will give you a temporary password, which you can change later in Your Profile.
        </p>
        <Button className="mt-5 w-full" onClick={() => setForgot(false)}>OK</Button>
      </Sheet>
    </div>
  );
}
