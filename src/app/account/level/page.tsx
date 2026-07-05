import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberLevelDetail, getMemberProgression } from "@/lib/portal-data";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { YourLevel } from "@/components/portal/your-level";
import { ProgressionView } from "@/components/portal/progression-view";

export const metadata: Metadata = { title: "Progress — NP7" };
export const dynamic = "force-dynamic";

/** Progress = the rider's windsurf progression across Freeride / Freerace / Slalom,
 *  graded by difficulty and verified by a coach on a trip (gold standard) or via a
 *  wind.coach video. Falls back to the legacy level view before migration 068. */
export default async function ProgressPage() {
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const [progression, detail] = await Promise.all([
    getMemberProgression(user.contactId).catch(() => null),
    getMemberLevelDetail(user.contactId).catch(() => null),
  ]);

  return (
    <>
      <PortalChrome section="experience" />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-1.5">Your progress</h1>
          <p className="text-[15px] text-[#6a7a80] mb-8">Your Freeride, Freerace and Slalom skills — verified by your coaches on trips, or via wind.coach.</p>
          {progression ? <ProgressionView progression={progression} />
            : detail ? <YourLevel detail={detail} />
            : <p className="text-[#6a7a80]">Nothing to show yet.</p>}
        </div>
      </main>
    </>
  );
}
