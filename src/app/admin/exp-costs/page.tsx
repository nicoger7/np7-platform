"use client";

/**
 * Experience costs.
 *
 * Two questions the old page could not answer are the whole point of this one:
 *
 *   Is this money real?     Expected (an estimate) · Real (a bank debit is
 *                           attached) · Recorded by hand (somebody typed it).
 *   Where does it belong?   One trip · shared across an experience's trips in
 *                           a year · a whole year · general.
 *
 * Nico wants costs on editions, and the page leans that way without tricks:
 * the edition is the default and the one-click choice; anything broader asks
 * for a sentence saying why, and the consequence panel shows what each choice
 * does to the trip's P&L and its § 25 margin before Save is pressed.
 *
 * Sorting lines into their § 25 bucket lives here too, in bulk, with the
 * bookkeeping plan's rule offered as a suggestion on every unsorted line.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";
import { RowActions } from "@/components/row-actions";
import { CostLinksEditor } from "@/components/admin/cost-links-editor";
import { editionOptionLabel } from "@/lib/edition-label";
import { mutate, saved } from "@/lib/mutate";
import { COST_SCOPES, MARGIN_CLASSES, COST_STATE_LABEL, type CostScope, type CostState, type MarginClass } from "@/lib/finance/costs";

type Money = {
  state: CostState; value: number; estimated: boolean; attached: number; attachedBank: number; open: number;
  provenance: "bank" | "off_bank" | "unverified" | null; zeroActualOnEstimate: boolean;
};

interface ExpCost {
  id: string;
  item: string;
  experience_id: string | null;
  edition_id: string | null;
  scope: CostScope;
  year: number | null;
  scope_reason: string | null;
  estimated_amount: number | null;
  actual_amount: number | null;
  actual_provenance: string | null;
  actual_note: string | null;
  unplanned: boolean;
  margin_class: string | null;
  margin_class_note: string | null;
  status: string | null;
  date: string | null;
  notes: string | null;
  exp_experiences: { id: string; title: string } | null;
  exp_editions: { id: string; label: string | null; year: number | null; date_start: string | null; date_end: string | null } | null;
  money: Money;
  scopeText: string;
  suggested: { cls: MarginClass; reason: string } | null;
  created_at: string;
}

interface Experience { id: string; title: string }
interface Edition { id: string; experience_id: string; year: number | null; label: string | null; date_start: string | null; date_end: string | null; exp_experiences?: { title?: string } | null }

type Consequence = {
  scope: string; amount: number;
  edition?: { id: string; label: string | null; year: number | null; title: string | null };
  pnl: { before: { received: number; costs: number; net: number }; after: { received: number; costs: number; net: number } } | null;
  margin: { territory: string; before: { entgelt: number; reisevorleistungen: number; bruttomarge: number; umsatzsteuer: number }; after: { entgelt: number; reisevorleistungen: number; bruttomarge: number; umsatzsteuer: number } } | null;
  board: { year: number | null; applies: boolean; note: string } | null;
  notes: string[];
};

const STATUSES = ["confirmed", "estimate", "cancelled", "unlisted"];
const STATES: { key: "" | CostState; label: string }[] = [
  { key: "", label: "All" },
  { key: "expected", label: "Expected" },
  { key: "real", label: "Real" },
  { key: "hand", label: "Recorded by hand" },
];

type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "item", label: "Item", width: "1.4fr", required: true },
  { key: "scope", label: "Belongs to", width: "1fr" },
  { key: "estimated_amount", label: "Expected", width: "100px" },
  { key: "actual", label: "Actual", width: "130px" },
  { key: "open", label: "Open", width: "90px" },
  { key: "status", label: "Status", width: "90px" },
  { key: "margin_class", label: "§ 25", width: "120px" },
  { key: "_actions", label: "", width: "80px", required: true },
];

const STORAGE_KEY = "np7-exp-costs-columns-v2";

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === "asc" ? 1 : -1;
  if (b == null) return dir === "asc" ? -1 : 1;
  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) return dir === "asc" ? aNum - bNum : bNum - aNum;
  const cmp = String(a).localeCompare(String(b));
  return dir === "asc" ? cmp : -cmp;
}

const statusColor = (s: string | null) => {
  switch (s) {
    case "confirmed": return "bg-green-500/15 text-green-400";
    case "cancelled": return "bg-red-500/15 text-red-400";
    case "unlisted": return "bg-gray-500/15 text-gray-400";
    default: return "bg-amber-500/15 text-amber-400";
  }
};
const stateColor: Record<CostState, string> = {
  real: "bg-green-500/15 text-green-500",
  hand: "bg-amber-500/15 text-amber-500",
  expected: "bg-slate-500/15 admin-faint",
};
const classLabel = (k: string | null) => MARGIN_CLASSES.find((m) => m.key === k)?.label ?? "Unsorted";
const eur = (n: number | null | undefined) => (n != null ? `€${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—");
const eur2 = (n: number) => `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const delta = (a: number, b: number) => {
  const d = Math.round((b - a) * 100) / 100;
  if (d === 0) return <span className="admin-faint">no change</span>;
  return <span className={d > 0 ? "text-red-400" : "text-green-500"}>{d > 0 ? "+" : "−"}{eur2(Math.abs(d))}</span>;
};

const emptyForm = () => ({
  item: "", scope: "edition" as CostScope, experience_id: "", edition_id: "", year: "", scope_reason: "",
  estimated_amount: "", actual_amount: "", actual_note: "", status: "estimate", date: "", notes: "", margin_class: "",
});

export default function ExpCostsPage() {
  const [costs, setCosts] = useState<ExpCost[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState<"" | CostState>("");
  const [filterScope, setFilterScope] = useState("");
  const [filterExp, setFilterExp] = useState("");
  const [filterEdition, setFilterEdition] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [classifying, setClassifying] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => loadVisibleColumns(STORAGE_KEY, COLUMNS));
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [consequence, setConsequence] = useState<Consequence | null>(null);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch("/api/admin/exp-costs").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
    ]).then(([c, e]) => {
      setCosts(Array.isArray(c) ? c : []);
      setExperiences((e.experiences || e || []).map((x: Record<string, string>) => ({ id: x.id, title: x.title })));
      setLoading(false);
    });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    fetch("/api/admin/editions").then((r) => r.json()).then((d) => {
      const list: Edition[] = Array.isArray(d) ? d : [];
      setEditions(list);
      // The edition page links here with ?edition_id=…: honour it, and let the
      // edition imply its experience so the edition list stays short.
      try {
        const ed = new URLSearchParams(window.location.search).get("edition_id");
        if (ed) {
          setFilterEdition(ed);
          const hit = list.find((e) => e.id === ed);
          if (hit) setFilterExp(hit.experience_id);
        }
      } catch { /* no window */ }
    });
  }, []);

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else setSortDir("asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const years = useMemo(() => {
    const ys = new Set<number>();
    const now = new Date().getFullYear();
    for (let y = now - 1; y <= now + 2; y++) ys.add(y);
    for (const e of editions) if (e.year) ys.add(e.year);
    for (const c of costs) { if (c.year) ys.add(c.year); if (c.exp_editions?.year) ys.add(c.exp_editions.year); }
    return [...ys].sort();
  }, [editions, costs]);

  const yearOf = (c: ExpCost) => (c.scope === "edition" ? c.exp_editions?.year ?? null : c.year);

  const filtered = costs.filter((c) =>
    (!filterState || c.money.state === filterState) &&
    (!filterScope || c.scope === filterScope) &&
    (!filterExp || c.experience_id === filterExp) &&
    (!filterEdition || c.edition_id === filterEdition) &&
    (!filterYear || yearOf(c) === Number(filterYear)) &&
    (!filterStatus || c.status === filterStatus) &&
    (filterClass === "unsorted" ? c.margin_class === null : filterClass ? c.margin_class === filterClass : true) &&
    (!search || `${c.item} ${c.notes ?? ""} ${c.scopeText}`.toLowerCase().includes(search.toLowerCase()))
  );
  const sorted = sortKey && sortDir
    ? [...filtered].sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;
        if (sortKey === "scope") { aVal = a.scopeText; bVal = b.scopeText; }
        else if (sortKey === "actual") { aVal = a.money.state === "expected" ? null : a.money.value; bVal = b.money.state === "expected" ? null : b.money.value; }
        else if (sortKey === "open") { aVal = a.money.open; bVal = b.money.open; }
        else { aVal = a[sortKey as keyof ExpCost]; bVal = b[sortKey as keyof ExpCost]; }
        return compareValues(aVal, bVal, sortDir);
      })
    : filtered;

  // Totals per state for the SET ON SCREEN, so the filter buttons say what
  // they will show rather than a number for a different selection.
  const byState = useMemo(() => {
    const base = costs.filter((c) =>
      (!filterScope || c.scope === filterScope) && (!filterExp || c.experience_id === filterExp) &&
      (!filterEdition || c.edition_id === filterEdition) && (!filterYear || yearOf(c) === Number(filterYear)) &&
      (!filterStatus || c.status === filterStatus) && c.status !== "cancelled");
    const out: Record<"" | CostState, { n: number; sum: number }> = { "": { n: 0, sum: 0 }, expected: { n: 0, sum: 0 }, real: { n: 0, sum: 0 }, hand: { n: 0, sum: 0 } };
    for (const c of base) {
      out[""].n++; out[""].sum += c.money.value;
      out[c.money.state].n++; out[c.money.state].sum += c.money.value;
    }
    return out;
  }, [costs, filterScope, filterExp, filterEdition, filterYear, filterStatus]);

  const unsortedInView = sorted.filter((c) => c.margin_class === null && c.status !== "cancelled");
  const suggestedCount = (cls: MarginClass) => unsortedInView.filter((c) => c.suggested?.cls === cls).length;

  // Selecting a cost opens a master-detail (rail + detail); deselect → wide table.
  const selected = !!editId || showNew;
  const deselect = () => { setShowNew(false); setEditId(null); setFormError(null); setConsequence(null); };

  function startEdit(c: ExpCost) {
    setEditId(c.id);
    setForm({
      item: c.item, scope: c.scope, experience_id: c.experience_id || "", edition_id: c.edition_id || "",
      year: c.year?.toString() || "", scope_reason: c.scope_reason || "",
      estimated_amount: c.estimated_amount?.toString() || "", actual_amount: c.actual_amount?.toString() || "",
      actual_note: c.actual_note || "", status: c.status || "estimate", date: c.date || "", notes: c.notes || "",
      margin_class: c.margin_class || "",
    });
    setShowNew(false);
    setFormError(null);
  }

  const editing = editId ? costs.find((c) => c.id === editId) ?? null : null;

  // What the readers will use once this is saved: attached money wins, then
  // the typed actual, then the estimate. Same order as costMoney().
  const previewAmount = useMemo(() => {
    if (editing && editing.money.attached > 0) return editing.money.attached;
    if (form.actual_amount !== "") return Number(form.actual_amount) || 0;
    return Number(form.estimated_amount) || 0;
  }, [editing, form.actual_amount, form.estimated_amount]);

  // An edition cost with no edition picked yet has nothing to preview.
  const consequenceReady = form.scope !== "edition" || !!form.edition_id;

  // The consequence panel, debounced: one request per pause, never per keystroke.
  useEffect(() => {
    if (!selected || !consequenceReady) return;
    const qs = new URLSearchParams({ scope: form.scope, amount: String(previewAmount), margin_class: form.margin_class });
    if (form.scope === "edition") qs.set("edition_id", form.edition_id);
    if (form.year) qs.set("year", form.year);
    if (editId) qs.set("exclude_id", editId);
    const t = setTimeout(() => {
      fetch(`/api/admin/exp-costs/consequence?${qs}`).then((r) => r.json()).then((d) => setConsequence(d?.error ? null : d)).catch(() => setConsequence(null));
    }, 350);
    return () => clearTimeout(t);
  }, [selected, consequenceReady, form.scope, form.edition_id, form.year, form.margin_class, previewAmount, editId]);

  async function handleSave() {
    setFormError(null);
    const body: Record<string, unknown> = {
      item: form.item,
      scope: form.scope,
      edition_id: form.scope === "edition" ? form.edition_id || null : null,
      experience_id: form.scope === "edition" || form.scope === "experience_year" ? form.experience_id || null : null,
      year: form.scope === "experience_year" || form.scope === "year" ? (form.year ? Number(form.year) : null) : null,
      scope_reason: form.scope === "edition" ? null : form.scope_reason || null,
      estimated_amount: form.estimated_amount !== "" ? Number(form.estimated_amount) : null,
      actual_amount: form.actual_amount !== "" ? Number(form.actual_amount) : null,
      status: form.status || null,
      date: form.date || null,
      notes: form.notes || null,
      margin_class: form.margin_class || null,
    };
    if (form.actual_amount !== "") {
      // A typed actual says where it comes from, or it is filed as unverified.
      // Keeping a legacy row's provenance untouched is right; a NEW number
      // typed today has to explain itself.
      const unchanged = editing && editing.actual_amount != null && Number(editing.actual_amount) === Number(form.actual_amount) && (editing.actual_note || "") === form.actual_note;
      if (!unchanged) {
        if (!form.actual_note.trim()) { setFormError("Where does this actual come from? A typed actual needs a note (Nico's card, cash, an offset), or it should come from the Bank page as a real debit."); return; }
        body.actual_provenance = "off_bank";
        body.actual_note = form.actual_note;
      }
    } else {
      body.actual_note = form.actual_note || null;
    }
    const res = editId
      ? await mutate(`/api/admin/exp-costs/${editId}`, { method: "PATCH", body })
      : await mutate("/api/admin/exp-costs", { method: "POST", body });
    if (!res.ok) { setFormError(res.error); return; }
    deselect();
    fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this cost?")) return;
    if (!(await saved(mutate(`/api/admin/exp-costs/${id}`, { method: "DELETE" })))) return;
    fetchData();
  }

  async function handleDuplicate(id: string) {
    if (!(await saved(mutate(`/api/admin/exp-costs/${id}/duplicate`, { method: "POST" })))) return;
    fetchData();
  }

  async function classify(cls: MarginClass | null) {
    if (!picked.size) return;
    setClassifying(true);
    const res = await mutate<{ updated: number; refused: { item: string; why: string }[] }>("/api/admin/exp-costs/classify", { method: "PATCH", body: { costIds: [...picked], marginClass: cls } });
    setClassifying(false);
    if (!res.ok) { window.alert(res.error); return; }
    if (res.data?.refused?.length) window.alert(`${res.data.refused.length} line(s) left as they were: ${res.data.refused.map((r) => `${r.item} (${r.why})`).join("; ")}`);
    setPicked(new Set());
    fetchData();
  }

  const togglePick = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickSuggested = (cls: MarginClass) => setPicked(new Set(unsortedInView.filter((c) => c.suggested?.cls === cls).map((c) => c.id)));

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const gridTemplate = buildGridTemplate([{ key: "_pick", label: "", width: "28px", required: true }, ...COLUMNS], visibleColumns);
  const anyFilter = filterState || filterScope || filterExp || filterEdition || filterYear || filterStatus || filterClass || search;

  const formEditions = editions.filter((ed) => !form.experience_id || ed.experience_id === form.experience_id);
  const editionTitle = (ed: Edition) => ed.exp_experiences?.title ?? experiences.find((x) => x.id === ed.experience_id)?.title ?? null;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Experience Costs</h1>
          <p className="text-sm admin-muted">
            {costs.length} cost line{costs.length !== 1 ? "s" : ""} · real money comes from the bank, everything else is expected or typed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />
          <button onClick={() => { setShowNew(!showNew); setEditId(null); setFormError(null); setForm({ ...emptyForm(), experience_id: filterExp, edition_id: filterEdition }); }} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
            New Cost
          </button>
        </div>
      </div>

      {/* Real or expected: the filter Nico asked for, with the sums on it. */}
      <div className="flex flex-wrap gap-2 mb-3">
        {STATES.map((s) => (
          <button
            key={s.key}
            onClick={() => setFilterState(s.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              border: "1px solid var(--admin-border)",
              backgroundColor: filterState === s.key ? "var(--admin-accent)" : "var(--admin-surface)",
              color: filterState === s.key ? "var(--admin-accent-contrast)" : undefined,
            }}
            title={s.key === "real" ? "A bank debit is attached to the line" : s.key === "hand" ? "A number somebody typed, not yet seen in the bank" : s.key === "expected" ? "Only the estimate exists" : ""}
          >
            {s.label} <span className="opacity-70">· {byState[s.key].n} · {eur(Math.round(byState[s.key].sum))}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <select value={filterScope} onChange={(e) => setFilterScope(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All scopes</option>
          {COST_SCOPES.map((s) => <option key={s.key} value={s.key}>{s.short}</option>)}
        </select>
        <select value={filterExp} onChange={(e) => { setFilterExp(e.target.value); setFilterEdition(""); }} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All Experiences</option>
          {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <select value={filterEdition} onChange={(e) => { const v = e.target.value; setFilterEdition(v); const ed = v && !filterExp ? editions.find((x) => x.id === v) : null; if (ed) setFilterExp(ed.experience_id); }} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All editions</option>
          {editions.filter((ed) => !filterExp || ed.experience_id === filterExp).map((ed) => <option key={ed.id} value={ed.id}>{editionOptionLabel(ed, filterExp ? null : editionTitle(ed))}</option>)}
        </select>
        <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">§ 25: all</option>
          <option value="unsorted">Unsorted</option>
          {MARGIN_CLASSES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item, notes…" className="admin-input text-sm px-3 py-1.5 rounded-lg w-44" />
        {anyFilter && <button onClick={() => { setFilterState(""); setFilterScope(""); setFilterExp(""); setFilterEdition(""); setFilterYear(""); setFilterStatus(""); setFilterClass(""); setSearch(""); }} className="text-xs admin-faint hover:admin-muted">Clear</button>}
        <span className="text-xs admin-faint ml-auto self-center">{sorted.length} shown</span>
      </div>

      {/* Bulk § 25 sorting. The rule from page 8 of the bookkeeping plan is
          offered as a suggestion per line; a person presses the bucket. */}
      {!selected && unsortedInView.length > 0 && (
        <div className="rounded-xl admin-tablecard mb-4" style={{ border: "1px solid #b45309" }}>
          <div className="px-4 py-3 flex flex-wrap items-center gap-2">
            <div className="mr-auto">
              <p className="text-sm font-bold admin-heading">{unsortedInView.length} line{unsortedInView.length === 1 ? "" : "s"} in view not yet sorted for § 25</p>
              <p className="text-xs admin-muted mt-0.5 max-w-2xl">
                Bought from a third party and delivered straight to the guest (hotel, the guests&apos; flights and transfers, food, the centre, gear rental, excursions, coaches bought in) is a Reisevorleistung and reduces the margin. Own coaches, own gear and Nico&apos;s own trip are Eigenleistung. Office, software, the accountant are Gemeinkosten.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] admin-faint mr-1">Select the lines the rule suggests as</span>
              {MARGIN_CLASSES.map((m) => (
                <button key={m.key} onClick={() => pickSuggested(m.key)} disabled={!suggestedCount(m.key)} className="px-2.5 py-1 text-[11px] font-semibold rounded-lg admin-surface disabled:opacity-40" style={{ border: "1px solid var(--admin-border)" }}>
                  {m.label} ({suggestedCount(m.key)})
                </button>
              ))}
            </div>
          </div>
          {picked.size > 0 && (
            <div className="px-4 py-3 flex flex-wrap items-center gap-2" style={{ borderTop: "1px solid var(--admin-border)" }}>
              <span className="text-sm font-bold admin-heading mr-2">{picked.size} selected → sort as</span>
              {MARGIN_CLASSES.map((m) => (
                <button key={m.key} disabled={classifying} onClick={() => classify(m.key)} title={m.blurb} className="px-3 py-1.5 text-xs font-bold rounded-lg disabled:opacity-40" style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
                  {m.label}
                </button>
              ))}
              <button disabled={classifying} onClick={() => classify(null)} className="px-3 py-1.5 text-xs font-bold rounded-lg admin-muted" style={{ border: "1px solid var(--admin-border)" }}>Unsort</button>
              <button onClick={() => setPicked(new Set())} className="px-3 py-1.5 text-xs font-bold rounded-lg admin-faint">Clear selection</button>
            </div>
          )}
        </div>
      )}
      {!selected && picked.size > 0 && unsortedInView.length === 0 && (
        <div className="px-4 py-3 mb-4 rounded-xl admin-tablecard flex flex-wrap items-center gap-2" style={{ border: "1px solid var(--admin-border)" }}>
          <span className="text-sm font-bold admin-heading mr-2">{picked.size} selected → sort as</span>
          {MARGIN_CLASSES.map((m) => (
            <button key={m.key} disabled={classifying} onClick={() => classify(m.key)} className="px-3 py-1.5 text-xs font-bold rounded-lg disabled:opacity-40" style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>{m.label}</button>
          ))}
          <button disabled={classifying} onClick={() => classify(null)} className="px-3 py-1.5 text-xs font-bold rounded-lg admin-muted" style={{ border: "1px solid var(--admin-border)" }}>Unsort</button>
          <button onClick={() => setPicked(new Set())} className="px-3 py-1.5 text-xs font-bold rounded-lg admin-faint">Clear selection</button>
        </div>
      )}

      {(() => {
        const scopeDef = COST_SCOPES.find((s) => s.key === form.scope)!;
        const formPane = (
          <div className="flex-1 min-w-0 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold admin-heading">{editId ? "Edit Cost" : "New Cost"}{editing?.unplanned && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-500">unplanned · created from a bank debit</span>}</h3>
              {editId && <button onClick={() => { handleDelete(editId); deselect(); }} className="text-xs text-red-400/70 hover:text-red-400 transition-colors">Delete</button>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <div className="col-span-2"><label className={labelClass}>Item *</label><input className={inputClass} value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} /></div>
              <div><label className={labelClass}>Status</label>
                <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                </select>
              </div>
            </div>

            {/* Where it belongs. Edition first and preselected; the rest one click away, with a reason. */}
            <div className="mb-4 p-3 rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>
              <label className={labelClass}>Belongs to</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COST_SCOPES.map((s) => (
                  <button key={s.key} type="button" onClick={() => setForm({ ...form, scope: s.key, edition_id: s.key === "edition" ? form.edition_id : "", year: s.key === "experience_year" || s.key === "year" ? form.year || String(new Date().getFullYear()) : "", experience_id: s.key === "year" || s.key === "general" ? "" : form.experience_id })}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    style={{ border: "1px solid var(--admin-border)", backgroundColor: form.scope === s.key ? "var(--admin-accent)" : "transparent", color: form.scope === s.key ? "var(--admin-accent-contrast)" : undefined }}>
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-[12px] admin-faint mb-3">{scopeDef.blurb}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {(form.scope === "edition" || form.scope === "experience_year") && (
                  <div><label className={labelClass}>Experience{form.scope === "edition" ? " (narrows the list)" : " *"}</label>
                    <select className={inputClass} value={form.experience_id} onChange={(e) => setForm({ ...form, experience_id: e.target.value, edition_id: "" })}>
                      <option value="">{form.scope === "edition" ? "Any" : "—"}</option>
                      {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                    </select>
                  </div>
                )}
                {form.scope === "edition" && (
                  <div className="col-span-2"><label className={labelClass}>Edition *</label>
                    <select className={inputClass} value={form.edition_id} onChange={(e) => { const ed = editions.find((x) => x.id === e.target.value); setForm({ ...form, edition_id: e.target.value, experience_id: ed?.experience_id ?? form.experience_id }); }}>
                      <option value="">Pick the trip…</option>
                      {formEditions.map((ed) => <option key={ed.id} value={ed.id}>{editionOptionLabel(ed, form.experience_id ? null : editionTitle(ed))}</option>)}
                    </select>
                  </div>
                )}
                {(form.scope === "experience_year" || form.scope === "year") && (
                  <div><label className={labelClass}>Year *</label>
                    <select className={inputClass} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}>
                      <option value="">—</option>
                      {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                )}
                {form.scope !== "edition" && (
                  <div className="col-span-2 sm:col-span-3"><label className={labelClass}>Why not one trip? *</label>
                    <input className={inputClass} value={form.scope_reason} onChange={(e) => setForm({ ...form, scope_reason: e.target.value })} placeholder="e.g. one flight for the coach covers all three Bonaire weeks" />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <div><label className={labelClass}>Expected (€)</label><input className={inputClass} type="number" step="0.01" value={form.estimated_amount} onChange={(e) => setForm({ ...form, estimated_amount: e.target.value })} /></div>
              <div>
                <label className={labelClass}>Actual, typed (€)</label>
                <input className={inputClass} type="number" step="0.01" value={form.actual_amount} onChange={(e) => setForm({ ...form, actual_amount: e.target.value })} disabled={!!editing && editing.money.attachedBank > 0} />
                {editing && editing.money.attached > 0 && (
                  <p className="text-[11px] admin-faint mt-1">{eur(editing.money.attached)} is attached below{editing.money.attachedBank > 0 ? " from the bank, so this line is real and the typed number is not used" : "; it outranks the typed number"}.</p>
                )}
                {editing?.money.zeroActualOnEstimate && (
                  <p className="text-[11px] text-amber-500 mt-1">A zero was typed here on an estimate. Every report counts this line as €0. Clear it to fall back to the expected amount.</p>
                )}
              </div>
              <div><label className={labelClass}>Date</label><input className={inputClass} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              {form.actual_amount !== "" && (
                <div className="col-span-2 sm:col-span-3">
                  <label className={labelClass}>Where does this actual come from? *{editing?.actual_provenance === "unverified" && !form.actual_note ? " (legacy row, not yet said)" : ""}</label>
                  <input className={inputClass} value={form.actual_note} onChange={(e) => setForm({ ...form, actual_note: e.target.value })} placeholder="Nico's private card · cash on site · offset against … · (a bank debit should be allocated from the Bank page instead)" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className={labelClass}>§ 25 bucket</label>
                <select className={inputClass} value={form.margin_class} onChange={(e) => setForm({ ...form, margin_class: e.target.value })}>
                  <option value="">Unsorted</option>
                  {MARGIN_CLASSES.map((m) => <option key={m.key} value={m.key} disabled={m.key === "travel_input" && form.scope === "general"}>{m.label}</option>)}
                </select>
                {editing?.suggested && !form.margin_class && (
                  <button type="button" onClick={() => setForm({ ...form, margin_class: editing.suggested!.cls })} className="text-[11px] mt-1 underline admin-muted">
                    Rule suggests {classLabel(editing.suggested.cls)} ({editing.suggested.reason})
                  </button>
                )}
              </div>
              <div className="col-span-2"><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>

            {/* What this does, before it is saved. */}
            {consequence && consequenceReady && (
              <div className="mb-4 p-3 rounded-lg text-[12px]" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface-hover)" }}>
                <div className="text-[10px] font-bold tracking-[0.08em] admin-faint uppercase mb-2">What {eur2(consequence.amount)} here does</div>
                {consequence.pnl && consequence.margin && consequence.edition ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <div className="font-semibold admin-heading mb-1">P&amp;L · {[consequence.edition.title?.replace(/^NP7\s+(Experience\s+)?/i, ""), consequence.edition.label].filter(Boolean).join(" · ")}</div>
                      <div className="admin-muted">Costs {eur2(consequence.pnl.before.costs)} → <b>{eur2(consequence.pnl.after.costs)}</b> ({delta(consequence.pnl.before.costs, consequence.pnl.after.costs)})</div>
                      <div className="admin-muted">Net {eur2(consequence.pnl.before.net)} → <b>{eur2(consequence.pnl.after.net)}</b></div>
                    </div>
                    <div>
                      <div className="font-semibold admin-heading mb-1">§ 25 record · {consequence.margin.territory}</div>
                      <div className="admin-muted">Reisevorleistungen {eur2(consequence.margin.before.reisevorleistungen)} → <b>{eur2(consequence.margin.after.reisevorleistungen)}</b></div>
                      <div className="admin-muted">Margin {eur2(consequence.margin.before.bruttomarge)} → <b>{eur2(consequence.margin.after.bruttomarge)}</b>{consequence.margin.territory === "EU" && <> · VAT {eur2(consequence.margin.before.umsatzsteuer)} → <b>{eur2(consequence.margin.after.umsatzsteuer)}</b></>}</div>
                    </div>
                  </div>
                ) : (
                  <div className="admin-muted">No trip&apos;s P&amp;L and no § 25 record sees this cost. {consequence.board?.note}</div>
                )}
                {consequence.board?.applies && consequence.pnl && <div className="admin-faint mt-1">{consequence.board.note}</div>}
                {consequence.notes.map((n, i) => <div key={i} className="mt-1 text-amber-500">{n}</div>)}
              </div>
            )}

            {formError && <div className="mb-3 text-sm text-red-400">{formError}</div>}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={!form.item} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{editId ? "Update" : "Create"}</button>
              <button onClick={deselect} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
            </div>
            {editId && <CostLinksEditor costId={editId} onChange={fetchData} />}
          </div>
        );

        if (loading) return <div className="py-12 text-center text-sm admin-faint">Loading...</div>;

        const row = (c: ExpCost) => (
          <div key={c.id} className="grid gap-3 px-5 py-3 cursor-pointer transition-colors items-center" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            onClick={() => startEdit(c)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => togglePick(c.id)} aria-label="Select for § 25 sorting" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium admin-heading truncate">
                {c.item}
                {c.unplanned && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-500">unplanned</span>}
              </div>
              <div className="text-xs admin-faint truncate">
                {c.date ? formatDate(c.date) : ""}
                {c.margin_class === null && c.suggested && <span className="ml-1">· rule suggests {classLabel(c.suggested.cls)} ({c.suggested.reason})</span>}
                {c.money.zeroActualOnEstimate && <span className="ml-1 text-amber-500">· typed €0 actual, counted as zero</span>}
              </div>
            </div>
            {visibleColumns.has("scope") && (
              <span className="text-xs admin-muted truncate" title={c.scope_reason ?? undefined}>
                <span className="px-1.5 py-0.5 mr-1 rounded text-[9px] font-bold uppercase tracking-wide bg-slate-500/15 admin-faint">{COST_SCOPES.find((s) => s.key === c.scope)?.short}</span>
                {c.scopeText}
              </span>
            )}
            {visibleColumns.has("estimated_amount") && <span className="text-xs admin-muted">{eur(c.estimated_amount)}</span>}
            {visibleColumns.has("actual") && (
              <span className="text-xs font-medium flex items-center gap-1.5 min-w-0">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0 ${stateColor[c.money.state]}`} title={c.money.provenance === "off_bank" ? c.actual_note ?? "recorded off the bank" : c.money.provenance === "unverified" ? "legacy row, not yet decided" : c.money.provenance === "bank" ? "a bank debit is attached" : "only the estimate exists"}>
                  {c.money.state === "hand" ? "hand" : c.money.state}
                </span>
                <span className={c.money.state === "expected" ? "admin-faint" : c.money.state === "real" ? "text-green-500" : "text-amber-500"}>{c.money.state === "expected" ? "—" : eur(c.money.value)}</span>
              </span>
            )}
            {visibleColumns.has("open") && <span className="text-xs admin-muted">{c.money.open > 0 ? eur(c.money.open) : "—"}</span>}
            {visibleColumns.has("status") && (
              <span><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusColor(c.status)}`}>{c.status || "—"}</span></span>
            )}
            {visibleColumns.has("margin_class") && (
              <span className={`text-xs ${c.margin_class ? "admin-muted" : "text-amber-500"}`}>{classLabel(c.margin_class)}</span>
            )}
            <div onClick={(e) => e.stopPropagation()}>
              <RowActions onDuplicate={() => handleDuplicate(c.id)} onDelete={() => handleDelete(c.id)} />
            </div>
          </div>
        );

        if (!selected) {
          /* ── Wide table (default) ── */
          return sorted.length === 0 ? (
            <div className="py-16 text-center"><p className="text-sm admin-faint">No costs match</p></div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid gap-3 px-5 py-3 admin-surface items-center" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}>
                <input type="checkbox" aria-label="Select all shown" checked={sorted.length > 0 && sorted.every((c) => picked.has(c.id))} onChange={(e) => setPicked(e.target.checked ? new Set(sorted.map((c) => c.id)) : new Set())} />
                {COLUMNS.filter((c) => c.required || visibleColumns.has(c.key)).map((col) =>
                  col.key === "_actions" ? <span key={col.key} /> : (
                    <SortableHeader key={col.key} label={col.label} sortKey={col.key} currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  )
                )}
              </div>
              {sorted.map(row)}
            </div>
          );
        }

        /* ── Master-detail (rail + detail) — deselect returns to the wide table ── */
        return (
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="lg:w-[300px] shrink-0">
              <button onClick={deselect} className="mb-2 inline-flex items-center gap-1.5 text-xs admin-faint hover:admin-muted transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
                Back to wide view
              </button>
              <div className="rounded-xl admin-tablecard overflow-hidden max-h-[72vh] overflow-y-auto" style={{ border: "1px solid var(--admin-border)" }}>
                {sorted.map((c) => (
                  <button key={c.id} onClick={() => startEdit(c)} className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors" style={{ borderBottom: "1px solid var(--admin-border)", backgroundColor: editId === c.id ? "var(--admin-surface-hover)" : "transparent" }}>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium admin-heading truncate">{c.item}</span>
                      <span className="block text-[11px] admin-faint truncate">{c.scopeText} · exp {eur(c.estimated_amount)}{c.money.state !== "expected" ? ` · ${COST_STATE_LABEL[c.money.state].toLowerCase()} ${eur(c.money.value)}` : ""}</span>
                    </span>
                    <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${stateColor[c.money.state]}`}>{c.money.state === "hand" ? "hand" : c.money.state}</span>
                  </button>
                ))}
              </div>
            </div>
            {formPane}
          </div>
        );
      })()}
    </div>
  );
}
