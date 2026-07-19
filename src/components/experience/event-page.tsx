import Link from "next/link";
import { OceanHeader, NP7_LOGO } from "@/components/experience/ocean-header";
import { EventTicket, type TicketDate } from "@/components/experience/event-ticket";
import { createAdminClient } from "@/lib/supabase";
import { eventPricing, type EventInfo } from "@/lib/events";
import { eur } from "@/lib/stripe";

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
export async function EventPage({ event, isMember, paid }: { event: EventInfo; isMember: boolean; paid: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: content } = await db.from("exp_content").select("location_about,hero_image,gallery").eq("experience_id", event.id).maybeSingle();
  const hero = content?.hero_image || event.hero_image || "";
  const about = (content?.location_about || event.description || "").trim();
  const gallery = (Array.isArray(content?.gallery) ? content.gallery : []).filter(Boolean).slice(0, 6) as string[];

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
      <OceanHeader bookHref="#ticket" />

      {/* HERO — compact, event-forward */}
      <section className="relative min-h-[52vh] flex items-end bg-[#00374a] overflow-hidden">
        {hero && <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url('${hero}')` }} />}
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
              <p className="text-[15px] font-bold text-[#1f7a45]">You&apos;re in — see you on the water! 🌊</p>
              <p className="text-[13.5px] text-[#3a6a4e] mt-1">Check your email for the details{event.mode === "standby" ? " — we&apos;ll confirm your date soon" : ""}.</p>
            </div>
          )}
          {about ? (
            <p className="text-[16.5px] leading-[1.6] text-[#3a4a50] whitespace-pre-line [text-wrap:pretty]">{about}</p>
          ) : (
            <p className="text-[16.5px] leading-[1.6] text-[#3a4a50]">A focused NP7 session on the water. Bring your gear and your stoke — we&apos;ll handle the rest.</p>
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
            <span>© 2026 NP7 Experience</span>
          </div>
          <Link href="/experience" className="hover:text-white transition-colors">All experiences →</Link>
        </div>
      </footer>
    </main>
  );
}
