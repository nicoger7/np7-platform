import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { DEFAULT_WAIVER, renderWaiver, waiverCompanyVars } from "@/lib/waiver";
import { fmtDates } from "@/lib/portal-status";
import { SignWaiver } from "@/components/portal/sign-waiver";

export const metadata: Metadata = { title: "Sign your waiver — NP7" };
export const dynamic = "force-dynamic";

export default async function WaiverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser().catch(() => null);
  if (!user) redirect("/account/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: booking } = await db
    .from("exp_bookings")
    .select("id, contact_id, exp_experiences(title, waiver_text), exp_editions(date_start, date_end), contacts(name)")
    .eq("id", id)
    .maybeSingle();
  if (!booking || booking.contact_id !== user.contactId) redirect("/account");

  const [{ data: cs }, { data: sig }] = await Promise.all([
    db.from("company_settings").select("*").eq("division", "experience").maybeSingle(),
    db.from("exp_waiver_signatures").select("signed_name, signed_at").eq("booking_id", id).maybeSingle(),
  ]);

  const fullName = String(booking.contacts?.name ?? user.name ?? "").trim();
  const [firstName, ...rest] = fullName.split(/\s+/);
  const ed = booking.exp_editions;
  const vars = {
    ...waiverCompanyVars(cs),
    firstName: firstName || "",
    lastName: rest.join(" "),
    experienceTitle: booking.exp_experiences?.title ?? "your trip",
    dates: ed ? fmtDates(ed.date_start, ed.date_end) : "",
    signedDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  };
  const html = renderWaiver(booking.exp_experiences?.waiver_text || DEFAULT_WAIVER, vars);

  return <SignWaiver bookingId={id} html={html} defaultName={fullName} signed={sig ? { name: sig.signed_name, at: sig.signed_at } : null} />;
}
