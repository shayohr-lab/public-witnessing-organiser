import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import { initials } from "@/lib/format";

type Variant = "primary" | "secondary" | "amber" | "danger" | "ghost";

export function Button({
  variant = "primary",
  busy,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: "bg-primary text-white hover:bg-primary-dark",
    secondary: "border border-line2 bg-white text-ink hover:bg-ground",
    amber: "bg-amber-strong text-white hover:brightness-95",
    danger: "border border-line2 bg-white text-danger hover:bg-danger-soft",
    ghost: "bg-transparent text-primary hover:bg-primary-soft",
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-bold transition disabled:opacity-60 ${styles[variant]} ${className}`}
    >
      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
      <span>
        {label} {hint ? <span className="font-medium text-muted">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-12 w-full min-w-0 rounded-xl border border-line2 bg-white px-3.5 text-base font-medium text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${props.className ?? ""}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-white ${className}`}>{children}</div>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-xs font-extrabold tracking-[0.06em] text-muted">{children}</div>;
}

export function Avatar({ name, strong }: { name: string; strong?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-[13px] font-extrabold ${strong ? "bg-primary text-white" : "bg-open-soft text-open-ink"}`}
    >
      {initials(name)}
    </span>
  );
}

export type PillTone = "open" | "amber" | "ok" | "full" | "mine" | "danger" | "info";
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  const t: Record<PillTone, string> = {
    open: "bg-open-soft text-open-ink",
    amber: "bg-amber-soft text-amber-ink",
    ok: "bg-ok-soft text-ok-ink",
    full: "bg-full-soft text-full-ink",
    mine: "bg-primary text-white",
    danger: "bg-danger-soft text-danger",
    info: "bg-primary-soft text-primary-dark",
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold ${t[tone]}`}>{children}</span>;
}

/** Bottom sheet on phones, centred dialog on wide screens. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-ink/50" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-white px-5 pb-6 pt-3 sm:rounded-3xl">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line2 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="-mr-2 -mt-1 flex h-11 w-11 items-center justify-center rounded-xl hover:bg-ground">
            <X size={20} />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm font-semibold text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {label}…
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line2 px-4 py-6 text-center text-sm text-muted">{children}</div>;
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="flex flex-none items-center justify-center rounded-xl bg-primary" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="3" width="12" height="14" rx="1.5" />
        <path d="M9 7h6M9 10h6M9 13h4" />
        <circle cx="8" cy="20" r="1.5" />
        <circle cx="16" cy="20" r="1.5" />
      </svg>
    </span>
  );
}
