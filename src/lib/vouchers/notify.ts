import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { recipientsFor } from "@/lib/email/team-alerts";
import { publicOrigin } from "@/lib/public-origin";
import { fmtVoucherMoney, fmtVoucherValue, voucherValueLeft } from "@/lib/vouchers";
import { renderVoucherPdf } from "./voucher-pdf";

/**
 * After a gift voucher's payment is confirmed (admin "activate"), email the
 * printable PDF voucher to the buyer, and, if a recipient email was given, to
 * the recipient as a gift. Idempotent (dedupe per voucher) and best-effort: a
 * mail/PDF hiccup never fails the activation.
 *
 * Reports who it reached. Activating a voucher writes to up to two people, the
 * buyer and the person the gift is for, and the admin only ever saw "activated"
 * with no hint that a stranger's inbox was involved.
 *
 * NOT TO THE RECIPIENT WHEN NICO CALLS (27 Sep 2026)
 *
 * A buyer who books Nico's call is planning a moment: Nico rings the person
 * and tells them. The recipient mail went out the day the transfer cleared
 * anyway, so they had the PDF in their inbox before the phone ever rang. With
 * nico_call on, the PDF goes to the buyer only and Nico delivers the news.
 */
export type VoucherMailOutcome = { sentTo: string[]; attached: boolean };

/** "27 September 2027", the way every voucher surface writes a use-by date. */
const fmtValidUntil = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;

export async function sendVoucherIssued(voucherId: string, origin: string): Promise<VoucherMailOutcome> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: v } = await db
    .from("gift_vouchers")
    .select("*, buyer:contacts!buyer_contact_id(name,email)")
    .eq("id", voucherId)
    .maybeSingle();
  if (!v) return { sentTo: [], attached: false };

  let heroImage: string | null = null;
  // An any-trip voucher is exactly that. "your NP7 trip" read as if a trip
  // had already been chosen for them.
  let experienceTitle = "any NP7 trip";
  let currency = v.currency || "EUR";
  if (v.experience_id) {
    const [{ data: content }, { data: exp }] = await Promise.all([
      db.from("exp_content").select("hero_image").eq("experience_id", v.experience_id).maybeSingle(),
      db.from("exp_experiences").select("title,currency,hero_image").eq("id", v.experience_id).maybeSingle(),
    ]);
    heroImage = content?.hero_image || exp?.hero_image || null;
    experienceTitle = exp?.title || experienceTitle;
    currency = v.currency || exp?.currency || "EUR";
  }
  const { data: cs } = await db.from("company_settings").select("legal_name").eq("division", "experience").maybeSingle();

  // What it is worth now. At activation that is the full amount, but a
  // re-activation after partial use must not print the original figure.
  const amountLabel = fmtVoucherValue(voucherValueLeft(v), currency);
  const validUntil = fmtValidUntil(v.redeem_by);
  const buyerName: string | null = v.buyer?.name ?? null;
  const buyerFirst = buyerName ? buyerName.split(" ")[0] : "there";

  let pdf: Buffer | null = null;
  try {
    pdf = await renderVoucherPdf({
      code: v.code, amountLabel, experienceTitle,
      recipientName: v.recipient_name ?? null, fromName: buyerName,
      message: v.message ?? null, validUntil, heroImage, legalName: cs?.legal_name ?? null,
    });
  } catch { pdf = null; }
  const attachments = pdf ? [{ filename: `np7-gift-voucher-${v.code}.pdf`, content: pdf }] : undefined;

  const sentTo: string[] = [];

  // Buyer confirmation (with the printable PDF).
  if (v.buyer?.email) {
    const res = await sendEmail({
      to: v.buyer.email,
      templateKey: "voucher_purchased",
      vars: {
        firstName: buyerFirst, amount: amountLabel, experienceTitle, recipientName: v.recipient_name ?? undefined, voucherCode: v.code,
        validUntil: validUntil ?? undefined, nicoCall: v.nico_call ? "yes" : undefined,
      },
      contactId: v.buyer_contact_id,
      dedupeKey: `voucher_purchased:${v.id}`,
      ...(attachments ? { attachments } : {}),
    }).catch(() => null);
    if (res?.status === "sent") sentTo.push(buyerName || v.buyer.email);
  }

  // Deliver to the recipient directly, if an email was provided and Nico is
  // not the one bringing the news.
  if (v.recipient_email && !v.nico_call) {
    const res = await sendEmail({
      to: v.recipient_email,
      templateKey: "voucher_gift",
      vars: {
        firstName: v.recipient_name ? String(v.recipient_name).split(" ")[0] : "there", amount: amountLabel, experienceTitle,
        fromName: buyerName ?? undefined, voucherCode: v.code, validUntil: validUntil ?? undefined, joinLink: `${origin}/experience`,
      },
      contactId: v.recipient_contact_id ?? undefined,
      dedupeKey: `voucher_gift:${v.id}`,
      ...(attachments ? { attachments } : {}),
    }).catch(() => null);
    if (res?.status === "sent") sentTo.push(v.recipient_name || v.recipient_email);
  }

  return { sentTo, attached: !!pdf };
}

