import { NextResponse } from "next/server";
import { getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField, type EffectiveAccess, type WorldId } from "@/lib/access";

/**
 * Who may look at money, and whose money.
 *
 * Two separate questions, and the routes were only asking half of one.
 *
 * `effectiveCanSeeField(access, "money")` defaults its world argument to
 * "experience". Every finance and roadmap route called it that way, so a role
 * holding hardware.money and nothing else was refused everywhere, which is
 * exactly the NP7 Performance Team role. The three people it was created for
 * could not open the budget it was created for.
 *
 * The mirror of that bug is worse and was invisible while the first one masked
 * it: `world` and `entity` arrive in the query string and were never checked
 * against the caller's own worlds. Asking for ?world=experience was enough to
 * be handed Experience's entities. The two companies are legally separate, so
 * that is the one thing this file exists to prevent.
 *
 * A tier member (the legacy access_level path) still sees everything, which is
 * what "tier" has always meant elsewhere in the admin.
 */

export type MoneyAccess = { access: EffectiveAccess; world: WorldId };

const WORLDS: WorldId[] = ["experience", "hardware"];

/** Worlds this caller may enter at all. Tier members may enter any. */
export function permittedWorlds(access: EffectiveAccess): WorldId[] {
  if (access.kind === "tier") return WORLDS;
  return WORLDS.filter((w) => access.access.worlds.includes(w));
}

/** Worlds where this caller may additionally see figures. */
export function moneyWorlds(access: EffectiveAccess): WorldId[] {
  return permittedWorlds(access).filter((w) => effectiveCanSeeField(access, "money", w));
}

/**
 * Resolve the world a finance request is really operating in, and refuse if the
 * caller has no business there.
 *
 * `requested` is attacker-controlled, so it is validated rather than trusted:
 * it is honoured only when the caller may see money in it, and otherwise the
 * first world they legitimately have is used. A caller with none is refused.
 */
export async function requireMoneyAccess(
  requested?: string | null,
): Promise<MoneyAccess | NextResponse> {
  const access = await getRequestAccess();
  // No identity is not permission: getRequestAccess() returns null for an
  // unauthenticated or non-team caller.
  if (!access) {
    return NextResponse.json({ error: "You don't have access to financials." }, { status: 403 });
  }
  const allowed = moneyWorlds(access);
  if (!allowed.length) {
    return NextResponse.json({ error: "You don't have access to financials." }, { status: 403 });
  }
  const asked = requested === "experience" || requested === "hardware" ? (requested as WorldId) : null;
  if (asked && !allowed.includes(asked)) {
    // Naming the other company's world is not a mistake to be silently
    // corrected into showing them their own; it is a refusal.
    return NextResponse.json(
      { error: "You don't have access to that company's financials." },
      { status: 403 },
    );
  }
  return { access, world: asked ?? allowed[0] };
}

/** True when the result of requireMoneyAccess is a refusal. */
export const isDenied = (r: MoneyAccess | NextResponse): r is NextResponse => r instanceof NextResponse;

/* ── Owning the record, not just the page ─────────────────────────────────────
 *
 * Gating the ROUTE is not enough. Every one of these endpoints takes an id in
 * the query string or the body, looks it up with the service-role client and
 * acts on it, without ever asking which company the id belongs to. Somebody
 * with Performance access could read, edit and delete NP7 Experience's plans,
 * budget lines, recorded costs and allocations simply by naming them.
 *
 * These resolve an id back to the company that owns it and refuse when that
 * company is not one the caller may see. Each is one extra query, which is the
 * right price for the thing the two companies are legally required to have.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const REFUSE = () =>
  NextResponse.json({ error: "That belongs to another company." }, { status: 403 });

/** The world an entity trades in, or null when it is unknown. */
async function worldOfEntity(db: Db, entityId: string | null | undefined): Promise<WorldId | null> {
  if (!entityId) return null;
  const { data } = await db.from("fin_entities").select("division").eq("id", entityId).maybeSingle();
  const d = data?.division;
  return d === "experience" || d === "hardware" ? d : null;
}

/** Refuse unless `entityId` is a company this caller may see money in. */
export async function assertEntity(
  db: Db, entityId: string | null | undefined, worlds: WorldId[],
): Promise<NextResponse | null> {
  const world = await worldOfEntity(db, entityId);
  // An entity that does not exist, or that belongs to no world, is not a
  // licence to proceed. Unknown is refused, not waved through.
  return world && worlds.includes(world) ? null : REFUSE();
}

/** Refuse unless the plan belongs to a company this caller may see. */
export async function assertPlan(
  db: Db, planId: string | null | undefined, worlds: WorldId[],
): Promise<NextResponse | null> {
  if (!planId) return REFUSE();
  const { data } = await db.from("fin_plans").select("entity_id").eq("id", planId).maybeSingle();
  return assertEntity(db, data?.entity_id, worlds);
}

/** Refuse unless the cost object belongs to a company this caller may see. */
export async function assertObject(
  db: Db, objectId: string | null | undefined, worlds: WorldId[],
): Promise<NextResponse | null> {
  if (!objectId) return REFUSE();
  const { data } = await db.from("fin_cost_objects").select("entity_id").eq("id", objectId).maybeSingle();
  return assertEntity(db, data?.entity_id, worlds);
}

/** Refuse unless the recorded cost belongs to a company this caller may see. */
export async function assertActual(
  db: Db, actualId: string | null | undefined, worlds: WorldId[],
): Promise<NextResponse | null> {
  if (!actualId) return REFUSE();
  const { data } = await db.from("fin_actuals").select("entity_id").eq("id", actualId).maybeSingle();
  return assertEntity(db, data?.entity_id, worlds);
}

/** Refuse unless the budget line's plan belongs to a company this caller may see. */
export async function assertLine(
  db: Db, lineId: string | null | undefined, worlds: WorldId[],
): Promise<NextResponse | null> {
  if (!lineId) return REFUSE();
  const { data } = await db.from("fin_plan_lines").select("plan_id").eq("id", lineId).maybeSingle();
  return assertPlan(db, data?.plan_id, worlds);
}

/** Pick the world to work in: the one asked for when allowed, else the
 *  caller's own. Never both companies, which is what a missing world used to
 *  mean and is how the other company's entity could be reached by id alone. */
export function clampWorld(asked: string | null | undefined, worlds: WorldId[]): WorldId {
  return asked === "experience" || asked === "hardware"
    ? (worlds.includes(asked) ? asked : worlds[0])
    : worlds[0];
}
