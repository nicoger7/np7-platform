import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * Money that arrived and never got an invoice.
 *
 * The invoice list can only show documents that exist, so the one thing it
 * could never show was the gap — €369k of recorded revenue against €55k of
 * invoices, and nobody looking at either number would see the difference.
 *
 * Scoped deliberately to the CURRENT company. Everything before NP7 GmbH
 * started issuing was Surfcenter's paperwork and is settled elsewhere; counting
 * it here would bury three live cases under forty dead ones. The cutoff is the
 * first document issued under the division's current invoice prefix, so it
 * moves by itself if the entity is ever renamed again rather than needing a
 * date pasted into the code.
 */

const BILLABLE = ["deposit_invoice", "downpayment_invoice", "final_invoice", "addon_invoice", "credit_note"];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: settings } = await db
    .from("company_settings").select("division, invoice_prefix, legal_name").eq("division", "experience").maybeSingle();
  const prefix: string | null = settings?.invoice_prefix ?? null;
  if (!prefix) return NextResponse.json({ since: null, rows: [], total: 0 });

  const { data: docs } = await db
    .from("documents")
    .select("booking_id, type, amount, status, invoice_number, issued_at")
    .eq("division", "experience");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allDocs = (docs ?? []) as any[];

  // When this company started invoicing. A pro-forma counts: it carries the
  // same prefix and marks the same moment.
  const own = allDocs
    .filter((d) => String(d.invoice_number ?? "").replace(/^PF-/, "").startsWith(prefix))
    .map((d) => String(d.issued_at ?? "").slice(0, 10))
    .filter(Boolean)
    .sort();
  const since = own[0] ?? null;
  if (!since) return NextResponse.json({ since: null, rows: [], total: 0 });

  const invoiced = new Map<string, number>();
  for (const d of allDocs) {
    if (!d.booking_id || d.status !== "issued" || !BILLABLE.includes(d.type)) continue;
    // A credit note is stored negative — add it, never subtract it.
    invoiced.set(d.booking_id, (invoiced.get(d.booking_id) ?? 0) + (Number(d.amount) || 0));
  }

  const { data: pays } = await db
    .from("exp_payments")
    .select("booking_id, amount, type, direction, status, date, received_at, created_at");
  const received = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of ((pays ?? []) as any[])) {
    if (!p.booking_id || p.direction === "cost" || p.status !== "paid") continue;
    const when = String(p.date ?? p.received_at ?? p.created_at ?? "").slice(0, 10);
    if (!when || when < since) continue;
    const signed = (p.type === "refund" ? -1 : 1) * (Number(p.amount) || 0);
    received.set(p.booking_id, (received.get(p.booking_id) ?? 0) + signed);
  }

  const ids = [...received.keys()];
  if (!ids.length) return NextResponse.json({ since, rows: [], total: 0 });
  const { data: bks } = await db
    .from("exp_bookings").select("id, name, status").in("id", ids);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map(((bks ?? []) as any[]).map((b) => [b.id, b]));

  const rows = ids
    .map((id) => {
      const b = byId.get(id);
      const got = r2(received.get(id) ?? 0);
      const billed = r2(invoiced.get(id) ?? 0);
      return { id, name: b?.name ?? null, status: b?.status ?? null, received: got, invoiced: billed, gap: r2(got - billed) };
    })
    // A lost booking's money is a refund story, not an invoicing one.
    .filter((r) => r.gap > 0.5 && String(r.status ?? "").toLowerCase() !== "lost")
    .sort((a, b) => b.gap - a.gap);

  return NextResponse.json({
    since,
    company: settings?.legal_name ?? null,
    rows,
    total: r2(rows.reduce((s, r) => s + r.gap, 0)),
  });
}
