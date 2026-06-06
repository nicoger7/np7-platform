import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "NP7 Experience — Premium Watersports Travel",
  description: "Guided trips, coaching camps, and private sailing with Nico Prien (GER-7).",
};

// Revalidate every 60 seconds (so new experiences show up quickly)
export const revalidate = 60;

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default async function ExperiencePage() {
  // Fetch published experiences from Supabase, sorted by start date
  const { data: experiences } = await supabase
    .from("exp_experiences")
    .select("*")
    .eq("status", "published")
    .order("date_start", { ascending: true });

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/96 backdrop-blur-lg border-b border-[#ebebeb]">
        <div className="max-w-[1200px] mx-auto px-8 h-[68px] flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="bg-[#111] text-white w-9 h-9 rounded-[9px] flex items-center justify-center text-[13px] font-black">NP7</div>
          </Link>
          <div className="flex bg-[#f7f7f7] rounded-lg p-[3px] gap-0.5">
            <span className="px-3.5 py-1.5 rounded-md text-[11px] font-semibold bg-[#111] text-white">Experience</span>
            <Link href="/hardware" className="px-3.5 py-1.5 rounded-md text-[11px] font-semibold text-[#777] hover:text-[#111] transition-colors">Hardware</Link>
          </div>
          <nav className="hidden md:flex gap-7 ml-auto">
            <Link href="#experiences" className="text-[12.5px] font-medium text-[#777] hover:text-[#111] transition-colors">Experiences</Link>
            <Link href="#about" className="text-[12.5px] font-medium text-[#777] hover:text-[#111] transition-colors">About</Link>
            <Link href="#" className="text-[12.5px] font-medium text-[#777] hover:text-[#111] transition-colors">FAQ</Link>
            <Link href="#" className="text-[12.5px] font-medium text-[#777] hover:text-[#111] transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-[85vh] flex items-center bg-[#111]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://surfcenter-experience.com/wp-content/uploads/2025/01/53724070151_54cd73586b_k-1536x1024.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/35 to-black/65" />
        <div className="relative max-w-[1200px] mx-auto px-8 py-24 w-full">
          <p className="text-[11px] font-bold tracking-[0.25em] text-white/60 mb-4">NP7 EXPERIENCE</p>
          <h1 className="text-4xl sm:text-5xl lg:text-[68px] font-black text-white leading-[1.05] tracking-[-0.035em] mb-5 max-w-[680px]">
            Premium watersports travel around the world
          </h1>
          <p className="text-[17px] text-white/60 max-w-[460px] mb-9 font-normal">
            Small groups, world-class spots, and the pure feeling of freedom you came for.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Link href="#experiences" className="inline-block px-7 py-3.5 rounded-full text-[13px] font-bold bg-[#0aa3c7] text-white shadow-[0_4px_16px_rgba(10,163,199,0.25)] hover:bg-[#087a95] hover:-translate-y-0.5 transition-all">
              Explore Experiences
            </Link>
            <Link href="#about" className="inline-block px-7 py-3.5 rounded-full text-[13px] font-bold text-white border-[1.5px] border-white/50 hover:bg-white/[0.08] transition-all">
              About NP7
            </Link>
          </div>
        </div>
      </section>

      {/* Upcoming Experiences — from database */}
      <section className="py-24" id="experiences">
        <div className="max-w-[1200px] mx-auto px-8">
          <div className="text-center mb-16">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#999] mb-3">UPCOMING</p>
            <h2 className="text-4xl sm:text-5xl font-black tracking-[-0.03em] mb-3.5">Next on the water</h2>
            <p className="text-base text-[#777] max-w-[440px] mx-auto">Pick a date and join Nico.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {experiences?.map((exp) => {
              const spotsLeft = exp.max_spots - exp.spots_taken;
              return (
                <article key={exp.id} className="bg-white rounded-[14px] overflow-hidden border border-[#ebebeb] hover:-translate-y-1.5 hover:shadow-[0_20px_48px_rgba(0,0,0,0.08)] transition-all duration-300">
                  <div className="h-[220px] bg-cover bg-center bg-[#f7f7f7]" style={{ backgroundImage: `url('${exp.hero_image}')` }} />
                  <div className="p-7">
                    <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#777] mb-2.5">
                      {exp.location} &middot; {formatDate(exp.date_start)}
                    </p>
                    {spotsLeft > 0 && (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-green-600 mb-3">
                        <span className="w-1.5 h-1.5 bg-green-600 rounded-full" />
                        {spotsLeft} spots left
                      </div>
                    )}
                    {spotsLeft <= 0 && (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-500 mb-3">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                        Fully booked
                      </div>
                    )}
                    <h3 className="text-xl font-extrabold mb-2.5 tracking-[-0.02em]">{exp.title}</h3>
                    <p className="text-sm text-[#777] mb-5 leading-relaxed">{exp.description}</p>
                    <div className="flex items-center justify-between">
                      <Link href={`/experience/${exp.slug}`} className="inline-block px-5 py-2.5 rounded-full text-xs font-bold bg-[#111] text-white hover:bg-[#333] transition-colors">
                        Learn more
                      </Link>
                      {exp.price && (
                        <span className="text-sm font-bold text-[#111]">from &euro;{Number(exp.price).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* About */}
      <section className="py-24 bg-[#f7f7f7]" id="about">
        <div className="max-w-[1200px] mx-auto px-8">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-16 lg:gap-20 items-center">
            <div
              className="aspect-[4/5] rounded-[14px] bg-cover bg-center bg-[#ebebeb] shadow-[0_12px_32px_rgba(0,0,0,0.1)]"
              style={{ backgroundImage: "url('https://surfcenter-experience.com/wp-content/uploads/2025/01/P1021717-Kopie-scaled-e1736503004873.jpg')" }}
            />
            <div>
              <p className="text-[11px] font-bold tracking-[0.25em] text-[#999] mb-3">ABOUT NP7</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] mb-6 leading-[1.1]">More than a trip</h2>
              <p className="text-base text-[#777] mb-4 leading-relaxed">
                NP7 Experience is built around one simple idea: the best days are the ones you share on the water with good people, at the right spot, with no stress.
              </p>
              <p className="text-base text-[#777] mb-8 leading-relaxed">
                Small groups. World-class locations. Personal coaching. Whether it&apos;s your first foil flight or your hundredth jibe.
              </p>
              <Link href="#" className="inline-block px-7 py-3.5 rounded-full text-[13px] font-bold bg-[#111] text-white hover:bg-[#333] hover:-translate-y-0.5 transition-all">
                Get to know Nico
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="bg-[#111] text-white py-20">
        <div className="max-w-[480px] mx-auto text-center px-8">
          <h2 className="text-3xl font-black mb-3 tracking-[-0.03em]">Stay in the loop</h2>
          <p className="text-white/40 mb-7 text-[15px]">New experiences and early-bird dates.</p>
          <form className="flex gap-2">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 px-5 py-3.5 rounded-full border border-white/12 bg-white/[0.06] text-white text-sm outline-none focus:border-[#0aa3c7] placeholder:text-white/30"
            />
            <button type="submit" className="px-6 py-3.5 rounded-full text-[13px] font-bold bg-[#0aa3c7] text-white shadow-[0_4px_16px_rgba(10,163,199,0.25)] hover:bg-[#087a95] transition-colors">
              Subscribe
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#111] text-white/50 pt-16 pb-6 border-t border-white/[0.06]">
        <div className="max-w-[1200px] mx-auto px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="bg-white/10 text-white w-8 h-8 rounded-[9px] flex items-center justify-center text-[11px] font-black">NP7</div>
                <span className="text-[11px] font-bold tracking-[0.25em] text-white/70">EXPERIENCE</span>
              </div>
              <p className="text-[13px] max-w-[240px] text-white/30 leading-relaxed">Premium watersports travel with Nico Prien (GER-7).</p>
            </div>
            <div>
              <h4 className="text-white/70 text-[11px] font-bold tracking-[0.15em] uppercase mb-4">Contact</h4>
              <p className="text-[13px] mb-1.5">hello@np-seven.com</p>
              <p className="text-[13px]">NP7 GmbH<br />Germany</p>
            </div>
            <div>
              <h4 className="text-white/70 text-[11px] font-bold tracking-[0.15em] uppercase mb-4">Links</h4>
              <ul className="space-y-2.5">
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">Experiences</Link></li>
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">Destinations</Link></li>
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">About</Link></li>
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white/70 text-[11px] font-bold tracking-[0.15em] uppercase mb-4">Follow</h4>
              <ul className="space-y-2.5">
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">Instagram</Link></li>
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">YouTube</Link></li>
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">Facebook</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/[0.06] pt-5 text-[11px] text-white/25">
            &copy; 2026 NP7 Experience. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}
