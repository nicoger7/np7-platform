import { notFound } from "next/navigation";
import { flags } from "@/lib/flags";

// The Spotguide is a magazine section — hidden in production until SHOW_BLOG=true
// (a plain 404, like the rest of the quiet-launch surfaces). Visible in dev +
// preview so the team can seed spots first.
export default function SpotguideLayout({ children }: { children: React.ReactNode }) {
  if (!flags.showBlog) notFound();
  return <>{children}</>;
}
