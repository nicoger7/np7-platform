import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { STATUS_LABEL, STATUS_TONE, fmtVoucherMoney, type Voucher } from "@/lib/vouchers";

export const metadata: Metadata = { title: "Gift vouchers — NP7" };
export const dynamic = "force-dynamic";

type Row = Voucher & { exp_experiences: { title: string | null } | null };

const TONE: Record<string, string> = {
  amber: "bg-amber-100 text-amber-700",
  green: "bg-green-100 text-green-700",
  slate: "bg-slate-100 text-slate-600",
};

const fmtD = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

export default async function VouchersPage() {
  const user = await getPortalUser();
  if (!user) redirect("/account/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let rows: Row[] = [];
  let bank: { legal_name?: string; iban?: string; bic?: string; bank_name?: string } | null = null;
  try {
    const [{ data }, { data: cs }] = await Promise.all([
      db.from("gift_vouchers")
        .select("*, exp_experiences(title)")
        .or(`buyer_contact_id.eq.${user.contactId},recipient_contact_id.eq.${user.contactId}`)
        .order("created_at", { ascending: false }),
      db.from("company_settings").select("legal_name, iban, bic, bank_name").eq("division", "experience").maybeSingle(),
    ]);
    rows = (data ?? []) as Row[];
    bank = cs ?? null;
  } catch { /* table not migrated yet → empty state */ }

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <Link href="/account" className="text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a]">← Home</Link>
          <div className="flex flex-wrap items-end justify-between gap-3 mt-2 mb-8">
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">Gift vouchers</h1>
              <p className="text-[15px] text-[#6a7a80] mt-1.5">Vouchers you&apos;ve bought or been given. Print one, gift it, or use it on a booking.</p>
            </div>
            <Link href="/experience/gift" className="px-5 py-2.5 rounded-full text-[13px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] transition-colors">Gift a trip →</Link>
          </div>

          {rows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#f0e6d6] p-10 text-center">
              <p className="text-[15px] text-[#6a7a80] mb-5">No gift vouchers yet.</p>
              <Link href="/experience/gift" className="inline-block px-7 py-3.5 rounded-full text-[13.5px] font-bold text-white bg-[#00afdb]">Gift an NP7 trip</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {rows.map((v) => {
                const mine = v.buyer_contact_id === user.contactId;
                return (
                  <div key={v.id} className="bg-white rounded-2xl border border-[#f0e6d6] p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-[17px] font-extrabold text-[#00374a]">{v.exp_experiences?.title ?? "NP7 trip"}</h2>
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${TONE[STATUS_TONE[v.status]]}`}>{STATUS_LABEL[v.status]}</span>
                        </div>
                        <p className="text-[13px] text-[#8a9aa0] mt-1">
                          {mine ? "Bought by you" : "Gifted to you"}
                          {v.recipient_name ? ` · for ${v.recipient_name}` : ""}
                          {v.redeem_by && v.status === "active" ? ` · use by ${fmtD(v.redeem_by)}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        {v.amount != null && <p className="text-[20px] font-black text-[#00374a]">{fmtVoucherMoney(v.amount, v.currency ?? "EUR")}</p>}
                        <p className="text-[12px] font-mono text-[#8a9aa0] tracking-wide">{v.code}</p>
                      </div>
                    </div>

                    {v.message && <p className="text-[13.5px] text-[#5a6b72] italic mt-3 pt-3 border-t border-[#f3ede2]">“{v.message}”</p>}

                    {v.status === "pending" && mine && (
                      <div className="mt-4 rounded-xl bg-[#fff7ec] border border-[#f0e6d6] p-4 text-[13px] text-[#6a7a80] leading-relaxed">
                        <p className="font-bold text-[#00374a] mb-1">Pay by bank transfer to activate</p>
                        <p>Send {v.amount != null ? <strong>{fmtVoucherMoney(v.amount, v.currency ?? "EUR")}</strong> : "the amount"} with reference <strong>{v.code}</strong>{bank?.iban ? <> to IBAN <strong>{bank.iban}</strong>{bank.bic ? ` (BIC ${bank.bic})` : ""}{bank.bank_name ? `, ${bank.bank_name}` : ""}</> : ""}. We&apos;ll activate it as soon as it lands and email you — then you can print &amp; gift it.</p>
                      </div>
                    )}

                    {v.status === "active" && (
                      <div className="mt-4">
                        <div className="flex flex-wrap gap-2.5">
                          <Link href={`/account/vouchers/${v.id}/print`} className="px-4 py-2 rounded-full text-[12.5px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] transition-colors">Print voucher</Link>
                          {v.exp_experiences && (
                            <Link href={`/experience`} className="px-4 py-2 rounded-full text-[12.5px] font-bold text-[#00374a] bg-[#f1f5f6] hover:bg-[#e7eef0] transition-colors">Book this trip</Link>
                          )}
                        </div>
                        <p className="text-[12.5px] text-[#8a9aa0] mt-2.5 leading-relaxed">
                          To use it: register for the trip (it&apos;s free), then open your trip&apos;s <strong>payment plan</strong> and enter code <strong className="font-mono text-[#00374a]">{v.code}</strong> — the voucher covers what you&apos;ve been invoiced.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
