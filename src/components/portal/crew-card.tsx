import Link from "next/link";
import type { PublicProfile } from "@/lib/member-profile";

/**
 * Trip-dashboard teaser for the crew, merged with the WhatsApp "your group"
 * link. Shows a stack of opted-in avatars + counts and links to the full roster.
 * Self-hides upstream when there's nothing to show (no group link and no one
 * sharing). Purely presentational — the roster is projected server-side.
 */
export function CrewCard({
  bookingId, going, sharing, profiles, whatsappLink,
}: {
  bookingId: string; going: number; sharing: number; profiles: PublicProfile[]; whatsappLink: string | null;
}) {
  const shown = profiles.slice(0, 5);
  const extra = sharing - shown.length;

  return (
    <section className="bg-white rounded-2xl border border-[#f0e6d6] p-6">
      <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb] mb-4">Your crew</h2>

      {sharing > 0 ? (
        <Link href={`/account/bookings/${bookingId}/crew`} className="block group">
          <div className="flex items-center mb-2.5">
            {shown.map((p, i) => (
              <span key={p.contactId} className={`w-9 h-9 rounded-full grid place-items-center text-[12px] font-bold border-2 border-white bg-cover bg-center ${i ? "-ml-2.5" : ""} ${p.avatarUrl ? "" : "bg-[#e8f6fb] text-[#00748f]"}`}
                style={p.avatarUrl ? { backgroundImage: `url('${p.avatarUrl}')` } : undefined}>
                {p.avatarUrl ? "" : p.initials}
              </span>
            ))}
            {extra > 0 && <span className="w-9 h-9 -ml-2.5 rounded-full grid place-items-center text-[12px] font-bold border-2 border-white bg-[#eef3f4] text-[#6a7a80]">+{extra}</span>}
          </div>
          <p className="text-[13.5px] text-[#6a7a80]">{going} {going === 1 ? "rider" : "riders"} going · {sharing} sharing their profile</p>
          <span className="inline-flex items-center gap-1.5 mt-2 text-[13px] font-bold text-[#00afdb] group-hover:gap-2.5 transition-all">
            See who&apos;s going
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </Link>
      ) : (
        <p className="text-[13.5px] text-[#6a7a80]">
          {going > 1 ? `${going} riders are going. ` : ""}No one&apos;s shared a profile yet — <Link href="/account/profile" className="font-semibold text-[#00afdb] hover:underline">share yours</Link> to break the ice.
        </p>
      )}

      {whatsappLink && (
        <div className="border-t border-[#f3ede2] mt-4 pt-4">
          <a href={whatsappLink} target="_blank" rel="noopener" className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#1aa851] hover:underline">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.205zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.074-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
            Join the group chat
          </a>
        </div>
      )}
    </section>
  );
}
