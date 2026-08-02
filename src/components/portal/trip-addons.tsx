"use client";

import { useEffect, useState, useCallback } from "react";
import { effectiveAddonStatus } from "@/lib/addons";
import { hasFlightDetails, isSelfArriving, type FlightInfo } from "@/lib/flights";
import type { ArrivalInfo } from "@/lib/portal-data";

type Available = { id: string; name: string; category: string | null; description: string | null; sell_price: number | null; payment_mode?: string | null; payment_note?: string | null };
type AddonMeta = { checkIn?: string | null; checkOut?: string | null; nightsBefore?: number; nightsAfter?: number; nights?: number };
type Mine = { id: string; component_id: string | null; label: string; price: number | null; status?: string | null; notes?: string | null; meta?: AddonMeta | null; payment_mode?: string | null; payment_note?: string | null };

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

/** Break a cleaned add-on name into a small hotel eyebrow + a short title, so
    the consumer sees "WANAPA / Double Deluxe Patio" instead of one long line.
    Drops the redundant "Extra Night(s)" prefix for accommodation (the whole
    step is about extra nights). Falls back gracefully when there's no hotel. */
function splitAddon(name: string, category?: string | null): { hotel: string | null; title: string } {
  const clean = cleanAddonName(name);
  const parts = clean.split(" · ").map((p) => p.trim()).filter(Boolean);
  let hotel: string | null = null;
  let rest = parts;
  if (parts.length >= 2) { hotel = parts[0]; rest = parts.slice(1); }
  let title = rest.join(" · ");
  if (category === "accommodation") title = title.replace(/^extra nights?\s+/i, "");
  return { hotel, title: title || clean };
}

function money(n: number | null) {
  return n != null ? `€${Number(n).toLocaleString("en-US")}` : "";
}

/** Add-ons billed by time around the trip week. Accommodation is charged per
    night, gear rental per day; both are worked out from the member's flight
    dates (any time outside the trip week is "extra"). Everything else is a flat
    request. */
const PERIOD: Record<string, { unit: string; add: string }> = {
  accommodation: { unit: "night", add: "Add nights" },
  gear: { unit: "day", add: "Add days" },
};
const plural = (unit: string, n: number) => `${unit}${n !== 1 ? "s" : ""}`;

