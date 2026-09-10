/**
 * The § 25 Abs. 5 record, and the one write it needs.
 *
 * GET  returns the per-trip margin list, or a CSV of it with ?format=csv.
 * PATCH sorts a cost line into travel input, own service or overhead, which is
 *       the classification the whole record depends on and which nothing in
 *       the system had a place for until now.
 *
 * Under /api/admin/documents so both gates in access.ts cover it by prefix.
 * This reads and writes numbers that decide a VAT liability; it is owner-only
 * for the same reason the invoice list is.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate, requireSectionEdit } from "@/lib/admin-auth";
import { buildMarginRecord, marginRecordCsv } from "@/lib/lexoffice/margin";

export const dynamic = "force-dynamic";

const MARGIN_CLASSES = ["travel_input", "own_service", "overhead"];

export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const from = searchParams.get("from") || `${year}-01-01`;
  const to = searchParams.get("to") || `${year}-12-31`;

  // The unsorted cost lines, so the page can offer the work rather than only
  // report that it is outstanding.
  if (searchParams.get("costs") === "unclassified") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("exp_costs")
      .select("id, item, notes, status, date, actual_amount, estimated_amount, margin_class, edition_id, experience_id, exp_experiences(title), exp_editions(label, date_start)")
      .is("margin_class", null)
      .neq("status", "cancelled")
      .order("date", { ascending: false, nullsFirst: false })
      .limit(400);
    if (error) return NextResponse.json({ error: error.message }, { status: 200 });
    return NextResponse.json({ costs: data ?? [] });
  }

  try {
    const record = await buildMarginRecord(from, to);
    if (searchParams.get("format") === "csv") {
      return new NextResponse(
        // A BOM, so Excel in a German locale opens the umlauts as umlauts.
        "﻿" + marginRecordCsv(record),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="NP7-Margenermittlung-${from}-bis-${to}.csv"`,
          },
        },
      );
    }
    return NextResponse.json(record);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}

export async function PATCH(request: NextRequest) {
  /* A cost's § 25 bucket moves the VAT, so this asks for edit on the costs
     section even though the URL sits under documents. That means both grants
     are needed, the documents one from the middleware's path mapping and this
     one, which is the conservative direction for a field that decides a tax
     liability. */
  const denied = await requireSectionEdit("exp_costs");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    costIds?: string[];
    marginClass?: string | null;
    note?: string | null;
  };
  const ids = (body.costIds ?? []).filter(Boolean).slice(0, 200);
  if (!ids.length) return NextResponse.json({ error: "No cost lines given" }, { status: 400 });
  const cls = body.marginClass ?? null;
  if (cls !== null && !MARGIN_CLASSES.includes(cls)) {
    return NextResponse.json({ error: `"${cls}" is not one of the three § 25 buckets` }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db
    .from("exp_costs")
    .update({
      margin_class: cls,
      margin_class_note: body.note ?? null,
      // Cleared along with the class, so "when was this decided" never survives
      // the decision being taken back.
      margin_class_at: cls ? new Date().toISOString() : null,
    })
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: ids.length });
}
