import Link from "next/link";
import { NP7_LOGO } from "@/components/shared/brand";

const LEGAL_LINKS = [
  { href: "/impressum", label: "Impressum" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/widerrufsbelehrung", label: "Withdrawal policy" },
];

/**
 * Minimal, readable chrome for the legal pages (Impressum / privacy / terms).
 * Deliberately plain — no marketing nav — so it works during the quiet launch
 * and after. Pulls nothing world-specific.
 */
export function LegalShell({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[100svh] flex flex-col bg-white text-[#1d2b30]">
      <header className="border-b border-[#ececec]">
        <div className="max-w-[820px] mx-auto px-6 sm:px-8 h-16 flex items-center">
          <Link href="/" aria-label="NP7 home">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={NP7_LOGO} alt="NP7" className="h-6 w-auto" /></Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-[820px] mx-auto px-6 sm:px-8 py-12 sm:py-16">
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">{title}</h1>
          {updated && <p className="text-[13px] text-[#8a9aa0] mt-2">Last updated: {updated}</p>}
          <div className="legal-body mt-8">{children}</div>
        </div>
      </main>

      <footer className="border-t border-[#ececec] py-8">
        <div className="max-w-[820px] mx-auto px-6 sm:px-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[#8a9aa0]">
          <span>© {new Date().getFullYear()} NP7 GmbH</span>
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-[#00374a] transition-colors">{l.label}</Link>
          ))}
          {/* § 356a BGB: the withdrawal function must be highlighted, not buried
              among the other legal links — hence the accented pill. */}
          <Link href="/widerruf" className="px-2.5 py-1 rounded-full font-semibold text-[#00afdb] border border-[#00afdb]/40 hover:bg-[#00afdb]/10 transition-colors">Withdraw from contract</Link>
        </div>
      </footer>

      <style>{`
        .legal-body { font-size: 15px; line-height: 1.7; color: #3a4a50; }
        .legal-body h2 { font-size: 19px; font-weight: 800; color: #00374a; margin: 28px 0 10px; letter-spacing: -0.01em; }
        .legal-body h3 { font-size: 15.5px; font-weight: 700; color: #00374a; margin: 20px 0 6px; }
        .legal-body p { margin: 0 0 12px; }
        .legal-body ul { margin: 0 0 12px; padding-left: 20px; list-style: disc; }
        .legal-body li { margin: 0 0 5px; }
        .legal-body a { color: #00afdb; text-decoration: underline; }
        .legal-body strong { color: #00374a; }
        .legal-body .note { background: #fff7ec; border: 1px solid #f0e6d6; border-radius: 12px; padding: 14px 16px; font-size: 13.5px; color: #6a7a80; margin: 0 0 20px; }
      `}</style>
    </div>
  );
}
