import Link from "next/link";
import type { PublicProfile } from "@/lib/member-profile";

/**
 * The crew — the social highlight of the trip, so it's given real weight: a
 * tinted card with a bold "N riders going" headline, a row of larger avatars
 * (the actual faces), a clear "See who's going" call-to-action, and the WhatsApp
 * group chat as a one-tap pill. Sits under the page's "Your crew" label (no own
 * heading — avoids the doubled title). Self-hides upstream when empty.
 */
export function CrewCard({
  bookingId, going, sharing, profiles, whatsappLink,
}: {
  bookingId: string; going: number; sharing: number; profiles: PublicProfile[]; whatsappLink: string | null;
}) {
  const shown = profiles.slice(0, 7);
  const extra = sharing - shown.length;

  return (
    <div className="space-y-2.5">
      {sharing > 0 ? (
        <Link
          href={`/account/bookings/${bookingId}/crew`}
          className="group block rounded-2xl border border-[#c7e7f0] bg-gradient-to-br from-[#ecfaff] to-[#f3fbfd] p-4 sm:p-5 hover:shadow-[0_14px_36px_rgba(0,120,150,0.12)] hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-end justify-between gap-3 mb-3.5">
            <div className="min-w-0">
              <p className="text-[22px] font-black tracking-[-0.02em] text-[#00374a] leading-none">{going} {going === 1 ? "rider" : "riders"} going</p>
              <p className="text-[12.5px] text-[#5a7a86] mt-1.5">{sharing} sharing their profile</p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#00afdb] text-white text-[13px] font-bold px-4 py-2 group-hover:gap-2.5 transition-all">
              See who&apos;s going
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </div>
          <div className="flex items-center">
            {shown.map((p, i) => (
              <span
                key={p.contactId}
                className={`w-12 h-12 rounded-full grid place-items-center text-[13px] font-bold border-[2.5px] border-white bg-cover bg-center shadow-sm ${i ? "-ml-3.5" : ""} ${p.avatarUrl ? "" : "bg-[#d5eefa] text-[#00748f]"}`}
                style={p.avatarUrl ? { backgroundImage: `url('${p.avatarUrl}')` } : undefined}
                title={p.displayName ?? undefined}
              >
                {p.avatarUrl ? "" : p.initials}
              </span>
            ))}
            {extra > 0 && (
              <span className="w-12 h-12 -ml-3.5 rounded-full grid place-items-center text-[13px] font-bold border-[2.5px] border-white bg-[#e2edf0] text-[#5a6b72] shadow-sm">
                +{extra}
              </span>
            )}
          </div>
        </Link>
      ) : (
        <div className="rounded-2xl border border-[#c7e7f0] bg-gradient-to-br from-[#ecfaff] to-[#f3fbfd] p-4 sm:p-5">
          <p className="text-[18px] font-black tracking-[-0.02em] text-[#00374a] leading-tight">{going > 1 ? `${going} riders going` : "Your crew"}</p>
          <p className="text-[13px] text-[#5a7a86] mt-1.5">
            No one&apos;s shared a profile yet — <Link href="/account/profile" className="font-bold text-[#00849e] hover:underline">share yours</Link> to break the ice.
          </p>
        </div>
      )}

      {whatsappLink && (
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener"
          className="flex items-center justify-center gap-2 rounded-2xl border border-[#bfe6cd] bg-[#f1faf3] py-3 text-[14px] font-bold text-[#1aa851] hover:bg-[#e9f6ec] transition-colors"
        >
          <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.205zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.074-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
          Join the group chat
        </a>
      )}
    </div>
  );
}
