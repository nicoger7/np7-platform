import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { getPortalUser } from "@/lib/auth";
import { OceanHeader } from "@/components/experience/ocean-header";
import { GiftBuyForm } from "@/components/experience/gift-buy-form";

export const metadata: Metadata = { title: "Gift a trip — NP7 Experience" };
export const dynamic = "force-dynamic";

export default async function GiftPage() {
  const user = await getPortalUser().catch(() => null);

  return (
    <>
      <OceanHeader variant="docked" />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <section className="relative bg-[#00374a] text-white overflow-hidden">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-25 blur-[120px]" style={{ background: "radial-gradient(circle,#f47b20,transparent 70%)" }} aria-hidden />
          <div className="relative max-w-[760px] mx-auto px-6 sm:px-8 py-14 sm:py-16">
            <p className="text-[11px] font-bold tracking-[0.28em] text-[#ffc42e] mb-3">GIVE THE BEST WEEK OF THEIR YEAR</p>
            <h1 className="text-4xl sm:text-5xl font-black tracking-[-0.035em] leading-[1.02]">Gift an NP7 trip</h1>
            <p className="mt-4 text-[16px] sm:text-[17px] text-white/80 max-w-[560px]">A windsurf, wing &amp; foil adventure with coaching, a crew and everything arranged — wrapped up as a voucher for someone you love.</p>
            <div className="h-[3px] w-14 rounded-full mt-6" style={{ background: "linear-gradient(90deg,#ffc42e,#f47b20,#00afdb)" }} />
          </div>
        </section>

        <div className="max-w-[760px] mx-auto px-6 sm:px-8 py-10 sm:py-14">
          {user ? (
            <GiftFormLoader />
          ) : (
            <div className="bg-white rounded-2xl border border-[#f0e6d6] p-8 text-center">
              <h2 className="text-2xl font-black text-[#00374a] mb-2">Sign in to gift a trip</h2>
              <p className="text-[14.5px] text-[#5a6b72] leading-relaxed mb-6 max-w-[440px] mx-auto">Your voucher lives in your NP7 account — so you can print it, gift it, or use it yourself. Sign in or create a free account to continue.</p>
              <Link href="/account/login?next=/experience/gift" className="inline-block px-7 py-3.5 rounded-full text-[13.5px] font-bold text-white bg-[#00afdb]">Sign in / sign up →</Link>
            </div>
          )}

          {/* How gifting works */}
          <div className="mt-12">
            <p className="text-[11px] font-bold tracking-[0.22em] text-[#f47b20] mb-5 text-center">HOW GIFTING WORKS</p>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { n: "1", t: "Choose their trip", d: "Pick the experience and package. Pay by bank transfer — the price is locked in the moment you buy." },
                { n: "2", t: "We wrap it up", d: "Once your transfer lands we activate the voucher in your account. Print the PDF or hand over the code." },
                { n: "3", t: "They make it real", d: "They register for the trip and enter the code on their payment plan — it covers what they've been invoiced." },
              ].map((s) => (
                <div key={s.n} className="bg-white rounded-2xl border border-[#f0e6d6] p-5">
                  <span className="inline-grid place-items-center w-8 h-8 rounded-full text-[14px] font-black text-white mb-3" style={{ background: "linear-gradient(135deg,#ffc42e,#f47b20)" }}>{s.n}</span>
                  <h3 className="text-[15px] font-extrabold text-[#00374a] mb-1">{s.t}</h3>
                  <p className="text-[13px] text-[#6a7a80] leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              {["Valid a full year", "Printable PDF voucher", "For any NP7 trip", "50% back if unused"].map((c) => (
                <span key={c} className="px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold text-[#00374a] bg-white border border-[#f0e6d6]">{c}</span>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

async function GiftFormLoader() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [{ data: exps }, { data: pkgs }] = await Promise.all([
    sb.from("exp_experiences").select("id, title, currency").eq("status", "published").order("title"),
    sb.from("exp_packages").select("id, name, price, experience_id").eq("status", "active").order("price"),
  ]);
  const experiences = (exps ?? []) as { id: string; title: string; currency: string | null }[];
  const packages = (pkgs ?? []) as { id: string; name: string; price: number | null; experience_id: string }[];

  if (experiences.length === 0) {
    return <div className="bg-white rounded-2xl border border-[#f0e6d6] p-8 text-center text-[#6a7a80]">No experiences available to gift right now — check back soon.</div>;
  }
  return <GiftBuyForm experiences={experiences} packages={packages} />;
}
