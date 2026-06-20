import { cookies } from "next/headers";
import Link from "next/link";
import { OceanHeader } from "@/components/experience/ocean-header";
import { HardwareHeader } from "@/components/hardware/hardware-header";
import { NP7_LOGO } from "@/components/shared/brand";
import { flags } from "@/lib/flags";
import { PortalSubnav } from "./portal-subnav";

/**
 * Portal chrome — adapts to whether the public site is live yet:
 *
 * - **Public site live** (dev/preview always; prod once a SHOW_* flag is set):
 *   the member area wears the FULL section header — docked OceanHeader (teal,
 *   Experience) or HardwareHeader (black, Hardware) with the brand switch — so
 *   it matches the rest of the site.
 * - **Public site still hidden** (current production quiet launch): falls back
 *   to a MINIMAL logo-only header, so the member area stays "membership only"
 *   and never exposes the unreleased marketing menu.
 *
 * This means dev and main can share the exact same code: production stays
 * membership-only by flag, dev shows the finished product. Section + tone
 * follow the `np7_section` cookie; Gear/Cart subnav stays flag-gated.
 */
export async function PortalChrome() {
  const store = await cookies();
  const section = store.get("np7_section")?.value === "hardware" ? "hardware" : "experience";
  const siteLive = flags.showExperience || flags.showHardware;

  return (
    <>
      {siteLive ? (
        section === "hardware" ? <HardwareHeader variant="docked" /> : <OceanHeader variant="docked" />
      ) : (
        <header className={`sticky top-0 z-50 ${section === "hardware" ? "bg-black" : "bg-[#00374a]"} border-b border-white/10`}>
          <div className="max-w-[1000px] mx-auto px-5 sm:px-8 h-16 flex items-center">
            <Link href="/account" aria-label="NP7 home" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={NP7_LOGO} alt="NP7" className="h-6 w-auto invert" />
            </Link>
          </div>
        </header>
      )}
      <PortalSubnav tone={section === "hardware" ? "hardware" : "ocean"} showGear={flags.showGear} showCart={flags.showCart} />
    </>
  );
}
