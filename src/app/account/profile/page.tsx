import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberProfile, getProfilePhotoChoices, getMemberLevelDetail } from "@/lib/portal-data";
import { displayLevel } from "@/lib/member-level";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { CommunityProfile } from "@/components/portal/community-profile";
import { YourLevel } from "@/components/portal/your-level";

export const metadata: Metadata = { title: "Profile — NP7" };
export const dynamic = "force-dynamic";

/** Profile = your PUBLIC, crew-facing identity (avatar, handle, level, what others
 *  see). Private details & settings live on /account/settings (the Account page). */
export default async function ProfilePage() {
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const [profile, photoChoices, levelDetail] = await Promise.all([
    getMemberProfile(user.contactId),
    getProfilePhotoChoices(user.contactId).catch(() => []),
    getMemberLevelDetail(user.contactId).catch(() => null),
  ]);
  const shownLevel = profile
    ? displayLevel({ self_level: profile.self_level, level: profile.level, level_status: profile.level_status }).level
    : null;

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-1.5">Your profile</h1>
          <p className="text-[15px] text-[#6a7a80] mb-8">
            How other NP7 riders see you on trips, reviews and spot notes — you choose exactly what&apos;s shown.{" "}
            <Link href="/account/settings" className="font-semibold text-[#00afdb] hover:underline">Manage your private details →</Link>
          </p>
          {profile ? (
            <div className="space-y-5">
              <CommunityProfile
                name={profile.name}
                country={profile.country}
                shownLevel={shownLevel}
                dateOfBirth={profile.date_of_birth}
                username={profile.username}
                avatarUrl={profile.avatar_url}
                displayCity={profile.display_city}
                visibility={profile.visibility}
                photoChoices={photoChoices}
              />
              {levelDetail && <YourLevel detail={levelDetail} />}
            </div>
          ) : <p className="text-[#6a7a80]">Profile not found.</p>}
        </div>
      </main>
    </>
  );
}
