import Link from "next/link";
import { HeroVideo } from "@/components/experience/hero-video";
import { OceanHeader, NP7_LOGO } from "@/components/experience/ocean-header";
import { EventTicket, type TicketDate } from "@/components/experience/event-ticket";
import { MethodModal } from "@/components/experience/method-modal";
import { CoachCard } from "@/components/experience/coach-modal";
import { createAdminClient } from "@/lib/supabase";
import { eventPricing, type EventInfo } from "@/lib/events";
import { eur } from "@/lib/stripe";
import { flags } from "@/lib/flags";

type Coach = { name: string; role: string | null; bio: string | null; image_url: string | null; whatsapp_link: string | null };

/** Split a free-text / array "what's included" into clean bullet lines. */
function parseIncluded(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/\r?\n|·|;/).map((s) => s.replace(/^[-•\s]+/, "").trim()).filter(Boolean);
  return [];
}

/** Compact date range, e.g. "Sat 23 Nov" or "23–24 Nov 2026". */
function fmtRange(start: string, end: string | null): string {
  const s = new Date(start);
  const d = (x: Date) => x.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  if (!end || end === start) return `${d(s)} ${s.getFullYear()}`;
  const e = new Date(end);
  const short = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${short(s)} – ${short(e)} ${e.getFullYear()}`;
}

function toTicketDate(d: EventInfo["dates"][number]): TicketDate {
  return { id: d.id, label: d.label || fmtRange(d.date_start, d.date_end), sub: d.label ? fmtRange(d.date_start, d.date_end) : undefined };
}

/**
 * The slimmed EVENT page — for 1–2 day clinics (often for locals who already
 * know the spot). Sells the ticket fast: hero, a short what-it-is, the ticket
 * box. No accommodation, no pre-payment plan, no deep-dives.
 */
export async function EventPage({ event, isMember, paid, paidBookingId = null }: { event: EventInfo; isMember: boolean; paid: boolean; paidBookingId?: string | null }) {
  // "You're in" used to be a claim made by the URL alone, which is how a page
  // can congratulate someone the platform never recorded. Ask the booking.
  // The webhook writes the payment a moment after Stripe redirects, so a
  // still-unpaid row is treated as "landing", not as a failure.
  const paidBooking = paid && paidBookingId
    ? await (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = createAdminClient() as any;
        const { data } = await db.from("exp_bookings").select("id,status").eq("id", paidBookingId).maybeSingle();
        return (data as { id: string; status: string | null } | null) ?? null;
      })()
    : null;
  const paidConfirmed = ["paid", "reserved", "confirmed", "attended"].includes(String(paidBooking?.status ?? "").toLowerCase());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [{ data: content }, { data: exp }, { data: coachRows }] = await Promise.all([
    db.from("exp_content").select("location_about,hero_image,gallery,hero_video_url,hero_video_start,hero_video_end").eq("experience_id", event.id).maybeSingle(),
    db.from("exp_experiences").select("whats_included").eq("id", event.id).maybeSingle(),
    // HEAD coach only — the coach library is global (no per-event link), so
    // listing arbitrary coaches would attribute the wrong people to an event.
    // Nico fronts every event; per-event crews need an edition-coach link first.
    db.from("exp_coaches").select("name,role,bio,image_url,whatsapp_link").ilike("role", "%head%").order("created_at"),
  ]);
  const hero = content?.hero_image || event.hero_image || "";
  const heroVideo = (content?.hero_video_url || "").trim();
  const about = (content?.location_about || event.description || "").trim();
  const gallery = (Array.isArray(content?.gallery) ? content.gallery : []).filter(Boolean).slice(0, 6) as string[];
  const included = parseIncluded(exp?.whats_included).slice(0, 8);
  const coaches = ((coachRows ?? []) as Coach[]).slice(0, 1);

  const price = event.price ?? 0;
  const { deposit, balance, refund } = eventPricing(price, event.depositPct, event.refundPct);
  const cur = event.currency ?? "EUR";

  const candidateDates = event.dates.filter((d) => d.status === "candidate").map(toTicketDate);
  const confirmed = event.dates.find((d) => d.status === "confirmed");
  const fixedDate: TicketDate | null = confirmed ? toTicketDate(confirmed)
    : event.mode === "fixed" && event.dates[0] ? toTicketDate(event.dates[0]) : null;

  const canBook = price > 0 && (event.mode === "standby" ? candidateDates.length > 0 : !!fixedDate);

  return (
    <main className="min-h-screen bg-[#fbfdfd]">
      {/* An event opened by direct link (public_by_link) sits in a world that is
          otherwise 404 — so the nav must not offer Experiences / Hardware /
          Magazine while those are still hidden, or the page advertises dead
          ends to the very people we sent the link to. */}
      <OceanHeader bookHref="#ticket" showExperience={flags.showExperience} showHardware={flags.showHardware} showBlog={flags.showBlog} />

      {/* HERO — compact, event-forward */}
      <section className="relative min-h-[52vh] flex items-end bg-[#00374a] overflow-hidden">
        {heroVideo ? (
          <HeroVideo url={heroVideo} start={content?.hero_video_start ?? null} end={content?.hero_video_end ?? null} poster={hero || null} />
        ) : hero ? (
          <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url('${hero}')` }} />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-[#00374a]/45 to-transparent" />
        <div className="relative z-10 w-full max-w-[1000px] mx-auto px-6 sm:px-8 pb-10 pt-24 text-white">
          <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#ffd66b]">
            <span aria-hidden>◆</span> Event{event.location ? ` · ${event.location}` : ""}
          </span>
          <h1 className="text-4xl sm:text-6xl font-black tracking-[-0.03em] mt-3 leading-[1.02]">{event.title}</h1>
          {event.mode === "standby" && candidateDates.length > 0 && (
            <p className="text-white/85 text-[15px] mt-3">{candidateDates.length} possible date{candidateDates.length > 1 ? "s" : ""} · we confirm one when the forecast lands</p>
          )}
        </div>
      </section>

      <div className="max-w-[1000px] mx-auto px-6 sm:px-8 py-10 sm:py-14 grid lg:grid-cols-[1fr_400px] gap-8 lg:gap-12 items-start">
        {/* what it is — kept short */}
        <div>
          {paid && (
            <div className="mb-6 rounded-2xl bg-[#eafaf0] border border-[#bfe8cf] px-5 py-4">
              {paidConfirmed ? (
                <>
                  <p className="text-[15px] font-bold text-[#1f7a45]">You&apos;re in — see you on the water! 🌊</p>
                  <p className="text-[13.5px] text-[#3a6a4e] mt-1">Check your email for the details{event.mode === "standby" ? " — we&apos;ll confirm your date soon" : ""}.</p>
                </>
              ) : (
                <>
                  <p className="text-[15px] font-bold text-[#1f7a45]">Payment received — setting up your spot…</p>
                  <p className="text-[13.5px] text-[#3a6a4e] mt-1">This takes a few seconds. Your confirmation email is on its way.</p>
                </>
              )}
              {paidBooking && (
                <Link
                  href={`/account/bookings/${paidBooking.id}`}
                  className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-[#1f7a45] text-white text-[13px] font-bold px-4 py-2 hover:bg-[#186237] transition-colors"
                >
                  Go to my booking →
                </Link>
              )}
            </div>
          )}
          {about ? (
            <p className="text-[16.5px] leading-[1.6] text-[#3a4a50] whitespace-pre-line [text-wrap:pretty]">{about}</p>
          ) : (
            <p className="text-[16.5px] leading-[1.6] text-[#3a4a50]">A focused NP7 session on the water. Bring your gear and your stoke — we&apos;ll handle the rest.</p>
          )}

          {/* THE COACHING — this is why an NP7 day is different from a normal session */}
          <div className="mt-10 rounded-2xl bg-[#00374a] text-white p-6 sm:p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_10%,rgba(0,175,219,0.28),transparent_55%)]" aria-hidden />
            <div className="relative">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8fe6f2]">Coaching that changes your riding</p>
              <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.02em] mt-2">Not just a session — the NP7 Method</h2>
              <p className="text-[15px] text-white/75 leading-relaxed mt-3 max-w-[560px]">
                Every move broken into steps that click, video analysis so you see yourself, and a focus point you take home. It&apos;s the whole rider — technique, fundamentals, mindset and the fun that keeps you coming back.
              </p>
              <div className="mt-5"><MethodModal /></div>
            </div>
          </div>

          {/* WHAT'S INCLUDED / services on the ground */}
          {included.length > 0 && (
            <div className="mt-10">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#0a7f9e]">What&apos;s included</p>
              <h2 className="text-2xl font-black tracking-[-0.02em] text-[#00374a] mt-2">In your ticket</h2>
              <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {included.map((it) => (
                  <li key={it} className="flex items-start gap-2.5 text-[15px] text-[#3a4a50]">
                    <svg className="mt-0.5 shrink-0 text-[#00afdb]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><path d="M20 6L9 17l-5-5" /></svg>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* WHO'S COACHING */}
          {coaches.length > 0 && (
            <div className="mt-10">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#f47b20]">Your coach{coaches.length > 1 ? "es" : ""}</p>
              <h2 className="text-2xl font-black tracking-[-0.02em] text-[#00374a] mt-2">Who you&apos;ll ride with</h2>
              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                {coaches.map((c) => (
                  <CoachCard key={c.name} coach={c} />
                ))}
              </div>
            </div>
          )}

          {gallery.length > 0 && (
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {gallery.map((g, i) => (
                <div key={i} className="aspect-[4/3] rounded-xl bg-cover bg-center" style={{ backgroundImage: `url('${g}')` }} />
              ))}
            </div>
          )}
        </div>

        {/* ticket box */}
        <div id="ticket" className="lg:sticky lg:top-24 scroll-mt-24">
          {canBook ? (
            <EventTicket
              experienceId={event.id}
              mode={event.mode}
              priceLabel={eur(price, cur)}
              depositLabel={eur(deposit, cur)}
              balanceLabel={eur(balance, cur)}
              refundLabel={eur(refund, cur)}
              dates={candidateDates}
              fixedDate={fixedDate}
              isMember={isMember}
              eventDate={(confirmed ?? event.dates[0])?.date_start ?? null}
              editionSlug={event.editionSlug ?? null}
              location={event.location}
            />
          ) : (
            <div className="rounded-2xl bg-white border border-[#e3e9ec] p-7 text-center">
              <p className="text-[15px] font-bold text-[#00374a]">Dates coming soon</p>
              <p className="text-[13.5px] text-[#6a7a80] mt-2">This event isn&apos;t open for booking yet. Check back shortly.</p>
            </div>
          )}
        </div>
      </div>

      <footer className="bg-[#00374a] text-white/40 py-9">
        <div className="max-w-[1000px] mx-auto px-6 sm:px-8 flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <Link href="/"><img src={NP7_LOGO} alt="NP7" className="h-7 w-auto invert opacity-90" /></Link>
            <span className="whitespace-nowrap">© 2026 NP7 Experience</span>
          </div>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-5 gap-y-2">
            <Link href="/widerruf" className="text-white/70 underline underline-offset-2 hover:text-white transition-colors">Withdraw from contract</Link>
            {flags.showExperience && <Link href="/experience" className="hover:text-white transition-colors">All experiences →</Link>}
          </div>
        </div>
      </footer>
    </main>
  );
}
