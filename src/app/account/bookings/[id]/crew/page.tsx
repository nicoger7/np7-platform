import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberBooking, getCrewProfiles } from "@/lib/portal-data";
import { fmtDates } from "@/lib/portal-status";
import { PortalChrome } from "@/components/portal/portal-chrome";
import type { PublicProfile } from "@/lib/member-profile";

export const metadata: Metadata = { title: "Your crew — NP7" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function CrewPage({ params }: Props) {
  const { id } = await params;
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const b = await getMemberBooking(user.contactId, id);
  if (!b) notFound();

  const roster = b.edition?.id
    ? await getCrewProfiles(b.edition.id, user.contactId)
    : { going: 0, sharing: 0, profiles: [] };
  const notSharing = Math.max(0, roster.going - roster.sharing);

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-8 sm:py-12">
          <Link href={`/account/bookings/${b.id}`} className="text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a]">← Back to trip</Link>

          <div className="mt-3 mb-8">
            <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">Your crew</h1>
            <p className="text-[15px] text-[#6a7a80] mt-1.5">
              {b.experience?.title ?? "Your trip"}
              {b.edition?.date_start ? ` · ${fmtDates(b.edition.date_start, b.edition.date_end)}` : ""}
              {" · "}{roster.going} {roster.going === 1 ? "rider" : "riders"} going
            </p>
          </div>

          {b.edition?.whatsapp_group_link && (
            <a href={b.edition.whatsapp_group_link} target="_blank" rel="noopener"
              className="inline-flex items-center gap-2 mb-6 px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white bg-[#1aa851] hover:bg-[#16944a] transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.205zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.074-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
              Join the group chat
            </a>
          )}

          {roster.profiles.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#f0e6d6] p-8 text-center">
              <p className="text-[15px] text-[#6a7a80] mb-2">No one&apos;s shared a profile for this trip yet.</p>
              <p className="text-[13.5px] text-[#9aa6ac]">Be the first — <Link href="/account/profile" className="font-semibold text-[#00afdb] hover:underline">turn on your community profile</Link> and your crew will see you here.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {roster.profiles.map((p) => <CrewMember key={p.contactId} p={p} isYou={p.contactId === user.contactId} />)}
              </div>
              {notSharing > 0 && (
                <p className="text-[13px] text-[#9aa6ac] mt-5 flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20" /></svg>
                  {notSharing} more {notSharing === 1 ? "rider hasn't" : "riders haven't"} shared a profile.
                </p>
              )}
            </>
          )}

          <p className="text-[12.5px] text-[#9aa6ac] mt-8 leading-relaxed max-w-[640px]">
            You&apos;re shown here only if you&apos;ve turned on your community profile for trips. Change what you share anytime in <Link href="/account/profile" className="font-semibold text-[#00afdb] hover:underline">your profile</Link>.
          </p>
        </div>
      </main>
    </>
  );
}

function CrewMember({ p, isYou }: { p: PublicProfile; isYou: boolean }) {
  const place = [p.city, p.country].filter(Boolean).join(", ");
  const meta = [place, p.age != null ? `${p.age}` : ""].filter(Boolean).join(" · ");
  return (
    <div className="bg-white rounded-2xl border border-[#f0e6d6] p-4 text-center">
      {p.avatarUrl ? (
        <div className="w-14 h-14 mx-auto rounded-full bg-cover bg-center mb-2.5" style={{ backgroundImage: `url('${p.avatarUrl}')` }} />
      ) : (
        <div className="w-14 h-14 mx-auto rounded-full grid place-items-center bg-[#e8f6fb] text-[#00748f] text-[16px] font-bold mb-2.5">{p.initials}</div>
      )}
      <p className="text-[14px] font-bold text-[#00374a] truncate">{p.displayName}{isYou && <span className="text-[#9aa6ac] font-semibold"> · you</span>}</p>
      {p.username && <p className="text-[11.5px] text-[#9aa6ac] truncate">@{p.username}</p>}
      {meta && <p className="text-[12px] text-[#6a7a80] mt-1">{meta}</p>}
      {p.level && <span className="mt-2 inline-block text-[11px] font-bold bg-[#e1f5ee] text-[#0f6e56] px-2.5 py-0.5 rounded-md">{p.level}</span>}
    </div>
  );
}