/**
 * A voucher was just ordered on the website: tell the buyer how to pay, and
 * tell the team to expect the transfer.
 *
 * Until 27 Sep 2026 neither happened. The order route inserted a pending row
 * and returned; the buyer's only copy of the IBAN was the confirmation screen,
 * which also promised "we'll email you the bank-transfer details" that never
 * came. The team found out a voucher existed when the money landed, or when
 * somebody opened Admin → Vouchers.
 *
 * The buyer mail is transactional (the buyer's own action, carrying their bank
 * details), so like voucher_purchased it is on the soft-launch allow-list in
 * send.ts. The team mail is internal and goes out `manual`, like every other
 * team alert, to whoever is subscribed to voucher_ordered in Admin → Emails →
 * Team. Both carry dedupe keys, so a retried request never mails twice.
 * Best-effort: a mail failure never fails the order.
 */
export type VoucherOrder = {
  voucherId: string;
  code: string;
  amount: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  buyerContactId: string | null;
  recipientName: string | null;
  experienceTitle: string | null;
  packageName?: string | null;
  nicoCall: boolean;
  recipientPhone?: string | null;
  callDate?: string | null;
  bank: { legal_name?: string | null; iban?: string | null; bic?: string | null; bank_name?: string | null } | null;
};

export async function sendVoucherOrdered(o: VoucherOrder): Promise<{ buyer: boolean; team: number }> {
  const amount = fmtVoucherMoney(o.amount, o.currency || "EUR");
  const title = o.experienceTitle || "any NP7 trip";
  let buyer = false;
  let team = 0;

  const res = await sendEmail({
    to: o.buyerEmail,
    templateKey: "voucher_ordered",
    vars: {
      firstName: o.buyerName.split(" ")[0] || undefined,
      amount,
      experienceTitle: title,
      recipientName: o.recipientName ?? undefined,
      voucherCode: o.code,
      reference: o.code,
      accountHolder: o.bank?.legal_name ?? undefined,
      iban: o.bank?.iban ?? undefined,
      bic: o.bank?.bic ?? undefined,
      bankName: o.bank?.bank_name ?? undefined,
      nicoCall: o.nicoCall ? "yes" : undefined,
    },
    contactId: o.buyerContactId ?? undefined,
    dedupeKey: `voucher_ordered:${o.voucherId}`,
  }).catch(() => null);
  buyer = res?.status === "sent";

  const to = await recipientsFor("voucher_ordered").catch(() => []);
  const callLine = o.nicoCall
    ? `Nico is to call ${o.recipientName || "the recipient"}${o.recipientPhone ? ` on ${o.recipientPhone}` : ""}${o.callDate ? `, ideally ${o.callDate}` : ""}.`
    : "";
  const vars = {
    guestName: o.buyerName || o.buyerEmail,
    guestEmail: o.buyerEmail,
    amount,
    voucherCode: o.code,
    experienceTitle: title,
    packageName: o.packageName ?? "",
    recipientName: o.recipientName ?? "",
    callLine,
    adminLink: `${publicOrigin()}/admin/vouchers`,
  };
  for (const r of to) {
    const sent = await sendEmail({
      to: r.email,
      templateKey: "team_voucher_ordered",
      vars,
      // Internal, not guest lifecycle: never held by the soft-launch gate.
      manual: true,
      dedupeKey: `team:voucher_ordered:${o.voucherId}:${r.email.toLowerCase()}`,
    }).catch(() => null);
    if (sent?.status === "sent") team++;
  }
  return { buyer, team };
}
