import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Navigation } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Empty, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { isoDow, todayISO } from "@/lib/format";
import type { BoardRow, Location } from "@/lib/types";

export default function MapPage() {
  const [locs, setLocs] = useState<Location[] | null>(null);
  const [open, setOpen] = useState<Record<string, number>>({});
  const today = todayISO();

  useEffect(() => {
    supabase.from("locations").select("*").eq("active", true).order("sort_order").then(({ data }) => setLocs((data as Location[]) ?? []));
    if (isoDow(today) !== 7)
      supabase.rpc("week_board", { p_from: today, p_to: today }).then(({ data }) => {
        const m: Record<string, number> = {};
        ((data as BoardRow[]) ?? []).forEach((r) => {
          if (!r.is_past && !r.closed && r.booked < 3) m[r.location_id] = (m[r.location_id] ?? 0) + 1;
        });
        setOpen(m);
      });
  }, [today]);

  const withCoords = (locs ?? []).filter((l) => l.latitude != null && l.longitude != null);
  let mapSrc = "";
  if (withCoords.length) {
    const lats = withCoords.map((l) => l.latitude!);
    const lngs = withCoords.map((l) => l.longitude!);
    const pad = 0.01;
    const bbox = [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad].join(",");
    mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${withCoords[0].latitude},${withCoords[0].longitude}`;
  }

  return (
    <AppShell title="Cart locations">
      {mapSrc ? (
        <iframe title="Map of cart locations" src={mapSrc} className="h-64 w-full rounded-[20px] border border-line" loading="lazy" />
      ) : null}
      <div className="mt-3 flex flex-col gap-3">
        {locs === null ? (
          <Spinner />
        ) : locs.length === 0 ? (
          <Empty>No locations yet.</Empty>
        ) : (
          locs.map((l) => (
            <Card key={l.id} className="p-4">
              <div className="text-[17px] font-extrabold">{l.name}</div>
              {l.description ? <div className="mt-0.5 text-[13px] text-muted">{l.description}</div> : null}
              <div className="mt-2 text-[13px] text-open-ink">
                {isoDow(today) === 7 ? "No sessions on Sunday" : <>Today: <b>{open[l.id] ?? 0}</b> slots with room</>}
                {l.cart_storage ? <> · Cart kept at {l.cart_storage}</> : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {l.latitude != null && l.longitude != null ? (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${l.latitude},${l.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line2 text-sm font-bold text-ink"
                  >
                    <Navigation size={16} aria-hidden="true" /> Directions
                  </a>
                ) : (
                  <span className="flex h-11 items-center justify-center rounded-xl border border-dashed border-line2 text-xs font-semibold text-muted">Map pin not set yet</span>
                )}
                <Link to={`/home?location=${l.id}`} className="flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">
                  See slots
                </Link>
              </div>
            </Card>
          ))
        )}
      </div>
    </AppShell>
  );
}
