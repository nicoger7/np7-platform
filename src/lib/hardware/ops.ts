// NP7 Hardware supply-chain ops — the contract between admin UI, API routes and
// migration 20260727_116_hardware_supply_foundation.sql.
// See docs/hardware-backend-blueprint.md (§3.1, §3.3, §3.4).

// ── Purchase orders ──────────────────────────────────────────────────────────

export const PO_STATUSES = [
  "draft", "issued", "confirmed", "in_production", "ready_to_ship",
  "shipped", "partially_received", "received", "closed", "cancelled",
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

/** Allowed forward transitions. Receiving stock moves a PO to
 *  partially_received/received through the receipt endpoints — the manual
 *  ladder only walks production. Cancellation is possible until goods ship. */
export const PO_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  draft: ["issued", "cancelled"],
  issued: ["confirmed", "cancelled"],
  confirmed: ["in_production", "cancelled"],
  in_production: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["partially_received", "received"],
  partially_received: ["received"],
  received: ["closed"],
  closed: [],
  cancelled: [],
};

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  draft: "Draft", issued: "Issued", confirmed: "Confirmed",
  in_production: "In production", ready_to_ship: "Ready to ship",
  shipped: "Shipped", partially_received: "Partially received",
  received: "Received", closed: "Closed", cancelled: "Cancelled",
};

export const QC_TYPES = ["FAI", "IPC", "DUPRO", "PSI", "CLS"] as const;
export type QcType = (typeof QC_TYPES)[number];
export const QC_TYPE_LABELS: Record<QcType, string> = {
  FAI: "First article", IPC: "Initial production", DUPRO: "During production",
  PSI: "Pre-shipment", CLS: "Container loading",
};

export const MILESTONE_KINDS = [
  { kind: "materials_ordered", label: "Materials ordered" },
  { kind: "production_start", label: "Production start" },
  { kind: "sample_approved", label: "Sample approved" },
  { kind: "production_complete", label: "Production complete" },
  { kind: "inspection_passed", label: "Inspection passed" },
  { kind: "booked_freight", label: "Freight booked" },
  { kind: "custom", label: "Custom" },
] as const;

export const PAYMENT_KINDS = ["deposit", "balance", "other"] as const;

// ── Inbound shipments ────────────────────────────────────────────────────────

export const SHIPMENT_STATUSES = ["booked", "in_transit", "at_port", "cleared", "received", "closed"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** Manual ladder; "received" happens through the receive endpoint (it books
 *  stock + landed cost), never through a plain status PATCH. */
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  booked: ["in_transit"],
  in_transit: ["at_port", "cleared"],
  at_port: ["cleared"],
  cleared: [],            // → received via /receive
  received: ["closed"],
  closed: [],
};

export const SHIPMENT_MODES = ["sea", "air", "rail", "road"] as const;
export const COST_KINDS = ["freight", "duty", "insurance", "brokerage", "handling", "demurrage", "other"] as const;
export type CostKind = (typeof COST_KINDS)[number];
export const COST_KIND_LABELS: Record<string, string> = {
  freight: "Freight", duty: "Duty", insurance: "Insurance", brokerage: "Customs brokerage",
  handling: "Inbound handling", demurrage: "Demurrage", other: "Other",
};
export const ALLOCATION_BASES = ["value", "weight", "volume", "qty"] as const;
export type AllocationBasis = (typeof ALLOCATION_BASES)[number];

// ── Stock ────────────────────────────────────────────────────────────────────

export const LOCATION_KINDS = ["supplier", "in_transit", "3pl", "own_storage", "demo", "customer", "inventory_loss"] as const;
export const MOVEMENT_REASONS = [
  "po_receipt", "in_transit", "transfer", "sale", "return", "adjustment",
  "demo_out", "demo_return", "warranty_replacement", "write_off", "b2b_shipment", "correction",
] as const;

export const VARIANT_LIFECYCLES = ["draft", "active", "phase_out", "discontinued"] as const;

// ── Row types (as the admin APIs return them) ────────────────────────────────

export type Variant = {
  id: string; product_id: string; sku: string; ean: string | null; name: string;
  attributes: Record<string, unknown>; weight_g: number | null;
  box_l_mm: number | null; box_w_mm: number | null; box_h_mm: number | null;
  hs_code: string | null; customs_description: string | null;
  country_of_origin: string | null; preferential_origin: boolean;
  customs_value: number | null; serialized: boolean; rrp: number | null;
  lifecycle: string; sort_order: number;
};

export type Supplier = {
  id: string; name: string; country: string | null; currency: string;
  default_incoterm: string | null; default_payment_terms: string | null;
  contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  website: string | null; notes: string | null; created_at: string;
};

export type SupplierSku = {
  id: string; supplier_id: string; variant_id: string; supplier_item_code: string | null;
  unit_cost: number | null; currency: string; moq: number | null; order_multiple: number;
  lead_time_days: number | null; incoterm: string | null; preferential_origin: boolean;
  valid_from: string | null; valid_to: string | null; notes: string | null;
};

export type PurchaseOrder = {
  id: string; po_number: string; supplier_id: string; status: PoStatus;
  currency: string; incoterm: string | null; order_date: string | null;
  ex_factory_planned: string | null; ex_factory_actual: string | null;
  expected_receipt_date: string | null; payment_terms: string | null;
  notes: string | null; created_at: string;
};

export type PoLine = {
  id: string; po_id: string; variant_id: string; supplier_sku_id: string | null;
  qty_ordered: number; unit_cost: number | null;
  qty_shipped: number; qty_received: number; qty_rejected: number; notes: string | null;
};

export type StockLocation = {
  id: string; code: string; name: string; kind: string; is_virtual: boolean;
};

/** Money display for supplier currencies (costs are redacted for no-cost roles
 *  server-side before this ever renders). */
export function fmtAmount(n: number | null | undefined, currency = "EUR"): string {
  if (n == null) return "—";
  return `${currency === "EUR" ? "€" : currency + " "}${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
