import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Card, Field, Input, Pill, Sheet, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { supabase, errorText } from "@/lib/supabase";
import { fmtRange } from "@/lib/format";
import type { Location, TimeSlot } from "@/lib/types";

type Draft = Partial<Location> & { lat?: string; lng?: string };

export default function Locations() {
  const toast = useToast();
  const { profile } = useAuth();
  const [locs, setLocs] = useState<Location[] | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [slotDraft, setSlotDraft] = useState<{ start: string; end: string } | null>(null);

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([
      supabase.from("locations").select("*").order("sort_order").order("name"),
      supabase.from("time_slots").select("*").order("start_time"),
    ]);
    // hidden (archived) rows keep their history but are not shown
    setLocs(((l.data as Location[]) ?? []).filter((x) => !x.archived));
    setSlots(((s.data as TimeSlot[]) ?? []).filter((x) => !x.archived));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function openEdit(l?: Location) {
    setDraft(
      l
        ? { ...l, lat: l.latitude?.toString() ?? "", lng: l.longitude?.toString() ?? "" }
        : { name: "", description: "", cart_storage: "", active: true, sort_order: (locs?.length ?? 0) + 1, lat: "", lng: "" },
    );
  }

  async function save() {
    if (!draft || !profile) return;
    if (!draft.name?.trim()) return toast("Please enter a name", "error");
    const lat = draft.lat ? Number(draft.lat) : null;
    const lng = draft.lng ? Number(draft.lng) : null;
    if ((draft.lat && Number.isNaN(lat)) || (draft.lng && Number.isNaN(lng))) return toast("Latitude and longitude must be numbers", "error");
    const row = {
      name: draft.name.trim(),
      description: draft.description || null,
      cart_storage: draft.cart_storage || null,
      latitude: lat,
      longitude: lng,
      active: draft.active ?? true,
      sort_order: Number(draft.sort_order) || 0,
    };
    setBusy(true);
    const { error } = draft.id
      ? await supabase.from("locations").update(row).eq("id", draft.id)
      : await supabase.from("locations").insert({ ...row, congregation_id: profile.congregation_id });
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    toast("Location saved");
    setDraft(null);
    load();
  }

  function useMyLocation() {
    if (!navigator.geolocation) return toast("Location is not available on this device", "error");
    navigator.geolocation.getCurrentPosition(
      (pos) => setDraft((d) => d && { ...d, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }),
      () => toast("Couldn't get your location", "error"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function toggleSlot(s: TimeSlot) {
    const { error } = await supabase.from("time_slots").update({ active: !s.active }).eq("id", s.id);
    if (error) return toast(errorText(error), "error");
    load();
  }

  async function removeLocation(l: Location) {
    if (!window.confirm(`Delete ${l.name}?\n\nIf it was used before it will be hidden instead, so past records stay correct. Its upcoming bookings will be cancelled and the publishers told.`)) return;
    const { data, error } = await supabase.rpc("delete_location", { p_location: l.id });
    if (error) return toast(error.code === "PGRST202" ? "Deleting needs the v1.1 database update." : errorText(error), "error");
    toast(data === "deleted" ? `${l.name} deleted` : `${l.name} hidden — it has booking history`, "info");
    load();
  }

  async function addSlot() {
    if (!slotDraft) return;
    if (!slotDraft.start || !slotDraft.end) return toast("Choose a start and an end time", "error");
    setBusy(true);
    const { error } = await supabase.rpc("add_time_slot", { p_start: slotDraft.start, p_end: slotDraft.end });
    setBusy(false);
    if (error) return toast(error.code === "PGRST202" ? "Adding slots needs the v1.1 database update." : errorText(error), "error");
    toast(`Slot ${fmtRange(slotDraft.start, slotDraft.end)} added`);
    setSlotDraft(null);
    load();
  }

  async function removeSlot(t: TimeSlot) {
    const label = fmtRange(t.start_time, t.end_time);
    if (!window.confirm(`Delete the ${label} slot?\n\nIf it was used before it will be hidden instead, so past records stay correct. Its upcoming bookings will be cancelled and the publishers told.`)) return;
    const { data, error } = await supabase.rpc("delete_time_slot", { p_slot: t.id });
    if (error) return toast(error.code === "PGRST202" ? "Deleting slots needs the v1.1 database update." : errorText(error), "error");
    toast(data === "deleted" ? `Slot ${label} deleted` : `Slot ${label} hidden — it has booking history`, "info");
    load();
  }

  if (!locs) return <Spinner />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[26px] font-extrabold tracking-tight">Locations &amp; slots</h1>
        <Button onClick={() => openEdit()}>+ Add location</Button>
      </div>
      <Card>
        {locs.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3 border-b border-[#ECEEEA] px-4 py-3.5 last:border-b-0">
            <div className="min-w-[200px] flex-1">
              <div className="font-extrabold">{l.name}</div>
              <div className="text-[13px] text-muted">
                {[l.description, l.cart_storage ? `cart kept at ${l.cart_storage}` : null, l.latitude != null ? "map pin set" : "no map pin"].filter(Boolean).join(" · ")}
              </div>
            </div>
            <Pill tone={l.active ? "ok" : "full"}>{l.active ? "Active" : "Inactive"}</Pill>
            <Button variant="secondary" className="h-10 text-[13px]" onClick={() => openEdit(l)}>Edit</Button>
            <Button variant="danger" className="h-10 text-[13px]" onClick={() => removeLocation(l)}>Delete</Button>
          </div>
        ))}
      </Card>
      <p className="-mt-3 text-xs text-muted">To pause a location, edit it and untick "Active". Delete removes it; a location with booking history is hidden instead.</p>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[17px] font-extrabold">Time slots</h2>
          <Button variant="secondary" className="h-10 text-[13px]" onClick={() => setSlotDraft({ start: "", end: "" })}>+ Add slot</Button>
        </div>
        <p className="mt-1 text-sm text-muted">Monday to Saturday. Tick or untick a slot to turn new bookings for it on or off.</p>
        <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
          {slots.map((s) => (
            <div key={s.id} className="flex h-12 items-center gap-2 rounded-xl border border-line pl-3.5 pr-1.5 text-sm font-bold">
              <label className="flex flex-1 cursor-pointer items-center justify-between gap-2">
                <span className={s.active ? "" : "text-muted line-through"}>{fmtRange(s.start_time, s.end_time)}</span>
                <input type="checkbox" checked={s.active} onChange={() => toggleSlot(s)} aria-label={`Active ${fmtRange(s.start_time, s.end_time)}`} className="h-5 w-5 accent-[#1D5C70]" />
              </label>
              <button onClick={() => removeSlot(s)} aria-label={`Delete slot ${fmtRange(s.start_time, s.end_time)}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-danger hover:bg-danger-soft">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Sheet open={!!slotDraft} onClose={() => setSlotDraft(null)} title="Add a time slot">
        {slotDraft ? (
          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Start"><Input type="time" value={slotDraft.start} onChange={(e) => setSlotDraft({ ...slotDraft, start: e.target.value })} /></Field>
              <Field label="End"><Input type="time" value={slotDraft.end} onChange={(e) => setSlotDraft({ ...slotDraft, end: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-muted">The slot is added to every location, Monday to Saturday. It can't overlap another slot.</p>
            <Button busy={busy} onClick={addSlot}>Add slot</Button>
          </div>
        ) : null}
      </Sheet>

      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Edit location" : "Add location"}>
        {draft ? (
          <div className="flex flex-col gap-3.5">
            <Field label="Name"><Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Cart spot" hint="(optional)"><Input value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="e.g. Near the market entrance" /></Field>
            <Field label="Where the cart is kept" hint="(optional)"><Input value={draft.cart_storage ?? ""} onChange={(e) => setDraft({ ...draft, cart_storage: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Latitude"><Input inputMode="decimal" value={draft.lat ?? ""} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} placeholder="-6.85" /></Field>
              <Field label="Longitude"><Input inputMode="decimal" value={draft.lng ?? ""} onChange={(e) => setDraft({ ...draft, lng: e.target.value })} placeholder="39.30" /></Field>
            </div>
            <Button variant="ghost" onClick={useMyLocation}>Use my current location</Button>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Order"><Input type="number" value={draft.sort_order ?? 0} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} /></Field>
              <label className="flex items-end gap-2 pb-3 text-sm font-semibold">
                <input type="checkbox" checked={draft.active ?? true} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="h-5 w-5 accent-[#1D5C70]" /> Active
              </label>
            </div>
            <Button busy={busy} onClick={save}>Save</Button>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
