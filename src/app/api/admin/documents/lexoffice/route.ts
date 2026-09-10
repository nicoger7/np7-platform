/**
 * What has gone into lexoffice, what has not, and pushing the ones that have not.
 *
 * Lives under /api/admin/documents on purpose. Both gates in src/lib/access.ts
 * match by path prefix and FAIL OPEN for a path nobody registered, so a new
 * top-level route would have been readable by every team member until someone
 * noticed. Nesting it here means it inherits OWNER_ONLY and the "documents"
 * section grant without a new entry that could be forgotten.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate, requireSectionEdit } from "@/lib/admin-auth";
import { previewPush, pushDocument, PUSHABLE_TYPES, type DocumentForPush } from "@/lib/lexoffice/push";
import { listAccounts, accountReadiness, apiKeyFor } from "@/lib/lexoffice/accounts";

/** The push reads and writes the live books, so it must not be cached or
    prerendered under any circumstances. */
export const dynamic = "force-dynamic";

const SELECT =
  "id, booking_id, division, type, invoice_number, title, amount, currency, status, issued_at, file_path, meta, " +
  "lexoffice_voucher_id, lexoffice_account_id, lexoffice_pushed_at, lexoffice_remark, lexoffice_error, lexoffice_attempts";

// ─── GET: the three piles ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { searchParams } = new URL(request.url);
  const previewId = searchParams.get("preview");

  // A single document, fully worked out: exactly what would be sent, and every
  // reason it would be refused.
  if (previewId) {
    const { data } = await db.from("documents").select(SELECT).eq("id", previewId).maybeSingle();
    if (!data) return NextResponse.json({ error: "No such document" }, { status: 404 });
    const p = await previewPush(data as DocumentForPush);
    return NextResponse.json({ preview: { ...p, account: p.account ? { id: p.account.id, label: p.account.label } : null } });
  }

  const { data, error } = await db
    .from("documents")
    .select(SELECT)
    .eq("status", "issued")
    .in("type", PUSHABLE_TYPES as readonly string[])
    .order("issued_at", { ascending: false })
    .limit(500);

  if (error) {
    // Before migration 236 the lexoffice columns do not exist. Say so plainly
    // instead of showing an empty list that looks like "nothing to do".
    return NextResponse.json({ error: error.message, needsMigration: /lexoffice/.test(error.message) }, { status: 200 });
  }

  const rows = (data ?? []) as DocumentForPush[];
  const accounts = await listAccounts();
  const accountStatus = await Promise.all(
    accounts.map(async (a) => ({
      id: a.id,
      label: a.label,
      envKey: a.env_key,
      hasKey: !!apiKeyFor(a),
      enabled: a.enabled,
      validFrom: a.valid_from,
      validTo: a.valid_to,
      salesCategoryId: a.sales_category_id,
      problems: (await accountReadiness(a)).map((p) => p.message),
    })),
  );

  return NextResponse.json({
    documents: rows.map((r) => ({
      ...r,
      lexofficeState: r.lexoffice_voucher_id ? "pushed" : r.lexoffice_error ? "failed" : "pending",
    })),
    accounts: accountStatus,
  });
}

// ─── POST: push one, or push the ones that are ready ──────────────────────────

export async function POST(request: NextRequest) {
  // Writing into a company's books is a Documents edit, not a read.
  const denied = await requireSectionEdit("documents");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { documentId?: string; documentIds?: string[] };
  const ids = body.documentIds?.length ? body.documentIds : body.documentId ? [body.documentId] : [];
  if (!ids.length) return NextResponse.json({ error: "Nothing to push" }, { status: 400 });

  /*
   * Sequential, never Promise.all. lexoffice allows two requests a second and
   * a push is three calls (look up, create, attach), so a parallel batch would
   * trip the limit and fail halfway through creating vouchers that cannot be
   * deleted. The client throttles per key as well; this keeps the intent
   * visible at the call site.
   */
  const results: { documentId: string; ok: boolean; voucherId?: string; already?: boolean; reason?: string }[] = [];
  for (const id of ids.slice(0, 50)) {
    const out = await pushDocument(id);
    results.push(
      out.ok
        ? { documentId: id, ok: true, voucherId: out.voucherId, already: out.already }
        : { documentId: id, ok: false, reason: out.reason },
    );
  }

  return NextResponse.json({ results });
}
