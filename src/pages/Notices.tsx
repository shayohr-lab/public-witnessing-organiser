import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Pin } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import type { Announcement } from "@/lib/types";

export const GUIDELINES = [
  ["Arrive 10 minutes early", "and set up the cart together with your companion."],
  ["Let people approach.", "Stand beside the cart, greet warmly, and keep conversations peaceful and brief."],
  ["Never leave the cart unattended", "and never witness alone — at least two publishers at all times."],
  ["Return the cart", "to its storage place at the end of the last session of the day."],
];

export default function Notices() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from("announcements")
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setItems((data as Announcement[]) ?? []));
    try { localStorage.setItem("pwo.noticesSeen", new Date().toISOString()); } catch { /* ignore */ }
  }, []);

  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  return (
    <AppShell title="Notice board">
      {items === null ? (
        <Spinner />
      ) : (
        <Card className="overflow-hidden">
          {items.length === 0 ? <div className="px-4 py-4 text-sm text-muted">No announcements yet.</div> : null}
          {items.map((a) => (
            <Item
              key={a.id}
              id={a.id}
              open={openId === a.id}
              onToggle={toggle}
              title={a.title}
              meta={timeAgo(a.created_at)}
              pinned={a.pinned}
            >
              {a.body ? <div className="whitespace-pre-line text-[13px] leading-relaxed text-open-ink">{a.body}</div> : <div className="text-[13px] text-muted">No details.</div>}
            </Item>
          ))}
          <Item id="guidelines" open={openId === "guidelines"} onToggle={toggle} title="Guidelines for cart witnessing" meta="4 points">
            <ol>
              {GUIDELINES.map(([b, rest], i) => (
                <li key={i} className="flex gap-3 border-b border-[#ECEEEA] py-2.5 last:border-b-0">
                  <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-primary-soft text-[13px] font-extrabold text-primary-dark">{i + 1}</span>
                  <span className="text-[13px] leading-relaxed"><b>{b}</b> {rest}</span>
                </li>
              ))}
            </ol>
          </Item>
        </Card>
      )}
      <p className="mt-2 text-xs text-muted">Tap a title to read it.</p>
    </AppShell>
  );
}

function Item({
  id, open, onToggle, title, meta, pinned, children,
}: { id: string; open: boolean; onToggle: (id: string) => void; title: string; meta: string; pinned?: boolean; children: ReactNode }) {
  return (
    <div className="border-b border-[#ECEEEA] last:border-b-0">
      <button
        onClick={() => onToggle(id)}
        aria-expanded={open}
        aria-controls={`notice-${id}`}
        className={`flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left ${open ? "bg-ground" : ""}`}
      >
        {pinned ? <Pin size={16} className="flex-none text-amber-strong" aria-label="Pinned" /> : null}
        <span className="min-w-0 flex-1 text-sm font-extrabold leading-snug">{title}</span>
        <span className="whitespace-nowrap text-xs text-muted">{meta}</span>
        <ChevronDown size={18} className={`flex-none text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? <div id={`notice-${id}`} className="px-4 pb-4 pt-1">{children}</div> : null}
    </div>
  );
}