export function TripAddons({ bookingId, depositPaid, hasDeposit, securingLabel, initialFlights, arrival, editionStart, editionEnd, groupLink, joinedGroup }: { bookingId: string; depositPaid: boolean; hasDeposit: boolean; securingLabel: string; initialFlights: FlightInfo | null; arrival: ArrivalInfo | null; editionStart: string | null; editionEnd: string | null; groupLink?: string | null; joinedGroup?: boolean }) {
  const [available, setAvailable] = useState<Available[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showOffers, setShowOffers] = useState(false);

  // WhatsApp group — self-reported "I've joined" tick, persisted to wa_group.
  const [joined, setJoined] = useState(!!joinedGroup);
  const [showGroup, setShowGroup] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const hasGroup = !!groupLink;
  async function setGroupJoined(next: boolean) {
    setSavingGroup(true);
    setJoined(next); // optimistic
    const res = await fetch(`/api/portal/bookings/${bookingId}/group`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joined: next }),
    });
    if (!res.ok) setJoined(!next); // revert on failure
    setSavingGroup(false);
  }

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

  // Jump the member up to the flights step so they can enter dates that then
  // auto-fill the extra-night/day maths.
  function goToFlights() {
    setShowFlights(true);
    requestAnimationFrame(() => document.getElementById("prep-flights")?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
        const period = a.category ? PERIOD[a.category] : undefined;
        if (period) {
          const u = period.unit; // "night" | "day"
          const open = nightsFor === a.id;
          const before = Math.max(0, nightsBetween(nightForm.checkIn, editionStart));
          const after = Math.max(0, nightsBetween(editionEnd, nightForm.checkOut));
          const total = before + after;
          const price = a.sell_price != null ? a.sell_price * total : null;
          const { hotel, title } = splitAddon(a.name, a.category);
          return (
            <div key={a.id} className="bg-white rounded-xl border border-[#eef2f0] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {hotel && <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] leading-none mb-1">{hotel}</p>}
                  <p className="text-[14.5px] font-bold text-[#00374a] leading-tight">{title}</p>
                  {a.sell_price != null && <p className="text-[12.5px] text-[#5a6b72] mt-0.5"><span className="font-bold text-[#00374a]">{money(a.sell_price)}</span> / {u}</p>}
                  {a.description && <p className="text-[12px] text-[#9aa6ac] mt-0.5 truncate">{a.description}</p>}
                </div>
                {!open && (
                  <button onClick={() => openNights(a.id)}
                    className="shrink-0 px-4 py-2 rounded-full text-[12.5px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] transition-colors">{period.add}</button>
                )}
              </div>
              {open && (
                <div className="mt-3 pt-3 border-t border-[#eef2f0] space-y-3">
                  {/* Anything outside the trip week is an "extra" — worked out from
                      the member's own flight dates, which we pre-fill here. */}
                  {flightsSaved ? (
                    <p className="text-[12.5px] text-[#5a6b72] leading-snug">
                      Suggested from your flights ({fmtDay(flights?.arrivalDate)} → {fmtDay(flights?.departureDate)}). Any {u} outside the trip week ({fmtDay(editionStart)}–{fmtDay(editionEnd)}) counts as an extra {u} — adjust below if needed.
                    </p>
                  ) : (
                    <div className="rounded-lg bg-[#eef6f8] p-3 text-[12.5px] text-[#4a5b62] leading-snug">
                      <p className="font-bold text-[#00374a] mb-0.5">Add your flights and we&apos;ll do the maths</p>
                      <p>Enter when you arrive &amp; leave and we auto-calculate the extra {plural(u, 2)} — or set the dates below.</p>
                      <button onClick={goToFlights} className="mt-1.5 inline-flex items-center gap-1 font-bold text-[#00afdb] hover:underline">Add flight dates →</button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block"><span className="block text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1">Arrive</span>
                      <input type="date" value={nightForm.checkIn} onChange={(e) => setNightForm((f) => ({ ...f, checkIn: e.target.value }))} className={dateInput} /></label>
                    <label className="block"><span className="block text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1">Leave</span>
                      <input type="date" value={nightForm.checkOut} onChange={(e) => setNightForm((f) => ({ ...f, checkOut: e.target.value }))} className={dateInput} /></label>
                  </div>
                  <p className="text-[13px] text-[#00374a]">
                    {total > 0 ? (
                      <><strong>{[before > 0 ? `${before} ${plural(u, before)} before` : "", after > 0 ? `${after} ${plural(u, after)} after` : ""].filter(Boolean).join(" + ")}</strong> = {total} extra {plural(u, total)}{price != null ? ` · ${money(price)}` : ""}</>
                    ) : (
                      <span className="text-[#8a9aa0]">Those dates are within the trip week — no extra {plural(u, 2)} yet. Arrive earlier or leave later to add some.</span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => request(a.id, nightForm)} disabled={busy === a.id || total < 1}
                      className="px-4 py-2 rounded-full text-[12.5px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-50 transition-colors">{busy === a.id ? "…" : total > 0 ? `Request ${total} ${plural(u, total)}` : `Request extra ${plural(u, 2)}`}</button>
                    <button onClick={() => setNightsFor(null)} className="px-4 py-2 rounded-full text-[12.5px] font-semibold text-[#6a7a80] bg-[#f1f5f6]">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        }
        const { hotel, title } = splitAddon(a.name, a.category);
        return (
          <div key={a.id} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-[#eef2f0] px-4 py-3">
            <div className="min-w-0 flex-1">
              {hotel && <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] leading-none mb-1">{hotel}</p>}
              <p className="text-[14.5px] font-bold text-[#00374a] leading-tight">{title}</p>
              {/* A pay-direct extra is arranged by us but settled with the
                  provider — showing an NP7 price would imply we'll bill it. */}
              {a.payment_mode === "direct" ? (
                <p className="text-[12.5px] text-[#5a6b72] mt-0.5">
                  <span className="font-bold text-[#00374a]">Nothing to pay now</span>
                  {a.payment_note ? <span className="block text-[12px] mt-0.5">{a.payment_note}</span> : <span className="block text-[12px] mt-0.5">We arrange it — you settle it directly.</span>}
                </p>
              ) : (
                a.sell_price != null && <p className="text-[12.5px] text-[#5a6b72] mt-0.5"><span className="font-bold text-[#00374a]">{money(a.sell_price)}</span></p>
              )}
              {a.description && <p className="text-[12px] text-[#9aa6ac] mt-0.5 truncate">{a.description}</p>}
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
  // Checklist status: done = green check, pending = hollow ring. No numbers, so
  // the list never reads as a broken "✓, 2, ✓, 4" sequence.
  const stepIcon = (done: boolean) => (
    done ? (
      <span className="shrink-0 w-6 h-6 rounded-full bg-[#22a45d] text-white grid place-items-center">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      </span>
    ) : (
      <span className="shrink-0 w-6 h-6 rounded-full border-2 border-[#d3dde0] bg-white" />
    )
  );

  // Prep steps — flights lead (people sort flights right after the free
  // sign-up), then securing the spot with the down-payment (or deposit, when
  // the package sets one), then extras. Labels adapt to the package so it never
  // says "deposit" when the securing payment is really the down-payment.
  const steps: { key: "flights" | "secure" | "extras" | "confirm" | "book" | "group"; t: string; d: string }[] = [
    { key: "flights", t: "Your arrival", d: "Tell us when you get in and head off — flying or not. Times that fit the week; no rush before the down-payment." },
    { key: "secure", t: securingLabel, d: depositPaid ? "Your spot is secured ✓" : `Pay the ${hasDeposit ? "deposit" : "down-payment"} to lock in your place — refundable for 14 days.` },
    { key: "extras", t: "Request extras", d: "Want extra nights, gear or more? Request them — or choose none." },
    { key: "confirm", t: "We confirm", d: "We'll confirm availability and add it to your trip." },
    { key: "book", t: "Book your flights", d: "Once your dates are set, lock in your flights." },
    // Only when a group chat exists for this edition.
    ...(hasGroup ? [{ key: "group" as const, t: "Join the group chat", d: "Meet your crew before you go — say hi in the WhatsApp group." }] : []),
  ];

  return (
    <div className="rounded-2xl border border-[#f0e6d6] overflow-hidden bg-white">
      {steps.map((s, i) => {
        const done = s.key === "flights" ? flightsSaved : s.key === "secure" ? depositPaid : s.key === "extras" ? resolved : s.key === "confirm" ? addonsConfirmed : s.key === "group" ? joined : flightsBooked;
        const isFlights = s.key === "flights";
        const isExtras = s.key === "extras";
        const isGroup = s.key === "group";
        const interactive = isFlights || isExtras || isGroup;
        const open = (isFlights && showFlights) || (isExtras && showOffers) || (isGroup && showGroup);
        const toggle = isFlights ? () => setShowFlights((v) => !v) : isGroup ? () => setShowGroup((v) => !v) : () => setShowOffers((v) => !v);
        const subline = isFlights
          ? (flightsSaved ? "Arrival added — tap to view or edit" : "Tap to add your arrival & departure")
          : isGroup
          ? (joined ? "You're in the group ✓ — tap to open" : "Tap to open the group & mark yourself in")
          : isExtras
          ? (resolved ? (active.length ? `${active.length} requested — tap to manage` : "No extras — tap to change") : "Tap to add extra nights, gear & more")
          : s.key === "confirm" && addonsConfirmed
          ? (active.length > 0 ? "All your extras are confirmed and added to your trip." : "No extras to confirm — you're all set.")
          : s.d;

        // One consistent row grammar for every step: [status] [title + sub] [affordance].
        const rowCls = "flex items-center gap-3 w-full text-left px-4 py-3 min-h-[58px]";
        const rowInner = (
          <>
            {stepIcon(done)}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-[#00374a] leading-tight">
                {s.t}
                {isFlights && flightsBooked && <span className="ml-1.5 text-[11px] font-bold uppercase tracking-wide text-green-600">Booked</span>}
              </p>
              <p className="text-[12.5px] text-[#8a9aa0] leading-snug">{subline}</p>
            </div>
            {interactive ? chevron(open)
              : s.key === "secure" && !done ? (
                <span className="shrink-0 inline-flex items-center gap-0.5 text-[13px] font-bold text-[#00afdb]">Pay<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg></span>
              ) : s.key === "book" && !flightsBooked ? (
                <button type="button" onClick={markBooked} className="shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] transition-colors">I&apos;ve booked ✓</button>
              ) : null}
          </>
        );
        return (
          <div key={s.key} id={isFlights ? "prep-flights" : undefined} className={`scroll-mt-20 ${i > 0 ? "border-t border-[#f3ede2]" : ""}`}>
            {interactive ? (
              <button onClick={toggle} className={`${rowCls} hover:bg-[#faf6ee] transition-colors`}>{rowInner}</button>
            ) : s.key === "secure" && !done ? (
              <a href="#payment" className={`${rowCls} hover:bg-[#faf6ee] transition-colors`}>{rowInner}</a>
            ) : (
              <div className={rowCls}>{rowInner}</div>
            )}

            {open && isFlights && (
              <div className="px-4 pb-4 pt-3 border-t border-[#f3ede2]">
                <div className="rounded-lg bg-[#eef6f8] p-3 mb-3 text-[13px] text-[#4a5b62] space-y-1.5">
                  <p className="font-bold text-[#00374a]">You book your own travel</p>
                  <p className="leading-snug">We don&apos;t book travel for you — choose times that fit the week and add them here. Happy to advise on the best arrival/departure if you&apos;re unsure. Not flying? Tell us anyway, so we know when to expect you.</p>
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
                    <FlightSummary label={isSelfArriving(flights) ? "Arriving" : "Arrival"} date={flights?.arrivalDate} time={flights?.arrivalTime} no={flights?.arrivalFlightNo} />
                    <FlightSummary label={isSelfArriving(flights) ? "Leaving" : "Departure"} date={flights?.departureDate} time={flights?.departureTime} no={flights?.departureFlightNo} />
                    {isSelfArriving(flights) && <p className="text-[12.5px] text-[#8a9aa0]">Making your own way here</p>}
                    <button onClick={() => { setFlightForm(flights ?? {}); setEditingFlights(true); }} className="text-[13px] font-bold text-[#00afdb] hover:underline mt-1">Edit arrival</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Not everyone flies — some drive, take the train, or are
                        already in the country. They still need to tell us when
                        they land on the doorstep. */}
                    <div className="flex gap-1.5">
                      {([["flying", "I'm flying"], ["own", "Making my own way"]] as const).map(([mode, label]) => {
                        const active = (flightForm.arrivalMode ?? "flying") === mode;
                        return (
                          <button key={mode} type="button"
                            onClick={() => setFF("arrivalMode" as keyof FlightInfo, mode)}
                            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-bold transition-colors ${active ? "bg-[#00afdb] text-white" : "bg-[#f1f5f6] text-[#6a7a80] hover:text-[#00374a]"}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {isSelfArriving(flightForm) && (
                      <p className="text-[12.5px] text-[#6a7a80] -mt-1">
                        No flight number needed — just let us know when you&apos;ll arrive and head off, so we can plan transfers and the first evening around you.
                      </p>
                    )}
                    <FlightFields legend={isSelfArriving(flightForm) ? "Arriving" : "Arrival"} form={flightForm} setFF={setFF}
                      keys={["arrivalDate", "arrivalTime", "arrivalFlightNo"]} noFlightNo={isSelfArriving(flightForm)} />
                    <FlightFields legend={isSelfArriving(flightForm) ? "Leaving" : "Departure"} form={flightForm} setFF={setFF}
                      keys={["departureDate", "departureTime", "departureFlightNo"]} noFlightNo={isSelfArriving(flightForm)} />
                    <div className="flex gap-2">
                      <button onClick={saveFlights} disabled={savingFlights} className="px-5 py-2.5 rounded-full text-[13px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60">{savingFlights ? "Saving…" : flightsSaved ? "Save changes" : "Save my arrival"}</button>
                      {flightsSaved && <button onClick={() => setEditingFlights(false)} className="px-5 py-2.5 rounded-full text-[13px] font-bold text-[#6a7a80] bg-[#f1f5f6]">Cancel</button>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {open && isExtras && (
              <div className="px-4 pb-4 pt-3 border-t border-[#f3ede2]">
                {offer.length > 0 ? <Offers /> : <p className="text-[13px] text-[#8a9aa0]">No optional extras for this trip.</p>}
                {!resolved && (
                  <button onClick={chooseNone} disabled={busy === "none"} className="mt-3 text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a] underline underline-offset-2">{busy === "none" ? "…" : "No extras needed — I'm all set"}</button>
                )}
                {active.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#f3ede2] space-y-2">
                    {active.map((m) => {
                      const confirmed = effectiveAddonStatus(m) === "confirmed";
                      const { hotel, title } = splitAddon(m.label, m.meta?.checkIn || m.meta?.nights != null ? "accommodation" : null);
                      return (
                        <div key={m.id} className="flex items-start justify-between gap-3 text-[13.5px]">
                          <div className="min-w-0">
                            <span className="font-semibold text-[#00374a] block leading-tight">
                              {hotel && <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#9aa6ac] mr-1.5">{hotel}</span>}
                              {title}{m.payment_mode === "direct" ? " · pay directly" : m.price ? ` · ${money(m.price)}` : ""}
                            </span>
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

            {open && isGroup && (
              <div className="px-4 pb-4 pt-3 border-t border-[#f3ede2] space-y-3">
                <p className="text-[13px] text-[#4a5b62] leading-snug">Your whole crew for this week is in here — coaches and riders. Great for questions, plans and getting to know each other before you arrive.</p>
                <a href={groupLink ?? "#"} target="_blank" rel="noopener"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-bold text-white bg-[#1aa851] hover:bg-[#149247] transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.205zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.074-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
                  Open WhatsApp group
                </a>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={joined} disabled={savingGroup} onChange={(e) => setGroupJoined(e.target.checked)} className="w-4 h-4 accent-[#1aa851]" />
                  <span className="text-[13.5px] font-semibold text-[#00374a]">I&apos;ve joined the group</span>
                </label>
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

function FlightFields({ legend, form, setFF, keys, noFlightNo = false }: { legend: string; form: FlightInfo; setFF: (k: keyof FlightInfo, v: string) => void; keys: [keyof FlightInfo, keyof FlightInfo, keyof FlightInfo]; noFlightNo?: boolean }) {
  // w-full + min-w-0 so the native date/time pickers (which have a large
  // intrinsic min-width on iOS) shrink with the grid instead of overflowing.
  const input = "w-full min-w-0 px-3 py-2 rounded-lg border border-[#dde6e9] text-[14px] text-[#00374a] outline-none focus:border-[#00afdb]";
  return (
    <div>
      <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9aa6ac] mb-1.5">{legend}</p>
      <div className={`grid gap-2 ${noFlightNo ? "grid-cols-[1fr_90px]" : "grid-cols-[1fr_90px_1fr]"}`}>
        <input type="date" value={(form[keys[0]] as string | null) ?? ""} onChange={(e) => setFF(keys[0], e.target.value)} className={input} />
        <input type="time" value={(form[keys[1]] as string | null) ?? ""} onChange={(e) => setFF(keys[1], e.target.value)} className={input} />
        {/* Driving or taking the train: the time still matters for transfers and
            the first evening — the flight number is the only part that doesn't. */}
        {!noFlightNo && (
          <input type="text" value={(form[keys[2]] as string | null) ?? ""} onChange={(e) => setFF(keys[2], e.target.value)} placeholder="Flight no." className={input} />
        )}
      </div>
    </div>
  );
}
