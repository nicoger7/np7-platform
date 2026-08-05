import { emailLayout, emailButton, esc, type Division } from "./layout";

export type EmailVars = {
  firstName?: string;
  experienceTitle?: string;
  editionLabel?: string;
  dates?: string;
  packageName?: string;
  total?: string;
  deposit?: string;
  balance?: string;
  activationLink?: string;
  bookingLink?: string;
  whatsappLink?: string;
  /** admin-set subject for a survey invite; empty = the built-in one */
  surveySubject?: string;
  reviewLink?: string;
  joinLink?: string;
  /** Newline-separated packing list (rendered as a checklist). */
  packingList?: string;
  /** Personal pre-trip note from the host. */
  preTripNote?: string;
  finalDetailsNote?: string;
  waiverLink?: string;
  tripLink?: string;
  voucherCode?: string;
  recipientName?: string;
  fromName?: string;
  amount?: string;
  /** Payment reference to quote on a bank transfer (the invoice number). */
  reference?: string;
  inviterName?: string;
  rewardFriend?: string;
  personalNote?: string;
  /** Formatted securing-payment amount (e.g. "€1,399.50") and its deadline. */
  downpayment?: string;
  dueDate?: string;
  [k: string]: string | undefined;
};

type Built = { subject: string; html: string };
type LayoutOpts = { division?: Division; headerImage?: string | null; headerPosition?: number | null };

const p = (s: string) => `<p style="margin:0 0 15px;">${s}</p>`;

/**
 * The greeting sets the tone, so it gets to be a line rather than body copy —
 * bigger, in the brand deep-teal, with room under it.
 */
const greet = (v: EmailVars) =>
  `<p style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:800;color:#00374a;">Hey ${esc(v.firstName || "there")} 🤙</p>`;

/** A short gold→coral rule. The brand's "sun to sea" warmth, used to break a
 *  long email into parts without shouting a heading at people. */
const rule = () =>
  `<div style="height:3px;width:52px;background:#f47b20;background-image:linear-gradient(90deg,#ffc42e,#f47b20);border-radius:2px;margin:24px 0 16px;"></div>`;

/** A small heading above a block — quiet, uppercase, gold. */
const heading = (text: string) =>
  `<p style="margin:22px 0 6px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#b0791e;">${esc(text)}</p>`;

/**
 * Key facts as a card of label/value rows.
 *
 * Dates, amounts and package names were buried mid-sentence, so the one thing
 * a reader scans for was the hardest thing to find. Table-based and inline-
 * styled, so it survives Outlook.
 */
