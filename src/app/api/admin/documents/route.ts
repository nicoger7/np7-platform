import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Admin routes are gated by middleware; no per-route auth check needed.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMissingTable(message?: string | null) {
  return (
    !!message &&
    /(documents|company_settings|relation|schema cache|does not exist)/i.test(message)
  );
}

async function attachSignedUrl(
  db: ReturnType<typeof createAdminClient>,
  row: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!row.file_path) return { ...row, signedUrl: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any).storage
    .from("documents")
    .createSignedUrl(row.file_path as string, 3600);
  return { ...row, signedUrl: data?.signedUrl ?? null };
}

/**
 * Flatten the joined rows onto the shape the page reads.
 *
 * The join was here all along — and then thrown away. The page asks for
 * `contact_name` and falls back to `contact_id`, so every row in the finance
 * list showed a raw UUID where the guest's name belongs. On an invoice list,
 * of all places: an accountant could not tell whose invoice they were looking
 * at without opening the PDF.
 */
function flattenNames(row: Record<string, unknown>): Record<string, unknown> {
  const booking = row.exp_bookings as { id?: string; name?: string | null } | null | undefined;
  const contact = row.contacts as { id?: string; name?: string | null } | null | undefined;
  return { ...row, booking_name: booking?.name ?? null, contact_name: contact?.name ?? null };
}

// ─── GET /api/admin/documents ─────────────────────────────────────────────────
// Optional query params: division, type, from (ISO date), to (ISO date), q

export async function GET(request: NextRequest) {
  const db = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = db as any;

  const { searchParams } = new URL(request.url);
  const division = searchParams.get("division");
  const type = searchParams.get("type");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const q = (searchParams.get("q") ?? "").trim();

  /*
   * Searching an invoice list means searching for a PERSON at least as often as
   * for a number, and the name lives on another table. Resolve the matching
   * contacts first and fold their ids into the same OR — one extra round trip
   * beats making the embed an inner join and silently dropping every document
   * whose contact was deleted.
   */
  let contactIds: string[] = [];
  if (q) {
    const { data: cs } = await dbAny.from("contacts").select("id").ilike("name", `%${q}%`).limit(200);
    contactIds = ((cs ?? []) as { id: string }[]).map((c) => c.id);
  }
  const searchOr = q
    ? [
        `invoice_number.ilike.%${q}%`,
        `title.ilike.%${q}%`,
        ...(contactIds.length ? [`contact_id.in.(${contactIds.join(",")})`] : []),
      ].join(",")
    : null;

  let query = dbAny
    .from("documents")
    .select(
      `*,
       exp_bookings(id, name),
       contacts(id, name)`
    )
    .order("created_at", { ascending: false });

  if (division) query = query.eq("division", division);
  if (type) query = query.eq("type", type);
  if (from) query = query.gte("issued_at", from);
  if (to) query = query.lte("issued_at", to);
  if (searchOr) query = query.or(searchOr);

  const { data, error } = await query;

  if (error) {
    // If join columns don't exist (pre-migration), fall back to plain select
    if (
      /(exp_bookings|contacts|column)/i.test(error.message || "") &&
      /(does not exist|schema cache|relation)/i.test(error.message || "")
    ) {
      let fallback = dbAny
        .from("documents")
        .select("*")
        .order("created_at", { ascending: false });
      if (division) fallback = fallback.eq("division", division);
      if (type) fallback = fallback.eq("type", type);
      if (from) fallback = fallback.gte("issued_at", from);
      if (to) fallback = fallback.lte("issued_at", to);
      if (searchOr) fallback = fallback.or(searchOr);

      const { data: fallbackData, error: fallbackError } = await fallback;

      if (fallbackError) {
        if (isMissingTable(fallbackError.message)) {
          return NextResponse.json({ documents: [] });
        }
        return NextResponse.json({ error: fallbackError.message }, { status: 400 });
      }

      const rows = await Promise.all(
        (fallbackData ?? []).map((row: Record<string, unknown>) =>
          attachSignedUrl(db, row)
        )
      );
      return NextResponse.json({ documents: rows });
    }

    if (isMissingTable(error.message)) {
      return NextResponse.json({ documents: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = await Promise.all(
    (data ?? []).map((row: Record<string, unknown>) => attachSignedUrl(db, flattenNames(row)))
  );

  return NextResponse.json({ documents: rows });
}
