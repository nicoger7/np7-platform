/**
 * Editable {{variable}} defaults shown in the email editor (pre-filled) and
 * restored by "Back to default". These mirror the built-in wording; saving one
 * just creates an override row. Pure strings — safe to import client-side.
 */
const P = (s: string) => `<p style="margin:0 0 14px;">${s}</p>`;
const BTN = (label: string, linkVar: string) =>
  `<p style="margin:0 0 16px;"><a href="{{${linkVar}}}" style="display:inline-block;background:#00afdb;color:#ffffff;padding:13px 28px;border-radius:999px;text-decoration:none;font-weight:700;">${label}</a></p>`;
const SIGN = "<br>— Nico &amp; the NP7 team";

export const DEFAULT_SUBJECTS: Record<string, string> = {
  reservation_received: "You're registered — {{experienceTitle}} 🤙",
  deposit_confirmation: "You're in! 🤙 {{experienceTitle}} is booked",
  account_magic_link: "Your NP7 login link",
  trip_invite: "{{inviterName}} invited you to {{experienceTitle}} 🌊",
  payment_pending_nudge: "Your spot is waiting — {{experienceTitle}}",
  balance_invoice_reminder: "Balance for {{experienceTitle}} — invoice",
  pre_trip_info: "Getting ready for {{experienceTitle}} 🌊",
  balance_paid_confirmation: "All paid up — you're set for {{experienceTitle}} 🎉",
  pre_trip_final: "Almost time — final details for {{experienceTitle}} 🌊",
  post_trip_thank_you: "What a week 🤙 thank you — {{experienceTitle}}",
  addon_confirmed: "Confirmed: {{addonLabel}} — {{experienceTitle}}",
};

export const DEFAULT_BODIES: Record<string, string> = {
  reservation_received:
    P("Hey {{firstName}} 🤙") +
    P("You're registered for <strong>{{experienceTitle}}</strong> — awesome to have you. Here's how it works from here:") +
    P("<strong>1. Secure your spot.</strong> Your place is held once you pay the refundable downpayment in your account — 14 days to change your mind, plenty of time to sort flights.") +
    P("<strong>2. Plan it with us.</strong> Manage your booking, add extra nights and meet your crew in your trip account.") +
    P("<strong>3. Pay the balance later</strong> by bank transfer, in good time before the trip.") +
    BTN("Secure my spot", "bookingLink") +
    P("Any questions, just reply." + SIGN),

  trip_invite:
    P("Hey {{firstName}} 🤙") +
    P("<strong>{{inviterName}}</strong> wants you along on <strong>{{experienceTitle}}</strong> ({{dates}}) — an NP7 windsurf adventure.") +
    P("<em>“{{personalNote}}”</em>") +
    P("As their guest you get <strong>{{rewardFriend}} off</strong> your spot.") +
    BTN("See the trip & join", "joinLink") +
    P("Signing up is free and holds no payment — your spot is fully refundable for 14 days. Hope to see you on the water!" + SIGN),

  deposit_confirmation:
    P("Hey {{firstName}} 🤙") +
    P("Your deposit is in — you're officially coming to <strong>{{experienceTitle}}</strong> ({{dates}}). Get ready for the week your jibes have been waiting for.") +
    P("We've created your personal <strong>trip account</strong> where you'll manage your booking, see your travel documents and find your memories after the week. Activate it here:") +
    BTN("Activate my trip account", "activationLink") +
    P("<strong>What's next:</strong> we'll contact you personally within a day or two. The remaining balance is paid later by bank transfer — we'll send the invoice in good time.") +
    P("See you on the water." + SIGN),

  account_magic_link:
    P("Hey {{firstName}} 🤙") +
    P("Here's your secure login link for your NP7 account. It expires shortly, so use it soon:") +
    BTN("Log in to my account", "activationLink") +
    P("If you didn't request this, you can safely ignore this email."),

  payment_pending_nudge:
    P("Hey {{firstName}} 🤙") +
    P("Your reservation for <strong>{{experienceTitle}}</strong> is still held, but the deposit hasn't come through yet. Spots are limited — secure yours with the €{{deposit}} deposit:") +
    BTN("Complete my reservation", "bookingLink") +
    P("Questions? Just reply to this email — we're happy to help."),

  balance_invoice_reminder:
    P("Hey {{firstName}} 🤙") +
    P("Your trip is getting close! The remaining balance of <strong>{{balance}}</strong> for <strong>{{experienceTitle}}</strong> is now due by <strong>bank transfer</strong>.") +
    P("You'll find your invoice and bank details in your trip account:") +
    BTN("View my booking & invoice", "bookingLink") +
    P("Thanks — almost time to ride!" + SIGN),

  pre_trip_info:
    P("Hey {{firstName}} 🤙") +
    P("Not long now until <strong>{{experienceTitle}}</strong> ({{dates}})! Here's everything you need to get ready — packing list, arrival info and your group chat are all in your trip account:") +
    BTN("Open my trip details", "bookingLink") +
    P("Can't wait to ride with you." + SIGN),

  balance_paid_confirmation:
    P("Hey {{firstName}} 🤙") +
    P("Your balance is paid in full — everything's sorted for <strong>{{experienceTitle}}</strong> ({{dates}}). Nothing left to do but count down the days. 🌊") +
    P("Closer to departure we'll send your final pre-trip details — packing list, arrival info and your group chat. It's all in your trip account too:") +
    BTN("Open my trip", "bookingLink") +
    P("See you on the water." + SIGN),

  pre_trip_final:
    P("Hey {{firstName}} 🤙") +
    P("Just a few days to go until <strong>{{experienceTitle}}</strong> ({{dates}})! Here are your final details.") +
    P("<strong>Before you fly:</strong> give your packing list one last check, and have your arrival &amp; airport transfer info handy — it's all in your trip account.") +
    P("<strong>Join your group chat</strong> so you're in the loop with the crew and our team on the ground:") +
    BTN("Join the group chat", "whatsappLink") +
    P("Safe travels — we can't wait to ride with you." + SIGN),

  post_trip_thank_you:
    P("Hey {{firstName}} 🤙") +
    P("Thank you for joining <strong>{{experienceTitle}}</strong> — it was epic having you on the water. We hope you went home a better windsurfer with a few new friends. 🤙") +
    P("<strong>Your photos</strong> are being sorted and will appear in your trip account soon — we'll let you know the moment they're up.") +
    P("If you had a great time, a short review means the world to us and helps other riders find their next trip:") +
    BTN("Leave a review", "reviewLink") +
    P("Until the next session." + SIGN),

  addon_confirmed:
    P("Hey {{firstName}} 🤙") +
    P("Good news — we've confirmed <strong>{{addonLabel}}</strong> for your trip to <strong>{{experienceTitle}}</strong>.") +
    P("It adds <strong>{{addonPrice}}</strong> to your balance, bringing your remaining balance to <strong>{{balance}}</strong> — payable by bank transfer with the rest.") +
    BTN("View it in your trip", "bookingLink") +
    P("Any questions, just reply." + SIGN),
};