const facts = (rows: [string, string | undefined | null][]) => {
  const live = rows.filter(([, v]) => v != null && String(v).trim() !== "");
  if (!live.length) return "";
  const cells = live
    .map(
      ([k, v], i) =>
        `<tr>
<td style="padding:${i ? "9px" : "0"} 0 0;font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8aa0a8;width:40%;vertical-align:top;">${esc(k)}</td>
<td style="padding:${i ? "9px" : "0"} 0 0;font-size:15px;font-weight:700;color:#00374a;vertical-align:top;">${esc(String(v))}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;background:#f5fafb;border:1px solid #e2eef1;border-radius:12px;"><tr><td style="padding:16px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cells}</table>
</td></tr></table>`;
};

/** A personal note from the host — a quote block with the warm accent, since it
 *  is the one part of the mail written by a person rather than the system. */
const note = (text?: string) =>
  text && text.trim()
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr>
<td style="padding:14px 16px;background:#fffaf0;border-left:4px solid #f0a500;border-radius:4px;font-size:15px;line-height:1.6;color:#5a4a32;white-space:pre-line;">${esc(text.trim())}</td>
</tr></table>`
    : "";
/** A newline-separated list rendered as a tidy checklist (if set). */
const checklist = (text?: string) => {
  const items = (text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!items.length) return "";
  return `<ul style="margin:0 0 14px;padding-left:0;list-style:none;">${items.map((i) => `<li style="margin:0 0 7px;padding-left:22px;position:relative;"><span style="position:absolute;left:0;color:#1d9e75;font-weight:700;">✓</span>${esc(i)}</li>`).join("")}</ul>`;
};

/** Code-default templates, keyed by template_key. */
export const TEMPLATES: Record<string, (v: EmailVars, opts?: LayoutOpts) => Built> = {
  reservation_received: (v, opts) => ({
    subject: `You're registered — ${v.experienceTitle ?? "NP7 Experience"} 🤙`,
    html: emailLayout({
      ...opts,
      preheader: "You're on the list — here's how it works and how to secure your spot.",
      bodyHtml:
        greet(v) +
        p(`You're registered for <strong>${esc(v.experienceTitle || "")}${v.editionLabel ? " · " + esc(v.editionLabel) : ""}</strong> — awesome to have you. Here's how it works from here:`) +
        p(`<strong>1. Secure your spot.</strong> Attached are your payment details (pro-forma invoice) — pay the downpayment by bank transfer within the window shown and your place is locked in. Fully refundable for 14 days after you pay, so there's plenty of time to sort flights.`) +
        p(`<strong>2. Plan it with us.</strong> Manage your booking, add extra nights and meet your crew — all in your trip account.`) +
        p(`<strong>3. Pay the balance later</strong> by bank transfer, in good time before the trip.`) +
        (v.bookingLink ? emailButton("Secure my spot", v.bookingLink) : "") +
        p(`Any questions, just reply — we're happy to help.<br>— Nico & the NP7 team`),
    }),
  }),

  deposit_confirmation: (v, opts) => ({
    subject: `You're in! 🤙 ${v.experienceTitle ?? "Your NP7 trip"} is booked`,
    html: emailLayout({
      ...opts,
      preheader: "Deposit received — activate your trip account.",
      bodyHtml:
        greet(v) +
        p(`Your deposit is in — you're officially coming. Get ready for the week your jibes have been waiting for.`) +
        facts([["Trip", v.experienceTitle], ["Dates", v.dates], ["Package", v.packageName], ["Balance to come", v.balance]]) +
        p(`We've created your personal <strong>trip account</strong> where you'll manage your booking, see your travel documents, update your details and find your memories after the week. Activate it here:`) +
        (v.activationLink ? emailButton("Activate my trip account", v.activationLink) : "") +
        p(`<strong>What's next:</strong> we'll contact you personally within a day or two to go through everything. The remaining balance is paid later by bank transfer — we'll send the invoice in good time.`) +
        p(`See you on the water.<br>— Nico & the NP7 team`),
    }),
  }),

  account_magic_link: (v, opts) => ({
    subject: `Your NP7 login link`,
    html: emailLayout({
      ...opts,
      preheader: "Sign in to your NP7 account.",
      bodyHtml:
        greet(v) +
        p(`Here's your secure login link for your NP7 account. It expires shortly, so use it soon:`) +
        (v.activationLink ? emailButton("Log in to my account", v.activationLink) : "") +
        p(`If you didn't request this, you can safely ignore this email.`),
    }),
  }),

  trip_invite: (v, opts) => ({
    subject: `${v.inviterName ?? "A friend"} invited you to ${v.experienceTitle ?? "an NP7 trip"} 🌊`,
    html: emailLayout({
      ...opts,
      preheader: `Join ${v.inviterName ?? "a friend"} on this windsurf trip${v.rewardFriend ? ` — ${v.rewardFriend} off your spot` : ""}.`,
      bodyHtml:
        p(`Hey ${esc(v.firstName || "there")} 🤙`) +
        p(`<strong>${esc(v.inviterName || "A friend")}</strong> wants you along on <strong>${esc(v.experienceTitle || "an NP7 trip")}</strong>${v.dates ? " (" + esc(v.dates) + ")" : ""} — an NP7 windsurf adventure.`) +
        (v.personalNote ? p(`<em>“${esc(v.personalNote)}”</em>`) : "") +
        (v.rewardFriend ? p(`${v.inviterName ? `As <strong>${esc(v.inviterName)}</strong>’s guest you` : "You"} get <strong>${esc(v.rewardFriend)} off</strong> your spot.`) : "") +
        (v.joinLink ? emailButton("See the trip & join", v.joinLink) : "") +
        p(`Signing up is free and holds no payment — your spot is fully refundable for 14 days. Hope to see you on the water!<br>— Nico & the NP7 team`),
    }),
  }),

  // Hidden invite-only trip-interest survey (a personal secret link).
  survey_invite: (v, opts) => {
    // Quick mode: one button per date — tapping it ALREADY registers the answer
    // (the link carries it; the page just confirms). Plus an honest opt-out link.
    let quick: { label: string; url: string; group?: string | null }[] = [];
    try { quick = v.quickChoices ? JSON.parse(v.quickChoices) : []; } catch { /* fall back to the classic button */ }
    const isQuick = quick.length > 0;
    // Custom email text (survey admin) replaces the standard pitch + intro
    // paragraphs — greeting, buttons, opt-out and sign-off stay.
    const customBody = v.emailBody
      ? v.emailBody.split(/\n+/).map((line) => p(esc(line))).join("")
      : null;
    return {
      // An explicit subject from the admin always wins. Otherwise: name the trip
      // and ask the question — the old non-quick fallback opened "A quick one
      // for you" and previewed as "a private invite", which is simply wrong for
      // a survey behind a shareable open link.
      subject: v.surveySubject?.trim()
        || (isQuick
          ? `${v.surveyTitle ?? "A special NP7 trip"} — would you join? One tap 🤙`
          : `${v.surveyTitle ?? "A special NP7 trip"} — would you join? 🌊`),
      html: emailLayout({
        ...opts,
        preheader: isQuick
          ? `One tap answers it — no forms, no login.`
          : `Two minutes to help pick the week — no forms, no login.`,
        bodyHtml: isQuick
          ? p(`Hey ${esc(v.firstName || "there")} 🤙`) +
            (customBody ??
              (p(`I'm putting together <strong>${esc(v.surveyTitle || "a special, invite-only trip")}</strong> and you're on my shortlist. Just tell me if you'd be in — <strong>one tap on a date below is all it takes</strong> (it registers instantly, and you can change it after).`) +
              (v.surveyIntro ? p(`<em>${esc(v.surveyIntro)}</em>`) : ""))) +
            // Dates as compact chips that wrap, not full-width buttons stacked
            // with 22px of air each: seven of those was a page and a half of
            // scrolling for what is meant to be a one-tap question. Grouped
            // under the place, with a gold rule to carry the NP7 warmth.
            (() => {
              const groups: { name: string | null; items: typeof quick }[] = [];
              for (const ch of quick) {
                const g = groups.find((x) => x.name === (ch.group ?? null));
                if (g) g.items.push(ch);
                else groups.push({ name: ch.group ?? null, items: [ch] });
              }
              const chip = (label: string, url: string) =>
                `<a href="${url}" target="_blank" style="display:inline-block;margin:0 8px 10px 0;padding:12px 20px;border-radius:999px;background:#ffffff;border:2px solid #0aa3c7;color:#00374a;font-size:15px;font-weight:800;text-decoration:none;white-space:nowrap;">${esc(label)}</a>`;
              const head = (name: string) =>
                `<p style="margin:26px 0 4px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#b0791e;">${esc(name)}</p>` +
                `<div style="height:3px;width:46px;background:linear-gradient(90deg,#ffc42e,#f0774a);border-radius:2px;margin:0 0 12px;"></div>`;
              return groups
                .map((g) => (g.name ? head(g.name) : "") + g.items.map((ch) => chip(ch.label, ch.url)).join(""))
                .join("");
            })() +
            p(`<span style="color:#8a97a0;font-size:13.5px;">Tap as many as work for you — nothing is booked, it just tells me where the crew is leaning. 🤙</span>`) +
            (v.quickDeclineUrl ? p(`Not this time? No hard feelings — <a href="${esc(v.quickDeclineUrl)}" style="color:#b0791e;font-weight:bold;">tap here</a> and I'll stop asking. 🤙`) : "") +
            p(`This link is personal to you — no login, no commitment, just a show of hands.<br>— Nico`)
          : p(`Hey ${esc(v.firstName || "there")} 🤙`) +
            (customBody ??
              (p(`I'm putting together a <strong>special, invite-only trip</strong> and I'd love your input to help shape it — where, when, and what you'd want out of it.`) +
              (v.surveyIntro ? p(`<em>${esc(v.surveyIntro)}</em>`) : ""))) +
            (v.surveyLink ? emailButton(v.surveyCtaText || "Take the 2-minute survey", v.surveyLink) : "") +
            p(`This link is just for you — no need to log in. Thanks for helping me build something great.<br>— Nico`),
      }),
    };
  },

  payment_pending_nudge: (v, opts) => ({
    subject: `Your spot is waiting — ${v.experienceTitle ?? "NP7 Experience"}`,
    html: emailLayout({
      ...opts,
      preheader: "Your spot isn't secured yet — lock it in from your account.",
      bodyHtml:
        greet(v) +
        p(`Your place on <strong>${esc(v.experienceTitle || "")}</strong> is still open — but it isn't secured yet. Spots are limited, so lock yours in with the down-payment whenever you're ready. You'll find the amount and how to pay in your account:`) +
        (v.bookingLink ? emailButton("Secure my spot", v.bookingLink) : "") +
        p(`It stays fully refundable for 14 days. Questions? Just reply — we're happy to help.`),
    }),
  }),

  // Deadline ladder on the securing payment — mirrors the member-area banners
  // (dueUrgency in src/lib/payments.ts): a loud warning a few days before the
  // window closes, then the honest "we can't hold it any more" once it has.
  downpayment_last_chance: (v, opts) => ({
    subject: `Last chance to hold your spot — ${v.experienceTitle ?? "NP7 Experience"}`,
    html: emailLayout({
      ...opts,
      preheader: "Your payment window closes soon — after that we can't hold your place.",
      bodyHtml:
        greet(v) +
        p(`Quick heads-up: your window to secure <strong>${esc(v.experienceTitle || "your trip")}</strong> closes ${v.dueDate ? `on <strong>${esc(v.dueDate)}</strong>` : "in the next days"}. After that we can't hold your place, and the spot opens up to other riders.`) +
        p(`Locking it in takes a minute — pay the downpayment${v.downpayment ? ` of <strong>${esc(v.downpayment)}</strong>` : ""} by bank transfer. Everything you need is in your account:`) +
        (v.bookingLink ? emailButton("Secure my spot now", v.bookingLink) : "") +
        p(`Already paid in the last day or two? Then you're set — bank transfers can take a moment to reach us. Questions? Just reply.`),
    }),
  }),

  spot_released: (v, opts) => ({
    subject: `Your spot on ${v.experienceTitle ?? "the trip"} is no longer held`,
    html: emailLayout({
      ...opts,
      preheader: "Your payment window has passed — but there may still be room.",
      bodyHtml:
        greet(v) +
        p(`Your payment window for <strong>${esc(v.experienceTitle || "your trip")}</strong> has passed, so we can no longer hold your place — the spot is open to other riders again.`) +
        p(`Still want to come? If there's room left, it's yours the moment your downpayment lands:`) +
        (v.bookingLink ? emailButton("Check my trip & pay", v.bookingLink) : "") +
        p(`And if the timing didn't work out this round — no hard feelings. Reply and we'll find you a week that fits. 🤙`),
    }),
  }),

  balance_invoice_reminder: (v, opts) => ({
    subject: `Balance for ${v.experienceTitle ?? "your NP7 trip"} — invoice`,
    html: emailLayout({
      ...opts,
      preheader: "Your remaining balance is now due by bank transfer.",
      bodyHtml:
        greet(v) +
        facts([["Trip", v.experienceTitle], ["Dates", v.dates], ["Amount due", v.amount ?? v.balance], ["Due by", v.dueDate], ["Reference", v.reference]]) +
        p(`Your trip is getting close! The remaining balance${v.balance ? " of <strong>" + esc(v.balance) + "</strong>" : ""} for <strong>${esc(v.experienceTitle || "")}</strong> is now due by <strong>bank transfer</strong>.`) +
        p(`You'll find your invoice and bank details in your trip account:`) +
        (v.bookingLink ? emailButton("View my booking & invoice", v.bookingLink) : "") +
        p(`Thanks — almost time to ride!<br>— Nico & the NP7 team`),
    }),
  }),

  invoice_sent: (v, opts) => ({
    subject: `Your invoice for ${v.experienceTitle ?? "your NP7 trip"}${v.amount ? " — " + v.amount : ""}`,
    html: emailLayout({
      ...opts,
      preheader: "Your invoice is attached — payable by bank transfer.",
      bodyHtml:
        greet(v) +
        p(`Here's your invoice for <strong>${esc(v.experienceTitle || "your NP7 trip")}</strong>${v.amount ? `, <strong>${esc(v.amount)}</strong>` : ""} — attached as a PDF.`) +
        p(`Please pay by <strong>bank transfer</strong>${v.reference ? ` and quote the reference <strong>${esc(v.reference)}</strong>` : ""} so we can match it to your booking straight away.`) +
        (v.bookingLink ? emailButton("View my booking", v.bookingLink) : "") +
        p(`Any questions, just reply — happy to help.<br>— Nico &amp; the NP7 team`),
    }),
  }),

  // Post-payment: the pro-forma got paid → the OFFICIAL tax invoice goes out.
  invoice_after_payment: (v, opts) => ({
    subject: `Payment received 🤙 your invoice for ${v.experienceTitle ?? "your NP7 trip"}`,
    html: emailLayout({
      ...opts,
      preheader: "Your payment arrived — the official invoice is attached.",
      bodyHtml:
        greet(v) +
        p(`Great news — your payment${v.amount ? ` of <strong>${esc(v.amount)}</strong>` : ""} for <strong>${esc(v.experienceTitle || "your NP7 trip")}</strong> has arrived. Your spot is secured! 🎉`) +
        p(`Attached is your official invoice${v.reference ? ` (<strong>${esc(v.reference)}</strong>)` : ""} for your records — it replaces the pro-forma payment request.`) +
        (v.bookingLink ? emailButton("View my booking", v.bookingLink) : "") +
        p(`Next up: plan your trip in your account — flights, extra nights, your crew. See you on the water!<br>— Nico &amp; the NP7 team`),
    }),
  }),

  payment_shortfall_reminder: (v, opts) => ({
    subject: `Almost there — a little left on ${v.experienceTitle ?? "your NP7 trip"} 🌊`,
    html: emailLayout({
      ...opts,
      preheader: "We're excited for your trip — just a small balance to settle.",
      bodyHtml:
        greet(v) +
        p(`We're getting really excited for <strong>${esc(v.experienceTitle || "your trip")}</strong>${v.dates ? " (" + esc(v.dates) + ")" : ""} — it's going to be a great one. 🤩`) +
        p(`There's just <strong>${esc(v.balance || "a little")}</strong> left to fully settle your balance. A quick bank transfer${v.reference ? ` quoting <strong>${esc(v.reference)}</strong>` : ""} and you're all set.`) +
        (v.bookingLink ? emailButton("View my booking & pay", v.bookingLink) : "") +
        p(`Thanks so much — can't wait to ride with you.<br>— Nico &amp; the NP7 team`),
    }),
  }),

  /**
   * Two months out, when the group chat is still useful.
   *
   * The chat link used to appear only in "Final details" at ~3 days, by which
   * point everyone has already booked flights alone. Opening it at 60 days is
   * the point of the mail, so it holds back rather than sending a crew email
   * with no crew to join.
   */
  crew_forming: (v, opts) => ({
    subject: `Your crew for ${v.experienceTitle ?? "your NP7 trip"} is coming together 🤙`,
    html: emailLayout({
      ...opts,
      preheader: "Meet the people you'll be riding with — the group chat is open.",
      bodyHtml:
        greet(v) +
        p(`<strong>${esc(v.experienceTitle || "Your trip")}</strong>${v.dates ? " (" + esc(v.dates) + ")" : ""} is about two months away, and the crew is taking shape.`) +
        p(`This is the good bit: people start comparing flights, sorting shared transfers, and arguing about sail sizes long before anyone lands.`) +
        (v.whatsappLink
          ? p(`<strong>Come and say hi:</strong>`) + emailButton("Join the group chat", v.whatsappLink)
          : "") +
        p(`No rush on anything else — your packing list and arrival details follow closer to the trip.`) +
        (v.bookingLink ? emailButton("Open my trip details", v.bookingLink) : "") +
        p(`See you on the water.<br>— Nico & the NP7 team`),
    }),
  }),

  pre_trip_info: (v, opts) => ({
    subject: `Getting ready for ${v.experienceTitle ?? "your NP7 trip"} 🌊`,
    html: emailLayout({
      ...opts,
      preheader: "What to pack and how to get ready.",
      bodyHtml:
        greet(v) +
        p(`Not long now until <strong>${esc(v.experienceTitle || "")}${v.dates ? " (" + esc(v.dates) + ")" : ""}</strong>! Time to start getting ready.`) +
        note(v.preTripNote) +
        (v.packingList ? rule() + heading("What to bring") + checklist(v.packingList) : "") +
        p(`Your arrival info and group chat are in your trip account too:`) +
        (v.bookingLink ? emailButton("Open my trip details", v.bookingLink) : "") +
        p(`Can't wait to ride with you.<br>— Nico & the NP7 team`),
    }),
  }),

  pre_trip_excitement: (v, opts) => ({
    subject: `Almost time 🌊 ${v.experienceTitle ?? "your NP7 trip"} is around the corner`,
    html: emailLayout({
      ...opts,
      preheader: "The countdown is on — here's what to look forward to.",
      bodyHtml:
        greet(v) +
        p(`The countdown is on — <strong>${esc(v.experienceTitle || "your trip")}</strong>${v.dates ? " (" + esc(v.dates) + ")" : ""} is almost here. 🤩`) +
        p(`Picture it: warm water, steady wind, good people, and a coach right there with you all week. Get the boards waxed in your mind — this is going to be a good one.`) +
        p(`Your crew, your coaches and all the details are waiting in your trip account:`) +
        (v.bookingLink ? emailButton("Open my trip", v.bookingLink) : "") +
        p(`See you on the water soon.<br>— Nico & the NP7 team`),
    }),
  }),

  balance_paid_confirmation: (v, opts) => ({
    subject: `All paid up — you're set for ${v.experienceTitle ?? "your NP7 trip"} 🎉`,
    html: emailLayout({
      ...opts,
      preheader: "Your balance is settled — everything's ready for your trip.",
      bodyHtml:
        greet(v) +
        p(`Your balance is paid in full — everything's sorted for <strong>${esc(v.experienceTitle || "")}${v.dates ? " (" + esc(v.dates) + ")" : ""}</strong>. Nothing left to do but count down the days. 🌊`) +
        p(`Closer to departure we'll send your final pre-trip details — packing list, arrival info and your group chat. It's all in your trip account too:`) +
        (v.bookingLink ? emailButton("Open my trip", v.bookingLink) : "") +
        p(`See you on the water.<br>— Nico & the NP7 team`),
    }),
  }),

  voucher_purchased: (v, opts) => ({
    subject: `Your NP7 gift voucher is ready 🎁`,
    html: emailLayout({
      ...opts,
      preheader: "Your printable gift voucher is attached.",
      bodyHtml:
        greet(v) +
        p(`Thank you — your <strong>${esc(v.amount || "")}</strong> gift voucher towards <strong>${esc(v.experienceTitle || "an NP7 trip")}</strong> is confirmed and ready. 🎁`) +
        p(`We've attached it as a <strong>printable PDF</strong>${v.recipientName ? ` — hand or send it to <strong>${esc(v.recipientName)}</strong>` : ""}. The code is <strong>${esc(v.voucherCode || "")}</strong>; it can be redeemed any time in the account at np-seven.com.`) +
        p(`Thanks for giving the gift of riding.<br>— Nico & the NP7 team`),
    }),
  }),

  // § 356a Abs. 4 BGB acknowledgment: neutral receipt wording (the substantive
  // validity is examined afterwards — never say "accepted"), echoing the content
  // of the declaration plus the date and time of receipt. German first — the
  // statutory context is German consumer law.
  withdrawal_received: (v, opts) => ({
    subject: `Eingangsbestätigung — Ihr Widerruf ist eingegangen`,
    html: emailLayout({
      ...opts,
      preheader: "Bestätigung des Eingangs Ihrer Widerrufserklärung.",
      bodyHtml:
        p(`Guten Tag ${esc(v.name || "")},`) +
        p(`hiermit bestätigen wir den <strong>Eingang</strong> Ihrer Widerrufserklärung über unsere Online-Widerrufsfunktion auf np-seven.com.`) +
        p(`<strong>Inhalt Ihrer Erklärung:</strong><br>Name: ${esc(v.name || "")}<br>Vertrag / Bestell- bzw. Gutscheinnummer: ${esc(v.contractRef || "")}${v.note ? `<br>Ihre Anmerkung: ${esc(v.note)}` : ""}`) +
        p(`<strong>Eingegangen am:</strong> ${esc(v.receivedDate || "")} um ${esc(v.receivedTime || "")} Uhr (deutsche Zeit).`) +
        p(`Wir prüfen Ihre Erklärung und melden uns zeitnah mit den nächsten Schritten (z.&nbsp;B. zur Rückabwicklung). Diese Bestätigung dokumentiert nur den Eingang.`) +
        p(`<em>English: this confirms RECEIPT of your withdrawal declaration submitted via our online withdrawal function, including its content and the date and time of receipt. We'll follow up shortly.</em>`) +
        p(`— NP7 GmbH`),
    }),
  }),

  voucher_gift: (v, opts) => ({
    subject: `🎁 You've been gifted an NP7 windsurf trip${v.fromName ? ` by ${v.fromName}` : ""}`,
    html: emailLayout({
      ...opts,
      preheader: "A gift voucher towards an NP7 Experience — open to redeem.",
      bodyHtml:
        p(`Hey ${esc(v.firstName || "there")} 🤙`) +
        p(`${v.fromName ? `<strong>${esc(v.fromName)}</strong> has` : "You've"} gifted you a <strong>${esc(v.amount || "")}</strong> voucher towards <strong>${esc(v.experienceTitle || "an NP7 trip")}</strong> — a coached windsurf, wing &amp; foil adventure. 🌊`) +
        p(`Your voucher (code <strong>${esc(v.voucherCode || "")}</strong>) is attached as a printable PDF. To use it, explore the trips and we'll apply it to your booking:`) +
        (v.joinLink ? emailButton("Explore the trips", v.joinLink) : "") +
        p(`See you on the water.<br>— Nico & the NP7 team`),
    }),
  }),

  cancellation_confirmed: (v, opts) => ({
    subject: `Your cancellation — ${v.experienceTitle ?? "NP7 trip"}`,
    html: emailLayout({
      ...opts,
      preheader: "Your booking has been cancelled.",
      bodyHtml:
        greet(v) +
        p(`This confirms we've cancelled your booking for <strong>${esc(v.experienceTitle || "your NP7 trip")}</strong>${v.dates ? " (" + esc(v.dates) + ")" : ""}, as requested.`) +
        p(`Anything owed back to you — a refund or a goodwill credit toward a future trip — we'll sort personally and be in touch shortly. If anything's unclear, just reply to this email.`) +
        p(`We hope to ride with you another time. 🌊<br>— Nico & the NP7 team`),
    }),
  }),

  waiver_reminder: (v, opts) => ({
    subject: `Quick one before ${v.experienceTitle ?? "your NP7 trip"} — sign your waiver`,
    html: emailLayout({
      ...opts,
      preheader: "A 1-minute waiver everyone signs before the trip.",
      bodyHtml:
        greet(v) +
        p(`Quick bit of admin before <strong>${esc(v.experienceTitle || "your trip")}</strong>${v.dates ? " (" + esc(v.dates) + ")" : ""}: every participant signs a short waiver &amp; health declaration. It takes about a minute, right in your account.`) +
        (v.waiverLink ? emailButton("Sign my waiver", v.waiverLink) : "") +
        p(`Already done it? You're all set — ignore this. 🤙`),
    }),
  }),

  photos_ready: (v, opts) => ({
    subject: `📸 Your photos from ${v.experienceTitle ?? "your NP7 trip"} are here`,
    html: emailLayout({
      ...opts,
      preheader: "Relive the week — your gallery is live.",
      bodyHtml:
        greet(v) +
        p(`Good news — the photos from <strong>${esc(v.experienceTitle || "your trip")}</strong> are in your gallery. Relive the week, and download your favourites.`) +
        (v.tripLink ? emailButton("See my photos", v.tripLink) : "") +
        p(`Hope the stoke lasts.<br>— Nico & the NP7 team`),
    }),
  }),

  pre_trip_final: (v, opts) => ({
    subject: `Almost time — final details for ${v.experienceTitle ?? "your NP7 trip"} 🌊`,
    html: emailLayout({
      ...opts,
      preheader: "Arrival info and your group chat — see you very soon.",
      bodyHtml:
        greet(v) +
        p(`Just a few days to go until <strong>${esc(v.experienceTitle || "")}${v.dates ? " (" + esc(v.dates) + ")" : ""}</strong>! Here are your final details.`) +
        note(v.finalDetailsNote) +
        p(`<strong>Before you fly:</strong> give your packing list one last check, and have your arrival & airport transfer info handy — it's all in your trip account.`) +
        (v.whatsappLink
          ? p(`<strong>Join your group chat</strong> so you're in the loop with the crew and our team on the ground:`) + emailButton("Join the group chat", v.whatsappLink)
          : (v.bookingLink ? emailButton("Open my trip details", v.bookingLink) : "")) +
        p(`Safe travels — we can't wait to ride with you.<br>— Nico & the NP7 team`),
    }),
  }),

  post_trip_thank_you: (v, opts) => ({
    subject: `What a week 🤙 thank you — ${v.experienceTitle ?? "your NP7 trip"}`,
    html: emailLayout({
      ...opts,
      preheader: "Thank you for riding with us — your photos and a small ask.",
      bodyHtml:
        greet(v) +
        p(`Thank you for joining <strong>${esc(v.experienceTitle || "")}</strong> — it was epic having you on the water. We hope you went home a better windsurfer with a few new friends. 🤙`) +
        p(`<strong>Your photos</strong> are being sorted and will appear in your trip account soon — we'll let you know the moment they're up.`) +
        (v.reviewLink
          ? p(`If you had a great time, a short review means the world to us and helps other riders find their next trip:`) + emailButton("Leave a review", v.reviewLink)
          : p(`If you had a great time, we'd love to hear from you — just reply to this email, it makes our day.`)) +
        p(`Until the next session.<br>— Nico & the NP7 team`),
    }),
  }),

  addon_confirmed: (v, opts) => ({
    subject: `Confirmed: ${v.addonLabel ?? "your add-on"} — ${v.experienceTitle ?? "your NP7 trip"}`,
    html: emailLayout({
      ...opts,
      preheader: "Your requested add-on is confirmed.",
      bodyHtml:
        greet(v) +
        p(`Good news — we've confirmed <strong>${esc(v.addonLabel || "your add-on")}</strong> for your trip${v.experienceTitle ? " to <strong>" + esc(v.experienceTitle) + "</strong>" : ""}.`) +
        (v.addonPrice ? p(`It adds <strong>${esc(v.addonPrice)}</strong> to your balance${v.balance ? `, bringing your remaining balance to <strong>${esc(v.balance)}</strong>` : ""} — payable by bank transfer with the rest.`) : "") +
        (v.bookingLink ? emailButton("View it in your trip", v.bookingLink) : "") +
        p(`Any questions, just reply.<br>— Nico & the NP7 team`),
    }),
  }),
};

