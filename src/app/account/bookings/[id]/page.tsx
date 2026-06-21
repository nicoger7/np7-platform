import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberBooking, getMemoryPhotosForBooking, getBookingPaid, getBookingHotel, getEditionCoaches, getMemoryDownloadsRemaining, getConfirmedAddonsTotal, getBookingFlights, getExperienceArrivalInfo } from "@/lib/portal-data";
import { bookingStatus, CHIP_CLASS, fmtDates, money } from "@/lib/portal-status";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { ExtraNightsButton } from "@/components/portal/extra-nights-button";
import { MemberDocuments } from "@/components/portal/member-documents";
import { MemberGallery } from "@/components/portal/member-gallery";
import { TripAddons } from "@/components/portal/trip-addons";
import { PaymentPlan } from "@/components/portal/payment-plan";
import { CancelTrip } from "@/components/portal/cancel-trip";
import { computePaymentPlan } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase";

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
  const [photos, paid, hotel, coaches, downloadsRemaining, addonsTotal, flights, arrival] = await Promise.all([
    b.edition?.id ? getMemoryPhotosForBooking(b.edition.id, b.id).catch(() => []) : Promise.resolve([]),
    getBookingPaid(b.id).catch(() => 0),
    getBookingHotel(b.id).catch(() => null),
    b.edition?.id ? getEditionCoaches(b.edition.id).catch(() => []) : Promise.resolve([]),
    getMemoryDownloadsRemaining(b.id).catch(() => 3),
    getConfirmedAddonsTotal(b.id).catch(() => 0),
    getBookingFlights(b.id).catch(() => null),
    b.experience_id ? getExperienceArrivalInfo(b.experience_id).catch(() => null) : Promise.resolve(null),
  ]);

  const deposit = b.edition?.deposit ?? 300;
  const baseTotal = b.agreed_price ?? null;
  const total = baseTotal != null ? baseTotal + addonsTotal : addonsTotal > 0 ? addonsTotal : null;
  const depositPaid = paid >= deposit || b.downpayment_received || ["downpayment_paid", "paid", "confirmed"].includes((b.status ?? "").toLowerCase());
  const tripEnded = b.edition?.date_end ? new Date(b.edition.date_end) < new Date() : false;
  // waiver signature status (table from migration 031)
  const waiverSig = await (createAdminClient() as unknown as { from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { signed_name: string; signed_at: string } | null }> } } } })
    .from("exp_waiver_signatures").select("signed_name, signed_at").eq("booking_id", id).maybeSingle()
    .then((r) => r.data).catch(() => null);
  const cancellation = b.experience?.cancellation_policy ||
    "You can cancel any time before the trip. Your deposit is refundable for 14 days after payment; after that it's kept as the cancellation fee. Once you've paid the 50% downpayment or the full balance, that amount becomes the fee — with a goodwill credit voucher toward a future trip. Use ‘Cancel this trip’ above to start, or see our Terms for the full scale.";
  const plan = computePaymentPlan(
    { deposit: b.edition?.deposit ?? null },
    { total: total ?? 0, paidAmount: paid, editionStart: b.edition?.date_start ?? null }
  );

  // Once the trip is over, photos are what the member wants first — so the
  // memories card jumps to the top of the column (otherwise it sits at the end).
  const memoriesCard = (
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
            <a href={b.edition.memories_video_url} target="_blank" className="inline-flex items-center gap-2 text-[14px] font-bold text-[#00afdb] hover:underline">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              Watch your week&apos;s video</a>
          )}
        </>
      )}
    </Card>
  );

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-8 sm:py-12">
          <Link href="/account/trips" className="text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a]">← My trips</Link>

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
                    Leave a review
                  </Link>
                </section>
              )}

              {/* after the trip, photos come first */}
              {tripEnded && memoriesCard}

              {/* payment plan — deposit → downpayment → final */}
              <Card title="Payment plan">
                <Row label="Package" value={b.pkg?.name ?? "—"} />
                {addonsTotal > 0 && <Row label="Confirmed add-ons" value={`+ ${money(addonsTotal, b.experience?.currency)}`} />}
                <div className="mt-3.5">
                  <PaymentPlan
                    milestones={plan}
                    currency={b.experience?.currency ?? "EUR"}
                    total={total ?? 0}
                    paid={paid}
                  />
                </div>
                {!tripEnded && (
                  <div className="mt-4 pt-3 border-t border-[#f3ede2] flex items-center justify-between gap-3">
                    <span className="text-[12px] text-[#9aa6ac] leading-snug">Plans changed?</span>
                    <CancelTrip bookingId={b.id} milestones={plan} paid={paid} currency={b.experience?.currency ?? "EUR"} />
                  </div>
                )}
              </Card>

              {/* waiver */}
              <Card title="Participation waiver">
                {waiverSig ? (
                  <div className="flex items-center gap-2.5">
                    <span className="shrink-0 w-7 h-7 rounded-full bg-green-500 text-white grid place-items-center text-[14px] font-bold">✓</span>
                    <div>
                      <p className="text-[14px] font-bold text-[#00374a]">Signed</p>
                      <p className="text-[12.5px] text-[#8a9aa0]">by {waiverSig.signed_name} · {new Date(waiverSig.signed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
                    </div>
                    <Link href={`/account/bookings/${b.id}/waiver`} className="ml-auto text-[13px] font-semibold text-[#00afdb] hover:underline">View</Link>
                  </div>
                ) : (
                  <div>
                    <p className="text-[13.5px] text-[#5a6b72] leading-relaxed mb-3">Every participant signs a short waiver &amp; health declaration before the trip — it takes a minute, right here in your account.</p>
                    <Link href={`/account/bookings/${b.id}/waiver`} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[13px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] transition-colors">Sign your waiver →</Link>
                  </div>
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

              {/* prep */}
              <Card title="Trip prep">
                <TripAddons bookingId={b.id} depositPaid={depositPaid} initialFlights={flights} arrival={arrival} editionStart={b.edition?.date_start ?? null} editionEnd={b.edition?.date_end ?? null} />
                <div className="mt-5 pt-4 border-t border-[#f3ede2]">
                  <ExtraNightsButton bookingId={b.id} />
                </div>
              </Card>

              {/* before the trip, memories sit at the end */}
              {!tripEnded && memoriesCard}
            </div>

            {/* right column */}
            <div className="space-y-5">
              {coaches.length > 0 && (
                <Card title="Your team">
                  <div className="space-y-4">
                    {coaches.map((c) => (
                      <div key={c.name} className="flex items-start gap-3">
                        <div className="w-14 h-14 rounded-full bg-cover bg-center shrink-0 bg-[#eef3f4]" style={{ backgroundImage: c.image ? `url('${c.image}')` : undefined }} />
                        <div className="min-w-0">
                          <p className="text-[14.5px] font-bold text-[#00374a]">{c.name}</p>
                          {c.role && <p className="text-[11px] font-bold tracking-wide uppercase text-[#00afdb]">{c.role}</p>}
                          {c.bio && <p className="text-[13px] text-[#6a7a80] leading-relaxed mt-1">{c.bio}</p>}
                          {c.whatsapp && (
                            <a href={normalizeWa(c.whatsapp)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 mt-1.5 text-[13px] font-semibold text-[#1aa851] hover:underline">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.205zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.074-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
                              Chat on WhatsApp
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {b.edition?.whatsapp_group_link && (
                <Card title="Your group">
                  <a href={b.edition.whatsapp_group_link} target="_blank" className="flex items-center gap-2 text-[14px] font-semibold text-[#00afdb] hover:underline">
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.205zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.074-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
                    Join your group chat
                  </a>
                </Card>
              )}

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
/** Normalise a stored WhatsApp value (wa.me/…, a full URL, or a raw number) into a tappable link. */
function normalizeWa(v: string): string {
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^wa\.me\//i.test(s)) return `https://${s}`;
  const digits = s.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : s;
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
