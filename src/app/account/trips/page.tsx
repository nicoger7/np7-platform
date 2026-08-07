import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberBookings, getMemberBannerImages } from "@/lib/portal-data";
import { bookingStatus, CHIP_CLASS, fmtDates, money } from "@/lib/portal-status";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { MemberHomeBanner } from "@/components/portal/member-home-banner";
import { BrandedTile } from "@/components/experience/branded-tile";
import { placeFromLocation, flagFromLocation } from "@/lib/experience-tile";

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
      <PortalChrome section="experience" />
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
            <div className="grid gap-5 sm:grid-cols-2">
              {bookings.map((b) => {
                const chip = bookingStatus(b);
                return (
                  <Link key={b.id} href={`/account/bookings/${b.id}`}
                    className="group block bg-white rounded-2xl border border-[#f0e6d6] overflow-hidden hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,55,74,0.08)] transition-all">
                    {/* Same auto-branded tile as the homepage experiences (flag /
                        place / coach composited on the raw photo); falls back to the
                        edition/experience hero when the experience isn't auto-tiled. */}
                    <div className="relative aspect-[16/9] overflow-hidden rounded-t-2xl grid place-items-center bg-[#e8f1f3]">
                      {b.experience?.tileAuto && b.experience?.hero_image ? (
                        <BrandedTile
                          photo={b.experience.hero_image}
                          place={placeFromLocation(b.experience.location ?? "").toUpperCase()}
                          flag={flagFromLocation(b.experience.location ?? "")}
                          coachName={b.experience.coachName ?? null}
                          coachCutout={b.experience.coachCutout ?? null}
                        />
                      ) : (() => { const tile = b.edition?.hero_image ?? b.experience?.hero_image; return tile ? (
                        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${tile}')` }} />
                      ) : (
                        <svg className="w-10 h-10 text-[#b9cdd3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                      ); })()}
                      {/* top-LEFT: the branded tile's coach cutout + "with Nico"
                          branding sits on the right, so the status chip goes left
                          to avoid overlapping it. */}
                      <span className={`absolute top-3 left-3 z-20 inline-block px-3 py-1.5 rounded-full text-[11px] font-bold shadow-sm ${CHIP_CLASS[chip.tone]}`}>{chip.label}</span>
                    </div>
                    <div className="p-5">
                      <h2 className="text-xl font-extrabold tracking-[-0.01em] text-[#00374a] group-hover:text-[#00afdb] transition-colors">
                        {b.experience?.title ?? "Your trip"}
                      </h2>
                      <p className="text-[14px] text-[#6a7a80] mt-1">
                        {b.edition?.label ? `${b.edition.label} · ` : ""}{fmtDates(b.edition?.date_start, b.edition?.date_end)}
                      </p>
                      {b.pkg?.name && <p className="text-[13px] text-[#9aa6ac] mt-1.5">{b.pkg.name.replace(/^[A-Za-z0-9]+\s*[-–—]\s*/, "").trim() || b.pkg.name}</p>}
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#f3ede2]">
                        <span className="text-[14px] font-bold text-[#00374a]">{money(b.agreed_price, b.experience?.currency) ?? "—"}</span>
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#00afdb] group-hover:gap-2.5 transition-all">
                          Manage trip
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                        </span>
                      </div>
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
