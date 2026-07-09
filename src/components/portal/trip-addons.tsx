"use client";

import { useEffect, useState, useCallback } from "react";
import { effectiveAddonStatus } from "@/lib/addons";
import { hasFlightDetails, type FlightInfo } from "@/lib/flights";
import type { ArrivalInfo } from "@/lib/portal-data";

type Available = { id: string; name: string; category: string | null; description: string | null; sell_price: number | null };
type AddonMeta = { checkIn?: string | null; checkOut?: string | null; nightsBefore?: number; nightsAfter?: number; nights?: number };
type Mine = { id: string; component_id: string | null; label: string; price: number | null; status?: string | null; notes?: string | null; meta?: AddonMeta | null };

const nightsBetween = (a?: string | null, b?: string | null) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : 0);
const fmtDay = (d?: string | null) => (d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");

/** Strip the internal code prefix from an add-on's admin name for a clean
    consumer label. "BON - Wanapa - Extra Night Double Deluxe Patio" →
    "Wanapa · Extra Night Double Deluxe Patio". Conservative: drops only a
    leading short destination code, then prettifies the remaining separators
    (keeps the hotel so options at different hotels stay distinguishable). */
function cleanAddonName(name: string): string {
  return name
    .replace(/^[A-Z0-9]{2,5}\s+[–—-]\s+/, "")
    .replace(/\s+[–—-]\s+/g, " · ")
    .trim();
}

function money(n: number | null) {
  return n != null ? `€${Number(n).toLocaleString("en-US")}` : "";
}

export function TripAddons({ bookingId, depositPaid, hasDeposit, securingLabel, initialFlights, arrival, editionStart, editionEnd }: { bookingId: string; depositPaid: boolean; hasDeposit: boolean; securingLabel: string; initialFlights: FlightInfo | null; arrival: ArrivalInfo | null; editionStart: string | null; editionEnd: string | null }) {
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

  // Extra-night picker state (one accommodation offer being configured at a time).
  const [nightsFor, setNightsFor] = useState<string | null>(null);
  const [nightForm, setNightForm] = useState<{ checkIn: string; checkOut: string }>({ checkIn: "", checkOut: "" });

  function openNights(componentId: string) {
    setNightForm({
      checkIn: flights?.arrivalDate ?? editionStart ?? "",
      checkOut: flights?.departureDate ?? editionEnd ?? "",
    });
    setNightsFor(componentId);
  }

  async function request(componentId: string, extra?: { checkIn: string; checkOut: string }) {
    setBusy(componentId);
    await fetch(`/api/portal/bookings/${bookingId}/addons`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: componentId, ...(extra ?? {}) }),
    });
    setBusy(null);
    setNightsFor(null);
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
  // "We confirm" is done once everything requested is confirmed (vacuously true
  // when the member chose no extras — nothing left to confirm).
  const addonsConfirmed = resolved && active.every((m) => effectiveAddonStatus(m) === "confirmed");
  const requestedIds = new Set(active.map((m) => m.component_id).filter(Boolean));
  const offer = available.filter((a) => !requestedIds.has(a.id));

  const dateInput = "w-full min-w-0 px-3 py-2 rounded-lg border border-[#dde6e9] text-[14px] text-[#00374a] outline-none focus:border-[#00afdb]";
  const Offers = () => (
    <div className="space-y-2">
      {offer.map((a) => {
        // Extra hotel nights need the dates — capture arrive/leave (pre-filled from
        // flights) and bill anything outside the trip week.
        if (a.category === "accommodation") {
          const open = nightsFor === a.id;
          const before = Math.max(0, nightsBetween(nightForm.checkIn, editionStart));
          const after = Math.max(0, nightsBetween(editionEnd, nightForm.checkOut));
          const total = before + after;
          const price = a.sell_price != null ? a.sell_price * total : null;
          return (
            <div key={a.id} className="bg-[#f8fbfc] rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[#00374a] truncate">{cleanAddonName(a.name)}{a.sell_price ? ` · ${money(a.sell_price)}/night` : ""}</p>
                  {a.description && <p className="text-[12.5px] text-[#8a9aa0] truncate">{a.description}</p>}
                </div>
                {!open && (
                  <button onClick={() => openNights(a.id)}
                    className="shrink-0 px-4 py-2 rounded-full text-[12.5px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] transition-colors">Add nights</button>
                )}
              </div>
              {open && (
                <div className="mt-3 pt-3 border-t border-[#e3eef1] space-y-3">
                  <p className="text-[12.5px] text-[#5a6b72] leading-snug">Which nights? Pick when you arrive &amp; leave — any night outside the trip week ({fmtDay(editionStart)} – {fmtDay(editionEnd)}) is an extra night.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block"><span className="block text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1">Arrive</span>
                      <input type="date" value={nightForm.checkIn} onChange={(e) => setNightForm((f) => ({ ...f, checkIn: e.target.value }))} className={dateInput} /></label>
                    <label className="block"><span className="block text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1">Leave</span>
                      <input type="date" value={nightForm.checkOut} onChange={(e) => setNightForm((f) => ({ ...f, checkOut: e.target.value }))} className={dateInput} /></label>
                  </div>
                  <p className="text-[13px] text-[#00374a]">
                    {total > 0 ? (
                      <><strong>{[before > 0 ? `${before} night${before !== 1 ? "s" : ""} before` : "", after > 0 ? `${after} night${after !== 1 ? "s" : ""} after` : ""].filter(Boolean).join(" + ")}</strong> = {total} extra night{total !== 1 ? "s" : ""}{price != null ? ` · ${money(price)}` : ""}</>
                    ) : (
                      <span className="text-[#8a9aa0]">Those dates are within the trip week — no extra nights yet.</span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => request(a.id, nightForm)} disabled={busy === a.id || total < 1}
                      className="px-4 py-2 rounded-full text-[12.5px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-50 transition-colors">{busy === a.id ? "…" : "Request these nights"}</button>
                    <button onClick={() => setNightsFor(null)} className="px-4 py-2 rounded-full text-[12.5px] font-semibold text-[#6a7a80] bg-[#f1f5f6]">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={a.id} className="flex items-center justify-between gap-3 bg-[#f8fbfc] rounded-xl px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-[#00374a] truncate">{cleanAddonName(a.name)}{a.sell_price ? ` · ${money(a.sell_price)}` : ""}</p>
              {a.description && <p className="text-[12.5px] text-[#8a9aa0] truncate">{a.description}</p>}
            </div>
            <button onClick={() => request(a.id)} disabled={busy === a.id}
              className="shrink-0 px-4 py-2 rounded-full text-[12.5px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-colors">
              {busy === a.id ? "…" : "Request"}
            </button>
          </div>
        );
      })}
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

  // Prep steps — flights lead (people sort flights right after the free
  // sign-up), then securing the spot with the down-payment (or deposit, when
  // the package sets one), then extras. Labels adapt to the package so it never
  // says "deposit" when the securing payment is really the down-payment.
  const steps: { key: "flights" | "secure" | "extras" | "confirm" | "book"; t: string; d: string }[] = [
    { key: "flights", t: "Check your flights", d: "Find arrival/departure times that fit the week — you've got time before the down-payment's due." },
    { key: "secure", t: securingLabel, d: depositPaid ? "Your spot is secured ✓" : `Pay the ${hasDeposit ? "deposit" : "down-payment"} to lock in your place — refundable for 14 days.` },
    { key: "extras", t: "Request extras", d: "Want extra nights, gear or more? Request them — or choose none." },
    { key: "confirm", t: "We confirm", d: "We'll confirm availability and add it to your trip." },
    { key: "book", t: "Book your flights", d: "Once your dates are set, lock in your flights." },
  ];

  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const done = s.key === "flights" ? flightsSaved : s.key === "secure" ? depositPaid : s.key === "extras" ? resolved : s.key === "confirm" ? addonsConfirmed : flightsBooked;
        const isFlights = s.key === "flights";
        const isExtras = s.key === "extras";
        const open = (isFlights && showFlights) || (isExtras && showOffers);

        // Non-interactive steps (secure, we confirm, book flights w/ button)
        if (!isFlights && !isExtras) {
          return (
            <div key={s.key} className="flex gap-3 px-1 py-1">
              {badge(i, done)}
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[#00374a] leading-tight">{s.t}</p>
                <p className="text-[12.5px] text-[#8a9aa0] leading-snug">{s.key === "confirm" && addonsConfirmed ? (active.length > 0 ? "All your extras are confirmed and added to your trip." : "No extras to confirm — you're all set.") : s.d}</p>
                {s.key === "secure" && !done && (
                  <a href="#payment" className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-bold text-[#00afdb] hover:underline">See the payment plan &amp; how to pay →</a>
                )}
                {s.key === "book" && !flightsBooked && (
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
          <div key={s.key} className="rounded-xl border border-[#eee2cf] bg-[#fffdf8] overflow-hidden">
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
                  <p className="font-bold text-[#00374a]">You book your own flights</p>
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
                        <div key={m.id} className="flex items-start justify-between gap-3 text-[13.5px]">
                          <div className="min-w-0">
                            <span className="font-semibold text-[#00374a] truncate block">{cleanAddonName(m.label)}{m.price ? ` · ${money(m.price)}` : ""}</span>
                            {(m.meta?.checkIn || m.meta?.checkOut) && (
                              <span className="text-[12px] text-[#8a9aa0]">{fmtDay(m.meta.checkIn)} → {fmtDay(m.meta.checkOut)}</span>
                            )}
                          </div>
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
  // w-full + min-w-0 so the native date/time pickers (which have a large
  // intrinsic min-width on iOS) shrink with the grid instead of overflowing.
  const input = "w-full min-w-0 px-3 py-2 rounded-lg border border-[#dde6e9] text-[14px] text-[#00374a] outline-none focus:border-[#00afdb]";
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
