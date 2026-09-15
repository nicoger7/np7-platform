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
 *
 * ── WHY IT IS A LINE NOW, AND NOT A LIST ────────────────────────────────────
 *
 * Six rows of title, sentence, link and date is around 600px, and it sits
 * between the next-step hero and the Payment/Prep/Trip/Docs/Photos tabs. On a
 * phone that pushed the tabs most of a screen further down for something the
 * guest reads once. Nico: "can it be a line from left to right? which shows
 * whats done already, and then it can be folded open?"
 *
 * So the same steps draw as a rail of dots, about 126px, and the list is behind
 * a <details>, the same fold the packing checklist and the day-by-day already
 * use, so it needs no JavaScript, keyboards get it for free, and the browser
 * announces the open state itself. Nothing left the block; it only stopped
 * being the first thing on the page.
 *
 * ── ONE CLOCK ───────────────────────────────────────────────────────────────
 *
 * The builder used to be handed `now` while the component separately called
 * `new Date()`, and each step's done/past-ness was worked out down there, on
 * the second clock. It is decided here once, stamped on the step as `state`,
 * and the component renders it. That is not a second source of truth about
 * done-ness: it is the one source finally computing it once.
 *
 * Days are compared as yyyy-mm-dd strings, the way payments.ts already does it,
 * because `when` for a milestone is UTC midnight and this renders on a server
 * in UTC. A getTime() comparison made a payment due TODAY read as past from
 * 00:01, grey and with its date blanked, on the very day we were asking for it.
 */
import { Fragment } from "react";
import { daysBetween, type Milestone } from "@/lib/payments";

/**
 * · done:  it happened (paid, joined).
 * · past:  its date went by and it is not something we tick off.
 * · now:   the one step this page is about. Exactly one, ever.
 * · ahead: still to come.
 */
export type WhatsNextState = "done" | "past" | "now" | "ahead";

export type WhatsNextStep = {
  when: Date | null;
  label: string;
  /**
   * A name short enough for the collapsed line, where `label` carries a figure
   * ("Balance · EUR 1,820") that the hero 8px above is already shouting.
   */
  short: string;
  detail?: string;
  done?: boolean;
  /**
   * This is the money the plan is asking for RIGHT NOW. Milestone.status is a
   * three-state ladder and `done: paid` throws two thirds of it away; this
   * keeps the middle rung, which is the one the line exists to point at.
   * Gated on `asking` (see buildWhatsNext) so it can never contradict the hero.
   */
  due?: boolean;
  state: WhatsNextState;
  /** "today", "in 3 days", "in 4 weeks", "~12 Mar". Nothing when undated. */
  eta?: string;
  href?: string;
  hrefLabel?: string;
};

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

const toISO = (d: Date) => d.toISOString().slice(0, 10);

/**
 * "in 3 weeks", not "9 Nov". A phone reader should not have to do arithmetic
 * to learn whether something is close, and the relative form is shorter than
 * the date it replaces. Past dates get nothing: the line never counts backwards.
 */
function etaOf(when: Date | null, now: Date): string | undefined {
  if (!when) return undefined;
  const d = daysBetween(toISO(now), toISO(when));
  if (d < 0) return undefined;
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d < 14) return `in ${d} days`;
  if (d <= 70) return `in ${Math.round(d / 7)} weeks`;
  return `~${fmt(when)}`;
}

