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

// ─── GET /api/admin/documents ─────────────────────────────────────────────────
// Optional query params: division, type, from (ISO date), to (ISO date)

export async function GET(request: NextRequest) {
  const db = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = db as any;

  const { searchParams } = new URL(request.url);
  const division = searchParams.get("division");
  const type = searchParams.get("type");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

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
    (data ?? []).map((row: Record<string, unknown>) => attachSignedUrl(db, row))
  );

  return NextResponse.json({ documents: rows });
}
