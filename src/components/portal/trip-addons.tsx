"use client";

import { useEffect, useState, useCallback } from "react";
import { effectiveAddonStatus } from "@/lib/addons";
import { hasFlightDetails, type FlightInfo } from "@/lib/flights";
import type { ArrivalInfo } from "@/lib/portal-data";

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

export function TripAddons({ bookingId, depositPaid, initialFlights, arrival, editionStart, editionEnd }: { bookingId: string; depositPaid: boolean; initialFlights: FlightInfo | null; arrival: ArrivalInfo | null; editionStart: string | null; editionEnd: string | null }) {
  const [available, setAvailable] = useState<Available[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showOffers, setShowOffers] = useState(false);

  // flights
  const [flights, setFlights] = useState<FlightInfo | null>(initialFlights);
  // Prefill the form dates with the trip's own dates so the member doesn't retype them.
  const [flightForm, setFlightForm] = useState<FlightInfo>({
    ...(initialFlights ?? {}),
    arrivalDate: initialFlights?.arrivalDate ?? editionStart ?? undefined,
    departureDate: initialFlights?.departureDate ?? editionEnd ?? undefined,
  });
  const [showFlights, setShowFlights] = useState(false);
  const [editingFlights, setEditingFlights] = useState(false);
  const [savingFlights, setSavingFlights] = useState(false);
  const flightsSaved = hasFlightDetails(flights);
  const flightsBooked = flights?.booked === true;

  async function putFlights(payload: FlightInfo) {
    const res = await fetch(`/api/portal/bookings/${bookingId}/flights`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setFlights(d.flights ?? payload);
    return res.ok;
  }

  async function saveFlights() {
    setSavingFlights(true);
    const ok = await putFlights({ ...flightForm, booked: flights?.booked ?? false });
    setSavingFlights(false);
    if (ok) setEditingFlights(false);
  }

  async function markBooked() {
    await putFlights({ ...(flights ?? {}), booked: true });
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

  const chevron = (open: boolean) => (
    <svg className={`w-4 h-4 shrink-0 text-[#8a9aa0] transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
  );
  const badge = (i: number, done: boolean) => (
    <span className={`shrink-0 w-6 h-6 rounded-full grid place-items-center text-[12px] font-bold ${done ? "bg-green-500 text-white" : "bg-[#e3eef1] text-[#00748f]"}`}>
      {done ? "✓" : i + 1}
    </span>
  );

  return (
    <div className="space-y-2">
      {STEPS.map((s, i) => {
        const done = (i === 0 && depositPaid) || (i === 1 && flightsSaved) || (i === 2 && resolved) || (i === 4 && flightsBooked);
        const isFlights = i === 1;
        const isExtras = i === 2;
        const open = (isFlights && showFlights) || (isExtras && showOffers);

        // Non-interactive steps (deposit, we confirm, book flights w/ button)
        if (!isFlights && !isExtras) {
          return (
            <div key={s.t} className="flex gap-3 px-1 py-1">
              {badge(i, done)}
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[#00374a] leading-tight">{s.t}</p>
                <p className="text-[12.5px] text-[#8a9aa0] leading-snug">{s.d}</p>
                {i === 4 && !flightsBooked && (
                  <button onClick={markBooked} className="mt-1.5 px-3 py-1 rounded-full text-[12px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] transition-colors">I&apos;ve booked them ✓</button>
                )}
              </div>
            </div>
          );
        }

        // Interactive steps: clickable module that folds open inline
        const toggle = isFlights ? () => setShowFlights((v) => !v) : () => setShowOffers((v) => !v);
        const subline = isFlights
          ? (flightsSaved ? "Flight details added — tap to view or edit" : "Tap to add your flight details")
          : (resolved ? (active.length ? `${active.length} requested — tap to manage` : "No extras — tap to change") : "Tap to add extra nights, gear & more");
        return (
          <div key={s.t} className="rounded-xl border border-[#eee2cf] bg-[#fffdf8] overflow-hidden">
            <button onClick={toggle} className="flex items-center gap-3 w-full text-left px-3 py-2.5 hover:bg-[#fbf6ec] transition-colors">
              {badge(i, done)}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-[#00374a] leading-tight">
                  {s.t}
                  {isFlights && flightsBooked && <span className="ml-1.5 text-[11px] font-bold uppercase tracking-wide text-green-600">Booked</span>}
                </p>
                <p className="text-[12.5px] text-[#8a9aa0] leading-snug">{subline}</p>
              </div>
              {chevron(open)}
            </button>

            {open && isFlights && (
              <div className="px-3 pb-3 pt-3 border-t border-[#f0e6d6]">
                <div className="rounded-lg bg-[#eef6f8] p-3 mb-3 text-[13px] text-[#4a5b62] space-y-1.5">
                  <p className="font-bold text-[#00374a]">✈ You book your own flights</p>
                  <p className="leading-snug">We don&apos;t book flights for you — choose times that fit the week and add them here. Happy to advise on the best arrival/departure if you&apos;re unsure.</p>
                  {arrival?.airportCode && (
                    <p>Airport: <strong className="text-[#00374a]">{arrival.airportCode}</strong>{arrival.airportDistance ? ` · ${arrival.airportDistance}` : ""}</p>
                  )}
                  {arrival && arrival.transportOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="text-[12px] text-[#8a9aa0]">Getting there:</span>
                      {arrival.transportOptions.map((t) => (
                        <span key={t} className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${/recommend/i.test(t) ? "bg-[#00afdb]/15 text-[#0782a0]" : "bg-white text-[#5a6b72] border border-[#dde6e9]"}`}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                {flightsSaved && !editingFlights ? (
                  <div className="space-y-2 text-[13.5px]">
                    <FlightSummary label="Arrival" date={flights?.arrivalDate} time={flights?.arrivalTime} no={flights?.arrivalFlightNo} />
                    <FlightSummary label="Departure" date={flights?.departureDate} time={flights?.departureTime} no={flights?.departureFlightNo} />
                    <button onClick={() => { setFlightForm(flights ?? {}); setEditingFlights(true); }} className="text-[13px] font-bold text-[#00afdb] hover:underline mt-1">Edit flights</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <FlightFields legend="Arrival" form={flightForm} setFF={setFF} keys={["arrivalDate", "arrivalTime", "arrivalFlightNo"]} />
                    <FlightFields legend="Departure" form={flightForm} setFF={setFF} keys={["departureDate", "departureTime", "departureFlightNo"]} />
                    <div className="flex gap-2">
                      <button onClick={saveFlights} disabled={savingFlights} className="px-5 py-2.5 rounded-full text-[13px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60">{savingFlights ? "Saving…" : flightsSaved ? "Save changes" : "Save my flights"}</button>
                      {flightsSaved && <button onClick={() => setEditingFlights(false)} className="px-5 py-2.5 rounded-full text-[13px] font-bold text-[#6a7a80] bg-[#f1f5f6]">Cancel</button>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {open && isExtras && (
              <div className="px-3 pb-3 pt-3 border-t border-[#f0e6d6]">
                {offer.length > 0 ? <Offers /> : <p className="text-[13px] text-[#8a9aa0]">No optional extras for this trip.</p>}
                {!resolved && (
                  <button onClick={chooseNone} disabled={busy === "none"} className="mt-3 text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a] underline underline-offset-2">{busy === "none" ? "…" : "No extras needed — I'm all set"}</button>
                )}
                {active.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#f3ede2] space-y-2">
                    {active.map((m) => {
                      const confirmed = effectiveAddonStatus(m) === "confirmed";
                      return (
                        <div key={m.id} className="flex items-center justify-between gap-3 text-[13.5px]">
                          <span className="font-semibold text-[#00374a]">{m.label}{m.price ? ` · ${money(m.price)}` : ""}</span>
                          <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${confirmed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{confirmed ? "Confirmed ✓" : "Requested"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {noneChosen && active.length === 0 && <p className="mt-2 text-[13px] text-[#5a6b72]">✓ No extras needed — you&apos;re all set.</p>}
              </div>
            )}
          </div>
        );
      })}
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
        <input type="date" value={(form[keys[0]] as string | null) ?? ""} onChange={(e) => setFF(keys[0], e.target.value)} className={input} />
        <input type="time" value={(form[keys[1]] as string | null) ?? ""} onChange={(e) => setFF(keys[1], e.target.value)} className={input} />
        <input type="text" value={(form[keys[2]] as string | null) ?? ""} onChange={(e) => setFF(keys[2], e.target.value)} placeholder="Flight no." className={input} />
      </div>
    </div>
  );
}
