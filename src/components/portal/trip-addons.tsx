"use client";

import { useEffect, useState, useCallback } from "react";
import { effectiveAddonStatus } from "@/lib/addons";

type Available = { id: string; name: string; description: string | null; sell_price: number | null };
type Mine = { id: string; component_id: string | null; label: string; price: number | null; status?: string | null; notes?: string | null };

const STEPS = [
  { t: "Pay your deposit", d: "Secures your spot — done if you're here." },
  { t: "Check your flights", d: "Find arrival/departure times that fit the week." },
  { t: "Sort your extras", d: "Want extra nights or gear? Request them — or choose none." },
  { t: "We confirm", d: "We'll confirm availability and add it to your trip." },
  { t: "Book your flights", d: "Once your dates are set, lock in your flights." },
];

function money(n: number | null) {
  return n != null ? `€${Number(n).toLocaleString("en-US")}` : "";
}

export function TripAddons({ bookingId, depositPaid }: { bookingId: string; depositPaid: boolean }) {
  const [available, setAvailable] = useState<Available[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showOffers, setShowOffers] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/portal/bookings/${bookingId}/addons`)
      .then((r) => r.json())
      .then((d) => {
        setAvailable(Array.isArray(d?.available) ? d.available : []);
        setMine(Array.isArray(d?.mine) ? d.mine : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [bookingId]);
  useEffect(() => { load(); }, [load]);

  async function request(componentId: string) {
    setBusy(componentId);
    await fetch(`/api/portal/bookings/${bookingId}/addons`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: componentId }),
    });
    setBusy(null);
    setShowOffers(false);
    load();
  }

  async function chooseNone() {
    setBusy("none");
    await fetch(`/api/portal/bookings/${bookingId}/addons`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ none: true }),
    });
    setBusy(null);
    load();
  }

  // active = real requests/confirmed (not the "none" marker)
  const active = mine.filter((m) => effectiveAddonStatus(m) !== "declined");
  const noneChosen = mine.some((m) => effectiveAddonStatus(m) === "declined");
  const resolved = active.length > 0 || noneChosen;
  const requestedIds = new Set(active.map((m) => m.component_id).filter(Boolean));
  const offer = available.filter((a) => !requestedIds.has(a.id));

  const Offers = () => (
    <div className="space-y-2">
      {offer.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-3 bg-[#f8fbfc] rounded-xl px-4 py-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[#00374a] truncate">{a.name}{a.sell_price ? ` · ${money(a.sell_price)}` : ""}</p>
            {a.description && <p className="text-[12.5px] text-[#8a9aa0] truncate">{a.description}</p>}
          </div>
          <button onClick={() => request(a.id)} disabled={busy === a.id}
            className="shrink-0 px-4 py-2 rounded-full text-[12.5px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-colors">
            {busy === a.id ? "…" : "Request"}
          </button>
        </div>
      ))}
      <p className="text-[12px] text-[#9aa6ac] mt-1">Requests aren&apos;t charged automatically — we confirm availability first, then add it to your balance.</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* process steps */}
      <ol className="space-y-2.5">
        {STEPS.map((s, i) => {
          const done = (i === 0 && depositPaid) || (i === 2 && resolved);
          return (
            <li key={s.t} className="flex gap-3">
              <span className={`shrink-0 w-6 h-6 rounded-full grid place-items-center text-[12px] font-bold ${done ? "bg-green-500 text-white" : "bg-[#e3eef1] text-[#00748f]"}`}>
                {done ? "✓" : i + 1}
              </span>
              <div>
                <p className="text-[14px] font-bold text-[#00374a] leading-tight">{s.t}</p>
                <p className="text-[12.5px] text-[#8a9aa0] leading-snug">{s.d}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* my requests */}
      {active.length > 0 && (
        <div className="border-t border-[#f3ede2] pt-4 space-y-2">
          {active.map((m) => {
            const confirmed = effectiveAddonStatus(m) === "confirmed";
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 text-[13.5px]">
                <span className="font-semibold text-[#00374a]">{m.label}{m.price ? ` · ${money(m.price)}` : ""}</span>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${confirmed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                  {confirmed ? "Confirmed ✓" : "Requested"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* offers / none */}
      {!loading && (offer.length > 0 || !resolved) && (
        <div className="border-t border-[#f3ede2] pt-4">
          {!resolved ? (
            <>
              <p className="text-[12.5px] font-bold text-[#6a7a80] mb-2.5">Add to your trip</p>
              {offer.length > 0 ? <Offers /> : <p className="text-[13px] text-[#8a9aa0]">No optional extras for this trip.</p>}
              <button onClick={chooseNone} disabled={busy === "none"}
                className="mt-3 text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a] underline underline-offset-2">
                {busy === "none" ? "…" : "No extras needed — I'm all set"}
              </button>
            </>
          ) : (
            <>
              {noneChosen && active.length === 0 && <p className="text-[13px] text-[#5a6b72] mb-2">✓ No extras needed — you&apos;re all set.</p>}
              {offer.length > 0 && (
                showOffers ? (
                  <>
                    <Offers />
                    <button onClick={() => setShowOffers(false)} className="mt-2 text-[12.5px] font-semibold text-[#8a9aa0] hover:text-[#00374a]">Hide</button>
                  </>
                ) : (
                  <button onClick={() => setShowOffers(true)} className="text-[13px] font-bold text-[#00afdb] hover:underline">+ Add something else</button>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
