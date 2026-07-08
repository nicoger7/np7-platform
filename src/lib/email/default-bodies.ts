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
  voucher_purchased: "Your NP7 gift voucher is ready 🎁",
  voucher_gift: "🎁 You've been gifted an NP7 windsurf trip",
  cancellation_confirmed: "Your cancellation — {{experienceTitle}}",
  payment_pending_nudge: "Your spot is waiting — {{experienceTitle}}",
  invoice_after_payment: "Payment received 🤙 your invoice for {{experienceTitle}}",
  downpayment_last_chance: "Last chance to hold your spot — {{experienceTitle}}",
  spot_released: "Your spot on {{experienceTitle}} is no longer held",
  balance_invoice_reminder: "Balance for {{experienceTitle}} — invoice",
  pre_trip_info: "Getting ready for {{experienceTitle}} 🌊",
  pre_trip_excitement: "Almost time 🌊 {{experienceTitle}} is around the corner",
  balance_paid_confirmation: "All paid up — you're set for {{experienceTitle}} 🎉",
  pre_trip_final: "Almost time — final details for {{experienceTitle}} 🌊",
  waiver_reminder: "Quick one before {{experienceTitle}} — sign your waiver",
  post_trip_thank_you: "What a week 🤙 thank you — {{experienceTitle}}",
  photos_ready: "📸 Your photos from {{experienceTitle}} are here",
  addon_confirmed: "Confirmed: {{addonLabel}} — {{experienceTitle}}",
};

export const DEFAULT_BODIES: Record<string, string> = {
  reservation_received:
    P("Hey {{firstName}} 🤙") +
    P("You're registered for <strong>{{experienceTitle}}</strong> — awesome to have you. Here's how it works from here:") +
    P("<strong>1. Secure your spot.</strong> Attached are your payment details (pro-forma invoice) — pay the downpayment by bank transfer within the window shown and your place is locked in. Fully refundable for 14 days after you pay.") +
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
    P("Your place on <strong>{{experienceTitle}}</strong> is still open — but it isn't secured yet. Spots are limited, so lock yours in with the down-payment whenever you're ready. You'll find the amount and how to pay in your account:") +
    BTN("Secure my spot", "bookingLink") +
    P("It stays fully refundable for 14 days. Questions? Just reply — we're happy to help."),

  invoice_after_payment:
    P("Hey {{firstName}} 🤙") +
    P("Great news — your payment of <strong>{{amount}}</strong> for <strong>{{experienceTitle}}</strong> has arrived. Your spot is secured! 🎉") +
    P("Attached is your official invoice (<strong>{{reference}}</strong>) for your records — it replaces the pro-forma payment request.") +
    BTN("View my booking", "bookingLink") +
    P("Next up: plan your trip in your account — flights, extra nights, your crew. See you on the water!" + SIGN),

  downpayment_last_chance:
    P("Hey {{firstName}} 🤙") +
    P("Quick heads-up: your window to secure <strong>{{experienceTitle}}</strong> closes on <strong>{{dueDate}}</strong>. After that we can't hold your place, and the spot opens up to other riders.") +
    P("Locking it in takes a minute — pay the downpayment of <strong>{{downpayment}}</strong> by bank transfer. Everything you need is in your account:") +
    BTN("Secure my spot now", "bookingLink") +
    P("Already paid in the last day or two? Then you're set — bank transfers can take a moment to reach us. Questions? Just reply."),

  spot_released:
    P("Hey {{firstName}} 🤙") +
    P("Your payment window for <strong>{{experienceTitle}}</strong> has passed, so we can no longer hold your place — the spot is open to other riders again.") +
    P("Still want to come? If there's room left, it's yours the moment your downpayment lands:") +
    BTN("Check my trip & pay", "bookingLink") +
    P("And if the timing didn't work out this round — no hard feelings. Reply and we'll find you a week that fits. 🤙"),

  balance_invoice_reminder:
    P("Hey {{firstName}} 🤙") +
    P("Your trip is getting close! The remaining balance of <strong>{{balance}}</strong> for <strong>{{experienceTitle}}</strong> is now due by <strong>bank transfer</strong>.") +
    P("You'll find your invoice and bank details in your trip account:") +
    BTN("View my booking & invoice", "bookingLink") +
    P("Thanks — almost time to ride!" + SIGN),

  pre_trip_info:
    P("Hey {{firstName}} 🤙") +
    P("Not long now until <strong>{{experienceTitle}}</strong> ({{dates}})! Time to start getting ready — your packing list, the note from Nico, arrival info and group chat are all set in your trip account:") +
    BTN("Open my trip details", "bookingLink") +
    P("Can't wait to ride with you." + SIGN),

  pre_trip_excitement:
    P("Hey {{firstName}} 🤙") +
    P("The countdown is on — <strong>{{experienceTitle}}</strong> ({{dates}}) is almost here. 🤩") +
    P("Picture it: warm water, steady wind, good people, and a coach right there with you all week. This is going to be a good one.") +
    BTN("Open my trip", "bookingLink") +
    P("See you on the water soon." + SIGN),

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

  waiver_reminder:
    P("Hey {{firstName}} 🤙") +
    P("Quick bit of admin before <strong>{{experienceTitle}}</strong> ({{dates}}): every participant signs a short waiver &amp; health declaration. It takes about a minute, right in your account.") +
    BTN("Sign my waiver", "waiverLink") +
    P("Already done it? You're all set — ignore this. 🤙"),

  photos_ready:
    P("Hey {{firstName}} 🤙") +
    P("Good news — the photos from <strong>{{experienceTitle}}</strong> are in your gallery. Relive the week, and download your favourites.") +
    BTN("See my photos", "tripLink") +
    P("Hope the stoke lasts." + SIGN),

  cancellation_confirmed:
    P("Hey {{firstName}} 🤙") +
    P("This confirms we've cancelled your booking for <strong>{{experienceTitle}}</strong> ({{dates}}), as requested.") +
    P("Anything owed back to you — a refund or a goodwill credit toward a future trip — we'll sort personally and be in touch shortly. If anything's unclear, just reply to this email.") +
    P("We hope to ride with you another time. 🌊" + SIGN),

  addon_confirmed:
    P("Hey {{firstName}} 🤙") +
    P("Good news — we've confirmed <strong>{{addonLabel}}</strong> for your trip to <strong>{{experienceTitle}}</strong>.") +
    P("It adds <strong>{{addonPrice}}</strong> to your balance, bringing your remaining balance to <strong>{{balance}}</strong> — payable by bank transfer with the rest.") +
    BTN("View it in your trip", "bookingLink") +
    P("Any questions, just reply." + SIGN),
};
