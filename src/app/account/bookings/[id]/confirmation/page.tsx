import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberBooking } from "@/lib/portal-data";
import { fmtDates, money, bookingStatus } from "@/lib/portal-status";
import { PrintButton } from "@/components/portal/print-button";

export const metadata: Metadata = { title: "Trip confirmation — NP7" };
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
  const deposit = b.edition?.deposit ?? 300;
  const balance = b.agreed_price != null ? b.agreed_price - deposit : null;
  const ref = `NP7-${b.id.slice(0, 8).toUpperCase()}`;
  const cur = b.experience?.currency;

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
              <h1 className="text-2xl font-black tracking-[-0.02em] text-[#00374a]">Trip confirmation</h1>
              <p className="text-[13px] text-[#6a7a80] mt-1">Booking reference <strong>{ref}</strong></p>
            </div>
            <div className="text-right text-[12px] text-[#6a7a80] leading-relaxed">
              <strong className="text-[#00374a]">NP7 GmbH</strong><br />Germany<br />experience@np-seven.com
            </div>
          </div>

          {/* status */}
          <p className="mt-5 text-[13px]"><span className="font-semibold text-[#00374a]">Status:</span> {chip.label}</p>

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
                <tr className="border-b border-[#eef2f3]"><td className="py-2.5 text-[#6a7a80]">Deposit{b.downpayment_received ? " (paid)" : ""}</td><td className="py-2.5 text-right font-bold text-[#00374a]">{money(deposit, cur)}</td></tr>
                {balance != null && balance > 0 && (
                  <tr><td className="py-2.5 text-[#6a7a80]">Remaining balance — by bank transfer</td><td className="py-2.5 text-right font-bold text-[#00374a]">{money(balance, cur)}</td></tr>
                )}
              </tbody>
            </table>
            <p className="text-[12px] text-[#9aa6ac] mt-2">The remaining balance is invoiced and paid by bank transfer ahead of the trip.</p>
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
            <p className="italic">Document generated {new Date().toLocaleDateString("en-GB")}. This is your booking summary; binding terms are those agreed at booking.</p>
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
