import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberGuides } from "@/lib/portal-data";
import { fmtDates } from "@/lib/portal-status";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { GuideCard } from "@/components/portal/guide-card";

export const metadata: Metadata = { title: "My focus points — NP7" };
export const dynamic = "force-dynamic";

/**
 * The shelf.
 *
 * A guide used to exist in exactly one place, at the bottom of one booking's
 * Trip tab, which meant that a rider with three trips had three guides and no
 * way to see them together. This is where they gather, the same way memories
 * do: unread first, because that is the one you came for, then everything else
 * in the order it arrived.
 */
export default async function GuidesPage() {
  const user = await getPortalUser();
  if (!user) redirect("/account/login");

  const guides = await getMemberGuides(user.contactId).catch(() => []);
  const unread = guides.filter((g) => !g.openedAt);
  const read = guides.filter((g) => g.openedAt);

  return (
    <>
      <PortalChrome section="experience" />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <Link href="/account" className="text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a]">← Home</Link>
          <div className="mt-2 mb-8">
            <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">My focus points</h1>
            <p className="text-[15px] text-[#6a7a80] mt-1.5">
              {guides.length > 0
                ? <>What your coach picked for you to work on, trip by trip. Yours to keep.</>
                : <>After a trip, your coach writes up the moves to work on next. They land here.</>}
            </p>
          </div>

          {guides.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#f0e6d6] p-8 text-center">
              <p className="text-[14px] text-[#8a9aa0]">Nothing here yet. Your first guide arrives after your first week with us.</p>
              <Link href="/account/trips" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#00afdb] mt-3 hover:gap-2.5 transition-all">
                See my trips
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {unread.length > 0 && (
                <div className="space-y-3">
                  {unread.map((g) => <GuideCard key={g.id} guide={g} unread />)}
                </div>
              )}
              {read.length > 0 && (
                <div>
                  {unread.length > 0 && (
                    <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#9aa6ac] mb-2.5">Earlier</p>
                  )}
                  <div className="space-y-3">
                    {read.map((g) => (
                      <div key={g.id}>
                        <GuideCard guide={g} unread={false} />
                        {g.tripStart && (
                          <p className="text-[12px] text-[#9aa6ac] mt-1.5 pl-1">{fmtDates(g.tripStart, g.tripEnd)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
