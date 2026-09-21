"use client";

import { useState } from "react";

export type ConflictKind = "secured" | "pending" | "covered" | "unknown";

/**
 * The one "email us" link on this flow, exported because the reserve modal
 * needs the same one under a blocked companion row.
 *
 * Adding a person to somebody's booking is a job the team does by hand, so the
 * only honest call to action is a mail that already knows which trip it is
 * about. Copy that says "email us" without a link is a dead end, and that is
 * what the roster note used to be.
 */
export function supportMailto(o: {
  tripLabel: string;
  firstName: string;
  topic: "add-someone" | "covered-spot";
}): string {
  const subject = o.topic === "add-someone"
    ? `Adding someone to my booking · ${o.tripLabel}`
    : `My spot on ${o.tripLabel}`;
  const body = o.topic === "add-someone"
    ? `Hi NP7,\n\nI'd like to add someone to my booking for ${o.tripLabel}.\n\nTheir name:\nTheir email:\nRoom or package:\n\nThanks,\n${o.firstName}`
    : `Hi NP7,\n\nI'm on ${o.tripLabel} on someone else's booking and I have a question about my spot.\n\nThanks,\n${o.firstName}`;
  return `mailto:experience@np-seven.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * "You're already on this week."
 *
 * None of the four cases is bad news, so none of them gets a red error line:
 * the screen wears the same cyan check as the success screen and says what is
 * actually true of this person. A lead told "you're in" would never pay the
 * downpayment that holds the spot, and a covered guest told to secure theirs
 * would be asked for money that is not theirs to pay, so the tones are not
 * decoration.
 *
 * `unknown` is the anonymous caller: the bare fact, no status, no booking id,
 * no payer name, because /api/register takes any address somebody types.
 *
 * Adding a person to an existing booking is a job our team does by hand today.
 * There is deliberately no self-service control for it here: the two paths in
 * the disclosure are the two that exist.
 */
export function AlreadyBooked({
  kind, tripLabel, bookingId, payerName, email, firstName, onClose,
}: {
  kind: ConflictKind;
  tripLabel: string;
  bookingId?: string;
  payerName?: string;
  email: string;
  firstName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [linkState, setLinkState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const title =
    kind === "secured" ? "You're in for this week 🤙"
    : kind === "pending" ? "You already registered for this week"
    : kind === "covered" ? "This week is already covered for you 🤙"
    : "There's already a registration for this email";

  const body =
    kind === "secured"
      ? `Your spot on ${tripLabel} is secured. There's nothing to book again here.`
    : kind === "pending"
      ? `You signed up for ${tripLabel} already, so there's no need to fill this in twice. The spot is held once the downpayment lands, and that's the only thing left to do.`
    : kind === "covered"
      ? (payerName
          ? `${payerName} has booked this week for you and your spot sits on their payment plan. There's nothing to book or pay here.`
          : "Someone has booked this week for you, and your spot sits on their payment plan. There's nothing to book or pay here.")
      : `There's already a registration for ${email} on ${tripLabel}. Check your inbox for your trip page, or get a fresh link below.`;

  const tripHref = bookingId
    ? (kind === "pending" ? `/account/bookings/${bookingId}#payment` : `/account/bookings/${bookingId}`)
    : null;
  const tripLabelCta = kind === "pending" ? "Open my trip and secure my spot" : "Open my trip";

  const ctaCls = "block w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] shadow-[0_6px_24px_rgba(0,175,219,0.35)] hover:bg-[#15c0ec] disabled:opacity-60 transition-all";

  async function sendLink() {
    if (linkState === "sending") return;
    setLinkState("sending");
    try {
      const res = await fetch("/api/portal/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next: "/account" }),
      });
      setLinkState(res.ok ? "sent" : "failed");
    } catch {
      setLinkState("failed");
    }
  }

  function copyTripLink() {
    /*
     * Origin + path only, for two reasons. An invite token in the query would
     * ride along and attribute the friend's signup to whoever invited THIS
     * person. And there is no week to carry: /experience/[slug] has no
     * per-week segment outside a clinic series, and the selected week lives in
     * React state (selected-edition.tsx), so a link cannot promise one. The
     * copy says "this trip" rather than "this week" for exactly that reason.
     */
    const link = `${window.location.origin}${window.location.pathname}`;
    navigator.clipboard?.writeText(link).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), 2500); },
      () => {},
    );
  }

  const mailtoHref = supportMailto({
    tripLabel, firstName, topic: kind === "covered" ? "covered-spot" : "add-someone",
  });

  return (
    <div className="p-8 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-[#00afdb] grid place-items-center mb-5">
        <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      </div>
      <h3 className="text-2xl font-black tracking-[-0.02em] text-[#00374a] mb-2">{title}</h3>
      <p className="text-[14.5px] text-[#5a6b72] leading-relaxed mb-6">{body}</p>

      {tripHref ? (
        <a href={tripHref} className={ctaCls}>{tripLabelCta}</a>
      ) : kind === "unknown" ? (
        linkState === "sent" ? (
          <p className="text-[13.5px] font-bold text-[#0f6e56] leading-snug">Sent 🤙 Check {email} for your link.</p>
        ) : linkState === "failed" ? (
          <p className="text-[13px] text-[#5a6b72] leading-snug">We couldn&apos;t send that link. You can log in at np-seven.com/account.</p>
        ) : (
          <button type="button" onClick={sendLink} disabled={linkState === "sending"} className={ctaCls}>
            {linkState === "sending" ? "One sec…" : "Email me the link to my trip"}
          </button>
        )
      ) : null}

      {/* The question this screen actually raises. Both answers are real ones:
          the friend registers themselves, or the team moves them across by
          hand. Nothing here pretends a self-service version exists.

          Case-split, because the second answer is not true of a covered guest.
          Their spot sits on somebody else's plan: they have no payment plan of
          their own and are never invoiced (admin/bookings/[id]/page.tsx), so
          "it stays one payment plan and one invoice" would be a promise about
          money they do not owe. */}
      <details className="group mt-6 text-left rounded-2xl bg-[#f7fbfc] border border-[#e6eef0] overflow-hidden">
        <summary className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer list-none select-none text-[13px] font-bold text-[#5a6b72] hover:text-[#00374a]">
          Bringing someone with you?
          <svg className="w-4 h-4 text-[#9aa6ac] transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </summary>
        <div className="px-5 pb-4">
          <p className="text-[12.5px] text-[#5a6b72] leading-snug mb-3">
            {kind === "covered"
              ? "Your own spot is sorted, and a friend can still come along."
              : "You can't book the same week twice for yourself, but there are two ways to get a friend on it."}
          </p>

          <p className="text-[12.5px] font-bold text-[#00374a] mb-1">They book their own spot</p>
          <p className="text-[12.5px] text-[#5a6b72] leading-snug mb-2">
            Send them the link to this trip, they pick the week and register themselves. It&apos;s free, takes a minute, and they pay their own way.
          </p>
          <button type="button" onClick={copyTripLink}
            className="text-[12.5px] font-bold text-[#00afdb] hover:underline">
            {copied ? "Copied 🤙" : "Copy the link"}
          </button>
          {bookingId && kind !== "covered" && (
            <p className="text-[11.5px] text-[#9aa6ac] leading-snug mt-1.5">
              Your trip page also has your invite link, which gets you both a voucher.
            </p>
          )}

          {kind === "covered" ? (
            <>
              <p className="text-[12.5px] font-bold text-[#00374a] mt-4 mb-1">Someone pays for yours</p>
              <p className="text-[12.5px] text-[#5a6b72] leading-snug mb-2">
                {payerName
                  ? `${payerName} is covering your spot, so there's no payment plan and no invoice on your side.`
                  : "Whoever booked this week for you is covering your spot, so there's no payment plan and no invoice on your side."}
                {" "}To put a friend on that same booking, {payerName ?? "they"} can ask us and we&apos;ll set it up, or write to us yourself.
              </p>
            </>
          ) : (
            <>
              <p className="text-[12.5px] font-bold text-[#00374a] mt-4 mb-1">Bringing someone along</p>
              {/* "kind" is only ever "covered" for the signed-in owner of the
                  booking. Anyone else, including a covered guest who has never
                  needed an account, arrives here as "unknown", so this wording
                  must be true whether or not they have a plan of their own.
                  Promising "one payment plan and one invoice" to somebody whose
                  spot a friend is already paying for is simply wrong. */}
              <p className="text-[12.5px] text-[#5a6b72] leading-snug mb-2">
                Our team adds them to the booking by hand and sorts out who pays for what. Send us their name and email and we&apos;ll set it up.
              </p>
            </>
          )}
          <a href={mailtoHref} className="text-[12.5px] font-bold text-[#00afdb] hover:underline">Email us</a>
        </div>
      </details>

      <button onClick={onClose} className="block w-full mt-5 text-[12.5px] font-semibold text-[#7a8a90] hover:text-[#00374a]">Done</button>
    </div>
  );
}
