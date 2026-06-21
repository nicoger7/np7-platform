import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { VoucherPrint } from "@/components/portal/voucher-print";

export const metadata: Metadata = { title: "Your gift voucher — NP7" };
export const dynamic = "force-dynamic";

export default async function VoucherPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser();
  if (!user) redirect("/account/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: v } = await db
    .from("gift_vouchers")
    .select("id, code, amount, currency, recipient_name, message, redeem_by, buyer_contact_id, recipient_contact_id, exp_experiences(title)")
    .eq("id", id)
    .maybeSingle();

  if (!v || (v.buyer_contact_id !== user.contactId && v.recipient_contact_id !== user.contactId)) redirect("/account/vouchers");

  return (
    <VoucherPrint
      code={v.code}
      experienceTitle={v.exp_experiences?.title ?? "NP7 trip"}
      amount={v.amount}
      currency={v.currency ?? "EUR"}
      recipientName={v.recipient_name}
      message={v.message}
      redeemBy={v.redeem_by}
    />
  );
}
