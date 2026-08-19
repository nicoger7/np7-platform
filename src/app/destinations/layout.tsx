import { notFound } from "next/navigation";
import { flags } from "@/lib/flags";
import { canSeeExperienceWorld } from "@/lib/auth";

// Destinations are part of the Experience world — hidden in production until
// SHOW_EXPERIENCE=true (a plain 404, no public hint).
export default function DestinationsLayout({ children }: { children: React.ReactNode }) {
  if (!(await canSeeExperienceWorld(flags.showExperience))) notFound();
  return <>{children}</>;
}
