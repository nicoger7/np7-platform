import { OceanHeader } from "@/components/experience/ocean-header";
import { HardwareHeader } from "@/components/hardware/hardware-header";
import { flags } from "@/lib/flags";
import type { Section } from "@/lib/blog-section";

/**
 * Section-aware header for the brand-neutral top-level pages (Magazine,
 * Spotguide, About). They span both worlds, so they keep the SAME menu as
 * wherever the reader came from — Experience by default, Hardware for hardware
 * visitors.
 *
 * Which of the two that is used to be resolved here from the np7_section cookie,
 * and that one read made every page carrying this header render per request. So
 * both headers ship in the markup instead and CSS shows the one matching
 * `data-np7-section` on <html> (see section-world.tsx). Every visitor gets byte
 * -identical HTML, which is what keeps these pages on the CDN.
 *
 * `section` pins the header for a page that HAS resolved its world from the
 * request — the force-dynamic draft routes, which were never cacheable anyway.
 * The experience header is flag-gated, so while only the Magazine is public the
 * menu shows just the Magazine link. Docked above the hero.
 */
export function SectionHeader({ section }: { section?: Section } = {}) {
  const ocean = {
    variant: "docked" as const,
    bookHref: "/experience#experiences",
    showExperience: flags.showExperience,
    showHardware: flags.showHardware,
    showBlog: flags.showBlog,
  };

  // One visible world ⇒ nothing to switch between, and no second header to ship.
  if (!flags.showHardware) return <OceanHeader {...ocean} />;
  if (section) return section === "hardware" ? <HardwareHeader variant="docked" /> : <OceanHeader {...ocean} />;

  return (
    <>
      <OceanHeader {...ocean} sectionVariant="experience" />
      <HardwareHeader variant="docked" sectionVariant="hardware" />
    </>
  );
}
