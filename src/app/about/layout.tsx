import { notFound } from "next/navigation";
import { flags } from "@/lib/flags";

// About spans both worlds — visible once either world is live; a plain 404 only
// during a full quiet launch (matches the other surfaces' fail-closed pattern).
export default function AboutLayout({ children }: { children: React.ReactNode }) {
  if (!flags.showExperience && !flags.showHardware) notFound();
  return <>{children}</>;
}
