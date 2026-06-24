import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/auth";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { GiftBuyForm } from "@/components/experience/gift-buy-form";
import { loadGiftData } from "@/lib/gift-data";

export const metadata: Metadata = { title: "Gift a trip — NP7" };
export const dynamic = "force-dynamic";

// In-portal mirror of /experience/gift so members can buy a voucher without
// leaving the member area (the public Experience site isn't revealed yet).
export default async function PortalGiftPage() {
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const { experiences, packages } = await loadGiftData();

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <Link href="/account/vouchers" className="text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a]">← Gift vouchers</Link>
          <div className="mt-2 mb-8">
            <p className="text-[11px] font-bold tracking-[0.26em] text-[#f47b20] mb-2">GIVE THE BEST WEEK OF THEIR YEAR</p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">Gift an NP7 trip</h1>
            <p className="text-[15px] text-[#6a7a80] mt-1.5 max-w-[560px]">A windsurf, wing &amp; foil adventure wrapped up as a voucher. Pay by bank transfer — once it lands we email a printable voucher, and call the recipient if you like.</p>
          </div>

          <GiftBuyForm experiences={experiences} packages={packages} />

          <div className="mt-12">
            <p className="text-[11px] font-bold tracking-[0.22em] text-[#f47b20] mb-5 text-center">HOW GIFTING WORKS</p>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { n: "1", t: "Pick your gift", d: "A whole experience, or a value toward any trip. Pay by bank transfer." },
                { n: "2", t: "We wrap it up", d: "Once your transfer lands we email a printable PDF voucher — and call the recipient if you asked us to." },
                { n: "3", t: "They make it real", d: "They register for a trip and enter the code on their payment plan — it covers what they've been invoiced." },
              ].map((s) => (
                <div key={s.n} className="bg-white rounded-2xl border border-[#f0e6d6] p-5">
                  <span className="inline-grid place-items-center w-8 h-8 rounded-full text-[14px] font-black text-white mb-3" style={{ background: "linear-gradient(135deg,#ffc42e,#f47b20)" }}>{s.n}</span>
                  <h3 className="text-[15px] font-extrabold text-[#00374a] mb-1">{s.t}</h3>
                  <p className="text-[13px] text-[#6a7a80] leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
