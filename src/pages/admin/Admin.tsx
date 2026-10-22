import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL, isSuperAdmin } from "@/lib/roles";
import Overview from "./Overview";
import Registrations from "./Registrations";
import Publishers from "./Publishers";
import Locations from "./Locations";
import Announcements from "./Announcements";

type Tab = "overview" | "registrations" | "publishers" | "locations" | "announcements";

export default function Admin() {
  const { profile } = useAuth();
  const superAdmin = isSuperAdmin(profile);
  const [tab, setTab] = useState<Tab>("overview");
  const [pending, setPending] = useState(0);
  const [cong, setCong] = useState("");

  const loadPending = useCallback(async () => {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending");
    setPending(count ?? 0);
  }, []);
  useEffect(() => {
    loadPending();
    supabase.from("congregations").select("name").maybeSingle().then(({ data }) => setCong(data?.name ?? ""));
  }, [loadPending]);

  // MT Assistants: bookings and registrations only
  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["registrations", "Registrations"],
    ["publishers", "Publishers"],
    ...(superAdmin ? ([["locations", "Locations"], ["announcements", "Announcements"]] as [Tab, string][]) : []),
  ];

  return (
    <div className="min-h-[100dvh] bg-ground">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-ink px-5 py-3.5 text-white">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div>
            <div className="text-[15px] font-extrabold">Public Witnessing Organizer</div>
            <div className="text-xs text-[#B9C4C8]">{cong ? `${cong} · ` : ""}{profile ? ROLE_LABEL[profile.role] : ""}</div>
          </div>
        </div>
        <Link to="/home" className="flex h-10 items-center gap-1.5 rounded-xl border border-[#3B4A50] px-3.5 text-[13px] font-bold">
          <ArrowLeft size={16} aria-hidden="true" /> Back to app
        </Link>
      </header>

      <div className="mx-auto flex max-w-[1400px] flex-wrap gap-6 p-4 sm:p-6">
        <nav aria-label="Console sections" className="flex w-full gap-1.5 overflow-x-auto lg:w-[220px] lg:flex-col">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              aria-current={tab === k ? "page" : undefined}
              className={`flex h-11 flex-none items-center justify-between gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm ${tab === k ? "border border-line bg-white font-extrabold" : "font-semibold text-open-ink"}`}
            >
              {label}
              {k === "registrations" && pending ? (
                <span className="rounded-full bg-[#C2410C] px-2 py-0.5 text-[11px] font-extrabold text-white">{pending}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <main className="min-w-0 flex-1">
          {tab === "overview" && <Overview pending={pending} onGoRegistrations={() => setTab("registrations")} />}
          {tab === "registrations" && <Registrations onChanged={loadPending} />}
          {tab === "publishers" && <Publishers />}
          {tab === "locations" && superAdmin && <Locations />}
          {tab === "announcements" && superAdmin && <Announcements />}
        </main>
      </div>
    </div>
  );
}
