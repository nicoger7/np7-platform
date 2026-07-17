import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { BotIdClient } from "botid/client";
import { flags } from "@/lib/flags";
import { getTeamMember } from "@/lib/auth";

// Hidden in production until SHOW_EXPERIENCE=true — a plain 404, no public hint.
// Exceptions: the gift-voucher purchase page stays open (standalone commerce
// flow), and logged-in TEAM members always get through — that's the admin
// "Preview page" button working in production before the reveal. (The team
// check only runs when the flag is off, so it can't affect rendering later.)
export default async function ExperienceLayout({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get("x-np7-pathname") ?? "";
  const isGift = path.startsWith("/experience/gift");
  if (!flags.showExperience && !isGift) {
    const team = await getTeamMember().catch(() => null);
    if (!team) notFound();
  }
  return (
    <>
      {/* Invisible Vercel BotID — protects the free registration endpoint. */}
      <BotIdClient protect={[{ path: "/api/register", method: "POST" }]} />
      {children}
    </>
  );
}
