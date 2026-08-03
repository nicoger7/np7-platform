/**
 * Admin access tiers. Pure (no server deps) so it can be imported by the
 * middleware, server components, and the client shell alike.
 *
 * - owner   → full access (finance, company/legal settings, team & payroll).
 * - manager → everything operational, but NOT the owner-only sections below.
 *
 * NULL / unknown levels normalise to "owner" so a not-yet-migrated or
 * unset member is never locked out; the owner downgrades from the Team editor.
 */
export type AccessLevel = "owner" | "manager";

export const ACCESS_LEVELS: AccessLevel[] = ["owner", "manager"];

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  owner: "Owner — full access",
  manager: "Manager — no Finance, Settings or Team admin",
};

/** Sections only an Owner may open — pages AND their APIs. */
const OWNER_ONLY = [
  "/admin/payments", "/admin/exp-costs", "/admin/vendors", "/admin/documents",
  "/admin/settings", "/admin/team", "/admin/roles", "/admin/hours-log", "/admin/analytics",
  "/api/admin/payments", "/api/admin/exp-costs", "/api/admin/vendors", "/api/admin/documents",
  "/api/admin/company-settings", "/api/admin/team", "/api/admin/roles", "/api/admin/hours-log", "/api/admin/analytics",
  // Product Development — the manufacturing IP. This list gates the legacy
  // owner/manager TIERS; OWNER_ONLY_SECTIONS gates granular roles. Both are
  // consulted, so a section that should be owner-only must appear in both.
  "/admin/product-dev", "/api/admin/product-dev",
  // Permanent delete from the archive is owner-only (archive + restore are not).
  "/api/admin/archive/purge",
];

export function normalizeLevel(v: unknown): AccessLevel {
  return v === "manager" ? "manager" : "owner";
}

