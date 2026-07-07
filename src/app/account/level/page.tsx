import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberProgression } from "@/lib/portal-data";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { ProgressionView } from "@/components/portal/progression-view";

export const metadata: Metadata = { title: "Progress — NP7" };
export const dynamic = "force-dynamic";

/** Progress = the rider's windsurf progression across Freeride / Freerace / Slalom
 *  (+ Wave & Freestyle), graded by difficulty. Log a skill yourself, then a coach
 *  on a trip (gold standard) or the Wind Coach App verifies it → rank moves. */
export default async function ProgressPage() {
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const progression = await getMemberProgression(user.contactId).catch(() => null);

  return (
    <>
      <PortalChrome section="experience" />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-1.5">Your progress</h1>
          <p className="text-[15px] text-[#6a7a80] mb-8">Log what you can do — your coaches verify it on trips, or via the Wind Coach App.</p>
          {progression ? <ProgressionView progression={progression} /> : <p className="text-[#6a7a80]">Nothing to show yet.</p>}
        </div>
      </main>
    </>
  );
}
