// Server-side helpers for the hardware supply chain (API routes only).
// Stock changes go through hw_record_movement (atomic ledger + levels);
// landed-cost allocation follows the blueprint: duty by value, freight by
// volume/weight, fallback value → qty when a metric is missing.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type LocationRow = { id: string; code: string; name: string; kind: string; is_virtual: boolean };

export async function getLocationsByCode(db: Db): Promise<Record<string, LocationRow>> {
  const { data, error } = await db.from("hw_stock_locations").select("*");
  if (error) throw new Error(`locations: ${error.message}`);
  const map: Record<string, LocationRow> = {};
  for (const l of data ?? []) map[l.code] = l;
  return map;
}

export async function recordMovement(db: Db, m: {
  variant_id: string; from: string; to: string; qty: number; reason: string;
  ref_type?: string; ref_id?: string; serial_id?: string;
  unit_cost?: number | null; note?: string; actor?: string;
}): Promise<string> {
  const { data, error } = await db.rpc("hw_record_movement", {
    p_variant: m.variant_id, p_from: m.from, p_to: m.to, p_qty: m.qty,
    p_reason: m.reason, p_ref_type: m.ref_type ?? null, p_ref_id: m.ref_id ?? null,
    p_serial: m.serial_id ?? null, p_unit_cost: m.unit_cost ?? null,
    p_note: m.note ?? null, p_actor: m.actor ?? null, p_occurred_at: new Date().toISOString(),
  });
  if (error) throw new Error(`movement: ${error.message}`);
  return data as string;
}

/** Re-derive a PO's received status from its lines and log the transition. */
export async function recalcPoReceiptStatus(db: Db, poId: string, actor = "system") {
  const [{ data: po }, { data: lines }] = await Promise.all([
    db.from("hw_purchase_orders").select("id,status").eq("id", poId).single(),
    db.from("hw_po_lines").select("qty_ordered,qty_received").eq("po_id", poId),
  ]);
  if (!po || !lines?.length) return;
  const anyReceived = lines.some((l: { qty_received: number }) => l.qty_received > 0);
  const allReceived = lines.every((l: { qty_ordered: number; qty_received: number }) => l.qty_received >= l.qty_ordered);
  const target = allReceived ? "received" : anyReceived ? "partially_received" : null;
  if (!target || po.status === target || ["closed", "cancelled"].includes(po.status)) return;
  await db.from("hw_purchase_orders").update({ status: target, updated_at: new Date().toISOString() }).eq("id", poId);
  await db.from("hw_po_status_events").insert({ po_id: poId, from_status: po.status, to_status: target, actor });
}

/** The balance payment is gated on a passed pre-shipment inspection: if any
 *  blocking PSI exists and none of them passed, the gate is closed. */
export async function psiGateBlocks(db: Db, poId: string): Promise<boolean> {
  const { data: psis } = await db.from("hw_qc_inspections")
    .select("result,blocks_balance_payment").eq("po_id", poId).eq("type", "PSI").eq("blocks_balance_payment", true);
  if (!psis?.length) return false;
  return !psis.some((p: { result: string | null }) => p.result === "pass" || p.result === "pass_with_notes");
}

// ── Landed-cost allocation ───────────────────────────────────────────────────

export type AllocLine = {
  key: string;           // po_line or inbound_line id
  qty: number;
  value_eur: number;     // qty × unit_cost × fx
  weight_g: number;      // qty × boxed weight
  volume_mm3: number;    // qty × boxed volume
};

/** Distribute each cost row over the lines by its basis; returns key → allocated EUR.
 *  Falls back value → qty when the chosen metric is zero across all lines. */
export function allocateCosts(
  costs: { amount_eur: number; basis: string }[],
  lines: AllocLine[],
): Map<string, number> {
  const out = new Map<string, number>(lines.map((l) => [l.key, 0]));
  const metric = (l: AllocLine, basis: string): number =>
    basis === "weight" ? l.weight_g : basis === "volume" ? l.volume_mm3 : basis === "qty" ? l.qty : l.value_eur;

  for (const cost of costs) {
    let basis = cost.basis;
    let total = lines.reduce((a, l) => a + metric(l, basis), 0);
    if (total <= 0) { basis = "value"; total = lines.reduce((a, l) => a + metric(l, basis), 0); }
    if (total <= 0) { basis = "qty"; total = lines.reduce((a, l) => a + metric(l, basis), 0); }
    if (total <= 0) continue;
    for (const l of lines) out.set(l.key, (out.get(l.key) ?? 0) + (cost.amount_eur * metric(l, basis)) / total);
  }
  return out;
}
