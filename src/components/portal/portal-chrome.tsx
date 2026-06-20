import { cookies } from "next/headers";
import Link from "next/link";
import { NP7_LOGO } from "@/components/shared/brand";
import { flags } from "@/lib/flags";
import { PortalSubnav } from "./portal-subnav";

/**
 * Portal chrome: a MINIMAL member header (just the NP7 logo — no marketing nav,
 * no Experience⇄Hardware switch, no "Book a trip") plus the portal submenu.
 * During the quiet launch the public sites are hidden, so the member area must
 * not expose links that reveal what's coming. Tone follows the section the
 * member arrived from (np7_section cookie); defaults to Experience.
 */
export async function PortalChrome() {
  const store = await cookies();
  const section = store.get("np7_section")?.value === "hardware" ? "hardware" : "experience";
  const bg = section === "hardware" ? "bg-black" : "bg-[#00374a]";

  return (
    <>
      <header className={`sticky top-0 z-50 ${bg} border-b border-white/10`}>
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 h-16 flex items-center">
          <Link href="/account" aria-label="NP7 home" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={NP7_LOGO} alt="NP7" className="h-6 w-auto invert" />
          </Link>
        </div>
      </header>
      <PortalSubnav tone={section === "hardware" ? "hardware" : "ocean"} showGear={flags.showGear} showCart={flags.showCart} />
    </>
  );
}
