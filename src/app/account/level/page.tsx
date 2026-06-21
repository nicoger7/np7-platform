import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberLevelDetail } from "@/lib/portal-data";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { YourLevel } from "@/components/portal/your-level";

export const metadata: Metadata = { title: "Progress — NP7" };
export const dynamic = "force-dynamic";

/** Progress = the rider's windsurf level + the skills behind it. Its own tab so
 *  the mastery view has room (the profile stays about community identity). */
export default async function ProgressPage() {
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const detail = await getMemberLevelDetail(user.contactId).catch(() => null);

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-1.5">Your progress</h1>
          <p className="text-[15px] text-[#6a7a80] mb-8">Your windsurf level and the skills behind it — ticked off by your coaches on every trip.</p>
          {detail ? <YourLevel detail={detail} /> : <p className="text-[#6a7a80]">Nothing to show yet.</p>}
        </div>
      </main>
    </>
  );
}
