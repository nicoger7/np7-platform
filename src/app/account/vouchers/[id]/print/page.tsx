import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { VoucherPrint } from "@/components/portal/voucher-print";
import { voucherValueLeft } from "@/lib/vouchers";

export const metadata: Metadata = { title: "Your gift voucher · NP7" };
export const dynamic = "force-dynamic";

export default async function VoucherPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser();
  if (!user) redirect("/account/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: v } = await db
    .from("gift_vouchers")
    .select("*, exp_experiences(title)")
    .eq("id", id)
    .maybeSingle();

  if (!v || (v.buyer_contact_id !== user.contactId && v.recipient_contact_id !== user.contactId)) redirect("/account/vouchers");

  /*
   * Only a voucher that is paid for prints. The account page only offers the
   * button on active ones, but typing the URL of an unpaid (pending) voucher
   * printed a gift nobody had paid for yet, and a cancelled or expired one
   * printed as if it still worked (27 Sep 2026). A redeemed one still prints,
   * as a keepsake of the gift.
   */
  if (v.status !== "active" && v.status !== "redeemed") redirect("/account/vouchers");

  return (
    <VoucherPrint
      code={v.code}
      experienceTitle={v.exp_experiences?.title ?? "Any NP7 trip"}
      // An active voucher prints what is left on it; a used-up one prints the
      // gift as it was given, since €0 on a keepsake means nothing.
      amount={v.status === "active" ? voucherValueLeft(v) : v.amount}
      currency={v.currency ?? "EUR"}
      recipientName={v.recipient_name}
      message={v.message}
      redeemBy={v.redeem_by}
    />
  );
}
