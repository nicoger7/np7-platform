import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberBooking, getBookingPaid } from "@/lib/portal-data";
import { fmtDates, money, bookingStatus, isSecured } from "@/lib/portal-status";
import { computePaymentPlan } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase";
import { PrintButton } from "@/components/portal/print-button";

// Deliberately generic: the page is a confirmation only once the spot is held,
// and the tab title must not promise more than the document does.
export const metadata: Metadata = { title: "Your booking — NP7" };
export const dynamic = "force-dynamic";

const STANDARD_INCLUDED = [
  "6 days of pro coaching", "Daily video analysis", "Pro windsurf gear rental",
  "Breakfast every morning", "Healthy lunch on the beach daily", "Event shirt & lycra",
  "Group activities & sunset sessions", "Photos & video of your week",
];

export default async function ConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const b = await getMemberBooking(user.contactId, id);
  if (!b) notFound();

  const chip = bookingStatus(b);
  const ref = `NP7-${b.id.slice(0, 8).toUpperCase()}`;
  const cur = b.experience?.currency;

  /**
   * A confirmation confirms something.
   *
   * This document used to be titled "Trip confirmation" for everyone, including
   * a booking with nothing paid — three lines above "Status: Spot not secured
   * yet". Under §651a BGB / Directive 2015/2302 the Reisebestätigung is what
   * evidences a concluded package-travel contract, so handing one to somebody
   * who has not secured a spot is wrong in both directions: it reads to the
   * guest as "I'm booked", and it muddies what NP7 has actually agreed to.
   *
   * So the document's identity follows the booking. Before the securing payment
   * it is a summary of what was chosen; after it, it is the confirmation.
   */
  const secured = isSecured(b);
  const title = secured ? "Trip confirmation" : "Booking summary";

  // The money comes from the SAME plan as the trip page and the invoices. It
  // used to be computed here on its own — `deposit ?? 300`, balance = total −
  // deposit — so this page said "Deposit €0 · Remaining balance €2,990" while
  // the trip page, five seconds earlier, said "€1,999 due 23 July". Same
  // booking, same screen session, two different answers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [paid, payRow] = await Promise.all([
    getBookingPaid(b.id),
    db.from("exp_bookings")
      .select("created_at, exp_packages(deposit,downpayment_percent,final_days_before,deposit_refund_days)")
      .eq("id", b.id).maybeSingle()
      .then((r: { data: { created_at: string | null; exp_packages: unknown } | null }) => r.data ?? null)
      .catch(() => null),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payCfg: any = payRow?.exp_packages ?? null;
  const plan = computePaymentPlan(
    {
      deposit: b.edition?.deposit ?? payCfg?.deposit ?? null,
      downpayment_percent: payCfg?.downpayment_percent ?? null,
      final_days_before: payCfg?.final_days_before ?? null,
      deposit_refund_days: payCfg?.deposit_refund_days ?? null,
    },
    { total: b.agreed_price ?? 0, paidAmount: paid, editionStart: b.edition?.date_start ?? null, bookedAt: payRow?.created_at ?? null }
  ).filter((m) => m.amount > 0);
  const outstanding = Math.max(0, (b.agreed_price ?? 0) - paid);

  return (
    <main className="min-h-[100svh] bg-[#eef3f4] py-8 print:bg-white print:py-0">
      <div className="max-w-[760px] mx-auto px-5">
        <div className="flex items-center justify-between mb-5 no-print">
          <Link href={`/account/bookings/${b.id}`} className="text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a]">← Back to trip</Link>
          <PrintButton />
        </div>

        <article className="bg-white rounded-2xl print:rounded-none border border-[#e3eaec] print:border-0 p-8 sm:p-12">
          {/* header */}
          <div className="flex items-start justify-between gap-4 pb-6 border-b-2 border-[#00374a]">
            <div>
              <h1 className="text-2xl font-black tracking-[-0.02em] text-[#00374a]">{title}</h1>
              <p className="text-[13px] text-[#6a7a80] mt-1">Booking reference <strong>{ref}</strong></p>
            </div>
            <div className="text-right text-[12px] text-[#6a7a80] leading-relaxed">
              <strong className="text-[#00374a]">NP7 GmbH</strong><br />Germany<br />experience@np-seven.com
            </div>
          </div>

          {/* status */}
          <p className="mt-5 text-[13px]"><span className="font-semibold text-[#00374a]">Status:</span> {chip.label}</p>

          {/* Said once, plainly, at the top — not left for the reader to infer
              from a status line under a word that says the opposite. */}
          {!secured && (
            <div className="mt-4 rounded-xl border border-[#f47b20]/30 bg-[#f47b20]/[0.07] px-4 py-3">
              <p className="text-[13px] font-bold text-[#00374a]">This is not a booking confirmation yet.</p>
              <p className="text-[12.5px] text-[#5a6b72] mt-1 leading-relaxed">
                It&apos;s a summary of what you picked, so you have it in writing. Your spot is held
                once the {plan.find((m) => m.status !== "paid")?.kind === "deposit" ? "deposit" : "down-payment"} reaches us —
                we&apos;ll send the confirmation then, and no place is reserved until we do.
              </p>
            </div>
          )}

          {/* customer + trip */}
          <div className="grid sm:grid-cols-2 gap-6 mt-6">
            <Block label="Traveller">
              <p className="text-[15px] font-bold text-[#00374a]">{user.name}</p>
              <p className="text-[13px] text-[#6a7a80]">{user.email}</p>
            </Block>
            <Block label="Experience">
              <p className="text-[15px] font-bold text-[#00374a]">{b.experience?.title}</p>
              <p className="text-[13px] text-[#6a7a80]">{b.edition?.label ? `${b.edition.label} · ` : ""}{fmtDates(b.edition?.date_start, b.edition?.date_end)}</p>
            </Block>
          </div>

          {/* package + pricing */}
          <div className="mt-8">
            <Block label="Package">
              <p className="text-[15px] font-bold text-[#00374a]">{b.pkg?.name ?? "—"}</p>
            </Block>
            <table className="w-full mt-4 text-[14px]">
              <tbody>
                <tr className="border-b border-[#eef2f3]"><td className="py-2.5 text-[#6a7a80]">Trip total (per person)</td><td className="py-2.5 text-right font-bold text-[#00374a]">{money(b.agreed_price, cur) ?? "—"}</td></tr>
                {plan.map((m) => (
                  <tr key={m.kind} className="border-b border-[#eef2f3]">
                    <td className="py-2.5 text-[#6a7a80]">
                      {m.label}
                      {m.status === "paid"
                        ? <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-green-700">Paid</span>
                        : m.dueLabel && <span className="ml-2 text-[12px] text-[#9aa6ac]">{m.dueLabel}</span>}
                    </td>
                    <td className="py-2.5 text-right font-bold text-[#00374a]">{money(m.amount, cur)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2.5 text-[#6a7a80]">{outstanding > 0 ? "Still to pay" : "Paid in full"}</td>
                  <td className={`py-2.5 text-right font-bold ${outstanding > 0 ? "text-[#00374a]" : "text-green-700"}`}>{money(outstanding, cur)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-[12px] text-[#9aa6ac] mt-2">Each stage is invoiced and paid by bank transfer ahead of the trip.</p>
          </div>

          {/* included */}
          <div className="mt-8">
            <Block label="What's included">
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-1">
                {STANDARD_INCLUDED.map((i) => <li key={i} className="text-[13.5px] text-[#3a4b52]">• {i}</li>)}
              </ul>
              <p className="text-[12.5px] text-[#9aa6ac] mt-3">Not included: flights, airport transfers (we&apos;re happy to arrange), and dinners.</p>
            </Block>
          </div>

          {/* legal */}
          <div className="mt-8 pt-6 border-t border-[#eef2f3] text-[12px] text-[#8a9aa0] leading-relaxed">
            <p className="mb-2"><strong className="text-[#5a6b72]">Package travel:</strong> This trip is a package within the meaning of EU Directive 2015/2302 / §651a BGB. Your statutory pre-contractual information and your rights are set out in the <Link href="/experience/legal/package-travel" className="text-[#00afdb] font-semibold">standard information form</Link>. The insolvency-protection certificate (Sicherungsschein) and full terms accompany your booking.</p>
            <p className="italic">
              Document generated {new Date().toLocaleDateString("en-GB")}.{" "}
              {secured
                ? "This is your booking summary; binding terms are those agreed at booking."
                : "This is a summary of your selection, not a booking confirmation — prices and availability are held only once the securing payment reaches us."}
            </p>
          </div>
        </article>
      </div>
    </main>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#00afdb] mb-1.5">{label}</p>
      {children}
    </div>
  );
}
