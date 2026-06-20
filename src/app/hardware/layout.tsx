import { notFound } from "next/navigation";
import { flags } from "@/lib/flags";

// Hidden in production until SHOW_HARDWARE=true — a plain 404, no public hint.
export default function HardwareLayout({ children }: { children: React.ReactNode }) {
  if (!flags.showHardware) notFound();
  return <>{children}</>;
}
