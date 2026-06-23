import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { BotIdClient } from "botid/client";
import { flags } from "@/lib/flags";

// Hidden in production until SHOW_EXPERIENCE=true — a plain 404, no public hint.
// Exception: the gift-voucher purchase page stays open (standalone commerce flow),
// so people can buy vouchers before the marketing site is revealed.
export default async function ExperienceLayout({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get("x-np7-pathname") ?? "";
  const isGift = path.startsWith("/experience/gift");
  if (!flags.showExperience && !isGift) notFound();
  return (
    <>
      {/* Invisible Vercel BotID — protects the free registration endpoint. */}
      <BotIdClient protect={[{ path: "/api/register", method: "POST" }]} />
      {children}
    </>
  );
}
