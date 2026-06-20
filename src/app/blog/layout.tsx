import { notFound } from "next/navigation";
import { flags } from "@/lib/flags";

// The blog is hidden in production until SHOW_BLOG=true (a plain 404, matching
// the rest of the quiet-launch surfaces). Always visible in dev + preview.
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  if (!flags.showBlog) notFound();
  return <>{children}</>;
}