/** A step before it knows where it sits in the line. */
type Draft = Omit<WhatsNextStep, "state" | "eta"> & {
  /**
   * Undated because it is due the moment you read it (payments.ts gives the
   * securing payment no date at all, "Pay to secure your spot"), not because it
   * belongs at the end. Sorted as today.
   */
  dueNow?: boolean;
  /** The trip ends the line, whatever any other date says. */
  last?: boolean;
  /** Pinned to the left. Only signing up, which is where the line starts. */
  first?: boolean;
};

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
  /**
   * Whether the page is genuinely asking this guest for money, decided once by
   * the caller from the same payment step the hero reads. Without it the line
   * would dun a guest whose transfer is already on its way, and a group guest
   * whose payer owes the money. Both of them have due milestones in their plan
   * and nothing whatsoever to do.
   */
  asking: boolean;
  /** When they signed up. The first step on the rail, and always done. */
  bookedAt: Date | null;
  money: (n: number) => string;
}): WhatsNextStep[] {
  const { now, start, end, plan, depositPaid, fullyPaid, isEvent, timingBefore, whatsappLink, joinedGroup, asking, bookedAt, money } = input;
  const daysBefore = (n: number | null | undefined) =>
    start && n != null ? new Date(start.getTime() - n * 86_400_000) : null;
  const drafts: Draft[] = [];

  /*
   * SIGNING UP IS A STEP, and it is already done.
   *
   * The rail used to open on the current dot with nothing behind it, so a guest
   * who had just booked read a line that said they had achieved nothing. Nico:
   * "this feels bad, it starts at step zero". He is right, and it was also
   * untrue: they found the trip, chose a package and gave us their details.
   *
   * It is honest rather than flattering. The step is done because the booking
   * exists, which is a fact, and it deliberately does NOT claim the spot is
   * secured, because that is what the down-payment is for and the next dot
   * along says so.
   */
  if (bookedAt) {
    drafts.push({
      when: bookedAt,
      label: "You signed up",
      short: "Signed up",
      detail: "You picked your week and your package. Everything below follows from here.",
      done: true,
      first: true,
    });
  }

  // Money first, it is the only step that is theirs to take.
  for (const m of plan) {
    const when = m.dueDate ? new Date(m.dueDate) : null;
    const paid = m.status === "paid";
    drafts.push({
      when,
      /*
       * Only an UNPAID undated milestone is due now. A paid deposit has no due
       * date either, and calling it due-now sorted it as if today, which put a
       * finished payment to the RIGHT of the down-payment, the balance and the
       * current dot. The rail makes exactly one promise, done on the left and
       * ahead on the right, and this broke it on every package with a deposit,
       * which is most of them once computePaymentPlan falls back to 300.
       */
      dueNow: !when && !paid,
      // A clinic is bought outright: its one milestone is the ticket, not a
      // down-payment on something larger.
      label: m.kind === "final" ? `Balance · ${money(m.amount)}` : `${isEvent ? "Ticket" : m.kind === "deposit" ? "Deposit" : "Down-payment"} · ${money(m.amount)}`,
      short: m.kind === "final" ? "Balance" : isEvent ? "Ticket" : m.kind === "deposit" ? "Deposit" : "Down-payment",
      detail: paid ? "Received, thank you." : m.kind === "final" ? "Bank transfer, details in your payment plan." : "Secures your spot. Fully refundable for 14 days.",
      done: paid,
      due: asking && m.status === "due",
      href: paid ? undefined : "#payment",
      hrefLabel: paid ? undefined : "See how to pay",
    });
  }

  if (!isEvent) {
    const crew = daysBefore(timingBefore.crew_forming);
    drafts.push({
      when: crew,
      label: "Your crew forms",
      short: "Your crew",
      detail: whatsappLink
        ? (joinedGroup ? "You're in the group chat." : "The WhatsApp group is open. Join it to meet the others.")
        : `We introduce the crew and open the WhatsApp group around ${fmt(crew) ?? "two months before"}.`,
      done: !!joinedGroup,
      href: whatsappLink && !joinedGroup ? whatsappLink : undefined,
      hrefLabel: whatsappLink && !joinedGroup ? "Join the group" : undefined,
    });
    const info = daysBefore(timingBefore.pre_trip_info);
    drafts.push({
      when: info,
      label: "Packing list & arrival info",
      short: "Packing list",
      detail: "Everything you need to bring, how to get there, and how the week is laid out.",
      href: "#prep",
      hrefLabel: "Trip prep",
    });
    const fin = daysBefore(timingBefore.pre_trip_final);
    drafts.push({
      when: fin,
      label: "Final details",
      short: "Final details",
      detail: "Transfers, meeting point and the first day's plan.",
    });
  } else if (!fullyPaid) {
    drafts.push({ when: null, label: "Sign the waiver", short: "The waiver", detail: "Once your ticket is paid.", href: "#docs", hrefLabel: "Documents" });
  }

  if (start) {
    drafts.push({
      when: start,
      last: true,
      label: end ? `Trip · ${fmt(start)} - ${fmt(end)}` : `Trip · ${fmt(start)}`,
      short: "Your trip",
      detail: depositPaid || fullyPaid ? "Your spot is held." : "Held for you once the down-payment is in.",
    });
  }

  /*
   * ORDER. Left to right, a line has to be in the order things happen, and the
   * old "undated sorts at the end" put an unpaid securing payment AFTER the
   * trip it secures, as did an event's waiver. The securing payment has no
   * date because it is due now, so it sorts as now. The trip is pinned last,
   * because nothing on this page happens after the trip.
   */
  const at = (d: Draft) => (d.when ? d.when.getTime() : d.dueNow ? now.getTime() : Number.POSITIVE_INFINITY);
  const ordered = drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      /*
       * Pinned first, not sorted by its date. Signing up is the origin of the
       * line and always happened before everything on it, but its DATE is not
       * always the earliest: a guest carrying an overdue balance has a
       * milestone dated before the day they booked, and by date alone the rail
       * opened on the debt instead of on the thing they had actually done.
       */
      const fa = a.d.first ? 0 : 1;
      const fb = b.d.first ? 0 : 1;
      if (fa !== fb) return fa - fb;
      const ra = a.d.last ? 1 : 0;
      const rb = b.d.last ? 1 : 0;
      if (ra !== rb) return ra - rb;
      const ta = at(a.d);
      const tb = at(b.d);
      return ta === tb ? a.i - b.i : ta - tb;
    })
    .map(({ d }) => d)
    /*
     * Yesterday's steps fall away, so the line stays short and stays about what
     * is coming. `|| d.due` is the exception and it is not cosmetic: without it
     * an OVERDUE balance vanished from the block entirely. Cameron Cederquist's
     * EUR 1,820, due 1 September and read on the 14th, was simply not here. A
     * tolerable omission in a list, and a lie as a line, which would have drawn
     * a green tick and four quiet dots under a hero shouting "Balance due".
     */
    .filter((d) => !d.when || d.when.getTime() >= now.getTime() - 86_400_000 || d.done || d.due);

  /*
   * WHICH ONE IS NOW. The money we are actually asking for, whatever its date:
   * an overdue balance is not "past", it is the whole point of the screen.
   * Failing that, the first step that has neither happened nor gone by.
   */
  const isPast = (d: Draft) => !d.done && d.when != null && daysBetween(toISO(now), toISO(d.when)) < 0;
  const dueIdx = ordered.findIndex((d) => d.due);
  const nowIdx = dueIdx >= 0 ? dueIdx : ordered.findIndex((d) => !d.done && !isPast(d));

  // Named field by field rather than spread, so the two sorting hints above
  // stay inside this function and never reach a renderer that might read them.
  return ordered.map((d, i) => ({
    when: d.when,
    label: d.label,
    short: d.short,
    detail: d.detail,
    done: d.done,
    due: d.due,
    href: d.href,
    hrefLabel: d.hrefLabel,
    eta: etaOf(d.when, now),
    state: d.done ? "done" : i === nowIdx ? "now" : isPast(d) ? "past" : "ahead",
  }));
}

