import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberProfile } from "@/lib/portal-data";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { ProfileForm } from "@/components/portal/profile-form";

export const metadata: Metadata = { title: "Account — NP7" };
export const dynamic = "force-dynamic";

/** Account = your PRIVATE details & settings (only you + the NP7 team see these).
 *  The PUBLIC, crew-facing identity lives on /account/profile. */
export default async function AccountPage() {
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const profile = await getMemberProfile(user.contactId);

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-1.5">Account</h1>
          <p className="text-[15px] text-[#6a7a80] mb-8">
            Your private details &amp; settings — only you and the NP7 team see these.{" "}
            <Link href="/account/profile" className="font-semibold text-[#00afdb] hover:underline">Edit your public profile →</Link>
          </p>
          {profile ? <ProfileForm profile={profile} /> : <p className="text-[#6a7a80]">Account not found.</p>}
        </div>
      </main>
    </>
  );
}
