import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Card, Empty, SectionLabel, Spinner } from "@/components/ui";
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

  return (
    <AppShell title="Notice board">
      <div className="flex flex-col gap-3">
        {items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty>No announcements yet.</Empty>
        ) : (
          items.map((a) =>
            a.pinned ? (
              <div key={a.id} className="rounded-[18px] bg-ink p-4 text-white">
                <div className="flex justify-between text-[11px] font-extrabold tracking-[0.06em] text-[#F2B45C]">
                  <span>PINNED · SERVICE OVERSEER</span>
                  <span className="font-semibold tracking-normal text-[#B9C4C8]">{timeAgo(a.created_at)}</span>
                </div>
                <div className="mt-2 text-base font-extrabold leading-snug">{a.title}</div>
                {a.body ? <div className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-[#D9E0E2]">{a.body}</div> : null}
              </div>
            ) : (
              <Card key={a.id} className="p-4">
                <div className="flex justify-between gap-2">
                  <span className="text-sm font-extrabold">{a.title}</span>
                  <span className="whitespace-nowrap text-xs text-muted">{timeAgo(a.created_at)}</span>
                </div>
                {a.body ? <div className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-muted">{a.body}</div> : null}
              </Card>
            ),
          )
        )}
      </div>

      <div className="mt-6"><SectionLabel>GUIDELINES FOR CART WITNESSING</SectionLabel></div>
      <Card className="mt-2 px-4">
        <ol>
          {GUIDELINES.map(([b, rest], i) => (
            <li key={i} className="flex gap-3 border-b border-[#ECEEEA] py-3 last:border-b-0">
              <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-primary-soft text-[13px] font-extrabold text-primary-dark">{i + 1}</span>
              <span className="text-[13px] leading-relaxed"><b>{b}</b> {rest}</span>
            </li>
          ))}
        </ol>
      </Card>
    </AppShell>
  );
}
