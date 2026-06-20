import { cookies } from "next/headers";
import { OceanHeader } from "@/components/experience/ocean-header";
import { HardwareHeader } from "@/components/hardware/hardware-header";
import { flags } from "@/lib/flags";
import { PortalSubnav } from "./portal-subnav";

/**
 * Portal chrome: the full section header you arrived from (Experience or
 * Hardware, read from the `np7_section` cookie — set in middleware / by the
 * member button) in its solid "docked" variant, with the portal submenu below.
 * The header colour + brand switch follow the section (teal Experience vs black
 * Hardware). Defaults to Experience when no section is known. Gear/Cart subnav
 * tabs stay flag-gated until those surfaces go live.
 */
export async function PortalChrome() {
  const store = await cookies();
  const section = store.get("np7_section")?.value === "hardware" ? "hardware" : "experience";

  return (
    <>
      {section === "hardware" ? <HardwareHeader variant="docked" /> : <OceanHeader variant="docked" />}
      <PortalSubnav tone={section === "hardware" ? "hardware" : "ocean"} showGear={flags.showGear} showCart={flags.showCart} />
    </>
  );
}
