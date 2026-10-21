import { Logo } from "@/components/ui";

/** Shown only when the Supabase values were not provided at build time. */
export default function Setup() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col justify-center gap-4 px-6">
      <Logo size={48} />
      <h1 className="text-2xl font-extrabold">Almost ready</h1>
      <p className="text-muted">
        This app is not connected to its database yet. Add <code className="rounded bg-white px-1">VITE_SUPABASE_URL</code> and{" "}
        <code className="rounded bg-white px-1">VITE_SUPABASE_ANON_KEY</code> (Supabase → Project Settings → API) to the hosting settings, then deploy again.
      </p>
    </div>
  );
}