const FALLBACK_KEYS = Object.keys(TEMPLATES);

/** Replace {{var}} tokens in a DB-stored override body/subject. */
function interpolate(s: string, v: EmailVars): string {
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => esc(v[k] ?? ""));
}

/**
 * Build a {subject, html}. A DB template (email_templates row with matching
 * template_key + body) overrides the code default; otherwise the code default
 * is used. Unknown keys throw.
 */
export function renderTemplate(
  key: string,
  rawVars: EmailVars,
  dbOverride?: { subject_line?: string | null; body?: string | null } | null,
  division: Division = "experience",
  headerImage?: string | null,
  headerPosition?: number | null
): Built {
  /**
   * We often don't have a name.
   *
   * A magic link goes to whoever typed the address; a newsletter contact may be
   * an address and nothing else. The code templates all handle that — every
   * greeting reads `v.firstName || "there"`. But an edited template body from
   * the admin editor goes through interpolate(), which fills a missing token
   * with an empty string, so `Hey {{firstName}} 🤙` would have gone out as
   * "Hey  🤙" the first time anyone edited a template and the recipient had no
   * name on file.
   *
   * Nothing has an edited body today, so nothing has shipped wrong — but the
   * landmine is armed and it is one click away. Normalising here means the
   * fallback is defined once and both paths get it.
   */
  const vars: EmailVars = {
    ...rawVars,
    firstName: String(rawVars.firstName ?? "").trim() || "there",
  };

  // survey_invite ignores a global BODY override: its text is edited per survey
  // (exp_surveys.email_body) and its one-tap date buttons are built in code — a
  // body saved in the template editor would silently strip them. Subject and
  // header image overrides still apply.
  if (dbOverride?.body && key !== "survey_invite") {
    const subject = dbOverride.subject_line ? interpolate(dbOverride.subject_line, vars) : (TEMPLATES[key]?.(vars).subject ?? "NP7 Experience");
    return { subject, html: emailLayout({ division, headerImage, headerPosition, bodyHtml: interpolate(dbOverride.body, vars) }) };
  }
  if (dbOverride?.subject_line && key === "survey_invite") {
    const built = TEMPLATES[key](vars, { division, headerImage, headerPosition });
    return { subject: interpolate(dbOverride.subject_line, vars), html: built.html };
  }
  const fn = TEMPLATES[key];
  if (!fn) throw new Error(`Unknown email template: ${key}. Known: ${FALLBACK_KEYS.join(", ")}`);
  return fn(vars, { division, headerImage, headerPosition });
}
