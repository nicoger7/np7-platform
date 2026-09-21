/**
 * Editable {{variable}} defaults shown in the email editor (pre-filled) and
 * restored by "Back to default". These mirror the built-in wording; saving one
 * just creates an override row. Pure strings — safe to import client-side.
 */
const P = (s: string) => `<p style="margin:0 0 14px;">${s}</p>`;
const BTN = (label: string, linkVar: string) =>
  `<p style="margin:0 0 16px;"><a href="{{${linkVar}}}" style="display:inline-block;background:#00afdb;color:#ffffff;padding:13px 28px;border-radius:999px;text-decoration:none;font-weight:700;">${label}</a></p>`;
const SIGN = "<br>Nico &amp; the NP7 team";

export const DEFAULT_SUBJECTS: Record<string, string> = {
  reservation_received: "You're registered for {{experienceTitle}} 🤙",
  deposit_confirmation: "You're in! 🤙 {{experienceTitle}} is booked",
  account_magic_link: "Your NP7 login link",
  team_invite: "Your NP7 admin access",
  trip_invite: "{{inviterName}} invited you to {{experienceTitle}} 🌊",
  voucher_purchased: "Your NP7 gift voucher is ready 🎁",
  withdrawal_received: "Eingangsbestätigung: Ihr Widerruf ist eingegangen",
  voucher_gift: "🎁 You've been gifted an NP7 windsurf trip",
  cancellation_confirmed: "Your cancellation · {{experienceTitle}}",
  payment_pending_nudge: "Your spot is waiting · {{experienceTitle}}",
  invoice_after_payment: "Payment received 🤙 your invoice for {{experienceTitle}}",
  downpayment_last_chance: "Last chance to hold your spot · {{experienceTitle}}",
  spot_released: "Your spot on {{experienceTitle}} is no longer held",
  balance_invoice_reminder: "Balance for {{experienceTitle}} · invoice",
  pre_trip_info: "Getting ready for {{experienceTitle}} 🌊",
  pre_trip_excitement: "Almost time 🌊 {{experienceTitle}} is around the corner",
  balance_paid_confirmation: "You're all set for {{experienceTitle}} 🎉",
  pre_trip_final: "Almost time: final details for {{experienceTitle}} 🌊",
  waiver_reminder: "Quick one before {{experienceTitle}}: sign your waiver",
  post_trip_thank_you: "What a week 🤙 thank you · {{experienceTitle}}",
  photos_ready: "📸 Your photos from {{experienceTitle}} are here",
  addon_confirmed: "Confirmed: {{addonLabel}} · {{experienceTitle}}",
  hw_return_received: "We got your return request · order {{orderNumber}}",
  hw_order_confirmation: "Order {{orderNumber}} confirmed · welcome to NP7 Hardware 🤙",
  event_ticket_confirmed: "You're in! 🤙 {{experienceTitle}}",
  event_deposit_received: "Deposit received · {{experienceTitle}}",
  event_part_received: "You're in! 🤙 {{experienceTitle}}",
  waiver_final_call: "One thing left before {{experienceTitle}}: your waiver",
  event_date_confirmed_balance: "It's on! 🤙 {{experienceTitle}} · date confirmed",
  event_date_not_running: "{{experienceTitle}} · your dates didn't make it",
  addon_declined: "About your request · {{addonLabel}}",
  voucher_expiry_reminder: "Your NP7 gift voucher runs out on {{redeemByLabel}}",
  invoice_sent: "Your invoice for {{experienceTitle}}{{?amount}} · {{amount}}{{/amount}}",
  credit_note_sent: "Correction to your invoice {{originalReference}} · {{experienceTitle}}",
  payment_shortfall_reminder: "Almost there: a little left on {{experienceTitle}} 🌊",
  transfer_instructions: "Your bank details for {{experienceTitle}} · {{amount}}",
  transfer_failed: "Your bank transfer for {{experienceTitle}} didn't go through",
  tier_expiry_reminder: "Your {{tierLabel}} status runs out{{?validUntilLabel}} on {{validUntilLabel}}{{/validUntilLabel}}",
  crew_forming: "Your crew for {{experienceTitle}} is coming together 🤙",
  guide_ready: "Your training guide · {{experienceTitle}} 🤙",
  skills_verified: "Your coach signed off new skills 🤙",
  team_booking_created: "New booking · {{guestName}} · {{experienceTitle}}",
  password_reset: "Reset your NP7 password",
};

