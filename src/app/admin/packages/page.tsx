"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SearchSelect } from "@/components/admin/search-select";
import Link from "next/link";
import { PackageComponentsEditor } from "@/components/package-components-editor";
import { PublicBadge } from "@/components/admin/public-badge";
import { editionLabel as edYearLabel } from "@/lib/edition-label";
import { PACKAGE_LEVEL_OPTIONS, packageLevelLabel } from "@/lib/package-levels";

interface Package {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | null;
  cost_per_person: number | null;
  deposit: number | null;
  deposit_refund_days: number | null;
  downpayment_percent: number | null;
  final_days_before: number | null;
  max_spots: number | null;
  room_type: string | null;
  beds_per_booking: number | null;
  sort_order: number;
  status: string;
  category: string | null;
  gear_baseline?: string | null;
  date: string | null;
  includes: unknown; // jsonb — curated "what's included" list shown on the website
  experience_id: string | null;
  edition_id: string | null;
  hotel_id: string | null;
  exp_experiences: { id: string; title: string } | null;
  // computed in the API
  component_count: number;
  cost_estimate: number | null;
  margin: number | null;
}

interface Edition {
  id: string;
  experience_id: string;
  year: number;
  label: string | null;
  status?: string | null;
  date_start?: string | null;
  exp_experiences: { id: string; title: string } | null;
}

interface Experience {
  id: string;
  title: string;
  code: string | null;
}



function money(n: number | null) {
  return n != null ? `€${Number(n).toLocaleString()}` : "—";
}

