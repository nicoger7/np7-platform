"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { isMinorOn, checkParticipant } from "@/lib/minors";
import { PhoneField, joinPhone, dialForLocation } from "@/components/experience/phone-field";

export type TicketDate = { id: string; label: string; sub?: string };

/**
 * The event ticket box. Two shapes:
 *   fixed   → one date, pay 100% now.
 *   standby → pick the dates you can make, pay a non-refundable deposit now.
 * Posts to /api/event/checkout and redirects to Stripe (or shows a friendly
 * "we'll follow up" when Stripe isn't configured yet).
 */
export function EventTicket({
  experienceId, mode, priceLabel, depositLabel, balanceLabel, refundLabel, dates, fixedDate, isMember, eventDate, editionSlug = null, location = null,
  partPayment = false, dueNowLabel = null, planBalanceLabel = null, balanceDueLabel = null,
}: {
  experienceId: string;
  mode: "fixed" | "standby";
  priceLabel: string;
  depositLabel: string;
  balanceLabel: string;
  refundLabel: string;
  dates: TicketDate[];        // standby candidate dates
  fixedDate: TicketDate | null;
  isMember: boolean;
  /** ISO date the event starts — age is judged on the day they ride. */
  eventDate?: string | null;
  /** Which clinic in the series this box is selling — the server prices and
   *  books against THIS edition rather than guessing. */
  editionSlug?: string | null;
  /** Where the event is — only used to pick a sensible default dial code. */
  location?: string | null;
  /** A fixed-date clinic sold as deposit-now, balance-before. Read off the
   *  package's deposit + "final due N days before", same as any trip. */
  partPayment?: boolean;
  dueNowLabel?: string | null;
  planBalanceLabel?: string | null;
  balanceDueLabel?: string | null;
}) {
  // Send them back HERE after logging in — the login page takes a `next`, it
  // just wasn't being given one, so a buyer mid-purchase landed on member home
  // and had to find their way back to the ticket.
  const pathname = usePathname();
  const loginHref = `/account/login?next=${encodeURIComponent(`${pathname}#ticket`)}`;
  const [picked, setPicked] = useState<string[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // The dial code defaults to where the event happens, because that is where
  // most of the people at it live — a Turkish parent booking a clinic in
  // Alaçatı should not have to hunt for +90.
  const homeDial = dialForLocation(location);
  const [dial, setDial] = useState(homeDial);
  const [gDial, setGDial] = useState(homeDial);
  // Under 18, a rider can't validly contract or waive anything — a parent has
  // to. The form asks everyone their date of birth and reveals the guardian
  // block only when it's needed, so adults aren't taxed for the juniors.
  const [dob, setDob] = useState("");
  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gPhone, setGPhone] = useState("");
  const [gRel, setGRel] = useState("");
  const minor = isMinorOn(dob || null, eventDate ?? null);
  const fullPhone = joinPhone(dial, phone);
  const fullGPhone = joinPhone(gDial, gPhone);
  const guardianProblem = dob ? checkParticipant(dob, eventDate ?? null, { guardianName: gName, guardianEmail: gEmail, guardianPhone: fullGPhone, guardianRelationship: gRel }) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(""); setBusy(true);
    try {
      const res = await fetch("/api/event/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId,
          editionSlug,
          dateIds: mode === "standby" ? picked : fixedDate ? [fixedDate.id] : [],
          firstName, lastName, email, phone: fullPhone,
          dob: dob || null,
          guardianName: gName || null, guardianEmail: gEmail || null,
          guardianPhone: fullGPhone || null, guardianRelationship: gRel || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "Something went wrong — please try again."); setBusy(false); return; }
      if (j.url) { window.location.assign(j.url); return; }   // → Stripe
      setDone(true); setBusy(false);                          // saved, no online payment configured
    } catch {
      setError("Something went wrong — please try again."); setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-[#00374a] text-white p-7 text-center">
        <p className="text-[15px] font-bold">You&apos;re on the list! 🤙</p>
        <p className="text-[13.5px] text-white/70 mt-2">We&apos;ll be in touch by email to sort your payment and confirm the details.</p>
      </div>
    );
  }

  const input = "w-full rounded-xl border border-[#dfe6e9] bg-white text-[#0a2a33] placeholder:text-[#9aa6ac] px-4 py-3 text-[15px] outline-none focus:border-[#00afdb] transition-colors";
  const canSubmit = (mode === "fixed" || picked.length > 0)
    && (isMember || (firstName.trim() && lastName.trim() && /\S+@\S+\.\S+/.test(email)))
    && !!dob && !guardianProblem;

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white border border-[#e3e9ec] shadow-[0_18px_50px_rgba(0,40,55,0.1)] p-6 sm:p-7">
      {/* price line */}
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#9aa6ac]">
          {mode === "standby" || partPayment ? "Pay today" : "Ticket"}
        </span>
        <span className="text-[28px] font-black text-[#00374a] tabular-nums">
          {mode === "standby" ? depositLabel : partPayment ? dueNowLabel : priceLabel}
        </span>
      </div>
      {mode === "standby" && (
        <p className="text-[12.5px] text-[#6a7a80] mt-1">of {priceLabel} total · balance {balanceLabel} once your date is set</p>
      )}
      {mode !== "standby" && partPayment && (
        <p className="text-[12.5px] text-[#6a7a80] mt-1">
          of {priceLabel} total · balance {planBalanceLabel} due{balanceDueLabel ? ` ${balanceDueLabel}` : " before the clinic"}
        </p>
      )}

      {/* fixed date line */}
      {mode === "fixed" && fixedDate && (
        <div className="mt-4 rounded-xl bg-[#f4fbfc] border border-[#d7ecf1] px-4 py-3">
          <p className="text-[15px] font-bold text-[#00374a]">{fixedDate.label}</p>
          {fixedDate.sub && <p className="text-[12.5px] text-[#6a7a80]">{fixedDate.sub}</p>}
        </div>
      )}

      {/* standby date picker */}
      {mode === "standby" && (
        <div className="mt-4">
          <p className="text-[13.5px] font-bold text-[#00374a] mb-2">Which dates could you make it?</p>
          <div className="space-y-2">
            {dates.map((d) => {
              const on = picked.includes(d.id);
              return (
                <button key={d.id} type="button" onClick={() => toggle(d.id)}
                  className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border transition-all ${on ? "border-[#00afdb] bg-[#00afdb]/[0.06]" : "border-[#e3e9ec] hover:border-[#bcd]"}`}>
                  <span className={`grid place-items-center w-5 h-5 rounded-md border-2 shrink-0 ${on ? "bg-[#00afdb] border-[#00afdb]" : "border-[#c3ccd0]"}`}>
                    {on && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-semibold text-[#00374a]">{d.label}</span>
                    {d.sub && <span className="block text-[12px] text-[#6a7a80]">{d.sub}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[12px] text-[#8a9aa0] mt-2.5 leading-relaxed">
            Pick every date that works for you — we confirm one, usually a few days before. Your deposit is non-refundable if any of your dates runs. If none of them run, you get {refundLabel} back.
          </p>
        </div>
      )}

      {/* buyer details (guests only) */}
      {!isMember && (
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          <input className={input} placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
          <input className={input} placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
          <input className={`${input} sm:col-span-2`} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <span className="sm:col-span-2">
            <PhoneField dial={dial} onDial={setDial} number={phone} onNumber={setPhone} placeholder="Phone (optional)" inputClass={input} />
          </span>

        </div>
      )}

      {/* Age is asked of EVERYONE, member or guest — a logged-in account says
          nothing about who is riding, and this field gates the button. It used
          to live inside the guest-only block, which left members permanently
          unable to book. */}
      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        <label className="sm:col-span-2 block">
          <span className="block text-[12.5px] font-semibold text-[#5a6b72] mb-1">Participant&apos;s date of birth</span>
          <input className={`${input} w-full`} type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={eventDate ?? undefined} />
        </label>

        {minor && (
          <div className="sm:col-span-2 rounded-xl bg-[#fff8e8] border border-[#f2dfae] p-3.5 grid gap-2.5 sm:grid-cols-2">
            <p className="sm:col-span-2 text-[12.5px] text-[#8a6a2a] leading-relaxed">
              Under 18 — a parent or guardian books and signs. They&apos;ll be the contact for everything and the one who pays.
              <span className="block mt-1 font-semibold">The NP7 account, the confirmation and the waiver all go to the guardian&apos;s email below — the name above stays the rider&apos;s.</span>
            </p>
            <input className={input} placeholder="Parent / guardian name" value={gName} onChange={(e) => setGName(e.target.value)} autoComplete="name" />
            <input className={input} placeholder="Relationship (e.g. mother)" value={gRel} onChange={(e) => setGRel(e.target.value)} />
            <input className={input} type="email" placeholder="Guardian email" value={gEmail} onChange={(e) => setGEmail(e.target.value)} autoComplete="email" />
            {/* The number NP7 must be able to dial from the beach. Country code
                is explicit for exactly that reason. */}
            <PhoneField dial={gDial} onDial={setGDial} number={gPhone} onNumber={setGPhone} placeholder="Guardian phone" inputClass={input} />
          </div>
        )}
      </div>

      {!isMember && (
        <p className="text-[12.5px] text-[#8a9aa0] mt-2.5">
          Already have an NP7 account? <a href={loginHref} className="font-semibold text-[#0aa3c7] hover:underline">Log in</a>{" "}and we&apos;ll fill your details in.
        </p>
      )}

      {guardianProblem && <p className="text-[13px] font-semibold text-[#a5732a] mt-3">{guardianProblem}</p>}

      {error && <p className="text-[13px] font-semibold text-[#c0392b] mt-3">{error}</p>}

      <button type="submit" disabled={!canSubmit || busy}
        className="mt-5 w-full rounded-full py-3.5 text-[15px] font-black text-[#00374a] disabled:opacity-45 transition-transform active:scale-[0.99]"
        style={{ background: "linear-gradient(90deg,#ffe08a,#f0a500 60%,#f47b20)" }}>
        {busy
          ? "One sec…"
          : mode === "standby"
            ? `Secure my spot — ${depositLabel}`
            : partPayment
              ? `Secure my spot — ${dueNowLabel}`
              : `Book my ticket — ${priceLabel}`}
      </button>
      <p className="text-[11.5px] text-[#9aa6ac] text-center mt-2.5">Secure payment via Stripe.</p>
      {/* Art. 246a § 1 Abs. 3 EGBGB: fixed-date leisure services carry NO
          statutory withdrawal right — the consumer must be told. */}
      <p className="text-[11px] text-[#9aa6ac] text-center mt-1.5">
        Fixed-date event: no statutory right of withdrawal (§ 312g Abs. 2 Nr. 9 BGB) — our refundable-deposit policy applies instead.
      </p>
    </form>
  );
}
