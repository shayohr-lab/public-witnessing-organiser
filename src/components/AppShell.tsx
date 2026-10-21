import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Bell, Home, MapPin, MessageSquareText, Settings, ShieldCheck, User, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLive } from "@/lib/useLive";

function useCounts(userId: string | undefined) {
  const [unread, setUnread] = useState(0);
  const [invites, setInvites] = useState(0);
  const load = useCallback(async () => {
    if (!userId) return;
    const [n, i] = await Promise.all([
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
      supabase.from("invitations").select("id", { count: "exact", head: true }).eq("to_id", userId).eq("status", "pending"),
    ]);
    setUnread(n.count ?? 0);
    setInvites(i.count ?? 0);
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);
  useLive("notifications", load, 45000, userId ? `user_id=eq.${userId}` : undefined);
  return { unread, invites };
}

export function HeaderButton({ to, label, children, badge }: { to: string; label: string; children: ReactNode; badge?: number }) {
  return (
    <Link
      to={to}
      aria-label={badge ? `${label}, ${badge} new` : label}
      className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-ink hover:bg-ground"
    >
      {children}
      {badge ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C2410C] px-1 text-[11px] font-extrabold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export default function AppShell({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const { profile } = useAuth();
  const { unread, invites } = useCounts(profile?.id);
  const loc = useLocation();
  const isOverseer = profile?.role === "overseer" && profile.status === "approved";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const tabs = [
    { to: "/home", label: "Home", icon: Home },
    { to: "/map", label: "Map", icon: MapPin },
    { to: "/invites", label: "Invites", icon: UserPlus, badge: invites },
    { to: "/notices", label: "Notices", icon: MessageSquareText },
    { to: "/profile", label: "Profile", icon: User },
  ];

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col bg-ground">
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-ground/95 px-5 pb-3 pt-4 backdrop-blur">
        <h1 className="flex-1 text-2xl font-extrabold tracking-tight">{title}</h1>
        {actions}
        {isOverseer ? (
          <HeaderButton to="/admin" label="Service Overseer console">
            <ShieldCheck size={20} />
          </HeaderButton>
        ) : null}
        <HeaderButton to="/notifications" label="Notifications" badge={unread}>
          <Bell size={20} />
        </HeaderButton>
        <HeaderButton to="/settings" label="Settings">
          <Settings size={20} />
        </HeaderButton>
      </header>
      <main className="flex-1 px-5 pb-28">{children}</main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-[480px] grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]"
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `relative flex h-[64px] flex-col items-center justify-center gap-1 text-[11px] ${isActive ? "font-bold text-primary" : "font-semibold text-muted"}`
            }
          >
            <t.icon size={22} strokeWidth={1.9} aria-hidden="true" />
            {t.label}
            {t.badge ? (
              <span className="absolute left-1/2 top-2 ml-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#C2410C] px-1 text-[11px] font-extrabold text-white">
                {t.badge}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Simple page with a back arrow, no tab bar (used for sub-pages). */
export function SubPage({ title, back, children }: { title: string; back: string; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-[100dvh] max-w-[480px] bg-ground">
      <header className="sticky top-0 z-30 flex items-center gap-1 bg-ground/95 px-3 pb-3 pt-4 backdrop-blur">
        <Link to={back} aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
      </header>
      <main className="px-5 pb-12">{children}</main>
    </div>
  );
}
