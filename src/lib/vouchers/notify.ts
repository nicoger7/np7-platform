import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { fmtVoucherMoney } from "@/lib/vouchers";
import { renderVoucherPdf } from "./voucher-pdf";

/**
 * After a gift voucher's payment is confirmed (admin "activate"), email the
 * printable PDF voucher to the buyer, and — if a recipient email was given — to
 * the recipient as a gift. Idempotent (dedupe per voucher) and best-effort: a
 * mail/PDF hiccup never fails the activation.
 */
export async function sendVoucherIssued(voucherId: string, origin: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: v } = await db
    .from("gift_vouchers")
    .select("*, buyer:contacts!buyer_contact_id(name,email)")
    .eq("id", voucherId)
    .maybeSingle();
  if (!v) return;

  let heroImage: string | null = null;
  let experienceTitle = "your NP7 trip";
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

  const amountLabel = fmtVoucherMoney(v.amount, currency);
  const validUntil = v.redeem_by ? new Date(v.redeem_by).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
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

  // Buyer confirmation (with the printable PDF).
  if (v.buyer?.email) {
    await sendEmail({
      to: v.buyer.email,
      templateKey: "voucher_purchased",
      vars: { firstName: buyerFirst, amount: amountLabel, experienceTitle, recipientName: v.recipient_name ?? undefined, voucherCode: v.code },
      contactId: v.buyer_contact_id,
      dedupeKey: `voucher_purchased:${v.id}`,
      ...(attachments ? { attachments } : {}),
    }).catch(() => {});
  }

  // Deliver to the recipient directly, if an email was provided.
  if (v.recipient_email) {
    await sendEmail({
      to: v.recipient_email,
      templateKey: "voucher_gift",
      vars: { firstName: v.recipient_name ? String(v.recipient_name).split(" ")[0] : "there", amount: amountLabel, experienceTitle, fromName: buyerName ?? undefined, voucherCode: v.code, joinLink: `${origin}/experience` },
      dedupeKey: `voucher_gift:${v.id}`,
      ...(attachments ? { attachments } : {}),
    }).catch(() => {});
  }
}
