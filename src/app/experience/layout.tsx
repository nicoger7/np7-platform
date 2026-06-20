import { notFound } from "next/navigation";
import { BotIdClient } from "botid/client";
import { flags } from "@/lib/flags";

// Hidden in production until SHOW_EXPERIENCE=true — a plain 404, no public hint.
export default function ExperienceLayout({ children }: { children: React.ReactNode }) {
  if (!flags.showExperience) notFound();
  return (
    <>
      {/* Invisible Vercel BotID — protects the free registration endpoint. */}
      <BotIdClient protect={[{ path: "/api/register", method: "POST" }]} />
      {children}
    </>
  );
}
