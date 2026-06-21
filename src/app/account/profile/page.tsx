import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberProfile, getProfilePhotoChoices } from "@/lib/portal-data";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { ProfileForm } from "@/components/portal/profile-form";
import { CommunityProfile } from "@/components/portal/community-profile";

export const metadata: Metadata = { title: "Profile — NP7" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const [profile, photoChoices] = await Promise.all([
    getMemberProfile(user.contactId),
    getProfilePhotoChoices(user.contactId).catch(() => []),
  ]);

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-1.5">Your profile</h1>
          <p className="text-[15px] text-[#6a7a80] mb-8">Keep your details up to date — it helps us prep your perfect week.</p>
          {profile ? (
            <div className="space-y-5">
              <ProfileForm profile={profile} />
              <CommunityProfile
                name={profile.name}
                country={profile.country}
                level={profile.level}
                dateOfBirth={profile.date_of_birth}
                username={profile.username}
                avatarUrl={profile.avatar_url}
                displayCity={profile.display_city}
                visibility={profile.visibility}
                photoChoices={photoChoices}
              />
            </div>
          ) : <p className="text-[#6a7a80]">Profile not found.</p>}
        </div>
      </main>
    </>
  );
}
