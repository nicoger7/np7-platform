"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { DIVISIONS, DOCUMENT_TYPES, formatMoney, type Division, type DocumentType } from "@/lib/invoices/types";

interface DocumentRow {
  id: string;
  booking_id: string | null;
  contact_id: string | null;
  division: Division;
  type: DocumentType;
  invoice_number: string | null;
  title: string | null;
  amount: number | null;
  currency: string;
  status: "issued" | "void";
  issued_at: string;
  paid_at: string | null;
  due_date: string | null;
  signedUrl: string | null;
  // joined
  booking_name?: string | null;
  contact_name?: string | null;
}

/**
 * The finance list holds two different kinds of paper and they must not be read
 * as one pile.
 *
 * A TAX INVOICE carries a number from the gapless counter and is the document
 * the tax office cares about. A pro-forma is a payment request — it carries a
 * PF- reference precisely so it can never be mistaken for one, and it is voided
 * and replaced as a matter of course. A booking confirmation is neither.
 *
 * Reading them in one undifferentiated list is what made "a proper invoice
 * section" the ask: the totals were meaningless (a pro-forma and the invoice
 * that replaced it both counted), and nobody could answer the one question an
 * accountant always asks — is the sequence complete?
 */
const TAX_TYPES: DocumentType[] = [
  "deposit_invoice",
  "downpayment_invoice",
  "final_invoice",
  "addon_invoice",
  "credit_note",
];
const isProforma = (d: DocumentRow) =>
  d.type === "proforma_invoice" || String(d.invoice_number ?? "").startsWith("PF-");
const isTaxInvoice = (d: DocumentRow) => TAX_TYPES.includes(d.type) && !isProforma(d);

type View = "invoices" | "proforma" | "all";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function labelType(t: DocumentType) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The §14 UStG question, answered on the page instead of in a spreadsheet.
 *
 * The counter is per division and year, NOT per prefix — NP7 renamed from
 * Surfcenter Experience mid-year, so 2026 legitimately reads SCXP-2026-0001,
 * SCXP-2026-0002, NP7-XP-2026-0003… Grouping by the printed prefix would have
 * reported a two-invoice hole that does not exist, and sent someone looking for
 * paperwork that was never missing. Voided invoices keep their number and are
 * counted here for the same reason: the sequence must have no holes, and a
 * cancelled invoice is not a hole.
 */
type SeqCheck = { key: string; year: number; division: string; first: number; last: number; missing: number[]; count: number };
function sequenceChecks(docs: DocumentRow[]): SeqCheck[] {
  const groups = new Map<string, { division: string; year: number; nums: number[] }>();
  for (const d of docs) {
    const n = d.invoice_number;
    if (!n || n.startsWith("PF-")) continue;
    const m = /-(\d{4})-(\d+)$/.exec(n);
    if (!m) continue;
    const year = Number(m[1]);
    const key = `${d.division}:${year}`;
    if (!groups.has(key)) groups.set(key, { division: d.division, year, nums: [] });
    groups.get(key)!.nums.push(Number(m[2]));
  }
  return [...groups.entries()].map(([key, g]) => {
    const nums = [...new Set(g.nums)].sort((a, b) => a - b);
    const first = nums[0] ?? 0;
    const last = nums[nums.length - 1] ?? 0;
    const have = new Set(nums);
    const missing: number[] = [];
    for (let i = first; i <= last; i++) if (!have.has(i)) missing.push(i);
    return { key, year: g.year, division: g.division, first, last, missing, count: nums.length };
  }).sort((a, b) => b.year - a.year);
}

