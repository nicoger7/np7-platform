import Link from "next/link";
import { NP7_LOGO } from "./ocean-header";

/**
 * Deep-ocean newsletter + footer band, shared by the blog pages.
 * Mirrors the footer section of the experience overview page.
 */
export function OceanFooter() {
  return (
    <section className="bg-[#00374a] text-white pt-20 pb-10 border-t border-white/[0.06]">
      <div className="max-w-[480px] mx-auto text-center px-6 mb-16">
        <h2 className="text-3xl font-black tracking-[-0.03em] mb-3">Catch the next wave</h2>
        <p className="text-white/45 mb-7 text-[15px]">New experiences and early-bird dates, straight to your inbox.</p>
        <form className="flex gap-2">
          <input type="email" placeholder="your@email.com" className="flex-1 px-5 py-3.5 rounded-full border border-white/15 bg-white/[0.06] text-white text-sm outline-none focus:border-[#00afdb] placeholder:text-white/30" />
          <button type="submit" className="px-6 py-3.5 rounded-full text-[13px] font-bold bg-[#00afdb] text-white shadow-[0_4px_16px_rgba(0,175,219,0.3)] hover:bg-[#15c0ec] transition-colors">Subscribe</button>
        </form>
      </div>
      <div className="max-w-[1200px] mx-auto px-6 sm:px-8 border-t border-white/[0.07] pt-7 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-white/40">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="NP7 home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={NP7_LOGO} alt="NP7" className="h-5 w-auto invert opacity-70 hover:opacity-100 transition-opacity" />
          </Link>
          <span>© 2026 NP7 Experience · Nico Prien (GER-7)</span>
        </div>
        <div className="flex gap-5">
          <Link href="/hardware" className="hover:text-white transition-colors">Hardware</Link>
          <Link href="#" className="hover:text-white transition-colors">Instagram</Link>
          <Link href="#" className="hover:text-white transition-colors">YouTube</Link>
        </div>
      </div>
    </section>
  );
}
