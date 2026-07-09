import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getAllMemberMemories } from "@/lib/portal-data";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { MemoriesBrowser } from "@/components/portal/memories-browser";

export const metadata: Metadata = { title: "My memories — NP7" };
export const dynamic = "force-dynamic";

export default async function MemoriesPage() {
  const user = await getPortalUser();
  if (!user) redirect("/account/login");

  const trips = await getAllMemberMemories(user.contactId).catch(() => []);
  const totalPhotos = trips.reduce((n, t) => n + t.total, 0);

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <Link href="/account" className="text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a]">← Home</Link>
          <div className="mt-2 mb-8">
            <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">My memories</h1>
            <p className="text-[15px] text-[#6a7a80] mt-1.5">
              {totalPhotos > 0
                ? <>Every photo from your trips — your own, the week&apos;s shared shots, and the ones your crew shared with you. View only.</>
                : <>Your trip photos will gather here after each week.</>}
            </p>
            {trips.length > 0 && (
              <p className="text-[12.5px] text-[#9aa6ac] mt-2 leading-relaxed max-w-[620px]">
                💾 Your photos stay here for <strong className="text-[#6a7a80] font-semibold">a year after each trip</strong>, videos for <strong className="text-[#6a7a80] font-semibold">3 months</strong>. The keepers you star stay forever — so star your favourites (and download anything else) before then.
              </p>
            )}
          </div>

          {trips.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#f0e6d6] p-8 text-center">
              <p className="text-[14px] text-[#8a9aa0]">No photos yet — they appear here once a trip wraps up.</p>
              <Link href="/account/trips" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#00afdb] mt-3 hover:gap-2.5 transition-all">
                See my trips
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </div>
          ) : (
            <MemoriesBrowser trips={trips} />
          )}
        </div>
      </main>
    </>
  );
}
