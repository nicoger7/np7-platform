import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { flags } from "@/lib/flags";
import { PortalChrome } from "@/components/portal/portal-chrome";

export const metadata: Metadata = { title: "Cart — NP7" };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  if (!flags.showCart) notFound();
  const user = await getPortalUser();
  if (!user) redirect("/account/login");

  return (
    <>
      <PortalChrome section="hardware" />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-1.5">Your cart</h1>
          <p className="text-[15px] text-[#6a7a80] mb-8">Gear you&apos;re ready to order shows up here.</p>

          <div className="bg-white rounded-2xl border border-[#f0e6d6] p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-[#fff2dd] grid place-items-center mb-5">
              <svg className="w-7 h-7 text-[#caa25a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
              </svg>
            </div>
            <h2 className="text-xl font-extrabold text-[#00374a] mb-2">Your cart is empty</h2>
            <p className="text-[14.5px] text-[#6a7a80] leading-relaxed mb-6 max-w-md mx-auto">
              Add a board or fin from the workshop and it&apos;ll wait for you here, ready to check out.
            </p>
            <Link href="/hardware" className="inline-block px-7 py-3.5 rounded-full text-[14px] font-bold text-black bg-[#c2ff38] hover:bg-[#d4ff66] transition-colors">
              Shop gear
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
