import { notFound } from "next/navigation";
import { flags } from "@/lib/flags";

// Destinations are part of the Experience world — hidden in production until
// SHOW_EXPERIENCE=true (a plain 404, no public hint).
export default function DestinationsLayout({ children }: { children: React.ReactNode }) {
  if (!flags.showExperience) notFound();
  return <>{children}</>;
}
