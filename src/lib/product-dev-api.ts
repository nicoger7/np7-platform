/**
 * The repetitive half of the Product Development API.
 *
 * Seven entities need the same list / create / patch / soft-delete shape, and
 * writing that out ten times invites the two mistakes this section can least
 * afford: forgetting `updated_at` (there are no triggers in this database, so
 * the "recently changed" panel would quietly lie) and forgetting the write
 * guard (middleware only checks *reach*, never *edit*, so a view-only role
 * could otherwise POST straight through).
 *
 * Each route file stays a real file with its own handlers — the joins and the
 * ordering differ per entity — it just gets the boilerplate from here.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived, softDelete } from "@/lib/archive";
import { getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanEdit } from "@/lib/access";

/** Every mutating handler in this section runs under the same section key. */
const PD_PATH = "/api/admin/product-dev";

/**
 * Reject a mutating request from a member who only has *view* on this section.
 *
 * The middleware only ever calls `effectiveCanAccess`, so a role granted "view"
 * on the R&D sections can otherwise still POST/PATCH/DELETE straight through the
 * API — `effectiveCanEdit` exists but nothing upstream calls it.
 *
 * Lives here rather than in product-dev.ts because that module is imported by
 * client components for its row types, and `getRequestAccess` reaches for
 * `next/headers` — which fails the production build the moment it is pulled
 * into a client bundle.
 *
 * Returns a response to return, or null to proceed.
 */
export async function requirePdEdit(path: string = PD_PATH): Promise<NextResponse | null> {
  const access = await getRequestAccess();
  // No resolvable member → middleware already rejected the request; a null here
  // means the session vanished mid-flight, so fail closed rather than open.
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!effectiveCanEdit(access, path)) {
    return NextResponse.json({ error: "You have view-only access to Product Development." }, { status: 403 });
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = any;

export function pdDb(): DB {
  return createAdminClient() as DB;
}

export type CrudConfig = {
  table: string;
  /** Columns a PATCH/POST body may set. Anything else in the payload is dropped,
   *  so a ply editor can't smuggle `project_id` or `created_at`. */
  editable: readonly string[];
  /** Columns required on create. */
  required?: readonly string[];
  /** Default select for list + single reads (joins go here). */
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  /** Rows are keyed to a project; the list route filters on it when asked. */
  projectScoped?: boolean;
  /** Uses `active boolean` instead of `archived_at` (pd_materials). */
  softDeletable?: boolean;
};

/** "" → null, so clearing a text input stores NULL rather than an empty string. */
function clean(v: unknown): unknown {
  return v === "" ? null : v;
}

// ─── Entity configs ──────────────────────────────────────────────────────────
// The whitelists below are the only place a column becomes writable. Note what
// is deliberately absent from every one of them: id, project_id, created_at.
// A project's owner is set once, at creation.

export const PD_ENTITIES = {
  projects: {
    table: "pd_projects",
    editable: ["name", "slug", "kind", "status", "hw_product_id", "summary", "photos", "notes"],
    required: ["name", "slug"],
    orderBy: { column: "name" },
  },
  sources: {
    table: "pd_sources",
    editable: ["project_id", "kind", "title", "author_name", "author_org", "author_contact", "recipient", "received_at", "body", "confidence", "supplier_id", "external_ref", "files", "photos", "notes"],
    required: ["title"],
    projectScoped: true,
    orderBy: { column: "received_at", ascending: false },
  },
  constructions: {
    table: "pd_constructions",
    editable: ["project_id", "code", "name", "description", "sort_order", "source_id"],
    required: ["project_id", "code", "name"],
    projectScoped: true,
    orderBy: { column: "sort_order" },
  },
  molds: {
    table: "pd_molds",
    editable: ["project_id", "name", "kind", "key_dimension_mm", "key_dimension_label", "plate_material", "plate_thickness_mm", "has_alignment_pins", "supplier_id", "holder_supplier_id", "location_note", "status", "photos", "notes", "source_id"],
    required: ["project_id", "name"],
    projectScoped: true,
    orderBy: { column: "key_dimension_mm" },
  },
  materials: {
    table: "pd_materials",
    editable: ["slug", "name", "fibre", "form", "weave", "gsm", "default_orientation", "diagram_color", "supplier_id", "active", "notes"],
    required: ["slug", "name", "fibre", "form"],
    orderBy: { column: "name" },
    softDeletable: false, // deactivates instead — see pdDelete
  },
  layups: {
    table: "pd_layups",
    editable: ["project_id", "construction_id", "mold_id", "name", "ref", "revision", "superseded_by", "is_reference", "resin_pct_min", "resin_pct_max", "geometry", "files", "photos", "notes", "source_id"],
    required: ["project_id", "construction_id", "mold_id", "name"],
    projectScoped: true,
    select: "*, pd_constructions(id,name,code), pd_molds(id,name,key_dimension_mm)",
    orderBy: { column: "name" },
  },
  processes: {
    table: "pd_processes",
    editable: ["project_id", "name", "stage_order", "method", "summary", "construction_id", "source_id"],
    required: ["project_id", "name", "method"],
    projectScoped: true,
    orderBy: { column: "stage_order" },
  },
  // Sizes are child rows of a project (no archived_at — softDelete falls back
  // to a hard delete via its missing-column tolerance, which is what we want).
  sizes: {
    table: "pd_project_sizes",
    editable: ["project_id", "label", "length_cm", "box", "rake_deg", "back_end_mm", "sort_order", "notes", "source_id"],
    required: ["project_id", "label"],
    projectScoped: true,
    orderBy: { column: "length_cm" },
  },
} as const satisfies Record<string, CrudConfig>;

export type PdEntityKey = keyof typeof PD_ENTITIES;

/** Pick only the whitelisted keys present in the body. */
export function pickEditable(body: Record<string, unknown>, editable: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of editable) if (k in body) out[k] = clean(body[k]);
  return out;
}

