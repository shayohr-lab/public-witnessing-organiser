import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Field, Input, Pill, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { supabase, errorText } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import type { Announcement } from "@/lib/types";

export default function Announcements() {
  const toast = useToast();
  const { profile } = useAuth();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
    setItems((data as Announcement[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function post() {
    if (!profile || !title.trim()) return toast("Please add a title", "error");
    setBusy(true);
    const { error } = await supabase.from("announcements").insert({
      congregation_id: profile.congregation_id,
      title: title.trim(),
      body: body.trim() || null,
      pinned,
      created_by: profile.id,
    });
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    toast("Posted to the notice board");
    setTitle(""); setBody("");
    load();
  }

  async function togglePin(a: Announcement) {
    const { error } = await supabase.from("announcements").update({ pinned: !a.pinned }).eq("id", a.id);
    if (error) return toast(errorText(error), "error");
    load();
  }

  async function remove(a: Announcement) {
    if (!window.confirm(`Delete "${a.title}"?`)) return;
    const { error } = await supabase.from("announcements").delete().eq("id", a.id);
    if (error) return toast(errorText(error), "error");
    toast("Deleted", "info");
    load();
  }

  return (
    <div className="flex flex-wrap gap-5">
      <Card className="flex min-w-0 flex-[1_1_340px] flex-col gap-3 self-start p-5">
        <h1 className="text-[22px] font-extrabold tracking-tight">Post an announcement</h1>
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. No cart at Geza on Saturday" /></Field>
        <Field label="Message">
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="resize-y rounded-xl border border-line2 px-3.5 py-2.5 text-[15px] font-medium outline-none focus:border-primary" />
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-5 w-5 accent-[#1D5C70]" /> Pin to the top
        </label>
        <Button busy={busy} onClick={post}>Post to notice board</Button>
      </Card>

      <div className="min-w-0 flex-[1_1_380px]">
        <h2 className="text-[17px] font-extrabold">Posted</h2>
        <div className="mt-2">
          {items === null ? (
            <Spinner />
          ) : items.length === 0 ? (
            <Empty>Nothing posted yet.</Empty>
          ) : (
            <Card>
              {items.map((a) => (
                <div key={a.id} className="border-b border-[#ECEEEA] px-4 py-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-extrabold">{a.title}</div>
                    {a.pinned ? <Pill tone="info">Pinned</Pill> : null}
                  </div>
                  {a.body ? <div className="mt-1 whitespace-pre-line text-[13px] text-muted">{a.body}</div> : null}
                  <div className="mt-1.5 flex items-center gap-4 text-xs text-muted">
                    {timeAgo(a.created_at)}
                    <button onClick={() => togglePin(a)} className="py-1.5 font-bold text-primary">{a.pinned ? "Unpin" : "Pin"}</button>
                    <button onClick={() => remove(a)} className="py-1.5 font-bold text-danger">Delete</button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
