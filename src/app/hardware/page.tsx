import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NP7 Hardware — Custom Windsurf & Foil Boards",
  description: "Custom windsurf and foil boards designed by Nico Prien (GER-7). Engineered for performance, shaped for feel.",
};

const products = [
  { name: "NP7 Foil 145", year: "2026", price: "2,890" },
  { name: "NP7 Foil 125", year: "2026", price: "2,690" },
  { name: "NP7 Freeride 135", year: "2026", price: "2,490" },
  { name: "Front Wing 980", year: "2026", price: "890" },
];

const categories = [
  { name: "Boards", image: "https://surfcenter-experience.com/wp-content/uploads/2025/04/4-5-may-768x576.jpg" },
  { name: "Foils", image: "https://surfcenter-experience.com/wp-content/uploads/2025/11/Rossmeier-2.jpg" },
  { name: "Accessories", image: "https://surfcenter-experience.com/wp-content/uploads/2025/03/21-e1741705621400.jpg" },
];

export default function HardwarePage() {
  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/96 backdrop-blur-lg border-b border-[#ebebeb]">
        <div className="max-w-[1200px] mx-auto px-8 h-[68px] flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="bg-[#111] text-white w-9 h-9 rounded-[9px] flex items-center justify-center text-[13px] font-black">NP7</div>
          </Link>
          <div className="flex bg-[#f7f7f7] rounded-lg p-[3px] gap-0.5">
            <Link href="/experience" className="px-3.5 py-1.5 rounded-md text-[11px] font-semibold text-[#777] hover:text-[#111] transition-colors">Experience</Link>
            <span className="px-3.5 py-1.5 rounded-md text-[11px] font-semibold bg-[#111] text-white">Hardware</span>
          </div>
          <nav className="hidden md:flex gap-7 ml-auto">
            <Link href="#" className="text-[12.5px] font-medium text-[#777] hover:text-[#111] transition-colors">Boards</Link>
            <Link href="#" className="text-[12.5px] font-medium text-[#777] hover:text-[#111] transition-colors">Foils</Link>
            <Link href="#" className="text-[12.5px] font-medium text-[#777] hover:text-[#111] transition-colors">Accessories</Link>
            <Link href="#" className="text-[12.5px] font-medium text-[#777] hover:text-[#111] transition-colors">About</Link>
            <Link href="#" className="text-[12.5px] font-medium text-[#777] hover:text-[#111] transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-36 pb-24 bg-[#f7f7f7] text-center">
        <div className="max-w-[1200px] mx-auto px-8">
          <p className="text-[11px] font-bold tracking-[0.25em] text-[#999] mb-4">NP7 HARDWARE</p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-[-0.04em] leading-[1.05] mb-4">Built to ride.</h1>
          <p className="text-[17px] text-[#777] max-w-[440px] mx-auto mb-10">
            Custom windsurf and foil boards, designed by Nico Prien. Engineered for performance, shaped for feel.
          </p>
          <Link href="#products" className="inline-block px-7 py-3.5 rounded-full text-[13px] font-bold bg-[#111] text-white hover:bg-[#333] hover:-translate-y-0.5 transition-all">
            View all products
          </Link>
        </div>
      </section>

      {/* Categories */}
      <section className="py-24">
        <div className="max-w-[1200px] mx-auto px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {categories.map((cat) => (
              <Link key={cat.name} href="#" className="group relative aspect-[3/2] rounded-[14px] overflow-hidden block">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.06]"
                  style={{ backgroundImage: `url('${cat.image}')` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-6 left-6 z-10 text-lg font-extrabold text-white tracking-[-0.01em]">
                  {cat.name}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="pb-24" id="products">
        <div className="max-w-[1200px] mx-auto px-8">
          <div className="flex justify-between items-end mb-12">
            <h2 className="text-4xl font-black tracking-[-0.03em]">Latest products</h2>
            <Link href="#" className="text-xs font-semibold text-[#777] tracking-[0.06em] uppercase hover:text-[#111] transition-colors">
              View all &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {products.map((product) => (
              <Link key={product.name} href="#" className="group bg-[#f7f7f7] rounded-[14px] overflow-hidden p-8 pb-6 text-center hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] hover:bg-white transition-all duration-300 block">
                <div className="w-full aspect-square bg-[#f0f0f0] rounded-lg mb-5 flex items-center justify-center text-[#ccc] text-5xl font-extralight">
                  &#9651;
                </div>
                <h3 className="text-[15px] font-bold mb-1 tracking-[-0.01em]">{product.name}</h3>
                <div className="text-[11px] text-[#999] font-medium mb-2">{product.year}</div>
                <div className="text-sm font-bold">&euro;{product.price}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* About Hardware */}
      <section className="py-24 bg-[#111] text-white">
        <div className="max-w-[640px] mx-auto text-center px-8">
          <p className="text-[11px] font-bold tracking-[0.25em] text-white/30 mb-4">THE STORY</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] mb-6 leading-[1.1]">
            Designed on the water,<br />not in an office
          </h2>
          <p className="text-base text-white/45 mb-4 leading-relaxed">
            Every NP7 board starts with a session. Nico rides, tests, refines — then works with shapers to build something that feels right. No committees, no compromises.
          </p>
          <p className="text-base text-white/45 mb-8 leading-relaxed">
            Performance for real-world conditions. Boards that make you want to stay out longer.
          </p>
          <Link href="#" className="inline-block px-7 py-3.5 rounded-full text-[13px] font-bold bg-[#0aa3c7] text-white shadow-[0_4px_16px_rgba(10,163,199,0.25)] hover:bg-[#087a95] transition-colors">
            Learn more
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#111] text-white/50 pt-16 pb-6 border-t border-white/[0.06]">
        <div className="max-w-[1200px] mx-auto px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="bg-white/10 text-white w-8 h-8 rounded-[9px] flex items-center justify-center text-[11px] font-black">NP7</div>
                <span className="text-[11px] font-bold tracking-[0.25em] text-white/70">HARDWARE</span>
              </div>
              <p className="text-[13px] max-w-[240px] text-white/30 leading-relaxed">Custom windsurf and foil boards by Nico Prien (GER-7).</p>
            </div>
            <div>
              <h4 className="text-white/70 text-[11px] font-bold tracking-[0.15em] uppercase mb-4">Contact</h4>
              <p className="text-[13px] mb-1.5">hardware@np-seven.com</p>
              <p className="text-[13px]">NP7 GmbH<br />Germany</p>
            </div>
            <div>
              <h4 className="text-white/70 text-[11px] font-bold tracking-[0.15em] uppercase mb-4">Links</h4>
              <ul className="space-y-2.5">
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">Boards</Link></li>
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">Foils</Link></li>
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">Accessories</Link></li>
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">About</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white/70 text-[11px] font-bold tracking-[0.15em] uppercase mb-4">Follow</h4>
              <ul className="space-y-2.5">
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">Instagram</Link></li>
                <li><Link href="#" className="text-[13px] hover:text-white transition-colors">YouTube</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/[0.06] pt-5 text-[11px] text-white/25">
            &copy; 2026 NP7 Hardware. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}