/**
 * How a step's dot looks, in one place, because the rail and the list draw the
 * same steps: a guest who taps Show has to find the big dot where the line
 * said it was. Only the SIZE differs between them: the line has 295px for up
 * to seven dots, the list has a column.
 *
 * Three signals, never colour alone: fill, size and, on the current step, a
 * ring. #c4621a rather than the brand's #f47b20, which is about 2.6:1 on white
 * and fails the 3:1 a non-text mark needs when it is the thing saying "you are
 * here".
 */
function dotSkin(state: WhatsNextState, onYou: boolean) {
  switch (state) {
    case "done": return { fill: "bg-[#0f6e56]", ring: "", tick: true };
    case "now": return onYou
      ? { fill: "bg-[#c4621a]", ring: "ring-4 ring-[#c4621a]/15", tick: false }
      : { fill: "bg-[#00afdb]", ring: "ring-4 ring-[#00afdb]/15", tick: false };
    case "past": return { fill: "bg-[#c8d3d8]", ring: "", tick: false };
    default: return { fill: "bg-white border-2 border-[#dbe5e8]", ring: "", tick: false };
  }
}

const RAIL_SIZE: Record<WhatsNextState, string> = {
  done: "w-[18px] h-[18px]",
  now: "w-[22px] h-[22px]",
  past: "w-3 h-3",
  ahead: "w-3 h-3",
};

