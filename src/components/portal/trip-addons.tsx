"use client";

import { useEffect, useState, useCallback } from "react";
import { effectiveAddonStatus } from "@/lib/addons";
import { hasFlights, type FlightInfo } from "@/lib/flights";

type Available = { id: string; name: string; description: string | null; sell_price: number | null };
type Mine = { id: string; component_id: string | null; label: string; price: number | null; status?: string | null; notes?: string | null };

const STEPS = [
  { t: "Pay your deposit", d: "Secures your spot — done if you're here." },
  { t: "Check your flights", d: "Find arrival/departure times that fit the week." },
  { t: "Request extras", d: "Want extra nights, gear or more? Request them — or choose none." },
  { t: "We confirm", d: "We'll confirm availability and add it to your trip." },
  { t: "Book your flights", d: "Once your dates are set, lock in your flights." },
];

function money(n: number | null) {
  return n != null ? `€${Number(n).toLocaleString("en-US")}` : "";
}

export function TripAddons({ bookingId, depositPaid, initialFlights }: { bookingId: string; depositPaid: boolean; initialFlights: FlightInfo | null }) {
  const [available, setAvailable] = useState<Available[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showOffers, setShowOffers] = useState(false);

  // flights
  const [flights, setFlights] = useState<FlightInfo | null>(initialFlights);
  const [flightForm, setFlightForm] = useState<FlightInfo>(initialFlights ?? {});
  const [showFlights, setShowFlights] = useState(false);
  const [editingFlights, setEditingFlights] = useState(false);
  const [savingFlights, setSavingFlights] = useState(false);
  const flightsSaved = hasFlights(flights);

  async function saveFlights() {
    setSavingFlights(true);
    const res = await fetch(`/api/portal/bookings/${bookingId}/flights`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(flightForm),
    });
    const d = await res.json().catch(() => ({}));
    setSavingFlights(false);
    if (res.ok) { setFlights(d.flights ?? flightForm); setEditingFlights(false); }
  }
  const setFF = (k: keyof FlightInfo, v: string) => setFlightForm((f) => ({ ...f, [k]: v }));

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
          const done = (i === 0 && depositPaid) || (i === 1 && flightsSaved) || (i === 2 && resolved) || (i === 4 && flightsSaved);
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

      {/* Add to your trip — always a folded module; expands on click */}
      {!loading && (
        <div className="border-t border-[#f3ede2] pt-4">
          <button
            onClick={() => setShowOffers((v) => !v)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="text-[14px] font-bold text-[#00374a]">Add to your trip{offer.length > 0 ? ` · ${offer.length}` : ""}</span>
            <svg className={`w-4 h-4 text-[#8a9aa0] transition-transform ${showOffers ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {showOffers && (
            <div className="mt-3">
              {offer.length > 0 ? <Offers /> : <p className="text-[13px] text-[#8a9aa0]">No optional extras for this trip.</p>}
              {!resolved && (
                <button onClick={chooseNone} disabled={busy === "none"}
                  className="mt-3 text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a] underline underline-offset-2">
                  {busy === "none" ? "…" : "No extras needed — I'm all set"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Flights — foldable module */}
      <div className="border-t border-[#f3ede2] pt-4">
        <button onClick={() => setShowFlights((v) => !v)} className="flex items-center justify-between w-full text-left">
          <span className="text-[14px] font-bold text-[#00374a]">
            {flightsSaved ? "Your flights ✈" : "I booked my flights ✈"}
            {flightsSaved && <span className="ml-1.5 text-green-600">✓</span>}
          </span>
          <svg className={`w-4 h-4 text-[#8a9aa0] transition-transform ${showFlights ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {showFlights && (
          <div className="mt-3">
            {flightsSaved && !editingFlights ? (
              <div className="space-y-2 text-[13.5px]">
                <FlightSummary label="Arrival" date={flights?.arrivalDate} time={flights?.arrivalTime} no={flights?.arrivalFlightNo} />
                <FlightSummary label="Departure" date={flights?.departureDate} time={flights?.departureTime} no={flights?.departureFlightNo} />
                <button onClick={() => { setFlightForm(flights ?? {}); setEditingFlights(true); }}
                  className="text-[13px] font-bold text-[#00afdb] hover:underline mt-1">Edit flights</button>
              </div>
            ) : (
              <div className="space-y-4">
                <FlightFields legend="Arrival" form={flightForm} setFF={setFF} keys={["arrivalDate", "arrivalTime", "arrivalFlightNo"]} />
                <FlightFields legend="Departure" form={flightForm} setFF={setFF} keys={["departureDate", "departureTime", "departureFlightNo"]} />
                <div className="flex gap-2">
                  <button onClick={saveFlights} disabled={savingFlights}
                    className="px-5 py-2.5 rounded-full text-[13px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60">
                    {savingFlights ? "Saving…" : flightsSaved ? "Save changes" : "Save my flights"}
                  </button>
                  {flightsSaved && (
                    <button onClick={() => setEditingFlights(false)} className="px-5 py-2.5 rounded-full text-[13px] font-bold text-[#6a7a80] bg-[#f1f5f6]">Cancel</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* current requests / status */}
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
      {noneChosen && active.length === 0 && (
        <p className="border-t border-[#f3ede2] pt-4 text-[13px] text-[#5a6b72]">✓ No extras needed — you&apos;re all set.</p>
      )}
    </div>
  );
}

function FlightSummary({ label, date, time, no }: { label: string; date?: string | null; time?: string | null; no?: string | null }) {
  const parts = [date, time, no].filter(Boolean);
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#6a7a80]">{label}</span>
      <span className="font-semibold text-[#00374a] text-right">{parts.length ? parts.join(" · ") : "—"}</span>
    </div>
  );
}

function FlightFields({ legend, form, setFF, keys }: { legend: string; form: FlightInfo; setFF: (k: keyof FlightInfo, v: string) => void; keys: [keyof FlightInfo, keyof FlightInfo, keyof FlightInfo] }) {
  const input = "px-3 py-2 rounded-lg border border-[#dde6e9] text-[14px] text-[#00374a] outline-none focus:border-[#00afdb]";
  return (
    <div>
      <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9aa6ac] mb-1.5">{legend}</p>
      <div className="grid grid-cols-[1fr_90px_1fr] gap-2">
        <input type="date" value={form[keys[0]] ?? ""} onChange={(e) => setFF(keys[0], e.target.value)} className={input} />
        <input type="time" value={form[keys[1]] ?? ""} onChange={(e) => setFF(keys[1], e.target.value)} className={input} />
        <input type="text" value={form[keys[2]] ?? ""} onChange={(e) => setFF(keys[2], e.target.value)} placeholder="Flight no." className={input} />
      </div>
    </div>
  );
}