function toCsv(rows: DocumentRow[]): string {
  const head = ["Invoice number", "Date", "Guest", "Booking", "Type", "Amount", "Currency", "Status", "Division", "Paid on"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((d) => [
    d.invoice_number ?? "",
    d.issued_at ? d.issued_at.slice(0, 10) : "",
    d.contact_name ?? "",
    d.booking_name ?? "",
    labelType(d.type),
    d.amount == null ? "" : Number(d.amount).toFixed(2),
    d.currency ?? "EUR",
    d.status,
    d.division,
    d.paid_at ? d.paid_at.slice(0, 10) : "",
  ].map(esc).join(","));
  return [head.join(","), ...lines].join("\n");
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("invoices");
  const [filterDivision, setFilterDivision] = useState<Division | "">("");
  const [filterType, setFilterType] = useState<DocumentType | "">("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterDivision) params.set("division", filterDivision);
    if (filterType) params.set("type", filterType);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo) params.set("to", filterTo);
    if (debounced) params.set("q", debounced);
    const res = await fetch(`/api/admin/documents?${params}`);
    if (res.ok) {
      const data = await res.json();
      setDocs(data.documents || []);
    }
    setLoading(false);
  }, [filterDivision, filterType, filterFrom, filterTo, debounced]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const shown = useMemo(() => {
    if (view === "invoices") return docs.filter(isTaxInvoice);
    if (view === "proforma") return docs.filter(isProforma);
    return docs;
  }, [docs, view]);

  const counts = useMemo(() => ({
    invoices: docs.filter(isTaxInvoice).length,
    proforma: docs.filter(isProforma).length,
    all: docs.length,
  }), [docs]);

  /*
   * Money, stated the way an invoice list has to state it: what stands, what
   * was cancelled, what has been settled. A void invoice is not revenue.
   *
   * A credit note is ALREADY STORED NEGATIVE (NP7-XP-2026-0024 is -1,495), so
   * it is added like every other row. Subtracting it — the obvious-looking
   * `charges - credits` — negates a negative and inflates the total by twice
   * the credit: Dimitri Lagendijk's three documents come to exactly his 2,550
   * price, and this read them as 5,540.
   */
  const totals = useMemo(() => {
    const live = shown.filter((d) => d.status !== "void");
    const sum = (rows: DocumentRow[]) => rows.reduce((t, d) => t + (Number(d.amount) || 0), 0);
    const credits = live.filter((d) => d.type === "credit_note");
    const charges = live.filter((d) => d.type !== "credit_note");
    return {
      issued: sum(charges) + sum(credits),
      issuedCount: charges.length,
      credited: sum(credits),
      creditCount: credits.length,
      voided: sum(shown.filter((d) => d.status === "void")),
      voidCount: shown.filter((d) => d.status === "void").length,
      settled: sum(charges.filter((d) => d.paid_at)),
      openCount: charges.filter((d) => !d.paid_at).length,
      open: sum(charges.filter((d) => !d.paid_at)),
    };
  }, [shown]);

  const checks = useMemo(() => (view === "proforma" ? [] : sequenceChecks(docs)), [docs, view]);

  function exportCsv() {
    const blob = new Blob([toCsv(shown)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `np7-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleVoid(id: string) {
    if (!confirm("Void this document? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "void" }),
    });
    if (res.ok) fetchDocs();
  }

  const inputClass =
    "px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const cols = "150px 1fr 170px 130px 100px 90px 70px 70px";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold admin-heading">Invoices</h1>
          <p className="text-sm admin-muted mt-0.5">
            {loading ? "Loading…" : `${shown.length} ${view === "invoices" ? "invoice" : "document"}${shown.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={shown.length === 0}
          className="px-4 py-2 text-sm font-bold rounded-lg transition-colors admin-muted hover:admin-heading disabled:opacity-40"
          style={{ border: "1px solid var(--admin-border)" }}
        >
          Export CSV
        </button>
      </div>

      {/* Which pile you are looking at */}
      <div className="flex rounded-lg overflow-hidden w-fit mb-4" style={{ border: "1px solid var(--admin-border)" }}>
        {([["invoices", "Invoices", counts.invoices], ["proforma", "Pro-forma", counts.proforma], ["all", "All documents", counts.all]] as const).map(([key, label, n]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-2 text-sm font-bold transition-colors ${view === key ? "text-[var(--admin-accent-contrast)]" : "admin-muted hover:admin-heading"}`}
            style={view === key ? { backgroundColor: "var(--admin-accent)" } : undefined}
          >
            {label} <span className={view === key ? "opacity-70" : "admin-faint"}>{n}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          className={`${inputClass} w-64`}
          placeholder="Search number, guest or title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={inputClass} value={filterDivision} onChange={(e) => setFilterDivision(e.target.value as Division | "")}>
          <option value="">All divisions</option>
          {DIVISIONS.map((d) => (<option key={d} value={d} className="capitalize">{d}</option>))}
        </select>

        <select className={inputClass} value={filterType} onChange={(e) => setFilterType(e.target.value as DocumentType | "")}>
          <option value="">All types</option>
          {DOCUMENT_TYPES.map((t) => (<option key={t} value={t}>{labelType(t)}</option>))}
        </select>

        <div className="flex items-center gap-2">
          <label className="text-xs admin-faint">From</label>
          <input type="date" className={inputClass} value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs admin-faint">To</label>
          <input type="date" className={inputClass} value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
        </div>
        {(filterDivision || filterType || filterFrom || filterTo || search) && (
          <button
            onClick={() => { setFilterDivision(""); setFilterType(""); setFilterFrom(""); setFilterTo(""); setSearch(""); }}
            className="px-3 py-2 text-xs admin-muted rounded-lg transition-colors"
            style={{ border: "1px solid var(--admin-border)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* What the selection adds up to */}
      {!loading && shown.length > 0 && (
        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {[
            { label: "Invoiced", value: formatMoney(totals.issued), sub: `${totals.issuedCount} document${totals.issuedCount !== 1 ? "s" : ""}${totals.creditCount ? ` · ${formatMoney(totals.credited)} credited back` : ""}` },
            { label: "Settled", value: formatMoney(totals.settled), sub: "marked paid" },
            { label: "Still open", value: formatMoney(totals.open), sub: `${totals.openCount} unpaid` },
            { label: "Cancelled", value: formatMoney(totals.voided), sub: `${totals.voidCount} void — not revenue` },
          ].map((c) => (
            <div key={c.label} className="rounded-xl px-4 py-3" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{c.label}</div>
              <div className="text-xl font-bold admin-heading mt-1">{c.value}</div>
              <div className="text-[11px] admin-faint mt-0.5">{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* The sequence, because someone always asks */}
      {!loading && checks.length > 0 && (
        <div className="rounded-xl px-4 py-3 mb-5 flex flex-wrap gap-x-6 gap-y-2" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase self-center">Invoice sequence</span>
          {checks.map((c) => (
            <span key={c.key} className="text-xs admin-muted">
              <span className="capitalize admin-heading font-medium">{c.division}</span> {c.year} ·{" "}
              <span className="font-mono">{String(c.first).padStart(4, "0")}–{String(c.last).padStart(4, "0")}</span> ·{" "}
              {c.missing.length === 0 ? (
                <span className="text-green-400">no gaps ({c.count} numbers)</span>
              ) : (
                <span className="text-red-400">
                  {c.missing.length} missing: {c.missing.slice(0, 8).map((n) => String(n).padStart(4, "0")).join(", ")}
                  {c.missing.length > 8 ? "…" : ""}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : shown.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">
            {view === "invoices" ? "No invoices match these filters" : "No documents found"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          {/* Header */}
          <div
            className="grid gap-3 px-5 py-3 admin-surface"
            style={{ gridTemplateColumns: cols, borderBottom: "1px solid var(--admin-border)" }}
          >
            {["Invoice #", "Title / Booking", "Guest", "Type", "Amount", "Date", "Status", ""].map((h) => (
              <span key={h} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>

          {/* Rows */}
          {shown.map((doc) => (
            <div
              key={doc.id}
              className="grid gap-3 px-5 py-3 transition-colors"
              style={{
                gridTemplateColumns: cols,
                borderBottom: "1px solid var(--admin-border)",
                opacity: doc.status === "void" ? 0.55 : 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <span className={`text-xs font-mono self-center truncate ${doc.status === "void" ? "line-through admin-faint" : "admin-muted"}`}>
                {doc.invoice_number || "—"}
              </span>
              <div className="min-w-0 self-center">
                <div className="text-sm font-medium admin-heading truncate">{doc.title || labelType(doc.type)}</div>
                {doc.booking_id && (
                  <Link
                    href={`/admin/bookings/${doc.booking_id}`}
                    className="text-xs admin-faint hover:text-[#0aa3c7] truncate block"
                  >
                    {doc.booking_name || "Open booking"}
                  </Link>
                )}
              </div>
              <span className="text-xs admin-muted self-center truncate">
                {doc.contact_id ? (
                  <Link href={`/admin/contacts/${doc.contact_id}`} className="hover:text-[#0aa3c7]">
                    {doc.contact_name || "Unnamed contact"}
                  </Link>
                ) : "—"}
              </span>
              <span className="text-xs admin-muted self-center">{labelType(doc.type)}</span>
              <span className="text-sm font-medium admin-heading self-center tabular-nums">
                {formatMoney(doc.amount, doc.currency)}
              </span>
              <span className="text-xs admin-faint self-center">{fmtDate(doc.issued_at)}</span>
              <span className="self-center">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    doc.status === "void"
                      ? "bg-red-500/15 text-red-400"
                      : doc.paid_at
                        ? "bg-green-500/15 text-green-400"
                        : "bg-amber-500/15 text-amber-400"
                  }`}
                >
                  {doc.status === "void" ? "void" : doc.paid_at ? "paid" : "open"}
                </span>
              </span>
              <div className="self-center flex items-center gap-2">
                {doc.signedUrl && (
                  <a
                    href={doc.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors"
                  >
                    PDF
                  </a>
                )}
                {doc.status !== "void" && (
                  <button
                    onClick={() => handleVoid(doc.id)}
                    className="text-xs text-red-400/50 hover:text-red-400 transition-colors"
                  >
                    Void
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
