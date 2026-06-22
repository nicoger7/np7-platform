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
  reviewLink?: string;
  [k: string]: string | undefined;
};

type Built = { subject: string; html: string };
type LayoutOpts = { division?: Division; headerImage?: string | null; headerPosition?: number | null };

const p = (s: string) => `<p style="margin:0 0 14px;">${s}</p>`;
const greet = (v: EmailVars) => p(`Hey ${esc(v.firstName || "there")} 🤙`);

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
        p(`<strong>1. Secure your spot.</strong> Your place is held once you pay the refundable downpayment in your account — you've got 14 days to change your mind and get it back, plenty of time to sort flights.`) +
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
        p(`Your deposit is in — you're officially coming to <strong>${esc(v.experienceTitle || "")}${v.dates ? " (" + esc(v.dates) + ")" : ""}</strong>. Get ready for the week your jibes have been waiting for.`) +
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
      preheader: "Sign in to your NP7 trip account.",
      bodyHtml:
        greet(v) +
        p(`Here's your secure login link for your NP7 trip account. It expires shortly, so use it soon:`) +
        (v.activationLink ? emailButton("Log in to my account", v.activationLink) : "") +
        p(`If you didn't request this, you can safely ignore this email.`),
    }),
  }),

  payment_pending_nudge: (v, opts) => ({
    subject: `Your spot is waiting — ${v.experienceTitle ?? "NP7 Experience"}`,
    html: emailLayout({
      ...opts,
      preheader: "Complete your deposit to lock in your spot.",
      bodyHtml:
        greet(v) +
        p(`Your reservation for <strong>${esc(v.experienceTitle || "")}</strong> is still held, but the deposit hasn't come through yet. Spots are limited — secure yours with the €${esc(v.deposit || "300")} deposit:`) +
        (v.bookingLink ? emailButton("Complete my reservation", v.bookingLink) : "") +
        p(`Questions? Just reply to this email — we're happy to help.`),
    }),
  }),

  balance_invoice_reminder: (v, opts) => ({
    subject: `Balance for ${v.experienceTitle ?? "your NP7 trip"} — invoice`,
    html: emailLayout({
      ...opts,
      preheader: "Your remaining balance is now due by bank transfer.",
      bodyHtml:
        greet(v) +
        p(`Your trip is getting close! The remaining balance${v.balance ? " of <strong>" + esc(v.balance) + "</strong>" : ""} for <strong>${esc(v.experienceTitle || "")}</strong> is now due by <strong>bank transfer</strong>.`) +
        p(`You'll find your invoice and bank details in your trip account:`) +
        (v.bookingLink ? emailButton("View my booking & invoice", v.bookingLink) : "") +
        p(`Thanks — almost time to ride!<br>— Nico & the NP7 team`),
    }),
  }),

  pre_trip_info: (v, opts) => ({
    subject: `Getting ready for ${v.experienceTitle ?? "your NP7 trip"} 🌊`,
    html: emailLayout({
      ...opts,
      preheader: "Everything you need before you fly out.",
      bodyHtml:
        greet(v) +
        p(`Not long now until <strong>${esc(v.experienceTitle || "")}${v.dates ? " (" + esc(v.dates) + ")" : ""}</strong>! Here's everything you need to get ready — packing list, arrival info and your group chat are all in your trip account:`) +
        (v.bookingLink ? emailButton("Open my trip details", v.bookingLink) : "") +
        p(`Can't wait to ride with you.<br>— Nico & the NP7 team`),
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

  pre_trip_final: (v, opts) => ({
    subject: `Almost time — final details for ${v.experienceTitle ?? "your NP7 trip"} 🌊`,
    html: emailLayout({
      ...opts,
      preheader: "Arrival info and your group chat — see you very soon.",
      bodyHtml:
        greet(v) +
        p(`Just a few days to go until <strong>${esc(v.experienceTitle || "")}${v.dates ? " (" + esc(v.dates) + ")" : ""}</strong>! Here are your final details.`) +
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
  vars: EmailVars,
  dbOverride?: { subject_line?: string | null; body?: string | null } | null,
  division: Division = "experience",
  headerImage?: string | null,
  headerPosition?: number | null
): Built {
  if (dbOverride?.body) {
    const subject = dbOverride.subject_line ? interpolate(dbOverride.subject_line, vars) : (TEMPLATES[key]?.(vars).subject ?? "NP7 Experience");
    return { subject, html: emailLayout({ division, headerImage, headerPosition, bodyHtml: interpolate(dbOverride.body, vars) }) };
  }
  const fn = TEMPLATES[key];
  if (!fn) throw new Error(`Unknown email template: ${key}. Known: ${FALLBACK_KEYS.join(", ")}`);
  return fn(vars, { division, headerImage, headerPosition });
}
