/**
 * "What happens next" — the timeline a guest is missing the moment they sign up.
 *
 * Registration ends with "we've emailed you how it works", and the email says
 * "secure your spot, plan it with us, pay the balance later". True, but it
 * answers none of the questions people actually have: when do I hear from you
 * again, when does the group chat start, when do I get the packing list, what
 * does the week look like, whom do I ask? So they ask — by mail, one at a time.
 *
 * Every line here is derived, never typed: the payment plan supplies the
 * money dates, the mail schedule (getSendTiming, admin-editable) supplies when
 * each mail lands, the edition supplies the trip dates and the WhatsApp link.
 * If the admin moves a mail from 21 to 30 days out, this page moves with it.
 */
import type { Milestone } from "@/lib/payments";

export type WhatsNextStep = {
  when: Date | null;
  label: string;
  detail?: string;
  done?: boolean;
  href?: string;
  hrefLabel?: string;
};

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

export function buildWhatsNext(input: {
  now: Date;
  start: Date | null;
  end: Date | null;
  plan: Milestone[];
  depositPaid: boolean;
  fullyPaid: boolean;
  isEvent: boolean;
  timingBefore: Record<string, number | null | undefined>;
  whatsappLink: string | null;
  joinedGroup: boolean;
  money: (n: number) => string;
}): WhatsNextStep[] {
  const { now, start, end, plan, depositPaid, fullyPaid, isEvent, timingBefore, whatsappLink, joinedGroup, money } = input;
  const daysBefore = (n: number | null | undefined) =>
    start && n != null ? new Date(start.getTime() - n * 86_400_000) : null;
  const steps: WhatsNextStep[] = [];

  // Money first — it is the only step that is theirs to take.
  for (const m of plan) {
    const due = m.dueDate ? new Date(m.dueDate) : null;
    const paid = m.status === "paid";
    steps.push({
      when: due,
      // A clinic is bought outright: its one milestone is the ticket, not a
      // down-payment on something larger.
      label: m.kind === "final" ? `Balance · ${money(m.amount)}` : `${isEvent ? "Ticket" : m.kind === "deposit" ? "Deposit" : "Down-payment"} · ${money(m.amount)}`,
      detail: paid ? "Received — thank you." : m.kind === "final" ? "Bank transfer, details in your payment plan." : "Secures your spot. Fully refundable for 14 days.",
      done: paid,
      href: paid ? undefined : "#payment",
      hrefLabel: paid ? undefined : "See how to pay",
    });
  }

  if (!isEvent) {
    const crew = daysBefore(timingBefore.crew_forming);
    steps.push({
      when: crew,
      label: "Your crew forms",
      detail: whatsappLink
        ? (joinedGroup ? "You're in the group chat." : "The WhatsApp group is open — join it to meet the others.")
        : `We introduce the crew and open the WhatsApp group around ${fmt(crew) ?? "two months before"}.`,
      done: !!joinedGroup,
      href: whatsappLink && !joinedGroup ? whatsappLink : undefined,
      hrefLabel: whatsappLink && !joinedGroup ? "Join the group" : undefined,
    });
    const info = daysBefore(timingBefore.pre_trip_info);
    steps.push({
      when: info,
      label: "Packing list & arrival info",
      detail: "Everything you need to bring, how to get there, and how the week is laid out.",
      href: "#prep",
      hrefLabel: "Trip prep",
    });
    const fin = daysBefore(timingBefore.pre_trip_final);
    steps.push({
      when: fin,
      label: "Final details",
      detail: "Transfers, meeting point and the first day's plan.",
    });
  } else if (!fullyPaid) {
    steps.push({ when: null, label: "Sign the waiver", detail: "Once your ticket is paid.", href: "#docs", hrefLabel: "Documents" });
  }

  if (start) {
    steps.push({
      when: start,
      label: end ? `Trip · ${fmt(start)} – ${fmt(end)}` : `Trip · ${fmt(start)}`,
      detail: depositPaid || fullyPaid ? "Your spot is held." : "Held for you once the down-payment is in.",
    });
  }

  // Sort by date; undated at their natural position (end).
  return steps
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ta = a.s.when?.getTime() ?? Number.POSITIVE_INFINITY;
      const tb = b.s.when?.getTime() ?? Number.POSITIVE_INFINITY;
      return ta === tb ? a.i - b.i : ta - tb;
    })
    .map(({ s }) => s)
    .filter((s) => !s.when || s.when.getTime() >= now.getTime() - 86_400_000 || s.done);
}

export function WhatsNext({ steps, contact }: { steps: WhatsNextStep[]; contact: { email: string | null; phone: string | null } }) {
  if (!steps.length) return null;
  const today = new Date();
  return (
    <section className="rounded-2xl bg-white border border-[#f0e6d6] p-5 sm:p-6 mt-4">
      <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb] mb-4">What happens next</h2>
      <ol className="relative">
        {steps.map((s, i) => {
          const past = s.done || (s.when ? s.when.getTime() < today.getTime() : false);
          return (
            <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
              {i < steps.length - 1 && <span aria-hidden className="absolute left-[9px] top-5 bottom-0 w-px bg-[#f0e6d6]" />}
              <span
                aria-hidden
                className={`mt-1 w-[19px] h-[19px] rounded-full grid place-items-center shrink-0 ${s.done ? "bg-[#0f6e56]" : past ? "bg-[#c8d3d8]" : "bg-white border-2 border-[#00afdb]"}`}
              >
                {s.done && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={`text-[14.5px] font-bold ${s.done ? "text-[#0f6e56]" : "text-[#00374a]"}`}>{s.label}</p>
                  <p className="text-[12px] font-semibold text-[#8a9aa0] shrink-0 tabular-nums">{s.when ? (s.when.getTime() < today.getTime() && !s.done ? "" : `~${fmt(s.when)}`) : ""}</p>
                </div>
                {s.detail && <p className="text-[13px] text-[#5a6b72] leading-snug mt-0.5">{s.detail}</p>}
                {s.href && s.hrefLabel && (
                  <a href={s.href} target={s.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="inline-block text-[12.5px] font-semibold text-[#00afdb] hover:underline mt-1">{s.hrefLabel} →</a>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {(contact.email || contact.phone) && (
        <p className="text-[12.5px] text-[#5a6b72] mt-5 pt-4 border-t border-[#f0e6d6]">
          Questions in between? Message us any time
          {contact.phone && <> on WhatsApp <a className="font-semibold text-[#00afdb]" href={`https://wa.me/${contact.phone.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer">{contact.phone}</a></>}
          {contact.phone && contact.email && " or "}
          {contact.email && <a className="font-semibold text-[#00afdb]" href={`mailto:${contact.email}`}>{contact.email}</a>}.
        </p>
      )}
    </section>
  );
}
