import { headers } from "next/headers";
import { BotIdClient } from "botid/client";
import { experienceGateOpen, redirectToMemberLogin } from "@/lib/member-gate";

// Hidden in production until SHOW_EXPERIENCE=true. Logged-out visitors are
// asked to sign in (members can already see this world). Exceptions: the
// gift-voucher purchase page stays open (standalone commerce flow), link-only
// experiences open by their own link, and logged-in TEAM members always get
// through, which is the admin "Preview page" button working in production
// before the reveal. (The team check only runs when the flag is off, so it
// can't affect rendering later.)
//
// This is the BACKSTOP, not the gate (Nico, 27 Sep 2026). Next renders this
// layout, the page and generateMetadata side by side, so a redirect from here
// lands after the page has already rendered and its content rides along in the
// body of the 307. The pages under /experience therefore ask
// experienceGateOpen() themselves, first, before any query. This check stays
// for any page that does not.
export default async function ExperienceLayout({ children }: { children: React.ReactNode }) {
  // the header carries path + query; experienceGateOpen strips the query
  const path = (await headers()).get("x-np7-pathname") ?? "";
  if (!(await experienceGateOpen(path))) {
    // Members can see this world already, so someone arriving logged out is
    // asked to sign in and sent back here, not told the page does not exist.
    await redirectToMemberLogin("/experience");
  }
  return (
    <>
      {/* Invisible Vercel BotID — protects the free registration endpoint. */}
      <BotIdClient protect={[{ path: "/api/register", method: "POST" }]} />
      {children}
    </>
  );
}
