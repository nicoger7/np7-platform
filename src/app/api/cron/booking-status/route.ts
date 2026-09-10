import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cronAuthorized, CRON_DENIED } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A trip that has been paid for and has finished is a trip somebody went on.
 *
 * Nico: "why mark attended as manual? if he paid and didnt cancel it should
 * automatically make attended after the date." Nothing in the codebase advanced
 * a booking to `attended` — it was a person remembering, per guest, per week,
 * which is how the Treuestufen ladder and the "have you been on a trip yet"
 * checks end up quietly wrong.
 *
 * The rule is exactly his: PAID, not lost, not archived, and the edition has
 * ended. Nothing else moves.
 *
 * What deliberately does NOT move: a `confirmed` booking whose trip has ended.
 * Those people almost certainly travelled too, but confirmed means the balance
 * was never paid, and Alaçatı 2026 has two of them owing €7,595 between them.
 * Marking those attended files them away as finished business, which is the
 * opposite of what should happen to a debt. They are reported instead, so a
 * human decides.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json(CRON_DENIED, { status: 401 });

  /* Untyped on purpose. database.types.ts does not carry exp_editions, so the
     generated client refuses the table that this job is entirely about. The
     emails cron solves the same problem with `createAdminClient() as any`;
     this is the same escape hatch, said out loud and scoped to one function
     rather than to every query in the file. */
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const today = new Date().toISOString().slice(0, 10);

  // Editions that are over. One query, then a filter in memory, because the
  // date lives on the edition and the status lives on the booking.
  const { data: finished, error: edErr } = await db
    .from("exp_editions")
    .select("id, label, date_end")
    .not("date_end", "is", null)
    .lt("date_end", today);
  if (edErr) return NextResponse.json({ error: edErr.message }, { status: 500 });
  if (!finished?.length) return NextResponse.json({ advanced: 0, note: "no finished editions" });

  const editionIds = finished.map((e) => e.id);
  const labelById = new Map(finished.map((e) => [String(e.id), String(e.label ?? "")]));

  const { data: bookings, error: bkErr } = await db
    .from("exp_bookings")
    .select("id, name, status, edition_id")
    .in("edition_id", editionIds)
    .in("status", ["paid", "confirmed"]);
  /*
   * Checked, and loudly. The first version of this filtered `archived_at is
   * null` as well, copying the pattern from tables that have that column.
   * exp_bookings does not, so PostgREST rejected the whole query, `data` came
   * back undefined, and the job reported "0 advanced" with a 200 — a cron that
   * looks green every morning and has never once done its job. Cancellation is
   * carried by the `lost` status here, which the status filter above already
   * excludes, so nothing is lost by dropping the column.
   */
  if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });

  const toAdvance = (bookings ?? []).filter((b) => b.status === "paid");
  const owing = (bookings ?? []).filter((b) => b.status === "confirmed");

  const advanced: string[] = [];
  for (const b of toAdvance) {
    const { error } = await db
      .from("exp_bookings")
      .update({ status: "attended" })
      .eq("id", b.id)
      // Conditioned on the status we read, so two overlapping runs cannot both
      // claim the same booking and nothing that moved meanwhile is overwritten.
      .eq("status", "paid");
    if (error) continue;
    advanced.push(`${b.name ?? b.id} · ${labelById.get(String(b.edition_id)) ?? ""}`);
  }

  return NextResponse.json({
    advanced: advanced.length,
    bookings: advanced,
    // Travelled but never settled up. Not touched, on purpose.
    paidUpNeeded: owing.map((b) => `${b.name ?? b.id} · ${labelById.get(String(b.edition_id)) ?? ""}`),
  });
}
