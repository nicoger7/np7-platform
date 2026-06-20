import { notFound } from "next/navigation";
import { flags } from "@/lib/flags";

// Hidden in production until SHOW_EXPERIENCE=true — a plain 404, no public hint.
export default function ExperienceLayout({ children }: { children: React.ReactNode }) {
  if (!flags.showExperience) notFound();
  return <>{children}</>;
}
