import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberBooking, getMemoryPhotosForBooking, getBookingPaid, getBookingHotel, getEditionCoaches, getMemoryDownloadsRemaining } from "@/lib/portal-data";
import { bookingStatus, CHIP_CLASS, fmtDates, money } from "@/lib/portal-status";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { ExtraNightsButton } from "@/components/portal/extra-nights-button";
import { MemberDocuments } from "@/components/portal/member-documents";
import { MemberGallery } from "@/components/portal/member-gallery";

export const metadata: Metadata = { title: "My trip — NP7" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function BookingDetail({ params }: Props) {
  const { id } = await params;
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const b = await getMemberBooking(user.contactId, id);
  if (!b) notFound();

  const chip = bookingStatus(b);
  const [photos, paid, hotel, coaches, downloadsRemaining] = await Promise.all([
    b.edition?.id ? getMemoryPhotosForBooking(b.edition.id, b.id).catch(() => []) : Promise.resolve([]),
    getBookingPaid(b.id).catch(() => 0),
    getBookingHotel(b.id).catch(() => null),
    b.edition?.id ? getEditionCoaches(b.edition.id).catch(() => []) : Promise.resolve([]),
    getMemoryDownloadsRemaining(b.id).catch(() => 3),
  ]);

  const deposit = b.edition?.deposit ?? 300;
  const total = b.agreed_price ?? null;
  const depositPaid = paid >= deposit || b.downpayment_received || ["downpayment_paid", "paid", "confirmed"].includes((b.status ?? "").toLowerCase());
  const paidInFull = total != null && paid >= total && total > 0;
  const remaining = total != null ? Math.max(0, total - paid) : null;
  const tripEnded = b.edition?.date_end ? new Date(b.edition.date_end) < new Date() : false;
  const cancellation = b.experience?.cancellation_policy ||
    "Cancellations are handled case by case in line with our package travel terms. The deposit secures your spot; please contact us as early as possible if your plans change. Full terms are provided with your booking confirmation.";

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-8 sm:py-12">
          <Link href="/account" className="text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a]">← My trips</Link>

          <div className="flex flex-wrap items-start justify-between gap-3 mt-3 mb-8">
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">{b.experience?.title ?? "Your trip"}</h1>
              <p className="text-[15px] text-[#6a7a80] mt-1.5">{b.edition?.label ? `${b.edition.label} · ` : ""}{fmtDates(b.edition?.date_start, b.edition?.date_end)}</p>
            </div>
            <span className={`inline-block px-3.5 py-1.5 rounded-full text-[12px] font-bold ${CHIP_CLASS[chip.tone]}`}>{chip.label}</span>
          </div>

          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
            {/* left column */}
            <div className="space-y-5">
              {/* review nudge — once the week is over */}
              {tripEnded && (
                <section className="bg-gradient-to-br from-[#00afdb] to-[#0782a0] rounded-2xl p-6 text-white">
                  <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/80 mb-2">How was it?</h2>
                  <p className="text-[15px] font-bold leading-snug mb-1">Loved your week? Leave a review.</p>
                  <p className="text-[13.5px] text-white/85 leading-relaxed mb-4">It takes a minute and helps other riders find their next trip. You can add a photo too.</p>
                  <Link href={`/account/bookings/${b.id}/review`}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[13.5px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-transform">
                    ⭐ Leave a review
                  </Link>
                </section>
              )}

              {/* payment */}
              <Card title="Payment">
                <Row label="Package" value={b.pkg?.name ?? "—"} />
                <Row label="Trip total" value={money(total, b.experience?.currency) ?? "—"} />
                {paid > 0 && <Row label="Paid so far" value={(money(paid, b.experience?.currency) ?? "—") + " ✓"} tone="green" />}
                {paidInFull ? (
                  <Row label="Status" value="Paid in full ✓" tone="green" />
                ) : (
                  <>
                    <Row label="Deposit" value={(money(deposit, b.experience?.currency) ?? "€300") + (depositPaid ? " · paid ✓" : " · pending")} tone={depositPaid ? "green" : "amber"} />
                    {remaining != null && remaining > 0 && (
                      <Row label="Remaining balance" value={`${money(remaining, b.experience?.currency)} · by bank transfer`} />
                    )}
                  </>
                )}
                {!paidInFull && (
                  <p className="text-[12.5px] text-[#8a9aa0] mt-3 leading-relaxed">The remaining balance is paid by bank transfer — we&apos;ll send your invoice with all details in good time before the trip. Payments we&apos;ve received are reflected above.</p>
                )}
              </Card>

              {/* your stay */}
              {hotel && (
                <Card title="Your stay">
                  {hotel.image_url && (
                    <div className="rounded-xl overflow-hidden mb-3 aspect-[16/9] bg-cover bg-center" style={{ backgroundImage: `url('${hotel.image_url}')` }} />
                  )}
                  <p className="text-[15px] font-bold text-[#00374a]">{hotel.name}</p>
                  {hotel.description && <p className="text-[13.5px] text-[#5a6b72] leading-relaxed mt-1.5 whitespace-pre-line">{hotel.description}</p>}
                  {hotel.website && (
                    <a href={hotel.website} target="_blank" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#00afdb] hover:underline mt-2">Hotel website ↗</a>
                  )}
                </Card>
              )}

              {/* your coaches */}
              {coaches.length > 0 && (
                <Card title="Your coaches">
                  <div className="space-y-4">
                    {coaches.map((c) => (
                      <div key={c.name} className="flex items-start gap-3">
                        <div className="w-14 h-14 rounded-full bg-cover bg-center shrink-0 bg-[#eef3f4]" style={{ backgroundImage: c.image ? `url('${c.image}')` : undefined }} />
                        <div className="min-w-0">
                          <p className="text-[14.5px] font-bold text-[#00374a]">{c.name}</p>
                          {c.role && <p className="text-[11px] font-bold tracking-wide uppercase text-[#00afdb]">{c.role}</p>}
                          {c.bio && <p className="text-[13px] text-[#6a7a80] leading-relaxed mt-1">{c.bio}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* prep */}
              <Card title="Trip prep">
                <p className="text-[14px] text-[#5a6b72] leading-relaxed mb-3">We&apos;ll add your detailed arrival info and packing list here as the trip gets closer. In the meantime:</p>
                <div className="space-y-2.5">
                  {b.edition?.whatsapp_group_link ? (
                    <a href={b.edition.whatsapp_group_link} target="_blank" className="flex items-center gap-2 text-[14px] font-semibold text-[#00afdb] hover:underline">
                      <span>💬</span> Join your group chat
                    </a>
                  ) : <p className="text-[13.5px] text-[#9aa6ac]">💬 Your group chat link will appear here soon.</p>}
                  <div className="pt-1"><ExtraNightsButton bookingId={b.id} /></div>
                </div>
              </Card>

              {/* memories */}
              <Card title="Your memories">
                {photos.length === 0 && !b.edition?.memories_video_url ? (
                  <p className="text-[13.5px] text-[#9aa6ac]">Your photos &amp; video will appear here after the week.</p>
                ) : (
                  <>
                    {photos.length > 0 && (
                      <div className="mb-3">
                        <MemberGallery photos={photos} bookingId={b.id} downloadsRemaining={downloadsRemaining} />
                      </div>
                    )}
                    {b.edition?.memories_video_url && (
                      <a href={b.edition.memories_video_url} target="_blank" className="inline-flex items-center gap-2 text-[14px] font-bold text-[#00afdb] hover:underline">▶ Watch your week&apos;s video</a>
                    )}
                  </>
                )}
              </Card>
            </div>

            {/* right column — documents */}
            <div className="space-y-5">
              <Card title="Travel documents">
                <DocLink href={`/account/bookings/${b.id}/confirmation`} label="Trip confirmation" sub="Your booking summary (print / save as PDF)" />
                <DocLink href="/experience/legal/package-travel" label="Standard information form" sub="Your rights under EU package-travel law" />
                <MemberDocuments bookingId={b.id} />
                <details className="mt-2 border-t border-[#f3ede2] pt-3">
                  <summary className="text-[14px] font-semibold text-[#00374a] cursor-pointer">Cancellation policy</summary>
                  <p className="text-[13px] text-[#6a7a80] leading-relaxed mt-2 whitespace-pre-line">{cancellation}</p>
                </details>
              </Card>

              <Card title="Need anything?">
                <p className="text-[14px] text-[#5a6b72] leading-relaxed">We&apos;re here for you personally. Reply to any of our emails or reach us at <a href="mailto:experience@np-seven.com" className="text-[#00afdb] font-semibold">experience@np-seven.com</a>.</p>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-[#f0e6d6] p-6">
      <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb] mb-4">{title}</h2>
      {children}
    </section>
  );
}
function Row({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-[#f7f1e7] last:border-0">
      <span className="text-[13.5px] text-[#6a7a80]">{label}</span>
      <span className={`text-[13.5px] font-bold text-right ${tone === "green" ? "text-green-700" : tone === "amber" ? "text-[#c4621a]" : "text-[#00374a]"}`}>{value}</span>
    </div>
  );
}
function DocLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 py-2.5 group">
      <span className="shrink-0 w-9 h-9 rounded-lg bg-[#00afdb]/10 text-[#00afdb] grid place-items-center">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-[#00374a] group-hover:text-[#00afdb] transition-colors">{label}</span>
        <span className="block text-[12px] text-[#9aa6ac]">{sub}</span>
      </span>
      <svg className="w-4 h-4 text-[#c9d4d8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
    </Link>
  );
}
