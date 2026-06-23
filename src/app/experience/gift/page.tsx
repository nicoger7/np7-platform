import type { Metadata } from "next";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { OceanHeader } from "@/components/experience/ocean-header";
import { GiftBuyForm } from "@/components/experience/gift-buy-form";

export const metadata: Metadata = { title: "Gift a trip — NP7 Experience" };
export const dynamic = "force-dynamic";

type Exp = { id: string; title: string; currency: string | null; price: number | null };
type Pkg = { id: string; name: string; price: number | null; experience_id: string };

async function loadGiftData(): Promise<{ experiences: Exp[]; heroes: string[]; packages: Pkg[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: exps } = await sb.from("exp_experiences").select("id, title, currency, price, hero_image").eq("status", "published").order("title");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (exps ?? []) as any[];
  const ids = rows.map((e) => e.id);
  const { data: content } = ids.length ? await sb.from("exp_content").select("experience_id, hero_image").in("experience_id", ids) : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byExp = new Map((content ?? []).map((c: any) => [c.experience_id, c.hero_image]));
  const heroes = [...new Set(rows.map((e) => byExp.get(e.id) || e.hero_image).filter(Boolean))] as string[];
  const experiences = rows.map((e) => ({ id: e.id, title: e.title, currency: e.currency, price: e.price ?? null }));

  // Public packages, so gifting a specific experience can pick a tier.
  let packages: Pkg[] = [];
  if (ids.length) {
    const { data: pkgRows } = await sb.from("exp_packages").select("id, name, price, experience_id, sort_order, status, website_visible").in("experience_id", ids).order("sort_order");
    // Packages are edition-bound and code-prefixed ("BON001 - Beginner – No Hotel").
    // Strip the edition code so the same tier across weeks collapses to ONE pill,
    // keeping the lowest "from" price — a clean tier picker for gifting.
    const tierName = (n: unknown) => String(n || "").replace(/^[A-Za-z]{2,5}\s*\d+\s*[-–—]\s*/, "").trim();
    const byKey = new Map<string, Pkg>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of ((pkgRows ?? []) as any[])) {
      if (p.status === "archived" || p.website_visible === false || p.price == null) continue;
      const name = tierName(p.name) || p.name;
      const key = `${p.experience_id}|${name.toLowerCase()}`;
      const cur = byKey.get(key);
      if (!cur || Number(p.price) < Number(cur.price ?? Infinity)) {
        byKey.set(key, { id: p.id, name, price: p.price, experience_id: p.experience_id });
      }
    }
    packages = [...byKey.values()];
  }
  return { experiences, heroes, packages };
}

export default async function GiftPage() {
  const { experiences, heroes, packages } = await loadGiftData();

  return (
    <>
      <OceanHeader variant="docked" />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <section className="relative bg-[#00374a] text-white overflow-hidden">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-25 blur-[120px]" style={{ background: "radial-gradient(circle,#f47b20,transparent 70%)" }} aria-hidden />
          <div className="relative max-w-[760px] mx-auto px-6 sm:px-8 py-14 sm:py-16">
            <Link href="/experience#experiences" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/70 hover:text-white transition-colors mb-5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
              Back to experiences
            </Link>
            <p className="text-[11px] font-bold tracking-[0.28em] text-[#ffc42e] mb-3">GIVE THE BEST WEEK OF THEIR YEAR</p>
            <h1 className="text-4xl sm:text-5xl font-black tracking-[-0.035em] leading-[1.02]">Gift an NP7 trip</h1>
            <p className="mt-4 text-[16px] sm:text-[17px] text-white/80 max-w-[560px]">A windsurf, wing &amp; foil adventure with coaching, a crew and everything arranged — wrapped up as a voucher for someone you love. Add a personal call from Nico to deliver the news.</p>
            <div className="h-[3px] w-14 rounded-full mt-6" style={{ background: "linear-gradient(90deg,#ffc42e,#f47b20,#00afdb)" }} />
          </div>
        </section>

        {/* Photo band — a taste of the trips on offer (every published experience's hero) */}
        {heroes.length > 0 && (
          <div className="-mt-px bg-[#00374a]">
            <div className="flex gap-2 overflow-x-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {heroes.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="h-40 sm:h-52 w-64 sm:w-80 shrink-0 rounded-xl object-cover" />
              ))}
            </div>
          </div>
        )}

        <div className="max-w-[760px] mx-auto px-6 sm:px-8 py-10 sm:py-14">
          <GiftBuyForm experiences={experiences} packages={packages} />

          {/* How gifting works */}
          <div className="mt-12">
            <p className="text-[11px] font-bold tracking-[0.22em] text-[#f47b20] mb-5 text-center">HOW GIFTING WORKS</p>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { n: "1", t: "Pick your gift", d: "A whole experience, or a value toward any trip. Pay by bank transfer — no account needed." },
                { n: "2", t: "We wrap it up", d: "Once your transfer lands we email a printable PDF voucher — and call the recipient with the news, if you asked us to." },
                { n: "3", t: "They make it real", d: "They register for a trip and enter the code on their payment plan — it covers what they've been invoiced." },
              ].map((s) => (
                <div key={s.n} className="bg-white rounded-2xl border border-[#f0e6d6] p-5">
                  <span className="inline-grid place-items-center w-8 h-8 rounded-full text-[14px] font-black text-white mb-3" style={{ background: "linear-gradient(135deg,#ffc42e,#f47b20)" }}>{s.n}</span>
                  <h3 className="text-[15px] font-extrabold text-[#00374a] mb-1">{s.t}</h3>
                  <p className="text-[13px] text-[#6a7a80] leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              {["Valid 1 year — 2 years for value gifts over €5,000", "Printable PDF voucher", "Any trip or a specific one", "Optional: a call from Nico"].map((c) => (
                <span key={c} className="px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold text-[#00374a] bg-white border border-[#f0e6d6]">{c}</span>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
