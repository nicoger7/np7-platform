/**
 * PATCH /api/admin/exp-costs/classify — sort cost lines into their § 25 bucket,
 * many at once.
 *
 * The same write /api/admin/documents/margin makes, offered where the lines
 * live. A bucket decides a VAT liability, so it asks for EDIT on the costs
 * section rather than mere reach. A general cost can never become a
 * Reisevorleistung; those are reported back by name and left untouched
 * rather than failing the whole batch.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireSectionEdit } from "@/lib/admin-auth";
import { isMarginClass } from "@/lib/finance/costs";

export async function PATCH(request: NextRequest) {
  const denied = await requireSectionEdit("exp_costs");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { costIds?: unknown; marginClass?: unknown; note?: unknown };
  const ids = (Array.isArray(body.costIds) ? body.costIds : []).filter((x): x is string => typeof x === "string" && !!x).slice(0, 300);
  if (!ids.length) return NextResponse.json({ error: "No cost lines given" }, { status: 400 });
  const cls = body.marginClass === null || body.marginClass === undefined || body.marginClass === "" ? null : body.marginClass;
  if (cls !== null && !isMarginClass(cls)) {
    return NextResponse.json({ error: `"${String(cls)}" is not one of the three § 25 buckets` }, { status: 400 });
  }
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: rows } = await db.from("exp_costs").select("id, item, scope").in("id", ids);
  const found = (rows ?? []) as { id: string; item: string; scope: string }[];
  const refused = cls === "travel_input" ? found.filter((r) => r.scope === "general") : [];
  const allowed = found.filter((r) => !refused.some((x) => x.id === r.id)).map((r) => r.id);

  if (allowed.length) {
    const { error } = await db
      .from("exp_costs")
      .update({
        margin_class: cls,
        margin_class_note: cls ? note ?? "Sorted on the costs page" : null,
        // Cleared along with the class, so "when was this decided" never
        // survives the decision being taken back.
        margin_class_at: cls ? new Date().toISOString() : null,
      })
      .in("id", allowed);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    updated: allowed.length,
    refused: refused.map((r) => ({ id: r.id, item: r.item, why: "A general cost cannot be a Reisevorleistung" })),
  });
}
