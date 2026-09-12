/**
 * Turning a request body into a row exp_costs will accept.
 *
 * Every column a person can set passes through here, for a new line and for
 * an edit alike, so the two cannot drift apart: the edition page's Costs tab
 * sends {item, amounts, date, status, edition_id, experience_id}, the costs
 * page sends the scope, the provenance and the bucket as well, and both land
 * in the same shape. Unknown keys are dropped rather than passed to the
 * database, which is what stops a stray field from becoming a column write.
 *
 * Pure. The database still enforces every rule with a constraint; this exists
 * so the answer arrives as a sentence before the round trip.
 */
import { isCostScope, isMarginClass, validateScope } from "./costs";

const STATUSES = new Set(["confirmed", "estimate", "cancelled", "unlisted"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Existing = {
  scope: string | null; edition_id: string | null; experience_id: string | null; year: number | null; scope_reason: string | null;
  actual_amount: number | string | null; actual_provenance: string | null; actual_note: string | null;
  margin_class: string | null;
} | null;

const money = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
};
const text = (v: unknown): string | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

export function buildCostWrite(
  body: Record<string, unknown>,
  existing: Existing,
): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const row: Record<string, unknown> = {};

  if (body.item !== undefined || !existing) {
    const item = text(body.item);
    if (!item) return { ok: false, error: "Give the cost a name." };
    row.item = item;
  }

  // ── where it belongs ───────────────────────────────────────────────────────
  const scopeTouched = ["scope", "edition_id", "experience_id", "year", "scope_reason"].some((k) => k in body);
  if (scopeTouched || !existing) {
    const merged = {
      scope: "scope" in body ? body.scope : existing?.scope ?? (body.edition_id ? "edition" : undefined),
      edition_id: "edition_id" in body ? body.edition_id : existing?.edition_id,
      experience_id: "experience_id" in body ? body.experience_id : existing?.experience_id,
      year: "year" in body ? body.year : existing?.year,
      scope_reason: "scope_reason" in body ? body.scope_reason : existing?.scope_reason,
    };
    if (merged.scope !== undefined && !isCostScope(merged.scope)) {
      return { ok: false, error: "Scope must be edition, experience_year, year or general." };
    }
    // Moving a cost off its edition with only the edition cleared is the old
    // page's "experience-wide" gesture. It now has to say what it means.
    if (merged.scope === undefined || (merged.scope === "edition" && !merged.edition_id && merged.experience_id)) {
      if (!merged.edition_id) {
        return { ok: false, error: "Pick the edition this cost belongs to, or choose a broader scope (shared across an experience's trips in a year, a whole year, or general) and say why." };
      }
      merged.scope = "edition";
    }
    const v = validateScope(merged);
    if (!v.ok) return v;
    Object.assign(row, v.row);
    // A cost moved onto an edition without naming the experience: the row
    // must not keep the OLD experience, or the guard will (rightly) refuse
    // it. Null lets the trigger fill it from the edition.
    if (v.row.scope === "edition" && "edition_id" in body && !("experience_id" in body)) row.experience_id = null;
  }

  // ── status and amounts ─────────────────────────────────────────────────────
  if (body.status !== undefined) {
    const s = body.status === null || body.status === "" ? "estimate" : String(body.status);
    if (!STATUSES.has(s)) return { ok: false, error: "Status must be estimate, confirmed, cancelled or unlisted." };
    row.status = s;
  }
  const est = money(body.estimated_amount);
  if (est === undefined && "estimated_amount" in body) return { ok: false, error: "The estimate has to be a number." };
  if (est !== undefined) row.estimated_amount = est;

  // ── the typed actual, and how honest it is ─────────────────────────────────
  const actualTouched = ["actual_amount", "actual_provenance", "actual_note"].some((k) => k in body);
  if (actualTouched) {
    const act = "actual_amount" in body ? money(body.actual_amount) : existing?.actual_amount ?? null;
    if (act === undefined) return { ok: false, error: "The actual has to be a number." };
    row.actual_amount = act;
    if (act === null) {
      row.actual_provenance = null;
      row.actual_note = "actual_note" in body ? text(body.actual_note) ?? null : existing?.actual_note ?? null;
    } else {
      const prov = "actual_provenance" in body ? body.actual_provenance : existing?.actual_provenance ?? null;
      if (prov !== null && prov !== undefined && prov !== "" && prov !== "off_bank" && prov !== "unverified") {
        return { ok: false, error: "A typed actual is either off_bank (with a note) or unverified. Bank-backed money is attached, not typed." };
      }
      const note = "actual_note" in body ? text(body.actual_note) ?? null : existing?.actual_note ?? null;
      if (prov === "off_bank" && !note) {
        return { ok: false, error: "An actual recorded off the bank needs a note saying where the number comes from (Nico's card, cash, an offset)." };
      }
      // Nothing said: the trigger files it as unverified, which is the honest default.
      if (prov === "off_bank" || prov === "unverified") row.actual_provenance = prov;
      else if ("actual_provenance" in body) row.actual_provenance = null;
      row.actual_note = note;
    }
  }

  // ── the § 25 bucket ────────────────────────────────────────────────────────
  if ("margin_class" in body) {
    const cls = body.margin_class === null || body.margin_class === "" ? null : body.margin_class;
    if (cls !== null && !isMarginClass(cls)) return { ok: false, error: `"${String(cls)}" is not one of the three § 25 buckets.` };
    const scope = (row.scope as string | undefined) ?? existing?.scope ?? "edition";
    if (cls === "travel_input" && scope === "general") {
      return { ok: false, error: "A general cost cannot be a Reisevorleistung: a travel input is bought for a trip." };
    }
    row.margin_class = cls;
    if (cls !== (existing?.margin_class ?? null)) {
      row.margin_class_at = cls ? new Date().toISOString() : null;
      row.margin_class_note = cls ? text(body.margin_class_note) ?? "Sorted on the costs page" : null;
    } else if ("margin_class_note" in body) {
      row.margin_class_note = text(body.margin_class_note) ?? null;
    }
  }

  // ── the rest ───────────────────────────────────────────────────────────────
  if ("date" in body) {
    const d = text(body.date) ?? null;
    if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: "The date has to be YYYY-MM-DD." };
    row.date = d;
  }
  if ("notes" in body) row.notes = text(body.notes) ?? null;
  if ("component_id" in body) {
    const c = body.component_id;
    if (c !== null && c !== "" && !(typeof c === "string" && UUID.test(c))) return { ok: false, error: "component_id is not an id." };
    row.component_id = c === "" ? null : c;
  }
  if ("unplanned" in body) row.unplanned = body.unplanned === true;

  if (existing) row.updated_at = new Date().toISOString();
  return { ok: true, row };
}
