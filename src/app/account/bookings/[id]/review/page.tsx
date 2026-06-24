import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberBooking, getOwnTripPhotos } from "@/lib/portal-data";
import { fmtDates } from "@/lib/portal-status";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { ReviewForm } from "@/components/portal/review-form";

export const metadata: Metadata = { title: "Leave a review — NP7" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ReviewPage({ params }: Props) {
  const { id } = await params;
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const b = await getMemberBooking(user.contactId, id);
  if (!b) notFound();

  // ONLY their own personal shots (not the week's shared gallery) — so a review
  // photo is genuinely the rider's own.
  const gallery = b.edition?.id ? await getOwnTripPhotos(b.edition.id, b.id).catch(() => []) : [];

  return (
    <>
      <PortalChrome section="experience" />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[640px] mx-auto px-5 sm:px-8 py-8 sm:py-12">
          <Link href={`/account/bookings/${b.id}`} className="text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a]">← Back to my trip</Link>

          <div className="mt-3 mb-7">
            <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">How was it?</h1>
            <p className="text-[15px] text-[#6a7a80] mt-1.5">
              Share your week at <strong className="text-[#00374a]">{b.experience?.title ?? "your trip"}</strong>
              {b.edition?.date_start ? ` · ${fmtDates(b.edition.date_start, b.edition.date_end)}` : ""}.
            </p>
          </div>

          <ReviewForm bookingId={b.id} gallery={gallery} />
        </div>
      </main>
    </>
  );
}