const Tick = ({ size }: { size: string }) => (
  <svg className={`${size} text-white`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

export function WhatsNext({ steps, contact, asking = false, awaitingTransfer = false }: {
  steps: WhatsNextStep[];
  contact: { email: string | null; phone: string | null };
  /** The page is asking this guest for money. Same value the builder got. */
  asking?: boolean;
  /** Their transfer is on its way, so nothing is on them. */
  awaitingTransfer?: boolean;
}) {
  if (!steps.length) return null;
  const nowIdx = steps.findIndex((s) => s.state === "now");
  const current = nowIdx >= 0 ? steps[nowIdx] : null;
  const doneCount = steps.filter((s) => s.state === "done").length;

  /*
   * THE ONE LINE. It must not be the hero's sentence again 8px lower, so it
   * never repeats an amount, a due date or a CTA: it answers the question the
   * hero cannot, which is whether anything at all is waiting on the guest and
   * what the next thing is.
   *
   * The lead is driven by `asking`, never by finding a step with `due`. An
   * unpaid clinic ticket is bought outright with no plan behind it, so no step
   * can carry `due`, and reading "Nothing needs you" over a hero asking for
   * money is the one thing this line may never do.
   */
  const dueStep = steps.find((s) => s.due);
  const lead = asking ? "Waiting on you" : awaitingTransfer ? "Transfer on its way" : "Nothing needs you";
  const leadClass = asking ? "text-[#c4621a]" : awaitingTransfer ? "text-[#9a6b16]" : "text-[#0f6e56]";
  const tail = asking
    ? (dueStep?.short ?? "your payment").toLowerCase()
    : awaitingTransfer
      ? "nothing to do"
      : current
        ? `next, ${current.short.toLowerCase()}${current.eta ? `, ${current.eta}` : ""}`
        : "";

  return (
    <details className="rounded-2xl bg-white border border-[#f0e6d6] mt-4 group">
      {/* No anchor anywhere in here. A link inside a <summary> toggles the fold
          in some browsers, and TripView intercepts every href="#…" to switch
          tab, so one stray link would do both on a single tap. */}
      <summary className="p-5 sm:p-6 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb]">What happens next</h2>
          <span className="text-[12px] font-bold text-[#00afdb] shrink-0 group-open:hidden">Show</span>
          <span className="text-[12px] font-bold text-[#00afdb] shrink-0 hidden group-open:inline">Hide</span>
        </div>
        {/* The rail. One dot never reads as a line, it reads as broken, so
            below two steps the sentence carries the whole block. */}
        {steps.length > 1 && (
          <div aria-hidden className="flex items-center h-[30px] px-[4px] mt-3">
            {steps.map((s, i) => {
              const skin = dotSkin(s.state, asking);
              const travelled = i > 0 && (steps[i - 1].state === "done" || steps[i - 1].state === "past");
              return (
                <Fragment key={i}>
                  {i > 0 && <span className={`flex-1 h-[3px] min-w-[10px] rounded-full ${travelled ? "bg-[#0f6e56]/30" : "bg-[#f0e6d6]"}`} />}
                  <span className={`rounded-full grid place-items-center shrink-0 ${RAIL_SIZE[s.state]} ${skin.fill} ${skin.ring}`}>
                    {skin.tick && <Tick size="w-[11px] h-[11px]" />}
                  </span>
                </Fragment>
              );
            })}
          </div>
        )}
        {/* NOT truncated. At 375px the line has 291px, and the cut always
            landed on the end, which is where the "when" lives: the half the
            guest opened the page for. Two lines of 13.5px costs 18px once in a
            while and never eats the answer. */}
        <p className="text-[13.5px] text-[#5a6b72] leading-snug mt-2.5">
          <strong className={`font-bold ${leadClass}`}>{lead}</strong>{tail ? ` · ${tail}` : ""}
        </p>
        {/* Six unlabelled circles are worse than useless to a screen reader, so
            the rail is hidden from it outright and the count is spoken instead.
            Sighted guests read the same fact off the green ticks. */}
        <span className="sr-only">{doneCount} of {steps.length} steps done.</span>
      </summary>

      <div className="px-5 sm:px-6 pb-5 sm:pb-6">
        <ol className="relative">
          {steps.map((s, i) => {
            const skin = dotSkin(s.state, asking);
            return (
              <li key={i} aria-current={s.state === "now" ? "step" : undefined} className="relative flex gap-4 pb-5 last:pb-0">
                {i < steps.length - 1 && <span aria-hidden className="absolute left-[9px] top-5 bottom-0 w-px bg-[#f0e6d6]" />}
                {/* 19px whatever the state, so the connector above stays true.
                    The ring does the "this is the big one" job the rail does
                    with size, and costs no layout to do it. */}
                <span aria-hidden className={`mt-1 w-[19px] h-[19px] rounded-full grid place-items-center shrink-0 ${skin.fill} ${skin.ring}`}>
                  {skin.tick && <Tick size="w-3 h-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`text-[14.5px] font-bold ${s.done ? "text-[#0f6e56]" : "text-[#00374a]"}`}>
                      {/* The tick is the only thing that said "done", and it is
                          decoration. Say it. */}
                      {s.done && <span className="sr-only">Done. </span>}
                      {s.label}
                    </p>
                    <p className="text-[12px] font-semibold text-[#8a9aa0] shrink-0 tabular-nums">{s.when && s.state !== "past" ? `~${fmt(s.when)}` : ""}</p>
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
      </div>
      {/*
       * OUTSIDE the fold, deliberately. Folding the timeline away took the
       * WhatsApp number with it, from zero taps to one, and it is the only
       * place in the portal that number appears. A guest who needs to ask
       * something is exactly the guest who will not go hunting for it behind a
       * summary about packing lists.
       *
       * It sits outside <details> rather than inside <summary> because an <a>
       * within a summary toggles the panel in some browsers, so tapping the
       * number would open the timeline instead of opening WhatsApp.
       */}
      {(contact.email || contact.phone) && (
        <p className="text-[12.5px] text-[#5a6b72] mt-4 pt-4 border-t border-[#f0e6d6]">
          Questions in between? Message us any time
          {contact.phone && <> on WhatsApp <a className="font-semibold text-[#00afdb]" href={`https://wa.me/${contact.phone.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer">{contact.phone}</a></>}
          {contact.phone && contact.email && " or "}
          {contact.email && <a className="font-semibold text-[#00afdb]" href={`mailto:${contact.email}`}>{contact.email}</a>}.
        </p>
      )}
    </details>
  );
}
