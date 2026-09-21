import { notFound } from "next/navigation";
import { flags } from "@/lib/flags";

// About spans both worlds, but it is NOT part of either one's launch: riding on
// showExperience put it live, and in the nav, the moment the Experience world
// went public. Its own flag, fail-closed in production like every other surface.
export default function AboutLayout({ children }: { children: React.ReactNode }) {
  if (!flags.showAbout) notFound();
  return <>{children}</>;
}
