/**
 * Archive-before-delete. "Delete" sets `archived_at` (soft delete); the row is
 * hidden from lists, restorable, and only an owner can permanently purge it from
 * the Archive page. All helpers are TOLERANT of migration 039 not being applied
 * yet — they fall back to today's behaviour so nothing breaks before you run it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export type ArchiveEntity = {
  key: string;        // url-safe id used by the API
  table: string;      // db table
  label: string;      // singular
  plural: string;
  titleCol: string;   // column shown as the row's title
  subtitleCols?: string[];
  href?: (id: string) => string; // admin detail link, if any
};

export const ARCHIVE_ENTITIES: ArchiveEntity[] = [
  { key: "experiences", table: "exp_experiences", label: "Experience", plural: "Experiences", titleCol: "title", subtitleCols: ["location", "status"], href: (id) => `/admin/experiences/${id}` },
  { key: "editions", table: "exp_editions", label: "Edition", plural: "Editions", titleCol: "label", subtitleCols: ["year"], href: (id) => `/admin/editions/${id}` },
  { key: "packages", table: "exp_packages", label: "Package", plural: "Packages", titleCol: "name", subtitleCols: ["level"] },
  { key: "components", table: "exp_components", label: "Component", plural: "Components", titleCol: "name", subtitleCols: ["category"] },
  { key: "contacts", table: "contacts", label: "Contact / member", plural: "Contacts & members", titleCol: "name", subtitleCols: ["email"], href: (id) => `/admin/members/${id}` },
  { key: "hotels", table: "hotels", label: "Hotel", plural: "Hotels", titleCol: "name", subtitleCols: ["location"] },
  { key: "rooms", table: "exp_hotel_rooms", label: "Room booking (week)", plural: "Room bookings (weeks)", titleCol: "name", subtitleCols: ["hotel", "room_type"] },
  { key: "room_units", table: "exp_rooms", label: "Room (physical)", plural: "Rooms (physical)", titleCol: "name", subtitleCols: ["hotel", "room_type"] },
  { key: "vendors", table: "vendors", label: "Vendor", plural: "Vendors", titleCol: "name", subtitleCols: ["category"] },
  { key: "products", table: "hw_products", label: "Product", plural: "Products", titleCol: "title", subtitleCols: ["status"], href: (id) => `/admin/products/${id}` },
  { key: "hw_variants", table: "hw_variants", label: "Product variant", plural: "Product variants", titleCol: "name", subtitleCols: ["sku"] },
  { key: "hw_suppliers", table: "hw_suppliers", label: "Supplier", plural: "Suppliers", titleCol: "name", subtitleCols: ["country"], href: (id) => `/admin/suppliers/${id}` },
  { key: "hw_pos", table: "hw_purchase_orders", label: "Purchase order", plural: "Purchase orders", titleCol: "po_number", subtitleCols: ["status"], href: (id) => `/admin/purchasing/${id}` },
  { key: "hw_inbound", table: "hw_inbound_shipments", label: "Inbound shipment", plural: "Inbound shipments", titleCol: "reference", subtitleCols: ["status"], href: (id) => `/admin/purchasing/shipments/${id}` },
  { key: "hw_orders", table: "hw_orders", label: "Hardware order", plural: "Hardware orders", titleCol: "email", subtitleCols: ["status"], href: (id) => `/admin/orders/${id}` },
];

export const ARCHIVE_BY_KEY: Record<string, ArchiveEntity> = Object.fromEntries(ARCHIVE_ENTITIES.map((e) => [e.key, e]));
export const ARCHIVE_BY_TABLE: Record<string, ArchiveEntity> = Object.fromEntries(ARCHIVE_ENTITIES.map((e) => [e.table, e]));

export function missingArchivedCol(msg?: string | null): boolean {
  return !!msg && /archived_at/.test(msg) && /(does not exist|column|schema cache)/i.test(msg);
}

/** Drop archived rows from a fetched list. Tolerant: pre-migration the column is
 *  absent (archived_at undefined) so every row is kept. Use on select("*") lists.
 *  Untyped on `archived_at` because the generated DB types don't include it until
 *  migration 039 is applied + types regenerated. */
export function notArchived<T>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).filter((r) => !(r as { archived_at?: unknown } | null)?.archived_at);
}

/** Soft-delete = set archived_at. Pre-migration (column missing) → hard delete,
 *  so the existing Delete buttons keep working until 039 is applied. */
export async function softDelete(db: DB, table: string, id: string): Promise<{ ok: boolean; archived: boolean; error?: string }> {
  const { error } = await db.from(table).update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (!error) return { ok: true, archived: true };
  if (missingArchivedCol(error.message)) {
    const { error: delErr } = await db.from(table).delete().eq("id", id);
    return delErr ? { ok: false, archived: false, error: delErr.message } : { ok: true, archived: false };
  }
  return { ok: false, archived: false, error: error.message };
}

/**
 * Run a list query that excludes archived rows, retrying WITHOUT the filter if
 * `archived_at` doesn't exist yet. Usage:
 *   const { data, error } = await fetchActive((active) => {
 *     let q = db.from(t).select("*").order("name");
 *     return active ? q.is("archived_at", null) : q;
 *   });
 */
export async function fetchActive<T>(build: (active: boolean) => PromiseLike<{ data: T; error: { message?: string } | null }>): Promise<{ data: T; error: { message?: string } | null }> {
  const r = await build(true);
  if (r.error && missingArchivedCol(r.error.message)) return build(false);
  return r;
}
