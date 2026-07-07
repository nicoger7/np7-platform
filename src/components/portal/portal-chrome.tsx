import { cookies, headers } from "next/headers";
import Link from "next/link";
import { OceanHeader } from "@/components/experience/ocean-header";
import { HardwareHeader } from "@/components/hardware/hardware-header";
import { NP7_LOGO } from "@/components/shared/brand";
import { flags } from "@/lib/flags";
import { PortalSubnav } from "./portal-subnav";
import { MemberInstallPrompt } from "@/components/pwa/member-install-prompt";

/**
 * Portal chrome — adapts to whether the public site is live yet.
 *
 * - **Full section header** (docked OceanHeader / HardwareHeader with the brand
 *   switch + Magazine/About nav): shown everywhere EXCEPT the live quiet-launch
 *   production domain — i.e. on dev, preview deploys and localhost, and on
 *   production once a world is revealed (SHOW_EXPERIENCE / SHOW_HARDWARE).
 * - **Minimal logo-only header**: only on the live `np-seven.com` while the
 *   public worlds are still hidden, so production stays "membership only".
 *
 * Keyed off the request host rather than VERCEL_ENV so it's robust no matter how
 * the dev/preview deploy is configured.
 *
 * Tone defaults to **Experience** — the member portal IS the trip area, so it must
 * not inherit a stale `np7_section=hardware` cookie left over from browsing the
 * shop. The few hardware-member surfaces (My Gear / Cart) pass `section="hardware"`
 * explicitly. Gear/Cart subnav stays flag-gated.
 */
export async function PortalChrome({ section }: { section?: "experience" | "hardware" } = {}) {
  const [head, store] = await Promise.all([headers(), cookies()]);
  // A page can force its theme (trips→experience, gear→hardware); neutral pages
  // pass nothing and follow the current section context.
  const resolved: "experience" | "hardware" = section ?? (store.get("np7_section")?.value === "hardware" ? "hardware" : "experience");
  // Admin "view as member" read-only preview (Member view tab) → a clear banner.
  const isPreview = store.get("np7_preview")?.value === "1";

  const host = (head.get("host") || "").split(":")[0].toLowerCase();
  const onLiveDomain = /(^|\.)np-seven\.com$/.test(host);
  // Full header unless we're on the live domain with every world still hidden.
  const siteLive = !onLiveDomain || flags.showExperience || flags.showHardware;

  return (
    <>
      {isPreview && (
        <div className="sticky top-0 z-[60] bg-[#b97608] text-white text-center text-[12.5px] font-semibold py-1.5 px-4">
          Admin preview · read-only — this is the member’s own view. Actions are disabled.
        </div>
      )}
      {siteLive ? (
        resolved === "hardware" ? <HardwareHeader variant="docked" /> : <OceanHeader variant="docked" showExperience={flags.showExperience} showHardware={flags.showHardware} showBlog={flags.showBlog} />
      ) : (
        <header className={`sticky top-0 z-50 ${resolved === "hardware" ? "bg-black" : "bg-[#00374a]"} border-b border-white/10`}>
          <div className="max-w-[1000px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
            <Link href="/account" aria-label="NP7 home" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={NP7_LOGO} alt="NP7" className="h-6 w-auto invert" />
            </Link>
            {/* Magazine — the one public surface during the quiet launch, so it lives
                in the site header (dark bar), not in the member menu below. */}
            {flags.showBlog && (
              <Link href="/blog" className="text-[12.5px] font-semibold text-white/70 hover:text-white transition-colors tracking-wide">
                Magazine
              </Link>
            )}
          </div>
        </header>
      )}
      <PortalSubnav tone={resolved === "hardware" ? "hardware" : "ocean"} showGear={flags.showGear} showCart={flags.showCart} />
      <MemberInstallPrompt env={resolved} />
    </>
  );
}