export const DEFAULT_BODIES: Record<string, string> = {
  reservation_received:
    P("Hey {{firstName}} 🤙") +
    P("You're registered for <strong>{{experienceTitle}}</strong>. Awesome to have you. Here's how it works from here:") +
    /* NOT "fully refundable for 14 days". The down-payment is the cancellation
       fee from the moment it lands; only a deposit has a refund window, and
       hardly any trip charges one (Nico, 21 Sep 2026). What is true, and just
       as reassuring, is that nothing is owed until the deadline. */
    P("<strong>1. Secure your spot.</strong> Pay the down-payment in your trip account, straight from your bank in about a minute, or by transfer using the attached payment details. Either way your place is locked in.") +
    P("<strong>2. Plan it with us.</strong> Manage your booking, add extra nights and meet your crew in your trip account.") +
    P("<strong>3. Pay the balance later</strong>, whenever suits you before the trip. You can pay it early from the same page if you would rather be done with it.") +
    BTN("Secure my spot", "bookingLink") +
    P("Any questions, just reply." + SIGN),

  trip_invite:
    P("Hey {{firstName}} 🤙") +
    P("<strong>{{inviterName}}</strong> wants you along on <strong>{{experienceTitle}}</strong> ({{dates}}), an NP7 windsurf adventure.") +
    P("<em>“{{personalNote}}”</em>") +
    P("As their guest you get <strong>{{rewardFriend}} off</strong> your spot.") +
    BTN("See the trip & join", "joinLink") +
    /* The down-payment is the cancellation fee, not a refund ([[refund rule]],
       21 Sep 2026). Signing up really is free, and that is the true half. */
    P("Signing up is free and holds no payment, and cancelling costs you nothing until you pay. Hope to see you on the water!" + SIGN),

  deposit_confirmation:
    P("Hey {{firstName}} 🤙") +
    P("Your deposit is in. You're officially coming to <strong>{{experienceTitle}}</strong> ({{dates}}). Get ready for the week your jibes have been waiting for.") +
    P("We've created your personal <strong>trip account</strong> where you'll manage your booking, see your travel documents and find your memories after the week. Activate it here:") +
    BTN("Activate my trip account", "activationLink") +
    P("<strong>What's next:</strong> we'll contact you personally within a day or two. The remaining balance is paid later by bank transfer. We'll send the invoice in good time.") +
    P("See you on the water." + SIGN),

  team_invite:
    "You have been given access to the NP7 admin. The link signs you in; afterwards it lives at "
    + "np-seven.com/admin, which is worth bookmarking. To set a password instead, use \"Forgot password?\" there.",
  account_magic_link:
    P("Hey {{firstName}} 🤙") +
    P("Here's your secure login link for your NP7 account. It expires shortly, so use it soon:") +
    BTN("Log in to my account", "activationLink") +
    P("If you didn't request this, you can safely ignore this email."),

  payment_pending_nudge:
    P("Hey {{firstName}} 🤙") +
    P("Your place on <strong>{{experienceTitle}}</strong> is still open, but it isn't secured yet. Spots are limited, so lock yours in with the down-payment whenever you're ready. You'll find the amount and how to pay in your account:") +
    BTN("Secure my spot", "bookingLink") +
    P("It stays fully refundable for 14 days. Questions? Just reply. We're happy to help."),

  invoice_after_payment:
    P("Hey {{firstName}} 🤙") +
    P("Great news: your payment of <strong>{{amount}}</strong> for <strong>{{experienceTitle}}</strong> has arrived. Your spot is secured! 🎉") +
    P("Attached is your official invoice (<strong>{{reference}}</strong>) for your records. It replaces the pro-forma payment request.") +
    BTN("View my booking", "bookingLink") +
    P("Next up, plan your trip in your account: flights, extra nights, your crew. See you on the water!" + SIGN),

  downpayment_last_chance:
    P("Hey {{firstName}} 🤙") +
    P("Quick heads-up: the downpayment for <strong>{{experienceTitle}}</strong> is due on <strong>{{dueDate}}</strong>. Your spot is held, this is just so the date doesn't catch you out.") +
    P("It takes a minute: <strong>{{downpayment}}</strong> by bank transfer, everything you need is in your account.") +
    BTN("Secure my spot now", "bookingLink") +
    P("Already paid in the last day or two? Then you're set. Bank transfers can take a moment to reach us. Questions? Just reply."),

  spot_released:
    P("Hey {{firstName}} 🤙") +
    P("The downpayment for <strong>{{experienceTitle}}</strong> is past its date. Your spot is still yours, we have not given it to anyone.") +
    P("Whenever you can, send it over:") +
    BTN("Check my trip & pay", "bookingLink") +
    P("And if something has changed, or the timing has gone wrong, just reply. We would rather hear it than wonder. 🤙"),

  balance_invoice_reminder:
    P("Hey {{firstName}} 🤙") +
    P("Your trip is getting close! The remaining balance of <strong>{{balance}}</strong> for <strong>{{experienceTitle}}</strong> is now due by <strong>bank transfer</strong>.") +
    P("You'll find your invoice and bank details in your trip account:") +
    BTN("View my booking & invoice", "bookingLink") +
    P("Thanks. Almost time to ride!" + SIGN),

  pre_trip_info:
    P("Hey {{firstName}} 🤙") +
    P("Not long now until <strong>{{experienceTitle}}</strong> ({{dates}})! Time to start getting ready. Your packing list, the note from Nico, arrival info and group chat are all set in your trip account:") +
    BTN("Open my trip details", "bookingLink") +
    P("Can't wait to ride with you." + SIGN),

  pre_trip_excitement:
    P("Hey {{firstName}} 🤙") +
    P("The countdown is on. <strong>{{experienceTitle}}</strong> ({{dates}}) is almost here. 🤩") +
    P("Picture it: warm water, steady wind, good people, and a coach right there with you all week. This is going to be a good one.") +
    BTN("Open my trip", "bookingLink") +
    P("See you on the water soon." + SIGN),

  balance_paid_confirmation:
    P("Hey {{firstName}} 🤙") +
    P("Your balance is paid in full. Everything's sorted for <strong>{{experienceTitle}}</strong> ({{dates}}). Nothing left to do but count down the days. 🌊") +
    P("Closer to departure we'll send your final pre-trip details: packing list, arrival info and your group chat. It's all in your trip account too:") +
    BTN("Open my trip", "bookingLink") +
    P("See you on the water." + SIGN),

  pre_trip_final:
    P("Hey {{firstName}} 🤙") +
    P("Just a few days to go until <strong>{{experienceTitle}}</strong> ({{dates}})! Here are your final details.") +
    P("<strong>Before you fly:</strong> give your packing list one last check, and have your arrival &amp; airport transfer info handy. It's all in your trip account.") +
    P("<strong>Join your group chat</strong> so you're in the loop with the crew and our team on the ground:") +
    BTN("Join the group chat", "whatsappLink") +
    P("Safe travels. We can't wait to ride with you." + SIGN),

  // No wind.coach guide CTA here on purpose: the block is conditional on a
  // stored guide, and a flat body can't branch (same limit as addonPriceLine
  // below). renderTemplate() appends the CTA in code, under an edited body too.
  post_trip_thank_you:
    P("Hey {{firstName}} 🤙") +
    P("Thank you for joining <strong>{{experienceTitle}}</strong>. It was epic having you on the water. We hope you went home a better windsurfer with a few new friends. 🤙") +
    P("<strong>Your photos</strong> are being sorted and will appear in your trip account soon. We'll let you know the moment they're up.") +
    P("If you had a great time, a short review means the world to us and helps other riders find their next trip:") +
    BTN("Leave a review", "reviewLink") +
    P("Until the next session." + SIGN),

  waiver_reminder:
    P("Hey {{firstName}} 🤙") +
    P("Quick bit of admin before <strong>{{experienceTitle}}</strong> ({{dates}}): every participant signs a short waiver &amp; health declaration. It takes about a minute, right in your account.") +
    BTN("Sign my waiver", "waiverLink") +
    P("Already done it? Then you're all set and you can ignore this. 🤙"),

  photos_ready:
    P("Hey {{firstName}} 🤙") +
    P("Good news: the photos from <strong>{{experienceTitle}}</strong> are in your gallery. Relive the week, and download your favourites.") +
    BTN("See my photos", "tripLink") +
    P("Hope the stoke lasts." + SIGN),

  cancellation_confirmed:
    P("Hey {{firstName}} 🤙") +
    P("This confirms we've cancelled your booking for <strong>{{experienceTitle}}</strong> ({{dates}}), as requested.") +
    P("Anything owed back to you, whether a refund or a goodwill credit toward a future trip, we'll sort personally and be in touch shortly. If anything's unclear, just reply to this email.") +
    P("We hope to ride with you another time. 🌊" + SIGN),

  addon_confirmed:
    P("Hey {{firstName}} 🤙") +
    P("Good news: we've confirmed <strong>{{addonLabel}}</strong> for your trip to <strong>{{experienceTitle}}</strong>.") +
    // computed per add-on: pay-direct says "settled with the provider, not your
    // balance"; billed-by-us states the price and the ledger balance. A flat
    // body can't branch, so the sentence arrives pre-built.
    P("{{addonPriceLine}}") +
    BTN("View it in your trip", "bookingLink") +
    P("Any questions, just reply." + SIGN),

  // Hardware: formal acknowledgement of a WITHDRAWAL declaration (Directive
  // 2023/2673 — durable-medium confirmation, German legal wording first).
  // §356a Widerruf acknowledgement — sent by the ONLINE WITHDRAWAL FUNCTION, not
  // by a hardware return. The default used to be the hw_return_received copy
  // ({{orderNumber}}, {{items}}, {{orderLink}} — none of which this mail is ever
  // given), so opening it in the editor showed the wrong email entirely, and
  // saving it would have shipped a legally required acknowledgement with blanks
  // where the declaration's content belongs. It now mirrors the code.
  withdrawal_received:
    P("Guten Tag {{name}},") +
    P("hiermit bestätigen wir den <strong>Eingang</strong> Ihrer Widerrufserklärung über unsere Online-Widerrufsfunktion auf np-seven.com.") +
    P("<strong>Inhalt Ihrer Erklärung:</strong><br>Name: {{name}}<br>Vertrag / Bestell- bzw. Gutscheinnummer: {{contractRef}}{{?note}}<br>Ihre Anmerkung: {{note}}{{/note}}") +
    P("<strong>Eingegangen am:</strong> {{receivedDate}} um {{receivedTime}} Uhr (deutsche Zeit).") +
    P("Wir prüfen Ihre Erklärung und melden uns zeitnah mit den nächsten Schritten (z.&nbsp;B. zur Rückabwicklung). Diese Bestätigung dokumentiert nur den Eingang.") +
    P("<em>English: this confirms RECEIPT of your withdrawal declaration submitted via our online withdrawal function, including its content and the date and time of receipt. We'll follow up shortly.</em>") +
    P("NP7 GmbH"),

  // Hardware: web-shop order confirmation with bank-transfer instructions.
  hw_order_confirmation:
    P("Hey {{firstName}} 🤙") +
    P("Your order <strong>{{orderNumber}}</strong> is in, total <strong>{{total}}</strong> (incl. VAT).") +
    P("<strong>How to pay:</strong> bank transfer with reference <strong>{{paymentReference}}</strong>. Our bank details follow in a separate email. We pack and ship the moment your transfer lands.") +
    P("Track your order, and if needed declare a return, right here:") +
    BTN("View my order", "orderLink") +
    P("14-day withdrawal right from delivery. Any questions, just reply." + SIGN),

  // Hardware: acknowledgement of a WARRANTY claim (defect track).
  hw_return_received:
    P("Hey {{firstName}} 🤙") +
    P("We've received your return request for order <strong>{{orderNumber}}</strong> ({{items}}) on {{declaredDate}}. This email is your confirmation.") +
    P("<strong>What happens next:</strong> we'll review it and send you return instructions. Boards and other bulky gear: don't organize shipping yourself. We'll arrange the pickup.") +
    P("Once the gear is back and checked, your refund goes to the original payment method within 14 days.") +
    BTN("View your order", "orderLink") +
    P("Any questions, just reply." + SIGN),

  // ── Events (fixed clinics + stand-by) ──────────────────────────────────────
  // `location` and `dates` are both nullable — an edition need not carry either,
  // and a clinic FORMAT is deliberately not a place. The code templates hide an
  // empty row automatically (facts() filters them); here that job is done by the
  // {{?var}}…{{/var}} blocks, so a missing value takes its whole clause with it.

  event_ticket_confirmed:
    P("Hey {{firstName}} 🤙") +
    P("Your spot on <strong>{{experienceTitle}}</strong>{{?dates}} ({{dates}}){{/dates}} is booked and paid. See you on the water. 🌊") +
    P("<strong>Paid:</strong> {{amount}}{{?location}}<br><strong>Where:</strong> {{location}}{{/location}}") +
    P("We've set up your <strong>NP7 account</strong>, where you'll find your booking, your documents and (after the event) your photos and video.") +
    BTN("Open my account", "activationLink") +
    P("<strong>One thing before you ride.</strong> Everyone on the water signs a short waiver, and it takes about a minute.{{?waiverLink}} <a href=\"{{waiverLink}}\" style=\"color:#0aa3c7;font-weight:700;\">Sign it here</a>.{{/waiverLink}} If the participant is under 18, a parent or guardian signs it.") +
    P("Any questions, just reply to this email." + SIGN),

  // STAND-BY deposit. The date is NOT confirmed and this mail must not pretend
  // otherwise — so it deliberately carries no date line at all, however tempting.
  event_deposit_received:
    P("Hey {{firstName}} 🤙") +
    P("Your deposit is in and your spot is held. We confirm the date once the forecast lands. You'll hear from us as soon as it does, and the balance is due then.") +
    P("<strong>Event:</strong> {{experienceTitle}}{{?location}}<br><strong>Where:</strong> {{location}}{{/location}}<br><strong>Deposit paid:</strong> {{amount}}") +
    BTN("Open my account", "activationLink") +
    P("Any questions, just reply." + SIGN),

  // The opposite case: a deposit on a FIXED clinic. The date is set and the
  // balance has a real deadline, so this one may and must say so.
  event_part_received:
    P("Hey {{firstName}} 🤙") +
    P("Your deposit of <strong>{{amount}}</strong> is in and your spot is <strong>confirmed</strong>. See you on the water. 🌊") +
    P("You're booked on <strong>{{experienceTitle}}</strong>{{?location}} in {{location}}{{/location}}{{?dates}} ({{dates}}){{/dates}}.") +
    P("Still to pay: <strong>{{balance}}</strong>{{?balanceDue}}, due <strong>{{balanceDue}}</strong>{{/balanceDue}}.") +
    P("We've set up your <strong>NP7 account</strong>, where you'll find your booking, your invoice and (after the clinic) your photos.") +
    BTN("Open my account", "activationLink") +
    P("<strong>One thing before you ride.</strong> Everyone on the water signs a short waiver, and it takes about a minute.{{?waiverLink}} <a href=\"{{waiverLink}}\" style=\"color:#0aa3c7;font-weight:700;\">Sign it here</a>.{{/waiverLink}} If the participant is under 18, a parent or guardian signs it.") +
    P("Any questions, just reply to this email." + SIGN),

  event_date_confirmed_balance:
    P("Hey {{firstName}} 🤙") +
    P("Great news: the forecast landed and <strong>{{experienceTitle}}</strong> is confirmed. Your deposit holds the spot; the balance locks it in.") +
    P("<strong>Balance due:</strong> {{balance}}") +
    BTN("Pay the balance", "balanceLink") +
    P("See you on the water. 🌊" + SIGN),

  event_date_not_running:
    P("Hey {{firstName}} 🤙") +
    P("We've locked in a date for <strong>{{experienceTitle}}</strong>, and unfortunately it isn't one of the dates you could make. Sorry we couldn't line the wind up with your calendar this time.") +
    P("Your refund of <strong>{{refund}}</strong> goes back to your card automatically over the next few days. Nothing to do on your side.") +
    P("Next forecast window, we'd love another shot." + SIGN),

  waiver_final_call:
    P("Hey {{firstName}} 🤙") +
    P("We're nearly there. <strong>{{experienceTitle}}</strong>{{?dates}} ({{dates}}){{/dates}} is coming up fast, and there's one thing still open on your side: your <strong>waiver &amp; health declaration</strong>.") +
    P("Everyone riding with us signs one: a quick health check and the usual insurance bit. It's the last thing we need before we can get you on the water, and it takes about a minute.") +
    BTN("Sign my waiver · 1 minute", "waiverLink") +
    P("The button signs you straight in, so there's no password to remember. If it's expired by the time you click, just reply and we'll send a fresh one.") +
    P("Already signed? Then you're all set and you can ignore this. 🤙"),

  // ── Money ──────────────────────────────────────────────────────────────────

  invoice_sent:
    P("Hey {{firstName}} 🤙") +
    P("Here's your invoice for <strong>{{experienceTitle}}</strong>{{?amount}}, <strong>{{amount}}</strong>{{/amount}}. It's attached as a PDF.") +
    P("Please pay by <strong>bank transfer</strong>{{?reference}} and quote the reference <strong>{{reference}}</strong> so we can match it to your booking straight away{{/reference}}.") +
    BTN("View my booking", "bookingLink") +
    P("Any questions, just reply. Happy to help." + SIGN),

  credit_note_sent:
    P("Hey {{firstName}} 🤙") +
    P("Attached is <strong>{{reference}}</strong>, which corrects invoice <strong>{{originalReference}}</strong> for <strong>{{experienceTitle}}</strong>{{?amount}} by <strong>{{amount}}</strong>{{/amount}}.") +
    "{{?reason}}" + P("Reason: {{reason}}") + "{{/reason}}" +
    "{{?refundAmount}}" + P("The <strong>{{refundAmount}}</strong> you already paid will be refunded to your bank account within a few days. There is nothing you need to do.") + "{{/refundAmount}}" +
    P("Nothing is due on this document.") +
    BTN("View my booking", "bookingLink") +
    P("Any questions, just reply. Happy to help." + SIGN),

  // The guest has JUST been given an IBAN on screen and may close that tab in
  // ten seconds. This mail is their copy of it, so every fact they need to type
  // into their banking app is in it, and nothing in it says "paid" or "now".
  transfer_instructions:
    P("Hey {{firstName}} 🤙") +
    P("Here are the details for your transfer for <strong>{{experienceTitle}}</strong>{{?dates}} ({{dates}}){{/dates}}, so you don't have to keep that page open.") +
    P("<strong>Amount:</strong> {{amount}}{{?accountHolder}}<br><strong>Account holder:</strong> {{accountHolder}}{{/accountHolder}}{{?iban}}<br><strong>IBAN:</strong> {{iban}}{{/iban}}{{?bic}}<br><strong>BIC:</strong> {{bic}}{{/bic}}{{?reference}}<br><strong>Reference:</strong> {{reference}}{{/reference}}") +
    P("Send exactly that amount, quoting the reference, and it finds your booking by itself. Most transfers reach us in <strong>one to three working days</strong>, and your spot is held from the moment you send it. There is nothing else for you to do.") +
    BTN("See my booking", "bookingLink") +
    P("Any questions, just reply to this email." + SIGN),

  // Not a dunning letter. They think they paid, and the spot is not held, so
  // this says what happened plainly and gives them the way back.
  transfer_failed:
    P("Hey {{firstName}} 🤙") +
    P("Your bank transfer for <strong>{{experienceTitle}}</strong> didn't go through. Our payment provider sent it back rather than taking it.") +
    P("No money has left your account for it, and nothing is lost: open your booking and start the payment again, or use the bank details on your invoice, whichever is easier.") +
    BTN("Open my booking", "bookingLink") +
    P("If it keeps happening, just reply here and we'll sort it with you." + SIGN),

  payment_shortfall_reminder:
    P("Hey {{firstName}} 🤙") +
    P("We're getting really excited for <strong>{{experienceTitle}}</strong>{{?dates}} ({{dates}}){{/dates}}. It's going to be a good one. 🤩") +
    P("There's just <strong>{{balance}}</strong> left to settle your balance. A quick bank transfer{{?reference}} quoting <strong>{{reference}}</strong>{{/reference}} and you're all set.") +
    BTN("View my booking & pay", "bookingLink") +
    P("Thanks so much. Can't wait to ride with you." + SIGN),

  addon_declined:
    P("Hey {{firstName}} 🤙") +
    P("You asked us about <strong>{{addonLabel}}</strong> for {{experienceTitle}}, and unfortunately we can't make that one work.") +
    "{{?declineReason}}" + P("{{declineReason}}") + "{{/declineReason}}" +
    P("Nothing has been added to your balance, and the rest of your trip is unaffected.") +
    BTN("Open my trip", "bookingLink") +
    P("If you're flexible, reply to this email and we'll see what else is possible. We'd rather find you something than leave it here." + SIGN),

  // ── Vouchers ───────────────────────────────────────────────────────────────

  voucher_purchased:
    P("Hey {{firstName}} 🤙") +
    P("Thank you! Your <strong>{{amount}}</strong> gift voucher{{?experienceTitle}} towards <strong>{{experienceTitle}}</strong>{{/experienceTitle}} is confirmed and ready. 🎁") +
    P("It's attached as a <strong>printable PDF</strong>: print it, hand it over or send it on. The code is <strong>{{voucherCode}}</strong>, and it can be redeemed any time.") +
    P("Thanks for giving the gift of riding." + SIGN),

  voucher_gift:
    P("Hey {{firstName}} 🤙") +
    P("<strong>{{fromName}}</strong> has gifted you a <strong>{{amount}}</strong> voucher{{?experienceTitle}} towards <strong>{{experienceTitle}}</strong>{{/experienceTitle}}. That's a coached windsurf, wing &amp; foil adventure. 🌊") +
    P("Your voucher (code <strong>{{voucherCode}}</strong>) is attached as a printable PDF. To use it, pick a trip and we'll take it straight off your booking:") +
    BTN("Explore the trips", "joinLink") +
    P("See you on the water." + SIGN),

  voucher_expiry_reminder:
    P("Hey {{firstName}} 🤙") +
    P("A friendly heads-up: your NP7 gift voucher <strong>{{code}}</strong> over <strong>{{amountLabel}}</strong> is valid until <strong>{{redeemByLabel}}</strong>. After that it expires.") +
    P("Redeeming is easy: pick any experience, mention the code when you book, and we take it straight off the invoice.") +
    BTN("Browse the experiences", "browseLink") +
    P("Not sure which week fits? Just reply and we'll help you pick." + SIGN),

  // ── Member area ────────────────────────────────────────────────────────────

  crew_forming:
    P("Hey {{firstName}} 🤙") +
    P("<strong>{{experienceTitle}}</strong>{{?dates}} ({{dates}}){{/dates}} is {{timeAway}}, and the crew is taking shape.") +
    P("This is the good bit: people start comparing flights, sorting shared transfers, and arguing about sail sizes long before anyone lands.") +
    "{{?whatsappLink}}" + P("<strong>Come and say hi:</strong>") + BTN("Join the group chat", "whatsappLink") + "{{/whatsappLink}}" +
    "{{?moreToFollow}}" + P("No rush on anything else. Your packing list and arrival details follow closer to the trip.") + "{{/moreToFollow}}" +
    "{{?event}}" + P("Questions before then? Just reply to this email.") + "{{/event}}" +
    BTN("Open my trip details", "bookingLink") +
    P("See you on the water." + SIGN),

  guide_ready:
    P("Hey {{firstName}} 🤙") +
    P("Your personal training guide from <strong>{{experienceTitle}}</strong> is ready{{?coachName}}. {{coachName}} put it together from what you worked on out on the water{{/coachName}}.") +
    "{{?guidePoints}}" +
      P("<strong>Your focus points from the week:</strong>") +
      '<p style="margin:0 0 14px;white-space:pre-line;">{{guidePoints}}</p>' +
    "{{/guidePoints}}" +
    P("Each one comes with what to do, how it should feel, and the mistakes to watch for, plus the tip your coach gave you in person.") +
    BTN("Open my training guide", "guideUrl") +
    P("It lives in your trip account, so it's there whenever you need it: before the next session, or the next trip." + SIGN),

  team_booking_created:
    P("<strong>{{guestName}}</strong> just booked.") +
    P("Trip: <strong>{{experienceTitle}}</strong>{{?editionLabel}} · {{editionLabel}}{{/editionLabel}}{{?dates}}<br>Dates: {{dates}}{{/dates}}{{?packageName}}<br>Package: {{packageName}}{{/packageName}}{{?total}}<br>Worth: <strong>{{total}}</strong>{{/total}}{{?bookingStatus}}<br>Status: {{bookingStatus}}{{/bookingStatus}}{{?guestEmail}}<br>Email: {{guestEmail}}{{/guestEmail}}") +
    BTN("Open the booking", "adminLink") +
    P("You are getting this because you are on the team list for new bookings. Change who gets it in Admin → Emails → Team."),

  skills_verified:
    P("Hey {{firstName}} 🤙") +
    P("Good news from the water: your coach verified <strong>{{skillCount}}</strong> new skills{{?experienceTitle}} after <strong>{{experienceTitle}}</strong>{{/experienceTitle}} on your NP7 progress ladder.") +
    "{{?skillList}}" + P("{{skillList}}") + "{{/skillList}}" +
    "{{?levelLabel}}" + P("Your verified rank now reads <strong>{{levelLabel}}</strong>.") + "{{/levelLabel}}" +
    BTN("See my progress", "portalLink") +
    P("Keep it rolling. The next trip builds straight on top." + SIGN),

  tier_expiry_reminder:
    P("Hey {{firstName}} 🤙") +
    P("A heads-up from your NP7 ladder: your <strong>{{tierLabel}}</strong> status{{?validUntilLabel}} is valid until <strong>{{validUntilLabel}}</strong>, and after that{{/validUntilLabel}} it steps down, taking the perks with it.") +
    P("Keeping it is simple: ride with us again.{{?keepRule}} {{keepRule}}{{/keepRule}}") +
    BTN("See the upcoming weeks", "tripsLink") +
    P("Your member prices are already on the tiles when you're signed in." + SIGN),

  // No greeting by name and no sign-off: this is the one mail that may reach
  // someone who did not ask for it, so it stays plain and says so.
  password_reset:
    P("Someone asked to reset the password for this NP7 account. Usually that someone is you.") +
    BTN("Set a new password", "resetLink") +
    P("The link works once and expires after an hour. If you didn't request this, you can safely ignore this email. Your password stays as it is."),
};