function editionLabel(ed: Edition) {
  const base = ed.exp_experiences?.title || "Unknown";
  return `${base} — ${[ed.year, ed.label].filter(Boolean).join(" · ")}`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${
        status === "active"
          ? "bg-green-500/15 text-green-400"
          : status === "sold_out"
          ? "bg-red-500/15 text-red-400"
          : "bg-gray-500/15 text-gray-400"
      }`}
    >
      {status?.replace("_", " ") || "—"}
    </span>
  );
}

const emptyForm = {
  name: "", price: "", cost_per_person: "", deposit: "", max_spots: "",
  deposit_refund_days: "", downpayment_percent: "", final_days_before: "",
  category: "", gear_baseline: "rental", status: "active", experience_id: "", edition_id: "", hotel_id: "", includes: "",
  // The room pool: which room type at hotel_id this package sells, and how much
  // of a room one sale takes. Without a room type the hotel limits nothing and
  // the package sells past the last bed.
  room_type: "", beds_per_booking: "1",
};

/** jsonb includes (array of strings / objects) → one-per-line text for the editor. */
function includesToText(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  return raw
    .map((it) => (typeof it === "string" ? it : it && typeof it === "object" ? String((it as Record<string, unknown>).name ?? (it as Record<string, unknown>).label ?? (it as Record<string, unknown>).text ?? "") : ""))
    .filter(Boolean)
    .join("\n");
}

/** Split a package name into its parts — same convention the public site
    parses: "BON002 - Advanced – SOROBON Garden View Studio"
    → code "BON002", level "Advanced", room "SOROBON Garden View Studio". */
function parsePkgName(name: string): { code: string | null; level: string; room: string | null } {
  const m = name.match(/^([A-Z]{2,6}\d{0,4})\s*-\s*(.+)$/);
  const code = m ? m[1] : null;
  const rest = (m ? m[2] : name).trim();
  const segs = rest.split(/\s+[\u2013-]\s+/).map((x) => x.trim()).filter(Boolean);
  return { code, level: segs[0] || rest || "\u2014", room: segs.slice(1).join(" \u2013 ") || null };
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [hotels, setHotels] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterExperienceId, setFilterExperienceId] = useState("");
  const [filterEditionId, setFilterEditionId] = useState("");
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const yearDefaulted = useRef(false);
  const [dupOpen, setDupOpen] = useState<string | null>(null);   // group key with the target-picker open
  const [dupBusy, setDupBusy] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/admin/packages").then((r) => r.json()),
      fetch("/api/admin/editions").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
      fetch("/api/admin/hotels").then((r) => r.json()),
    ]).then(([pkgs, eds, exps, hot]) => {
      setPackages(Array.isArray(pkgs) ? pkgs : []);
      setEditions(Array.isArray(eds) ? eds : []);
      const list = Array.isArray(exps) ? exps : exps.experiences || [];
      setExperiences(list.map((e: Record<string, string>) => ({ id: e.id, title: e.title, code: e.code ?? null })));
      setHotels((hot?.hotels || []).filter((h: { id: string | null }) => h.id).map((h: { id: string; name: string }) => ({ id: h.id, name: h.name })));
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Open on the working year (current calendar year if editions exist for it,
  // else the most recent year) — so the overview lands on live packages, not
  // "All years" with future drafts. Only auto-set once; respects later clicks.
  useEffect(() => {
    if (yearDefaulted.current || editions.length === 0) return;
    const ys = [...new Set(editions.map((e) => e.year).filter((y): y is number => y != null))];
    if (ys.length === 0) return;
    const now = new Date().getFullYear();
    setFilterYear(ys.includes(now) ? now : Math.max(...ys));
    yearDefaulted.current = true;
  }, [editions]);

  // Cascading: edition options narrow to the selected experience
  const editionOptions = (filterExperienceId
    ? editions.filter((e) => e.experience_id === filterExperienceId)
    : editions
  ).filter((e) => filterYear == null || e.year === filterYear);

  const editionMap = new Map(editions.map((e) => [e.id, e]));
  const expCodeById = new Map(experiences.map((e) => [e.id, e.code]));

  const q = search.trim().toLowerCase();
  const yearOf = (p: Package) => (p.edition_id ? editionMap.get(p.edition_id)?.year ?? null : null);
  const filtered = packages.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (filterYear != null && p.edition_id && yearOf(p) !== filterYear) return false; // shared (no edition) spans all years
    if (filterEditionId) return p.edition_id === filterEditionId;
    if (filterExperienceId) return p.experience_id === filterExperienceId;
    return true;
  });
  const years = [...new Set(editions.map((e) => e.year).filter((y): y is number => y != null))].sort();

  // Column sorting (within each edition group); null/undefined always sink.
  const SORT_GET: Record<string, (p: Package) => string | number | null | undefined> = {
    package: (p) => parsePkgName(p.name).level.toLowerCase(),
    room: (p) => (parsePkgName(p.name).room || "").toLowerCase(),
    sell: (p) => p.price, cost: (p) => p.cost_estimate, margin: (p) => p.margin,
    comps: (p) => p.component_count, deposit: (p) => p.deposit, status: (p) => p.status,
  };
  function sortPkgs(list: Package[]): Package[] {
    // Default: level A→Z then room A→Z, so identical levels sit together and
    // the list reads the same way every time.
    if (!sortKey || !sortDir) {
      return [...list].sort((a, b) => {
        const pa = parsePkgName(a.name), pb = parsePkgName(b.name);
        return pa.level.localeCompare(pb.level) || (pa.room || "").localeCompare(pb.room || "");
      });
    }
    const get = SORT_GET[sortKey];
    return [...list].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? c : -c;
    });
  }
  function toggleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey(null); setSortDir(null); }
  }


  // Group by edition; packages WITHOUT an edition are the experience's SHARED
  // set (they apply to every week on the website). Order: live editions by
  // start date, then shared groups, then drafts/archived at the bottom.
  type PkgGroup = { key: string; label: string; editionId: string | null; status: string | null; date: string | null; shared: boolean; pkgs: Package[] };
  const groupMap = new Map<string, PkgGroup>();
  for (const pkg of filtered) {
    const ed = pkg.edition_id ? editionMap.get(pkg.edition_id) : null;
    const key = ed ? ed.id : `shared:${pkg.experience_id ?? "none"}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        label: ed ? editionLabel(ed) : `${pkg.exp_experiences?.title || "No Experience"} — all editions`,
        editionId: pkg.edition_id, status: ed?.status ?? null,
        date: ed?.date_start ?? null, shared: !ed, pkgs: [],
      });
    }
    groupMap.get(key)!.pkgs.push(pkg);
  }
  const groupRank = (g: PkgGroup) => (g.status === "draft" ? 2 : g.status === "archived" || g.status === "cancelled" ? 3 : g.shared ? 1 : 0);
  const grouped = [...groupMap.values()].sort((a, b) =>
    groupRank(a) - groupRank(b) || String(a.date ?? "9999").localeCompare(String(b.date ?? "9999")) || a.label.localeCompare(b.label)
  );

  function startNew() {
    setFormYear("");
    setEditId(null);
    setForm({ ...emptyForm, experience_id: filterExperienceId, edition_id: filterEditionId });
    setShowNew(true);
  }

  function startEdit(p: Package) {
    setFormYear("");
    setEditId(p.id);
    setShowNew(false);
    setForm({
      name: p.name,
      price: p.price?.toString() || "",
      cost_per_person: p.cost_per_person?.toString() || "",
      deposit: p.deposit?.toString() || "",
      deposit_refund_days: p.deposit_refund_days?.toString() || "",
      downpayment_percent: p.downpayment_percent?.toString() || "",
      final_days_before: p.final_days_before?.toString() || "",
      max_spots: p.max_spots?.toString() || "",
      category: p.category || "",
      gear_baseline: p.gear_baseline || "rental",
      status: p.status || "active",
      experience_id: p.experience_id || "",
      edition_id: p.edition_id || "",
      hotel_id: p.hotel_id || "",
      room_type: p.room_type || "",
      beds_per_booking: String(p.beds_per_booking ?? 1),
      includes: includesToText(p.includes),
    });
  }

  async function save() {
    const body = {
      name: form.name,
      price: form.price ? Number(form.price) : null,
      cost_per_person: form.cost_per_person ? Number(form.cost_per_person) : null,
      deposit: form.deposit ? Number(form.deposit) : null,
      // Milestone config (migration 032) — only sent when set, so package saves
      // keep working before 032 is applied.
      ...(form.deposit_refund_days ? { deposit_refund_days: Number(form.deposit_refund_days) } : {}),
      ...(form.downpayment_percent ? { downpayment_percent: Number(form.downpayment_percent) } : {}),
      ...(form.final_days_before ? { final_days_before: Number(form.final_days_before) } : {}),
      max_spots: form.max_spots ? Number(form.max_spots) : null,
      category: form.category || null,
      gear_baseline: form.gear_baseline || "rental",
      status: form.status,
      experience_id: form.experience_id || null,
      edition_id: form.edition_id || null,
      hotel_id: form.hotel_id || null,
      room_type: form.room_type || null,
      beds_per_booking: Number(form.beds_per_booking) || 1,
      includes: form.includes.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    // Never close on a failure. This swallowed every create: the POST 400'd on
    // the missing slug, nothing checked the response, and the modal closed as
    // though a package had been made.
    const res = editId
      ? await fetch(`/api/admin/packages/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch(`/api/admin/packages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || `Couldn't save this package (${res.status}).`);
      return;
    }
    setShowNew(false); setEditId(null); setForm(emptyForm); load();
  }

  async function duplicate(id: string) {
    await fetch(`/api/admin/packages/${id}/duplicate`, { method: "POST" });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this package? Component links will be removed too.")) return;
    await fetch(`/api/admin/packages/${id}`, { method: "DELETE" });
    load();
  }

  // Edition choices inside the form follow the form's experience. Sorted newest
  // year first and ALWAYS labelled with the year — "Week I" alone was ambiguous
  // once 2026 and 2027 editions coexisted.
  const formEditionOptions = (form.experience_id
    ? editions.filter((e) => e.experience_id === form.experience_id)
    : editions
  ).slice().sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || String(a.label ?? "").localeCompare(String(b.label ?? "")));

  // Year-first edition cascade — several seasons of "Week I/II/III" in one list
  // gets overloaded fast.
  const [formYear, setFormYear] = useState<string>("");

  // Rooms → availability: the physical rooms backing this package.
  const [rooms, setRooms] = useState<{ id: string; name: string | null; hotel: string | null; hotel_id: string | null; sleeps: number | null; room_type: string | null; room_number: string | null }[]>([]);
  useEffect(() => {
    if (!form.experience_id) { setRooms([]); return; }
    fetch(`/api/admin/rooms?experience_id=${form.experience_id}`).then((r) => r.json())
      .then((d) => setRooms(Array.isArray(d?.rooms) ? d.rooms : [])).catch(() => setRooms([]));
  }, [form.experience_id]);
  // Which physical rooms are actually operated in the package's edition — the
  // week rows. Used only to say "not this week" on a room type we don't hold.
  const [occ, setOcc] = useState<{ room_id: string | null; status: string | null }[]>([]);
  useEffect(() => {
    if (!form.edition_id) { setOcc([]); return; }
    fetch(`/api/admin/hotel-rooms?edition_id=${form.edition_id}`).then((r) => r.json())
      .then((d) => setOcc((Array.isArray(d) ? d : d?.rooms ?? d?.data ?? []).map((x: { room_id?: string | null; status?: string | null }) => ({ room_id: x.room_id ?? null, status: x.status ?? null }))))
      .catch(() => setOcc([]));
  }, [form.edition_id]);

  const inputClass =
    "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Packages</h1>
          <p className="text-sm admin-muted">
            {filtered.length} package{filtered.length !== 1 ? "s" : ""} across {grouped.length} group{grouped.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={startNew} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
          New Package
        </button>
      </div>

      {(showNew || editId) ? (
      <div className="flex flex-col lg:flex-row gap-4">
        {/* rail */}
        <div className="lg:w-64 shrink-0 flex lg:flex-col gap-1.5 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1">
          <button onClick={() => { setShowNew(false); setEditId(null); }} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            All packages
          </button>
          {filtered.map((pkg) => {
            const active = pkg.id === editId;
            const ed = editions.find((e) => e.id === pkg.edition_id);
            return (
              <button key={pkg.id} onClick={() => startEdit(pkg)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{pkg.name}</span>
                <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{ed ? `${ed.label || ed.year} · ` : ""}{pkg.category ? `${pkg.category[0].toUpperCase()}${pkg.category.slice(1)} · ` : ""}{money(pkg.price)} · {pkg.status}</span>
              </button>
            );
          })}
        </div>
        {/* detail: edit form + component selector */}
        <div className="flex-1 min-w-0 space-y-4">
        <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-base font-bold admin-heading mb-4">{editId ? "Edit package" : "New package"}</h3>
          {(() => {
            const selYear = formYear || (form.edition_id ? String(editionMap.get(form.edition_id)?.year ?? "") : "");
            const yearOptions = [...new Set(formEditionOptions.map((e) => e.year).filter((y): y is number => y != null))].sort((a, b) => b - a);
            const editionOpts = formEditionOptions.filter((ed) => !selYear || String(ed.year ?? "") === selYear);
            return (
              <div className="grid grid-cols-[1fr_170px_100px_170px] gap-4 mb-4">
                <div><label className={labelClass}>Name *<PublicBadge note="Shown as the package/room label in the public booking step" /></label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className={labelClass}>Experience</label>
                  <select className={inputClass} value={form.experience_id} onChange={(e) => { setFormYear(""); setForm({ ...form, experience_id: e.target.value, edition_id: "" }); }}>
                    <option value="">—</option>
                    {experiences.map((exp) => <option key={exp.id} value={exp.id}>{exp.title}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Year</label>
                  <select className={inputClass} value={selYear} onChange={(e) => { const y = e.target.value; setFormYear(y); setForm((f) => { const ed = editionMap.get(f.edition_id); return ed && String(ed.year ?? "") !== y && y !== "" ? { ...f, edition_id: "" } : f; }); }}>
                    <option value="">All</option>
                    {yearOptions.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Edition</label>
                  <select className={inputClass} value={form.edition_id} onChange={(e) => setForm({ ...form, edition_id: e.target.value })}>
                    <option value="">—</option>
                    {editionOpts.map((ed) => <option key={ed.id} value={ed.id}>{edYearLabel(ed) || "—"}{form.experience_id ? "" : ` — ${ed.exp_experiences?.title || ""}`}</option>)}
                  </select>
                </div>
              </div>
            );
          })()}
          {/* mirrors the website flow: the customer picks LEVEL first, then the stay */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Level<PublicBadge note="Step 1 on the website — the Advanced/Beginner choice customers make first" /></label>
              <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {PACKAGE_LEVEL_OPTIONS.map((c) => <option key={c} value={c}>{packageLevelLabel(c)}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Gear in the price<PublicBadge note="What this package's price already contains — the public gear choice (Rental vs Storage vs Own gear) quotes deltas from exactly this" /></label>
              <select className={inputClass} value={form.gear_baseline ?? "rental"} onChange={(e) => setForm({ ...form, gear_baseline: e.target.value })}>
                <option value="rental">Rental included</option>
                <option value="storage">Storage included</option>
                <option value="none">No gear included</option>
              </select>
            </div>
            <div><label className={labelClass}>Hotel<PublicBadge note="Step 2 on the website — drives the hotel name & photos in the accommodation choice" /></label>
              <select className={inputClass} value={form.hotel_id} onChange={(e) => setForm({ ...form, hotel_id: e.target.value })}>
                <option value="">No hotel / auto-detect</option>
                {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Status</label>
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="sold_out">Sold out</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div><label className={labelClass}>Sell (€)<PublicBadge note="The public package price" /></label><input type="number" className={inputClass} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div><label className={labelClass}>Cost / person <span className="normal-case font-normal admin-faint">— auto: components buy total</span></label><input type="number" className={inputClass} value={form.cost_per_person} onChange={(e) => setForm({ ...form, cost_per_person: e.target.value })} placeholder="auto" title="Kept in sync with the components’ buy total on every component change" /></div>
            <div><label className={labelClass}>Deposit</label><input type="number" className={inputClass} value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /></div>
            <div><label className={labelClass}>Cap <span className="normal-case font-normal admin-faint">— optional</span></label><input type="number" className={inputClass} placeholder="no limit" value={form.max_spots} onChange={(e) => setForm({ ...form, max_spots: e.target.value })} title="This package's share of the week. Leave empty for no limit — it stops one package eating the whole trip. NOT the room limit: that is derived from the beds." /></div>
          </div>
          {/* Payment plan (Phase 2): deposit → downpayment → final. Needs migration 032. */}
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-wide admin-faint mb-1.5">Payment plan</p>
            <div className="grid grid-cols-3 gap-4">
              <div><label className={labelClass}>Downpayment due (days after sign-up)<PublicBadge note="Shown in the public “How you pay” schedule + reserve modal" /></label><input type="number" className={inputClass} value={form.deposit_refund_days} onChange={(e) => setForm({ ...form, deposit_refund_days: e.target.value })} placeholder="14" /></div>
              <div><label className={labelClass}>Downpayment (% of total)<PublicBadge note="Shown in the public “How you pay” schedule + invoices" /></label><input type="number" className={inputClass} value={form.downpayment_percent} onChange={(e) => setForm({ ...form, downpayment_percent: e.target.value })} placeholder="50" /></div>
              <div><label className={labelClass}>Final due (days before trip)<PublicBadge note="Shown in the public “How you pay” schedule + invoices" /></label><input type="number" className={inputClass} value={form.final_days_before} onChange={(e) => setForm({ ...form, final_days_before: e.target.value })} placeholder="90" /></div>
            </div>
            <p className="text-[11px] admin-faint mt-1.5">Downpayment is always due that many days after sign-up (the flight-booking window); the final balance that many days before the trip. A deposit, if set, also stays refundable for the same window.</p>
          </div>
          <div className="mb-4">
            <div><label className={labelClass}>Website list — manual override <span className="normal-case font-normal admin-faint">(optional)</span></label>
              <textarea className={`${inputClass} h-[120px] resize-y leading-relaxed`} value={form.includes} onChange={(e) => setForm({ ...form, includes: e.target.value })} placeholder={"Usually leave this BLANK — the website then lists the components ✓-checked below (their Website text).\nFill it only to fully hand-write the list, one line each."} />
              <p className="text-[11px] admin-faint mt-1"><b>Leave blank</b> → the website shows the components marked <b>Web ✓</b> below, using each component&apos;s Website text. Filling this overrides that list entirely.</p>
            </div>
          </div>
          {/* Where the guests sleep — the room pool.
              This used to be a multi-select of individual rooms that also
              auto-filled the Spots box with the ROOM count. Two things were
              wrong with that: rooms are not spots (a double sleeps two), and the
              links had to be redone every edition because they point at that
              week's rooms. A room TYPE is edition-independent and needs no
              upkeep, so one pick here holds for every year. */}
          <div className="mb-4">
            <label className={labelClass}>Where guests sleep</label>
            {(() => {
              // Match on hotel_id, not the legacy free text: exp_rooms.hotel
              // holds nicknames ("REF") while hotels.name is the real name
              // ("REF Carsi"), so the old comparison matched nothing for any
              // active hotel and this whole picker was unreachable. The text
              // compare stays as a fallback for rows migration 143 could not
              // backfill unambiguously.
              const hotelName = hotels.find((h) => h.id === form.hotel_id)?.name ?? null;
              if (!form.hotel_id) {
                return (
                  <p className="text-xs admin-faint mt-1">
                    No hotel on this package, so only the week&apos;s Max spots limits it — right for
                    &ldquo;Experience Only&rdquo; and no-hotel packages. Pick a <b>Hotel</b> above to sell a room.
                  </p>
                );
              }
              const hotelRooms = rooms.filter((r) =>
                r.hotel_id ? r.hotel_id === form.hotel_id
                           : (r.hotel ?? "").toLowerCase() === (hotelName ?? "").toLowerCase());
              const scheduled = new Set(occ.map((o) => o.room_id).filter(Boolean) as string[]);
              const editionAware = !!form.edition_id && occ.length > 0;
              const byType = new Map<string, typeof hotelRooms>();
              for (const r of hotelRooms) {
                const t = r.room_type || r.name || "Untyped";
                byType.set(t, [...(byType.get(t) ?? []), r]);
              }
              if (byType.size === 0) {
                return <p className="text-xs admin-faint mt-1">No rooms for {hotelName} yet — add them on the Hotel Rooms page. Until then the hotel limits nothing.</p>;
              }
              return (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {[...byType.entries()].map(([t, rs]) => {
                      const thisWeek = editionAware ? rs.filter((r) => scheduled.has(r.id)) : rs;
                      const on = form.room_type === t;
                      return (
                        <button key={t} type="button"
                          onClick={() => setForm({ ...form, room_type: on ? "" : t })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${on ? "bg-[#0aa3c7] text-white" : "admin-muted hover:admin-heading"}`}
                          style={on ? undefined : { border: "1px solid var(--admin-border)" }}
                          title={thisWeek.length === 0
                            ? "No rooms of this type are scheduled for this edition"
                            : `${thisWeek.length} room(s) of this type this week`}>
                          {on ? "\u2713 " : ""}{t}
                          <span className={on ? "opacity-80" : "admin-faint"}>
                            {" · "}{thisWeek.length === 0 ? "not this week" : `${thisWeek.length} room${thisWeek.length === 1 ? "" : "s"}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2.5 flex items-center gap-3 flex-wrap">

                  </div>
                  <p className="text-[11px] admin-faint mt-2">
                    {form.room_type
                      ? <>Selling <b>{form.room_type}</b>. Availability is the free beds of that type divided by beds per booking — packages sharing the type (Advanced + Beginner) share those beds. Nothing to redo next edition.</>
                      : <>Nothing picked, so the hotel doesn&apos;t limit this package and it can be sold past the last bed.</>}
                  </p>
                </>
              );
            })()}
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={!form.name} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{editId ? "Update" : "Create"}</button>
            <button onClick={() => { setShowNew(false); setEditId(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
          </div>
        </div>
        {editId && (
          <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <h3 className="text-base font-bold admin-heading mb-4">What&apos;s included</h3>
            <PackageComponentsEditor
              packageId={editId}
              experienceId={form.experience_id || null}
              editionId={form.edition_id || null}
              sellPrice={form.price ? Number(form.price) : null}
              onChanged={load}
              onCostSynced={(n) => setForm((f) => ({ ...f, cost_per_person: String(n) }))}
            />
          </div>
        )}
        </div>
      </div>
      ) : (
      <>
      {/* Filters: experience pills → edition pills, plus search */}
      <div className="mb-5 space-y-2.5">
        {/* A pill per experience was fine at four and a wall of chips at
            thirteen — and the list only grows. Search scales; pills don't. */}
        <div className="w-72">
          <SearchSelect
            value={filterExperienceId || null}
            onChange={(v) => { setFilterExperienceId(v ?? ""); setFilterEditionId(""); }}
            options={experiences.map((exp) => ({ value: exp.id, label: exp.title.replace(/^NP7\s+(Experience\s+)?/i, "") }))}
            placeholder="All experiences" clearLabel="All experiences" searchPlaceholder="Search experiences…"
          />
        </div>
        {years.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill small label="All years" active={filterYear == null} onClick={() => { setFilterYear(null); setFilterEditionId(""); }} />
            {years.map((y) => (
              <FilterPill key={y} small label={String(y)} active={filterYear === y} onClick={() => { setFilterYear(y); setFilterEditionId(""); }} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {filterExperienceId && editionOptions.length > 1 && (
            <>
              <FilterPill small label="All editions" active={!filterEditionId} onClick={() => setFilterEditionId("")} />
              {editionOptions.map((ed) => (
                <FilterPill key={ed.id} small label={edYearLabel(ed)} active={filterEditionId === ed.id} onClick={() => setFilterEditionId(ed.id)} />
              ))}
            </>
          )}
          <div className="relative ml-auto">
            <svg className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 admin-faint pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search packages…"
              className={`${inputClass} pl-9 w-[220px]`}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No packages match</p></div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.key}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
                <h2 className="text-sm font-bold admin-heading flex items-center gap-2">
                  {group.label}
                  {group.shared && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.06em] bg-[var(--admin-accent)]/15 text-[#0aa3c7]" title="No edition set — these packages apply to EVERY week of the experience on the website. An edition-scoped package with the same name overrides them for that week.">Shared · all editions</span>
                  )}
                  {group.status && group.status !== "published" && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.06em] bg-amber-500/15 text-amber-400">{group.status}</span>
                  )}
                </h2>
                {group.editionId && (
                  <div className="flex items-center gap-4">
                    {(() => {
                      const expId = group.pkgs[0]?.experience_id;
                      const targets = editions.filter((e) => e.experience_id === expId && e.id !== group.editionId);
                      if (!targets.length) return null;
                      return (
                        <span className="relative">
                          <button
                            type="button"
                            onClick={() => setDupOpen(dupOpen === group.key ? null : group.key)}
                            className="text-xs admin-muted hover:text-[#0aa3c7] transition-colors font-semibold"
                          >
                            Duplicate set →
                          </button>
                          {dupOpen === group.key && (
                            <span className="absolute right-0 top-full mt-1.5 z-30 min-w-[240px] rounded-xl p-1.5 shadow-xl" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                              <span className="block px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] admin-faint">Copy {group.pkgs.length} package{group.pkgs.length === 1 ? "" : "s"} to…</span>
                              {targets.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  disabled={dupBusy}
                                  onClick={async () => {
                                    if (!confirm(`Copy ${group.pkgs.length} package${group.pkgs.length === 1 ? "" : "s"} to "${editionLabel(t)}"?\n\nCopies arrive DEACTIVATED — review prices (and the PO codes in the names) before setting them active.`)) return;
                                    setDupBusy(true);
                                    for (const pkg of group.pkgs) {
                                      await fetch(`/api/admin/packages/${pkg.id}/duplicate`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ editionId: t.id }),
                                      });
                                    }
                                    setDupBusy(false);
                                    setDupOpen(null);
                                    load();
                                  }}
                                  className="block w-full text-left px-2.5 py-2 rounded-lg text-xs font-semibold admin-heading hover:bg-[var(--admin-accent)]/10 disabled:opacity-50 transition-colors"
                                >
                                  {editionLabel(t)}
                                </button>
                              ))}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                    <Link href={`/admin/editions/${group.editionId}`} className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors">
                      View edition →
                    </Link>
                  </div>
                )}
              </div>
              <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
                <div
                  className="grid grid-cols-[minmax(120px,0.7fr)_minmax(170px,1fr)_80px_80px_90px_55px_70px_80px_70px] gap-3 px-5 py-3 admin-surface"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                >
                  {[["package", "Package"], ["room", "Room / variant"], ["sell", "Sell"], ["cost", "Cost"], ["margin", "Margin"], ["comps", "Comps"], ["deposit", "Deposit"], ["status", "Status"]].map(([key, lbl]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={`flex items-center gap-1 text-left text-[10px] font-bold tracking-[0.1em] uppercase transition-colors ${sortKey === key ? "text-[#0aa3c7]" : "admin-faint hover:admin-muted"}`}
                      title="Sort"
                    >
                      {lbl}
                      {sortKey === key && <span className="text-[9px]">{sortDir === "asc" ? "\u25b2" : "\u25bc"}</span>}
                    </button>
                  ))}
                  <span></span>
                </div>
                {sortPkgs(group.pkgs).map((pkg) => {
                  return (
                    <div key={pkg.id} style={{ borderBottom: "1px solid var(--admin-border)" }}>
                      <div
                        className="grid grid-cols-[minmax(120px,0.7fr)_minmax(170px,1fr)_80px_80px_90px_55px_70px_80px_70px] gap-3 px-5 py-3 transition-colors cursor-pointer"
                        onClick={() => startEdit(pkg)}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        {(() => {
                          const parsed = parsePkgName(pkg.name);
                          return (
                            <>
                              <span className="min-w-0 self-center flex items-center gap-1.5">
                                <span className="text-sm font-semibold admin-heading">{parsed.level}</span>
                                {parsed.code && (
                                  <span className="shrink-0 text-[9px] font-mono px-1 py-px rounded admin-faint" style={{ border: "1px solid var(--admin-border)" }}>{parsed.code}</span>
                                )}
                              </span>
                              <span className="min-w-0 self-center text-sm admin-muted">{parsed.room || "—"}</span>
                            </>
                          );
                        })()}
                        <span className="text-xs admin-muted self-center">{money(pkg.price)}</span>
                        <span className="text-xs admin-muted self-center">
                          {money(pkg.cost_estimate)}
                          {pkg.cost_per_person == null && pkg.cost_estimate != null && (
                            <span className="ml-1 text-[9px] text-[#0aa3c7]" title="Derived from components">~</span>
                          )}
                        </span>
                        <span className={`text-xs self-center font-medium ${pkg.margin == null ? "admin-faint" : pkg.margin < 0 ? "text-red-400" : "text-green-400"}`}>{money(pkg.margin)}</span>
                        <span className="text-xs admin-muted self-center">{pkg.component_count || "—"}</span>
                        <span className="text-xs admin-muted self-center">{money(pkg.deposit)}</span>
                        <span className="self-center"><StatusBadge status={pkg.status} /></span>
                        <span className="flex items-center gap-2 self-center justify-end">
                          <button onClick={(e) => { e.stopPropagation(); duplicate(pkg.id); }} className="admin-faint hover:text-[#0aa3c7] transition-colors" title="Duplicate">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); remove(pkg.id); }} className="admin-faint hover:text-red-400 transition-colors" title="Delete">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </button>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}

/** Admin filter pill — active = accent, inactive = quiet outline. */
function FilterPill({ label, active, onClick, small = false }: { label: string; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full font-semibold transition-colors ${small ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"}`}
      style={active
        ? { backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast, #fff)" }
        : { border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }}
    >
      {label}
    </button>
  );
}
