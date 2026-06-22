import type { Metadata } from "next";
import Link from "next/link";
import { getInviteLanding } from "@/lib/invites";
import { JoinSignup } from "@/components/join/join-signup";
import { flags } from "@/lib/flags";

const HIGHLIGHTS = ["Pro coaching every day", "Small, hand-picked crew", "Hotel, transfers & gear sorted"];

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "You're invited — NP7 Experience" };

type Props = { params: Promise<{ token: string }> };

function fmtRange(start: string | null, end: string | null): string {
  if (!start) return "";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
  if (e && s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${month(e)} ${e.getFullYear()}`;
  if (e) return `${s.getDate()} ${month(s)} – ${e.getDate()} ${month(e)} ${e.getFullYear()}`;
  return s.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtMoney(n: number | null | undefined, currency = "EUR"): string {
  if (n == null) return "";
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[100svh] bg-[#fff7ec] flex items-center justify-center p-5">
      <div className="w-full max-w-[440px]">{children}</div>
    </main>
  );
}

export default async function JoinPage({ params }: Props) {
  const { token } = await params;
  const landing = await getInviteLanding(token).catch(() => null);

  if (!landing || !landing.experience) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white border border-[#f0e6d6] p-7 text-center">
          <h1 className="text-[20px] font-black text-[#00374a]">This invite isn&apos;t available</h1>
          <p className="text-[14px] text-[#5a6b72] mt-2 leading-relaxed">The link may have expired or been mistyped. Ask your friend to resend it — or explore our trips directly.</p>
          <Link href="/experience" className="inline-block mt-4 rounded-lg bg-[#00374a] text-white text-[14px] font-semibold px-5 py-2.5">Explore trips</Link>
        </div>
      </Shell>
    );
  }

  const { invite, inviterName, experience, edition, package: pkg, images } = landing;
  const hero = edition?.hero_image || experience.hero_image || null;
  const currency = experience.currency || "EUR";
  const dates = fmtRange(edition?.date_start ?? null, edition?.date_end ?? null);
  const friendReward = invite.reward_friend_amount;
  // Short selling blurb: the experience's own description, trimmed to a sentence
  // or two; a warm fallback if it has none.
  const blurb = (() => {
    const d = (experience.description || "").trim();
    if (!d) return "A week of windsurfing, coaching and good people — flights aside, everything's arranged so you just show up and ride.";
    return d.length <= 180 ? d : d.slice(0, 180).replace(/\s+\S*$/, "") + "…";
  })();
  // Real "what's included" from the package, falling back to the on-brand basics.
  const included = (pkg?.includes.length ? pkg.includes : HIGHLIGHTS).slice(0, 5);

  return (
    <Shell>
      <div className="rounded-2xl bg-white border border-[#f0e6d6] overflow-hidden shadow-sm">
        {/* Hero */}
        <div className="relative h-[180px] bg-[#0f6e56]">
          {hero && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero} alt={experience.title} className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#00374a]/85 via-[#00374a]/30 to-transparent" />
          <div className="absolute top-4 left-5 text-white/90 text-[12px] font-semibold tracking-wide">NP7 EXPERIENCE</div>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full bg-[#e1f5ee] text-[#0f6e56] inline-flex items-center justify-center text-[13px] font-bold">
              {(inviterName || "NP").slice(0, 2).toUpperCase()}
            </span>
            <p className="text-[14px] text-[#5a6b72]">
              <span className="text-[#00374a] font-bold">{inviterName || "A friend"}</span> invited you to join
            </p>
          </div>

          <h1 className="text-[22px] font-black text-[#00374a] mt-3 leading-tight">{experience.title}</h1>
          <p className="text-[14px] text-[#5a6b72] mt-1.5">
            {dates && <span>{dates}</span>}
            {dates && edition?.location && <span> · </span>}
            {edition?.location && <span>{edition.location}</span>}
            {!dates && !edition?.location && edition?.label && <span>{edition.label}</span>}
          </p>

          {/* Short sell — what this trip is */}
          <p className="text-[14px] text-[#3d4f56] leading-relaxed mt-3">{blurb}</p>

          {/* A few shots from the experience */}
          {images.length > 0 && (
            <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="h-24 w-32 shrink-0 rounded-xl object-cover" />
              ))}
            </div>
          )}

          {/* What's included — a clean checklist, not loose pills */}
          <div className="mt-4 rounded-xl bg-[#f6faf8] border border-[#e4f0ea] p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#0f6e56] mb-2">What&apos;s included</p>
            <ul className="space-y-1.5">
              {included.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[13.5px] text-[#3d4f56]">
                  <svg className="w-4 h-4 mt-[1px] shrink-0 text-[#1d9e75]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Reward + price */}
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              {pkg?.price != null && (
                <p className="text-[13px] text-[#94a3a8]">from <span className="text-[20px] font-black text-[#00374a]">{fmtMoney(pkg.price, currency)}</span></p>
              )}
            </div>
            {friendReward != null && friendReward > 0 && (
              <span className="text-[12px] font-bold px-2.5 py-1 rounded-lg bg-[#e1f5ee] text-[#0f6e56]">
                {fmtMoney(friendReward, currency)} off with {inviterName ? `${inviterName}'s` : "this"} invite
              </span>
            )}
          </div>

          <div className="mt-5">
            <JoinSignup
              experienceId={experience.id}
              editionId={edition?.id ?? null}
              packageId={pkg?.id ?? null}
              inviteToken={invite.token}
              defaultName={invite.invitee_name ?? ""}
              defaultEmail={invite.invitee_email ?? ""}
            />
          </div>

          {/* Browse-first path — appears once the public Experience site is live.
              The invite token is stickied in a cookie (set by JoinSignup), so a
              friend who explores first and signs up later is still attributed. */}
          {flags.showExperience && experience.slug && (
            <Link href={`/experience/${experience.slug}`} className="mt-3 block text-center text-[13px] font-semibold text-[#00afdb]">
              See the full trip &amp; everything that&apos;s included →
            </Link>
          )}
        </div>
      </div>
      <p className="text-center text-[12px] text-[#a99] mt-4">NP7 GmbH · Premium watersports travel</p>
    </Shell>
  );
}
