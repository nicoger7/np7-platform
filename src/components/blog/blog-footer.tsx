import Link from "next/link";
import { NP7_LOGO } from "@/components/shared/brand";
import { SECTION_CHROME, type Section } from "@/lib/blog-section";

/** Slim footer that closes the magazine pages; background follows the section. */
export function BlogFooter({
  section = "experience",
  showExperience = true,
  showHardware = true,
}: {
  section?: Section;
  showExperience?: boolean;
  showHardware?: boolean;
}) {
  return (
    <footer className="text-white" style={{ backgroundColor: SECTION_CHROME[section].heroBg }}>
      <div className="max-w-[1200px] mx-auto px-6 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-5 text-[12px] text-white/45">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="NP7 home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={NP7_LOGO} alt="NP7" className="h-5 w-auto invert opacity-70 hover:opacity-100 transition-opacity" />
          </Link>
          <span>© 2026 NP7 GmbH · Nico Prien (GER-7)</span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/blog" className="hover:text-white transition-colors">Magazine</Link>
          {showExperience && <Link href="/experience" className="hover:text-white transition-colors">Experience</Link>}
          {showHardware && <Link href="/hardware" className="hover:text-white transition-colors">Hardware</Link>}
          <Link href="/account" className="hover:text-white transition-colors">My NP7</Link>
          <Link href="/widerruf" className="text-white/70 underline underline-offset-2 hover:text-white transition-colors">Vertrag widerrufen</Link>
        </div>
      </div>
    </footer>
  );
}
