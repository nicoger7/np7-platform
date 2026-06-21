import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberBookings, getMemberBannerImages } from "@/lib/portal-data";
import { bookingStatus, CHIP_CLASS, fmtDates, money } from "@/lib/portal-status";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { MemberHomeBanner } from "@/components/portal/member-home-banner";

export const metadata: Metadata = { title: "My trips — NP7" };
export const dynamic = "force-dynamic";

export default async function MyTrips() {
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const [bookings, bannerImages] = await Promise.all([
    getMemberBookings(user.contactId),
    getMemberBannerImages(user.contactId).catch(() => []),
  ]);

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <Link href="/account" className="text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a]">← Home</Link>
          <div className="mt-2">
            <MemberHomeBanner
              images={bannerImages}
              title="My trips"
              subtitle={bookings.length ? "Tap a trip to manage everything — payment, prep, photos and more." : "Your booked trips will show up here."}
            />
          </div>

          {bookings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#f0e6d6] p-8 text-center">
              <p className="text-[15px] text-[#6a7a80] mb-5">No trips yet — your next adventure is waiting.</p>
              <Link href="/experience" className="inline-block px-7 py-3.5 rounded-full text-[14px] font-bold text-white bg-[#00afdb]">Explore experiences</Link>
            </div>
          ) : (
            <div className="grid gap-4">
              {bookings.map((b) => {
                const chip = bookingStatus(b);
                return (
                  <Link key={b.id} href={`/account/bookings/${b.id}`}
                    className="group bg-white rounded-2xl border border-[#f0e6d6] p-6 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,55,74,0.08)] transition-all">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="text-xl font-extrabold tracking-[-0.01em] text-[#00374a] group-hover:text-[#00afdb] transition-colors">
                          {b.experience?.title ?? "Your trip"}
                        </h2>
                        <p className="text-[14px] text-[#6a7a80] mt-1">
                          {b.edition?.label ? `${b.edition.label} · ` : ""}{fmtDates(b.edition?.date_start, b.edition?.date_end)}
                        </p>
                        {b.pkg?.name && <p className="text-[13px] text-[#9aa6ac] mt-1.5">{b.pkg.name}</p>}
                      </div>
                      <span className={`shrink-0 inline-block px-3 py-1.5 rounded-full text-[11px] font-bold ${CHIP_CLASS[chip.tone]}`}>{chip.label}</span>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#f3ede2]">
                      <span className="text-[14px] font-bold text-[#00374a]">{money(b.agreed_price, b.experience?.currency) ?? "—"}</span>
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#00afdb] group-hover:gap-2.5 transition-all">
                        Manage trip
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
