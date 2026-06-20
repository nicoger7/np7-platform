import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/dashboard — one aggregated payload for the ops dashboard.
// Middleware already gates this to active team members.
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const today = new Date().toISOString().slice(0, 10);

  const head = (table: string, build?: (q: any) => any) => {
    let q = db.from(table).select("id", { count: "exact", head: true });
    if (build) q = build(q);
    return q;
  };

  const [
    expCount, bookCount, contactCount, upcomingEditionsCount,
    latestBookings, upcomingEditions, recentEmails, overdueTodos,
    openBookings, unmatchedPayments,
  ] = await Promise.all([
    head("exp_experiences"),
    head("exp_bookings"),
    head("contacts"),
    head("exp_editions", (q: any) => q.gte("date_start", today).eq("status", "published")),
    db.from("exp_bookings").select("id,name,status,agreed_price,created_at,exp_experiences(title)").order("created_at", { ascending: false }).limit(6),
    db.from("exp_editions").select("id,label,year,date_start,date_end,max_spots,spots_taken,exp_experiences(title,slug)").gte("date_start", today).order("date_start", { ascending: true }).limit(6),
    db.from("email_log").select("template_key,to_email,status,subject,sent_at,created_at").order("created_at", { ascending: false }).limit(6),
    head("todos", (q: any) => q.lt("due_date", today).not("status", "in", "(done,completed,cancelled,archived)")),
    // open revenue: not-yet-fully-paid live bookings
    db.from("exp_bookings").select("agreed_price").eq("final_payment_received", false).not("status", "in", "(lost,attended,cancelled)"),
    head("exp_payments", (q: any) => q.eq("unmatched", true)),
  ]);

  const sum = (rows: { agreed_price: number | null }[] | null) =>
    (rows ?? []).reduce((a, r) => a + (Number(r.agreed_price) || 0), 0);

  return NextResponse.json({
    counts: {
      experiences: expCount.count ?? 0,
      bookings: bookCount.count ?? 0,
      contacts: contactCount.count ?? 0,
      upcomingEditions: upcomingEditionsCount.count ?? 0,
    },
    latestBookings: latestBookings.data ?? [],
    upcomingEditions: upcomingEditions.data ?? [],
    recentEmails: recentEmails.data ?? [],
    overdueTodos: overdueTodos.count ?? 0,
    finance: {
      // TODO: role-gate per ROADMAP §8 (access matrix). Interim: visible to all team members.
      openRevenue: sum(openBookings.data),
      unmatchedPayments: unmatchedPayments.count ?? 0,
    },
  });
}
