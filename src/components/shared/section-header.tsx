import { cookies } from "next/headers";
import { resolveSection } from "@/lib/blog-section";
import { OceanHeader } from "@/components/experience/ocean-header";
import { HardwareHeader } from "@/components/hardware/hardware-header";
import { flags } from "@/lib/flags";

/**
 * Section-aware header for the brand-neutral top-level pages (Magazine, About).
 * They span both worlds, so they keep the SAME menu as wherever the reader came
 * from — Experience by default, Hardware for hardware visitors (np7_section
 * cookie). Only follows the hardware cookie when Hardware is actually live; the
 * experience header is flag-gated, so while only Magazine is public the menu shows
 * just the Magazine link (no experience/hardware page links). Docked above the hero.
 */
export async function SectionHeader() {
  const store = await cookies();
  const section = resolveSection(store.get("np7_section")?.value);
  return section === "hardware" && flags.showHardware ? (
    <HardwareHeader variant="docked" />
  ) : (
    <OceanHeader variant="docked" bookHref="/experience#experiences" showExperience={flags.showExperience} showBlog={flags.showBlog} />
  );
}
