import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { SubPage } from "@/components/AppShell";
import { isStaff } from "@/lib/roles";
import { Button, Card, SectionLabel } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { APP_VERSION, DONATION_URL } from "@/lib/config";
import { addDays, fmtDate, mondayOf, todayISO } from "@/lib/format";
import type { Location } from "@/lib/types";

function get(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function put(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

function Row({ children, last }: { children: ReactNode; last?: boolean }) {
  return <div className={`flex min-h-[54px] items-center justify-between gap-3 text-sm font-semibold ${last ? "" : "border-b border-[#ECEEEA]"}`}>{children}</div>;
}

function Segmented({ options, value, onChange, label }: { options: [string, string][]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex overflow-hidden rounded-full border border-line2 text-[13px] font-bold">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`h-9 px-3 ${value === v ? "bg-ink text-white" : ""}`}>{l}</button>
      ))}
    </div>
  );
}

export default function Settings() {
  const { signOut, profile } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [cong, setCong] = useState("");
  const [locs, setLocs] = useState<Location[]>([]);
  const [text, setText] = useState(get("pwo.text") || "normal");
  const [defLoc, setDefLoc] = useState(get("pwo.defaultLocation") || "");
  const thisWeek = mondayOf(todayISO());
  const [week, setWeek] = useState(thisWeek);
  const [printLoc, setPrintLoc] = useState("all");

  useEffect(() => {
    supabase.from("congregations").select("name").maybeSingle().then(({ data }) => setCong(data?.name ?? ""));
    supabase.from("locations").select("*").eq("active", true).order("sort_order").then(({ data }) => setLocs((data as Location[]) ?? []));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.text = text;
    put("pwo.text", text);
  }, [text]);

  const weeks = Array.from({ length: 5 }, (_, i) => addDays(thisWeek, i * 7));

  return (
    <SubPage title="Settings" back="/home">
      <div className="flex flex-col gap-2.5">
        <SectionLabel>DISPLAY &amp; LANGUAGE</SectionLabel>
        <Card className="px-4">
          <Row>
            Language
            <Segmented label="Language" options={[["en", "English"], ["sw", "Kiswahili"]]} value="en" onChange={(v) => v === "sw" && toast("Kiswahili is coming soon", "info")} />
          </Row>
          <Row>
            Text size
            <Segmented label="Text size" options={[["small", "A−"], ["normal", "A"], ["large", "A+"]]} value={text} onChange={setText} />
          </Row>
          <Row last>
            <label htmlFor="defloc">Default location on Home</label>
            <select
              id="defloc"
              value={defLoc}
              onChange={(e) => { setDefLoc(e.target.value); put("pwo.defaultLocation", e.target.value); }}
              className="h-10 rounded-xl border border-line2 bg-white px-2.5 text-sm font-semibold"
            >
              <option value="">First location</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Row>
        </Card>

        <div className="mt-3"><SectionLabel>NOTIFICATIONS &amp; REMINDERS</SectionLabel></div>
        <Card className="px-4">
          <Row>In-app notifications<span className="text-xs font-bold text-ok-ink">On</span></Row>
          <Row>SMS<span className="rounded-full border border-dashed border-line2 px-2 py-0.5 text-[11px] font-extrabold text-muted">Coming soon</span></Row>
          <Row>Automatic WhatsApp<span className="rounded-full border border-dashed border-line2 px-2 py-0.5 text-[11px] font-extrabold text-muted">Coming soon</span></Row>
          <div className="py-3 text-[13px] leading-relaxed text-muted">
            You get a notification here when someone invites you, joins or leaves your session, or when you are left alone. Open the app the day before
            your session to check.
          </div>
        </Card>

        <div className="mt-3"><SectionLabel>TIMETABLE (PDF)</SectionLabel></div>
        <Card className="flex flex-col gap-2.5 p-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-bold">
              Week
              <select value={week} onChange={(e) => setWeek(e.target.value)} className="h-10 rounded-xl border border-line2 bg-white px-2 text-[13px] font-semibold">
                {weeks.map((w) => <option key={w} value={w}>Week of {fmtDate(w)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold">
              Location
              <select value={printLoc} onChange={(e) => setPrintLoc(e.target.value)} className="h-10 rounded-xl border border-line2 bg-white px-2 text-[13px] font-semibold">
                <option value="all">All locations</option>
                {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted">Every slot with the publishers' names — print it or save it as PDF.</p>
          <Button onClick={() => nav(`/print?week=${week}&location=${printLoc}`)}>Create timetable</Button>
        </Card>

        <div id="about" className="mt-3"><SectionLabel>ABOUT</SectionLabel></div>
        <Card className="p-4">
          <div className="text-[15px] font-extrabold">Public Witnessing Organizer</div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Version {APP_VERSION}{cong ? ` · ${cong}` : ""}. Helps publishers book cart sessions and coordinate with companions.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            <b className="text-ink">Privacy:</b> the app stores your name, mobile number, optional email and your bookings. Only approved publishers of
            your congregation can see names and numbers, and only to arrange sessions. Ask your Service Overseer to remove your account at any time.
          </p>
        </Card>

        <div id="help" className="mt-3"><SectionLabel>HELP</SectionLabel></div>
        <Card className="px-4">
          <details className="border-b border-[#ECEEEA] py-3.5">
            <summary className="cursor-pointer text-sm font-semibold">How to book and invite</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-muted">
              <li>On Home, choose the day and the location.</li>
              <li>Tap <b>Book</b> on an open slot, or <b>Join</b> where someone is waiting.</li>
              <li>If you are the first, invite a companion (at least 2 days before).</li>
              <li>Accept invitations in the Invites tab.</li>
            </ol>
          </details>
          <Link to="/notices" className="flex min-h-[52px] items-center justify-between border-b border-[#ECEEEA] text-sm font-semibold text-ink">
            Cart witnessing guidelines <ChevronRight size={18} className="text-muted" />
          </Link>
          <div className="py-3.5 text-[13px] leading-relaxed text-muted">Forgot your password? Ask your Service Overseer to reset it — they'll give you a temporary one.</div>
        </Card>

        {DONATION_URL ? (
          <>
            <div className="mt-3"><SectionLabel>DONATIONS</SectionLabel></div>
            <Card className="flex flex-col gap-2.5 p-4">
              <p className="text-[13px] text-open-ink">The app doesn't collect money. This opens the donation page in your browser.</p>
              <a href={DONATION_URL} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-xl border border-line2 font-bold text-ink">Open donation page ↗</a>
            </Card>
          </>
        ) : null}

        {isStaff(profile) ? (
          <Link to="/admin" className="mt-3 flex h-12 items-center justify-center rounded-xl bg-ink font-bold text-white">Open the console</Link>
        ) : null}
        <Button variant="danger" className="mt-3" onClick={async () => { await signOut(); nav("/", { replace: true }); }}>Sign out</Button>
      </div>
    </SubPage>
  );
}
