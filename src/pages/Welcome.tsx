import { Link } from "react-router-dom";
import { CalendarDays, UserPlus } from "lucide-react";
import { Logo } from "@/components/ui";

export default function Welcome() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col px-6 pb-8 pt-6">
      <div className="flex items-center gap-2.5">
        <Logo size={40} />
        <div className="text-[15px] font-extrabold leading-tight">
          Public Witnessing
          <br />
          Organizer
        </div>
      </div>

      <div className="mt-14">
        <div className="text-xs font-extrabold tracking-[0.08em] text-amber-strong">PUBLIC WITNESSING · CART MINISTRY</div>
        <h1 className="mt-3 text-[34px] font-extrabold leading-[1.1] tracking-tight">Plan your cart sessions together</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Book 2-hour sessions, see who is already there, and invite a companion — so no one witnesses alone.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <CalendarDays size={20} aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold">Open slots live, Monday to Saturday</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-soft text-amber-ink">
            <UserPlus size={20} aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold">2–3 publishers per cart</span>
        </div>
      </div>

      <div className="flex-1" />

      <div className="mt-10 flex flex-col gap-3">
        <Link to="/register" className="flex h-14 items-center justify-center rounded-2xl bg-primary text-base font-bold text-white hover:bg-primary-dark">
          Create an account
        </Link>
        <Link to="/login" className="flex h-14 items-center justify-center rounded-2xl border border-line2 bg-white text-base font-bold text-ink">
          Sign in
        </Link>
        <p className="mt-1 text-center text-xs text-muted">New accounts are approved once by the Service Overseer.</p>
      </div>
    </div>
  );
}