function underPrefix(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

export function isOwnerOnlyPath(path: string): boolean {
  return OWNER_ONLY.some((p) => underPrefix(p, path));
}

// Personal tools every active team member can always reach, regardless of role —
// e.g. logging your OWN hours. (The APIs still restrict you to your own data.)
// Personal, not departmental: your own hours and your own to-dos. Everyone with
// an admin account keeps these whatever their role grants. /admin/login is
// obviously never gated — you are not signed in yet.
const ALWAYS_AVAILABLE = ["/admin/hours-log", "/api/admin/hours-log", "/api/admin/active-time", "/admin/todos", "/api/admin/todos", "/admin/login"];
export function isPersonalPath(path: string): boolean {
  return ALWAYS_AVAILABLE.some((p) => underPrefix(p, path));
}

/** Whether a member at `level` may access `path` (an /admin or /api/admin path). */
export function canAccess(level: AccessLevel, path: string): boolean {
  if (isPersonalPath(path)) return true;
  if (level === "owner") return true;
  return !isOwnerOnlyPath(path);
}

// ─────────────────────────────────────────────────────────────────────────────
// Granular custom roles (migration 045). A role grants WORLDS + per-SECTION level
// + FIELD-group visibility. Members without a role keep the owner/manager tiers
// above; members with one are governed entirely by their role's `RoleAccess`.
// This module is pure so middleware, server code and the client shell share it.
// ─────────────────────────────────────────────────────────────────────────────

export const WORLDS = [
  { id: "experience", label: "NP7 Experience" },
  { id: "hardware", label: "NP7 Hardware" },
  { id: "product-dev", label: "Product Development" },
  { id: "analytics", label: "Analytics" },
] as const;
export type WorldId = (typeof WORLDS)[number]["id"];

export type SectionLevel = "none" | "view" | "edit";

export type Section = {
  key: string;
  label: string;
  world: WorldId;
  group: string;
  /** /admin + /api/admin path prefixes this section owns. */
  paths: string[];
};

/** The admin sections a role can be granted, mirroring the sidebar nav. */
export const SECTIONS: Section[] = [
  // Experience · Operations
  { key: "experiences", label: "Experiences & editions", world: "experience", group: "Operations", paths: ["/admin/experiences", "/admin/editions", "/admin/go-live", "/api/admin/experiences", "/api/admin/editions", "/api/admin/go-live"] },
  { key: "bookings", label: "Bookings", world: "experience", group: "Operations", paths: ["/admin/bookings", "/api/admin/bookings"] },
  { key: "contacts", label: "Contacts", world: "experience", group: "Operations", paths: ["/admin/contacts", "/api/admin/contacts"] },
  { key: "invites", label: "Trip invites", world: "experience", group: "Operations", paths: ["/admin/invites", "/api/admin/invites"] },
  { key: "hotel_rooms", label: "Hotel rooms", world: "experience", group: "Operations", paths: ["/admin/hotel-rooms", "/api/admin/hotel-rooms"] },
  { key: "hotels", label: "Hotels", world: "experience", group: "Operations", paths: ["/admin/hotels", "/api/admin/hotels"] },
  { key: "packages", label: "Packages", world: "experience", group: "Operations", paths: ["/admin/packages", "/api/admin/packages"] },
  { key: "components", label: "Components", world: "experience", group: "Operations", paths: ["/admin/components", "/api/admin/components"] },
  // Experience · Website
  { key: "file_storage", label: "File storage", world: "experience", group: "Website", paths: ["/admin/images", "/api/admin/images"] },
  { key: "event_content", label: "Event content", world: "experience", group: "Website", paths: ["/admin/content", "/api/admin/content"] },
  { key: "members", label: "Member management", world: "experience", group: "Website", paths: ["/admin/members", "/api/admin/members"] },
  { key: "magazine", label: "Magazine", world: "experience", group: "Website", paths: ["/admin/blog", "/api/admin/blog"] },
  { key: "spotguide", label: "Spotguide", world: "experience", group: "Website", paths: ["/admin/spotguide", "/admin/spots", "/api/admin/spotguide", "/api/admin/spots"] },
  { key: "destinations", label: "Destinations", world: "experience", group: "Website", paths: ["/admin/destinations", "/api/admin/destinations"] },
  // /api/admin/reviews (exp_reviews) belongs here: it backs this page and, as a
  // read-only pool, the edition Reviews tab. NOTE it can only live in ONE section —
  // sectionForPath keeps the longest match and breaks ties on FIRST-wins, so
  // listing a path under two sections does not OR their grants, it silently hands
  // the path to whichever section appears earlier in this array.
  { key: "guest_reviews", label: "Guest reviews", world: "experience", group: "Website", paths: ["/admin/guest-reviews", "/api/admin/guest-reviews", "/api/admin/reviews"] },
  { key: "waivers", label: "Waivers", world: "experience", group: "Website", paths: ["/admin/waivers", "/api/admin/waivers"] },
  // Experience · Team
  { key: "team", label: "Employees & roles", world: "experience", group: "Team", paths: ["/admin/team", "/admin/roles", "/api/admin/team", "/api/admin/roles"] },
  { key: "hours_log", label: "Hours log", world: "experience", group: "Team", paths: ["/admin/hours-log", "/api/admin/hours-log"] },
  // Experience · Finance
  { key: "payments", label: "Payments", world: "experience", group: "Finance", paths: ["/admin/payments", "/api/admin/payments"] },
  { key: "vouchers", label: "Gift vouchers", world: "experience", group: "Finance", paths: ["/admin/vouchers", "/api/admin/vouchers"] },
  { key: "exp_costs", label: "Experience costs", world: "experience", group: "Finance", paths: ["/admin/exp-costs", "/api/admin/exp-costs", "/api/admin/hours-cost"] },
  { key: "vendors", label: "Vendors", world: "experience", group: "Finance", paths: ["/admin/vendors", "/api/admin/vendors"] },
  { key: "documents", label: "Documents", world: "experience", group: "Finance", paths: ["/admin/documents", "/api/admin/documents"] },
  { key: "settings", label: "Company settings", world: "experience", group: "Finance", paths: ["/admin/settings", "/api/admin/company-settings"] },
  // Experience · Automation
  { key: "emails", label: "Emails & templates", world: "experience", group: "Automation", paths: ["/admin/emails", "/admin/email-templates", "/admin/email-log", "/admin/campaigns", "/api/admin/emails", "/api/admin/email-templates", "/api/admin/email-log", "/api/admin/campaigns", "/api/admin/audience"] },
  // Hardware
  { key: "products", label: "Products", world: "hardware", group: "Hardware", paths: ["/admin/products", "/api/admin/products", "/api/admin/variants"] },
  { key: "product_pages", label: "Product pages (website)", world: "hardware", group: "Hardware", paths: ["/admin/product-pages", "/api/admin/products"] },
  { key: "orders", label: "Orders", world: "hardware", group: "Hardware", paths: ["/admin/orders", "/api/admin/orders"] },
  { key: "inventory", label: "Inventory", world: "hardware", group: "Hardware", paths: ["/admin/inventory", "/api/admin/inventory"] },
  { key: "returns", label: "Returns", world: "hardware", group: "Hardware", paths: ["/admin/returns", "/api/admin/returns"] },
  { key: "purchasing", label: "Purchasing", world: "hardware", group: "Hardware", paths: ["/admin/purchasing", "/api/admin/purchasing", "/api/admin/inbound"] },
  { key: "suppliers", label: "Suppliers", world: "hardware", group: "Hardware", paths: ["/admin/suppliers", "/api/admin/suppliers"] },
  // Product Development. Registering these is NOT cosmetic: effectiveCanAccess
  // FAILS OPEN for section-less paths (see sectionForPath below), so R&D routes
  // shipped without an entry here are readable by every active team member —
  // including the Photographer role, which is scoped to Experience by design.
  // sectionForPath is longest-prefix-wins, so /admin/product-dev/library lands
  // on pd_library while everything else under the prefix lands on pd_knowledge.
  { key: "pd_knowledge", label: "R&D build sheets", world: "product-dev", group: "Product Dev", paths: ["/admin/product-dev", "/api/admin/product-dev"] },
  { key: "pd_library", label: "R&D media", world: "product-dev", group: "Product Dev", paths: ["/admin/product-dev/library", "/api/admin/product-dev/media"] },
  // Analytics
  { key: "member_activity", label: "Member activity", world: "experience", group: "Operations", paths: ["/admin/member-activity", "/api/admin/member-activity"] },
  { key: "archive", label: "Archive (deleted records)", world: "experience", group: "Operations", paths: ["/admin/archive", "/api/admin/archive"] },
  { key: "applications", label: "Signature-trip applications", world: "experience", group: "Operations", paths: ["/admin/applications"] },
  { key: "surveys", label: "Interest surveys", world: "experience", group: "Automation", paths: ["/admin/surveys", "/api/admin/surveys"] },
  { key: "pipeline_rules", label: "Pipeline rules", world: "experience", group: "Automation", paths: ["/admin/pipeline-rules", "/api/admin/pipeline-rules"] },
  { key: "task_rules", label: "Task rules", world: "experience", group: "Automation", paths: ["/admin/task-rules", "/api/admin/task-rules"] },
  { key: "withdrawals", label: "Withdrawals (Widerruf)", world: "experience", group: "Finance", paths: ["/admin/widerrufe", "/api/admin/widerrufe"] },
  { key: "skills", label: "Progression skills", world: "experience", group: "Website", paths: ["/admin/skills", "/api/admin/skills"] },
  // `boards` and `product_reviews` used to sit here, pointing at two placeholder
  // pages in the product-dev world. Both pages are gone (replaced by the real
  // build-sheet section), and `product_reviews` also claimed /api/admin/reviews —
  // which serves exp_reviews for the EXPERIENCE world's Guest Reviews page and
  // the edition Reviews tab. Owning it from product-dev meant any role without
  // the product-dev world got a 403 on both. That path now lives with
  // guest_reviews, above, where its data actually belongs.
  { key: "analytics", label: "Business analytics", world: "analytics", group: "Analytics", paths: ["/admin/analytics", "/api/admin/analytics"] },
];

/** Sensitive field groups a role can be allowed to see (redacted otherwise). */
export type FieldKey = "money" | "costs" | "contact_pii";
export const FIELDS: { key: FieldKey; label: string; description: string }[] = [
  { key: "money", label: "Prices & payments", description: "Agreed prices, payments, invoices and revenue figures." },
  { key: "costs", label: "Internal costs & margins", description: "Component costs, package margins, vendor and edition costs." },
  { key: "contact_pii", label: "Contact personal data", description: "Email, phone, billing address and date of birth." },
];

/** Per-world visibility of the sensitive field groups (absent/false = redacted). */
export type FieldVis = Partial<Record<FieldKey, boolean>>;

export type RoleAccess = {
  worlds: WorldId[];
  sections: Record<string, SectionLevel>;
  /** world → (group → can-see). A field is visible only in the worlds that grant it. */
  fields: Partial<Record<WorldId, FieldVis>>;
};

/** The sensitive field groups a world can ever expose (union of its sections). */
export function worldFields(world: WorldId): FieldKey[] {
  const set = new Set<FieldKey>();
  for (const s of SECTIONS) {
    if (s.world !== world) continue;
    for (const f of SECTION_EXPOSES[s.key] || []) set.add(f);
  }
  return FIELDS.map((f) => f.key).filter((k) => set.has(k));
}

/** Which sensitive field groups a section's data can contain. */
export const SECTION_EXPOSES: Record<string, FieldKey[]> = {
  bookings: ["money", "costs", "contact_pii"],
  contacts: ["contact_pii"],
  members: ["contact_pii", "money"],
  payments: ["money"],
  exp_costs: ["money", "costs"],
  vendors: ["costs"],
  documents: ["money"],
  packages: ["money", "costs"],
  components: ["costs"],
  // Hardware supply chain: factory costs + landed costs are margin-sensitive.
  suppliers: ["costs"],
  purchasing: ["money", "costs"],
  inventory: ["costs"],
  orders: ["money", "contact_pii"],
  returns: ["money", "contact_pii"],
};

/** Which of those exposures are actually enforced (redacted) server-side today.
 *  Anything a section EXPOSES but doesn't appear here will still leak through. */
export const REDACTION_COVERAGE: Record<string, FieldKey[]> = {
  bookings: ["money", "costs", "contact_pii"],
  contacts: ["contact_pii"],
  members: ["contact_pii", "money"],
};

/** Sections a role can reach that may still SHOW a hidden field group (because
 *  redaction isn't wired there yet) — surfaced as a warning in the role editor. */
export function accessLeaks(access: RoleAccess): { key: string; label: string; fields: FieldKey[] }[] {
  const out: { key: string; label: string; fields: FieldKey[] }[] = [];
  for (const sec of SECTIONS) {
    if (!access.worlds.includes(sec.world)) continue;
    if ((access.sections[sec.key] ?? "none") === "none") continue;
    const exposes = SECTION_EXPOSES[sec.key] || [];
    const covered = REDACTION_COVERAGE[sec.key] || [];
    const seen = access.fields[sec.world] || {};
    const leaked = exposes.filter((f) => seen[f] !== true && !covered.includes(f));
    if (leaked.length) out.push({ key: sec.key, label: sec.label, fields: leaked });
  }
  return out;
}

export const EMPTY_ACCESS: RoleAccess = { worlds: [], sections: {}, fields: {} };

/** Coerce an arbitrary jsonb blob into a safe RoleAccess. Tolerates the legacy
 *  flat `fields` shape ({money:true,…}) by expanding it onto the role's worlds. */
export function normalizeAccess(raw: unknown): RoleAccess {
  const a = (raw ?? {}) as Partial<RoleAccess>;
  const worldIds = WORLDS.map((w) => w.id) as string[];
  const fieldKeys = FIELDS.map((f) => f.key) as string[];
  const worlds = Array.isArray(a.worlds) ? (a.worlds.filter((w) => worldIds.includes(w as string)) as WorldId[]) : [];

  const rawFields = (a.fields ?? {}) as Record<string, unknown>;
  const fields: Partial<Record<WorldId, FieldVis>> = {};
  // Legacy flat shape: top-level keys are field groups → apply to every granted world.
  if (Object.keys(rawFields).some((k) => fieldKeys.includes(k))) {
    const flat: FieldVis = {};
    for (const k of fieldKeys) if (rawFields[k] === true) (flat as Record<string, boolean>)[k] = true;
    for (const w of worlds) fields[w] = { ...flat };
  } else {
    for (const w of worldIds) {
      const wv = rawFields[w];
      if (wv && typeof wv === "object") {
        const fv: FieldVis = {};
        for (const k of fieldKeys) if ((wv as Record<string, unknown>)[k] === true) (fv as Record<string, boolean>)[k] = true;
        fields[w as WorldId] = fv;
      }
    }
  }

  return {
    worlds,
    sections: a.sections && typeof a.sections === "object" ? (a.sections as Record<string, SectionLevel>) : {},
    fields,
  };
}

/** Union several roles into one effective access — so a member can hold a
 *  different role per world. Worlds union; the most permissive section level
 *  wins (edit > view > none); a field is visible if any role grants it. */
export function mergeAccess(list: RoleAccess[]): RoleAccess {
  const rank: Record<SectionLevel, number> = { none: 0, view: 1, edit: 2 };
  const out: RoleAccess = { worlds: [], sections: {}, fields: {} };
  const worlds = new Set<WorldId>();
  for (const a of list) {
    for (const w of a.worlds) worlds.add(w);
    for (const [k, v] of Object.entries(a.sections)) {
      if (rank[v] > rank[out.sections[k] ?? "none"]) out.sections[k] = v;
    }
    for (const [w, fv] of Object.entries(a.fields)) {
      const tgt = (out.fields[w as WorldId] ??= {}) as Record<string, boolean>;
      for (const [k, v] of Object.entries(fv ?? {})) if (v) tgt[k] = true;
    }
  }
  out.worlds = [...worlds];
  return out;
}

/** Sections only an Owner reaches (Finance, Company Settings, Team admin, Analytics,
 *  R&D) — the same set as the legacy owner-only paths, expressed as section keys.
 *  Product Development is here because the build sheets ARE the manufacturing IP
 *  and the sources carry partners' personal contact details; `builtinAccess`
 *  otherwise hands every world except Analytics to Manager automatically. */
export const OWNER_ONLY_SECTIONS = ["payments", "exp_costs", "vendors", "documents", "settings", "team", "hours_log", "analytics", "pd_knowledge", "pd_library"];

/** Built-in roles. Their access is computed live from the catalog (so Owner always
 *  covers new sections); stored in team_roles with a system_key (migrations 049/059). */
export type BuiltinRoleKey = "owner" | "manager" | "photographer";
export const BUILTIN_ROLES: { key: BuiltinRoleKey; name: string; description: string }[] = [
  { key: "owner", name: "Owner", description: "Full access to everything." },
  { key: "manager", name: "Manager", description: "Everything except Finance, Company Settings and Team admin." },
  { key: "photographer", name: "Photographer", description: "Experience photos & website content only — no prices, costs or personal data." },
];

export function builtinAccess(systemKey: string): RoleAccess {
  const allFields: FieldVis = { money: true, costs: true, contact_pii: true };
  const fieldsFor = (worlds: WorldId[]): Partial<Record<WorldId, FieldVis>> =>
    Object.fromEntries(worlds.map((w) => [w, { ...allFields }]));
  const sections: Record<string, SectionLevel> = {};
  if (systemKey === "photographer") {
    // Photo & website-content work in the Experience world only. Can find who's on
    // a trip (to match photos to people) and manage galleries/website content, but
    // sees NO money, costs or contact PII (names/levels still show — those aren't
    // in the redacted field groups). Bookings are fully redacted, so view is safe.
    const grants: Record<string, SectionLevel> = {
      experiences: "view", bookings: "view", members: "view",
      event_content: "edit", file_storage: "edit",
    };
    for (const [k, v] of Object.entries(grants)) sections[k] = v;
    return { worlds: ["experience"], sections, fields: {} }; // fields:{} → all sensitive groups hidden
  }
  if (systemKey === "manager") {
    const worlds = WORLDS.map((w) => w.id).filter((w) => w !== "analytics") as WorldId[];
    for (const s of SECTIONS) if (!OWNER_ONLY_SECTIONS.includes(s.key)) sections[s.key] = "edit";
    return { worlds, sections, fields: fieldsFor(worlds) };
  }
  const worlds = WORLDS.map((w) => w.id) as WorldId[];
  for (const s of SECTIONS) sections[s.key] = "edit"; // owner (+ any unknown system key) = everything
  return { worlds, sections, fields: fieldsFor(worlds) };
}

/** The section that owns a path (longest-prefix wins), or undefined for shared
 *  paths (Dashboard, Archive) that every team member may reach. */
export function sectionForPath(path: string): Section | undefined {
  let best: Section | undefined;
  let bestLen = -1;
  for (const s of SECTIONS) {
    for (const p of s.paths) {
      if (underPrefix(p, path) && p.length > bestLen) { best = s; bestLen = p.length; }
    }
  }
  return best;
}

/** Effective access of a member: either a granular role, or a legacy tier. */
export type EffectiveAccess =
  | { kind: "role"; access: RoleAccess }
  | { kind: "tier"; level: AccessLevel };

export function roleSectionLevel(access: RoleAccess, sectionKey: string): SectionLevel {
  return access.sections[sectionKey] ?? "none";
}

/** Can this member reach `path`? Shared (section-less) paths are always allowed. */
export function effectiveCanAccess(eff: EffectiveAccess, path: string): boolean {
  if (isPersonalPath(path)) return true; // hours log etc. — always available to any member
  if (eff.kind === "tier") return canAccess(eff.level, path);
  const sec = sectionForPath(path);
  if (!sec) return true;
  if (!eff.access.worlds.includes(sec.world)) return false;
  return roleSectionLevel(eff.access, sec.key) !== "none";
}

/**
 * Can this member WRITE at `path`?
 *
 * Reach and write were the same question until now: the middleware ran
 * effectiveCanAccess on every method, so anyone holding "view" on a section
 * performed that section's writes. Only two routes checked the edit level for
 * themselves — which meant a media role with emails=view could switch
 * automations off and fire lifecycle mail at every secured guest.
 *
 * Fails CLOSED on an unclaimed admin path, unlike reach: a route nobody has
 * classified is a route nobody has decided is safe to write.
 */
export function effectiveCanWrite(eff: EffectiveAccess, path: string): boolean {
  if (isPersonalPath(path)) return true;
  if (eff.kind === "tier") return canAccess(eff.level, path);
  const sec = sectionForPath(path);
  if (!sec) return false;
  if (!eff.access.worlds.includes(sec.world)) return false;
  return roleSectionLevel(eff.access, sec.key) === "edit";
}

/**
 * Can this member reach a section by KEY (rather than by path)?
 *
 * For surfaces that aggregate rows from many sections into one shared page —
 * the Archive is the only one today — and so can't ask the path-based question.
 * Unknown keys are allowed, matching the fail-open rule for section-less paths.
 */
export function effectiveCanAccessSection(eff: EffectiveAccess, sectionKey: string): boolean {
  const sec = SECTIONS.find((s) => s.key === sectionKey);
  if (!sec) return true;
  if (eff.kind === "tier") return canAccess(eff.level, sec.paths[0]);
  if (!eff.access.worlds.includes(sec.world)) return false;
  return roleSectionLevel(eff.access, sec.key) !== "none";
}

/** Can this member EDIT a section by key? The write-side twin of
 *  effectiveCanAccessSection, for aggregating surfaces (the Archive) whose
 *  mutations would otherwise accept a view-only grant. */
export function effectiveCanEditSection(eff: EffectiveAccess, sectionKey: string): boolean {
  const sec = SECTIONS.find((s) => s.key === sectionKey);
  if (!sec) return true;
  if (eff.kind === "tier") return canAccess(eff.level, sec.paths[0]);
  return eff.access.worlds.includes(sec.world) && roleSectionLevel(eff.access, sec.key) === "edit";
}

/** Can this member edit (not just view) within `path`'s section? */
export function effectiveCanEdit(eff: EffectiveAccess, path: string): boolean {
  if (isPersonalPath(path)) return true; // you can always log your own hours
  if (eff.kind === "tier") return canAccess(eff.level, path);
  const sec = sectionForPath(path);
  if (!sec) return true;
  return eff.access.worlds.includes(sec.world) && roleSectionLevel(eff.access, sec.key) === "edit";
}

/** Can this member enter a world (used to show/hide the world switcher)? */
export function effectiveCanEnterWorld(eff: EffectiveAccess, world: WorldId): boolean {
  if (eff.kind === "tier") return world === "analytics" ? eff.level === "owner" : true;
  return eff.access.worlds.includes(world);
}

/** May this member see a sensitive field group within a world? Legacy tiers see
 *  everything. World defaults to Experience (where all redaction is wired today). */
export function effectiveCanSeeField(eff: EffectiveAccess, field: FieldKey, world: WorldId = "experience"): boolean {
  if (eff.kind === "tier") return true;
  return eff.access.fields[world]?.[field] === true;
}
