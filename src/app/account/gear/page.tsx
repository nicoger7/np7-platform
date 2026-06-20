import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { flags } from "@/lib/flags";
import { PortalChrome } from "@/components/portal/portal-chrome";

export const metadata: Metadata = { title: "My gear — NP7" };
export const dynamic = "force-dynamic";

export default async function GearPage() {
  if (!flags.showGear) notFound();
  const user = await getPortalUser();
  if (!user) redirect("/account/login");

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-1.5">My gear</h1>
          <p className="text-[15px] text-[#6a7a80] mb-8">Your board &amp; fin orders and their build status will live here.</p>

          <div className="bg-white rounded-2xl border border-[#f0e6d6] p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-[#fff2dd] grid place-items-center mb-5">
              <svg className="w-7 h-7 text-[#caa25a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" />
              </svg>
            </div>
            <h2 className="text-xl font-extrabold text-[#00374a] mb-2">No gear orders yet</h2>
            <p className="text-[14.5px] text-[#6a7a80] leading-relaxed mb-6 max-w-md mx-auto">
              When you order a custom board or fin from the NP7 workshop, you&apos;ll track it here from build to delivery.
            </p>
            <Link href="/hardware" className="inline-block px-7 py-3.5 rounded-full text-[14px] font-bold text-black bg-[#c2ff38] hover:bg-[#d4ff66] transition-colors">
              Browse the workshop
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
