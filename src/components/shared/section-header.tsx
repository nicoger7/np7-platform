import { cookies } from "next/headers";
import { resolveSection } from "@/lib/blog-section";
import { OceanHeader } from "@/components/experience/ocean-header";
import { HardwareHeader } from "@/components/hardware/hardware-header";

/**
 * Section-aware header for the brand-neutral top-level pages (Magazine, About).
 * They span both worlds, so they keep the SAME menu as wherever the reader came
 * from — Experience by default, Hardware for hardware visitors (np7_section
 * cookie, same pattern as the member portal). Docked so it sits solid above the
 * page's own hero.
 */
export async function SectionHeader() {
  const store = await cookies();
  const section = resolveSection(store.get("np7_section")?.value);
  return section === "hardware" ? (
    <HardwareHeader variant="docked" />
  ) : (
    <OceanHeader variant="docked" bookHref="/experience#experiences" />
  );
}