export async function pdList(cfg: CrudConfig, request: NextRequest): Promise<NextResponse> {
  const db = pdDb();
  const sp = request.nextUrl.searchParams;
  let q = db.from(cfg.table).select(cfg.select ?? "*");
  if (cfg.projectScoped) {
    const projectId = sp.get("project_id");
    if (projectId) q = q.eq("project_id", projectId);
  }
  const search = sp.get("search");
  if (search) q = q.ilike("name", `%${search}%`);
  if (cfg.orderBy) q = q.order(cfg.orderBy.column, { ascending: cfg.orderBy.ascending ?? true });

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(cfg.softDeletable === false ? (data ?? []) : notArchived(data));
}

export async function pdCreate(cfg: CrudConfig, request: NextRequest): Promise<NextResponse> {
  const denied = await requirePdEdit(PD_PATH);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of cfg.required ?? []) {
    if (body[k] === undefined || body[k] === null || body[k] === "") {
      return NextResponse.json({ error: `${k} is required` }, { status: 400 });
    }
  }
  const insert = pickEditable(body, cfg.editable);
  const { data, error } = await pdDb().from(cfg.table).insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function pdPatch(cfg: CrudConfig, request: NextRequest, id: string): Promise<NextResponse> {
  const denied = await requirePdEdit(PD_PATH);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // updated_at by hand — there are zero triggers in this database.
  const update = { ...pickEditable(body, cfg.editable), updated_at: new Date().toISOString() };
  const { data, error } = await pdDb().from(cfg.table).update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function pdDelete(cfg: CrudConfig, id: string): Promise<NextResponse> {
  const denied = await requirePdEdit(PD_PATH);
  if (denied) return denied;

  const db = pdDb();
  if (cfg.softDeletable === false) {
    // pd_materials is global and referenced by plies via on-delete-restrict, so
    // it deactivates rather than archives — see migration 129.
    const { error } = await db.from(cfg.table).update({ active: false, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, deactivated: true });
  }
  const res = await softDelete(db, cfg.table, id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/**
 * Replace an ordered child list wholesale (plies on a layup, steps on a process).
 *
 * PUT rather than per-row PATCH because the editor works on the whole table at
 * once — you add a ply in the middle and every index after it shifts. Supabase
 * has no client-side transaction, so this deletes then inserts and reports
 * honestly if the insert half fails; the parent row is untouched either way, so
 * a failure is recoverable by re-saving rather than data loss elsewhere.
 */
export async function pdReplaceChildren(opts: {
  table: string;
  parentColumn: string;
  parentId: string;
  rows: Record<string, unknown>[];
  editable: readonly string[];
  request: NextRequest;
}): Promise<NextResponse> {
  const denied = await requirePdEdit(PD_PATH);
  if (denied) return denied;

  const db = pdDb();
  const now = new Date().toISOString();
  const insert = opts.rows.map((r) => ({
    ...pickEditable(r, opts.editable),
    [opts.parentColumn]: opts.parentId,
    updated_at: now,
  }));

  const { error: delErr } = await db.from(opts.table).delete().eq(opts.parentColumn, opts.parentId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  if (insert.length === 0) return NextResponse.json({ ok: true, count: 0 });

  const { data, error } = await db.from(opts.table).insert(insert).select();
  if (error) {
    return NextResponse.json(
      { error: `${error.message} — the previous rows were already cleared, so re-save to restore them.` },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, count: data?.length ?? 0, rows: data ?? [] });
}
