import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Check, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui";
import { useToast } from "@/components/Toast";

export default function Pending() {
  const { profile, refreshProfile, signOut } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (profile?.status === "approved") return <Navigate to="/home" replace />;
  const inactive = profile?.status === "declined" || profile?.status === "deactivated";

  async function check() {
    setBusy(true);
    const p = await refreshProfile();
    setBusy(false);
    if (p?.status === "approved") {
      toast("You're approved — welcome!");
      nav("/home", { replace: true });
    } else toast("Not approved yet. Please check again later.", "info");
  }

  async function out() {
    await signOut();
    nav("/", { replace: true });
  }

  if (inactive) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-extrabold">Your access is not active</h1>
        <p className="text-muted">Please speak to your Service Overseer.</p>
        <Button variant="secondary" onClick={out}>Sign out</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col px-6 pb-8 pt-16">
      <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-amber-soft text-amber-ink">
        <Clock size={34} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-[26px] font-extrabold leading-tight tracking-tight">Waiting for your Service Overseer</h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
        Hello {profile?.full_name?.split(" ")[0] ?? ""}, your account is registered. Once it's approved you can start booking — this happens only once.
      </p>

      <ol className="mt-7 rounded-2xl border border-line bg-white px-4">
        <li className="flex items-center gap-3 border-b border-[#ECEEEA] py-3.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2F7D4F] text-white"><Check size={16} strokeWidth={3} aria-hidden="true" /></span>
          <span className="text-sm font-bold">Account created</span>
        </li>
        <li className="flex items-center gap-3 border-b border-[#ECEEEA] py-3.5">
          <span className="h-7 w-7 rounded-full border-2 border-amber-strong" aria-hidden="true" />
          <span className="text-sm font-bold">Review by Service Overseer</span>
        </li>
        <li className="flex items-center gap-3 py-3.5">
          <span className="h-7 w-7 rounded-full border-2 border-line2" aria-hidden="true" />
          <span className="text-sm font-bold text-muted">Start booking sessions</span>
        </li>
      </ol>

      <div className="flex-1" />
      <div className="mt-10 flex flex-col gap-3">
        <Button busy={busy} onClick={check} className="h-14 rounded-2xl text-base">Check again</Button>
        <Button variant="secondary" onClick={out} className="h-12">Sign out</Button>
      </div>
    </div>
  );
}
