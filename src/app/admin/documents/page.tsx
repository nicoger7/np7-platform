"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { DIVISIONS, DOCUMENT_TYPES, formatMoney, type Division, type DocumentType } from "@/lib/invoices/types";
import {
  docKind,
  typeLabel,
  correctionMeta,
  correctedMeta,
  correctionsByOriginal,
  correctionState,
  correctionAllowance,
  summarizeDocuments,
  sequenceChecks,
  isTaxInvoiceDoc,
  KIND_LABELS,
  type DocKind,
} from "@/lib/invoices/corrections";
import { CorrectionDialog, type CorrectionMode } from "./correction-dialog";

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
  created_at?: string | null;
  paid_at: string | null;
  due_date: string | null;
  sent_at: string | null;
  meta: Record<string, unknown> | null;
  signedUrl: string | null;
  // joined
  booking_name?: string | null;
  contact_name?: string | null;
}

/**
 * The finance list holds several kinds of paper and they must not be read as
 * one pile.
 *
 * A TAX INVOICE carries a number from the gapless counter and is the document
 * the tax office cares about. A STORNO reverses one in full and a CREDIT NOTE
 * reduces one; both take the next number from the same counter and are stored
 * negative. A pro-forma is a payment request: it carries a PF- reference
 * precisely so it can never be mistaken for any of them, and it is voided and
 * replaced as a matter of course. A booking confirmation is none of these.
 *
 * Reading them in one undifferentiated list is what made "a proper invoice
 * section" the ask, and reading Stornos as "cancelled" is what made the
 * summary lie: a reversed invoice is negative revenue with a number, not a
 * replaced draft.
 */
type View = "invoices" | "stornos" | "credits" | "proforma" | "all";

const VIEW_KIND: Record<Exclude<View, "all">, DocKind> = {
  invoices: "invoice",
  stornos: "storno",
  credits: "credit",
  proforma: "proforma",
};

/**
 * Void and Storno are not two words for one act, and the page has to stop
 * offering them as if they were.
 *
 * VOID says this document never counted. That is true of a pro-forma, which is
 * a payment request and is replaced as a matter of course, and of a tax invoice
 * nobody ever received (a Fehldruck). The row keeps its number and reads
 * cancelled, so the § 14 sequence still has no holes.
 *
 * STORNO says an invoice that DID count is being reversed. It is its own
 * document with its own number from the same counter, and the customer gets it,
 * because they are holding the original in their own books. Once an invoice has
 * been sent, this is the only honest correction.
 */
const isCancellableTax = (d: DocumentRow) =>
  isTaxInvoiceDoc(d) && d.status !== "void" && !d.sent_at;

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function labelType(t: DocumentType) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function toCsv(rows: DocumentRow[], all: DocumentRow[]): string {
  const byOriginal = correctionsByOriginal(all);
  const head = ["Invoice number", "Date", "Guest", "Booking", "Kind", "Type", "Amount", "Currency", "Status", "Corrects", "Corrected by", "Division", "Sent on", "Paid on"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((d) => {
    const kind = docKind(d);
    const st = isTaxInvoiceDoc(d) ? correctionState(d, byOriginal) : null;
    const status = d.status === "void" ? (kind === "proforma" || kind === "confirmation" ? "void" : "cancelled")
      : st?.reversed ? "reversed" : d.paid_at ? "paid" : "open";
    return [
      d.invoice_number ?? "",
      d.issued_at ? d.issued_at.slice(0, 10) : "",
      d.contact_name ?? "",
      d.booking_name ?? "",
      KIND_LABELS[kind],
      labelType(d.type),
      d.amount == null ? "" : Number(d.amount).toFixed(2),
      d.currency ?? "EUR",
      status,
      correctionMeta(d).original_invoice_number ?? "",
      st?.credits.map((c) => c.invoice_number).filter(Boolean).join(" ") ?? "",
      d.division,
      d.sent_at ? d.sent_at.slice(0, 10) : "",
      d.paid_at ? d.paid_at.slice(0, 10) : "",
    ].map(esc).join(",");
  });
  return [head.join(","), ...lines].join("\n");
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [view, setView] = useState<View>("invoices");
  const [filterDivision, setFilterDivision] = useState<Division | "">("");
  const [filterType, setFilterType] = useState<DocumentType | "">("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [unbilled, setUnbilled] = useState<{ since: string | null; total: number; rows: { id: string; name: string | null; gap: number }[] } | null>(null);
  const [correcting, setCorrecting] = useState<{ id: string; mode: CorrectionMode } | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Money in, no invoice out. Loaded once — it answers a question about the
  // whole book, not about whatever is filtered on screen.
  useEffect(() => {
    fetch("/api/admin/documents/unbilled")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUnbilled(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Which filter set the rows on screen belong to. "Loading" means the rows
  // are for a different query than the one in the controls, so a filter
  // change reads as loading by itself and nothing has to flip a flag.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const queryKey = JSON.stringify([filterDivision, filterType, filterFrom, filterTo, debounced]);
  const loading = loadedFor !== queryKey;

  const fetchDocs = useCallback(() => {
    const params = new URLSearchParams();
    if (filterDivision) params.set("division", filterDivision);
    if (filterType) params.set("type", filterType);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo) params.set("to", filterTo);
    if (debounced) params.set("q", debounced);
    return fetch(`/api/admin/documents?${params}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setDocs(data.documents || []);
        }
      })
      .catch(() => {})
      .then(() => setLoadedFor(queryKey));
  }, [filterDivision, filterType, filterFrom, filterTo, debounced, queryKey]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const byOriginal = useMemo(() => correctionsByOriginal(docs), [docs]);

  const shown = useMemo(() => {
    if (view === "all") return docs;
    const kind = VIEW_KIND[view];
    return docs.filter((d) => docKind(d) === kind);
  }, [docs, view]);

  const counts = useMemo(() => {
    const c = { invoices: 0, stornos: 0, credits: 0, proforma: 0, all: docs.length };
    for (const d of docs) {
      const k = docKind(d);
      if (k === "invoice") c.invoices += 1;
      else if (k === "storno") c.stornos += 1;
      else if (k === "credit") c.credits += 1;
      else if (k === "proforma") c.proforma += 1;
    }
    return c;
  }, [docs]);

  /*
   * Money, stated the way an invoice list has to state it. Every invoice is
   * counted net of its corrections whatever the filter hides, and a Storno is
   * negative revenue with a number, never "cancelled". See summarizeDocuments.
   */
  const totals = useMemo(() => summarizeDocuments(shown, docs), [shown, docs]);

  const checks = useMemo(() => (view === "proforma" ? [] : sequenceChecks(docs)), [docs, view]);

  function exportCsv() {
    const blob = new Blob([toCsv(shown, docs)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `np7-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Cancel a document that never left the house.
   *
   * This is NOT the same act on both kinds of paper: voiding a pro-forma is
   * routine (the payment flow does it automatically every time a request
   * turns into an invoice); voiding a numbered tax invoice is a Fehldruck,
   * defensible only while nobody has it, and it has to carry the reason that
   * explains the gap-that-isn't.
   */
  async function handleVoid(doc: DocumentRow) {
    let reason: string | null = null;
    if (isCancellableTax(doc) || (doc.type === "credit_note" && !doc.sent_at)) {
      reason = prompt(
        `Cancel ${doc.invoice_number ?? "this document"}?\n\nOnly for paper nobody has seen. The number stays in the sequence, so write down why:`
      );
      if (!reason || !reason.trim()) return;
    } else if (!confirm("Void this document? This cannot be undone.")) {
      return;
    }
    const res = await fetch(`/api/admin/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "void", ...(reason ? { reason: reason.trim() } : {}) }),
    });
    if (res.ok) { fetchDocs(); return; }
    // An invoice already in the customer's hands is refused here and told to
    // use a Storno instead. Swallowing that left the button looking broken.
    const j = await res.json().catch(() => ({}));
    alert(j.error ?? "Couldn't cancel this document.");
  }

  async function handleSend(doc: DocumentRow) {
    if (doc.sent_at && !confirm(`${doc.invoice_number ?? "This document"} was sent on ${fmtDate(doc.sent_at)}. Send it again?`)) return;
    setSending(doc.id); setNotice(null);
    const res = await fetch(`/api/admin/documents/${doc.id}/send`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setSending(null);
    if (res.ok) { setNotice(`${doc.invoice_number ?? "Document"} sent.`); fetchDocs(); }
    else setNotice(j.error ?? "Could not send it.");
  }

  const inputClass =
    "px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const cols = "150px 1fr 160px 120px 100px 90px 96px 150px";

  const summaryCards = (() => {
    const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
    if (view === "stornos" || view === "credits") {
      return [
        { label: view === "stornos" ? "Reversed" : "Credited", value: formatMoney(totals.reversed), sub: `${n(totals.reversedCount, view === "stornos" ? "Storno" : "credit note")} · negative revenue` },
        { label: "Refunds due", value: formatMoney(totals.refundsDue), sub: "paid money owed back, logged by hand under Payments" },
        { label: "Cancelled numbers", value: formatMoney(totals.voided), sub: `${totals.voidCount} replaced, never revenue` },
      ];
    }
    return [
      { label: "Invoiced", value: formatMoney(totals.invoiced), sub: `${n(totals.invoiceCount, "invoice")}${totals.reversedCount ? ` · net of ${formatMoney(Math.abs(totals.reversed))} reversed` : ", net of corrections"}` },
      { label: "Settled", value: formatMoney(totals.settled), sub: `${n(totals.settledCount, "invoice")} marked paid` },
      { label: "Still open", value: formatMoney(totals.open), sub: `${totals.openCount} unpaid` },
      /* Stornos and credit notes: numbered documents that take revenue back.
         Not to be confused with the card after it, which is numbers written
         off before anyone saw the paper. */
      { label: "Reversed", value: formatMoney(totals.reversed), sub: totals.reversedCount ? `${n(totals.reversedCount, "correction")}${totals.refundsDue ? ` · ${formatMoney(totals.refundsDue)} refunds due` : ""}` : "no Stornos or credit notes" },
      { label: "Cancelled numbers", value: formatMoney(totals.voided), sub: `${totals.voidCount} replaced, never revenue` },
    ];
  })();

  /** The chip a row wears. The state that matters is sent / paid / open / reversed. */
  function statusChip(doc: DocumentRow) {
    const kind = docKind(doc);
    if (doc.status === "void") {
      const cancelled = kind !== "proforma" && kind !== "confirmation";
      return { text: cancelled ? "cancelled" : "void", cls: "bg-red-500/15 text-red-400", title: String(
        (doc.meta as { void_reason?: string; superseded_reason?: string } | null)?.void_reason
        ?? (doc.meta as { superseded_reason?: string } | null)?.superseded_reason
        ?? "Cancelled, no reason recorded") };
    }
    if (kind === "storno" || kind === "credit") {
      return { text: doc.sent_at ? "sent" : "not sent", cls: doc.sent_at ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400", title: doc.sent_at ? `Sent ${fmtDate(doc.sent_at)}` : "The guest has not received this yet" };
    }
    if (kind === "confirmation") return { text: "issued", cls: "bg-green-500/15 text-green-400", title: undefined };
    if (kind === "proforma") {
      return doc.sent_at
        ? { text: "sent", cls: "bg-amber-500/15 text-amber-400", title: `Payment request sent ${fmtDate(doc.sent_at)}${doc.due_date ? `, due ${fmtDate(doc.due_date)}` : ""}` }
        : { text: "not sent", cls: "bg-amber-500/15 text-amber-400", title: "The guest has not received this request yet" };
    }
    const st = correctionState(doc, byOriginal);
    if (st.reversed) {
      const by = st.credits.find((c) => correctionMeta(c).full === true) ?? st.credits[st.credits.length - 1];
      return { text: "reversed", cls: "bg-slate-500/15 admin-muted", title: `Reversed by ${by?.invoice_number ?? "a Storno"}` };
    }
    if (doc.paid_at) return { text: st.credited ? "paid · reduced" : "paid", cls: "bg-green-500/15 text-green-400", title: `Settled ${fmtDate(doc.paid_at)}${st.credited ? `, ${formatMoney(st.credited, doc.currency)} credited back` : ""}` };
    return doc.sent_at
      ? { text: "sent · open", cls: "bg-amber-500/15 text-amber-400", title: `Sent ${fmtDate(doc.sent_at)}, not paid` }
      : { text: "not sent", cls: "bg-amber-500/15 text-amber-400", title: "Issued, but the guest has not received it yet" };
  }

  return (
    <div className="fin">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold admin-heading">Invoices</h1>
          <p className="text-sm admin-muted mt-0.5">
            {loading ? "Loading…" : `${shown.length} ${view === "all" ? "document" : view === "invoices" ? "invoice" : view === "stornos" ? "Storno" : view === "credits" ? "credit note" : "pro-forma"}${shown.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Where these invoices go once they are issued. The push is its own
              page because writing into a set of company books cannot be undone
              through the API, so it wants a screen that shows the exact Beleg
              before anything is sent. */}
          <Link
            href="/admin/documents/margin"
            className="px-4 py-2 text-sm font-bold rounded-lg transition-colors admin-muted hover:admin-heading"
            style={{ border: "1px solid var(--admin-border)" }}
          >
            Margenermittlung
          </Link>
          <Link
            href="/admin/documents/lexoffice"
            className="px-4 py-2 text-sm font-bold rounded-lg transition-colors admin-muted hover:admin-heading"
            style={{ border: "1px solid var(--admin-border)" }}
          >
            lexoffice
          </Link>
          <button
            onClick={exportCsv}
            disabled={shown.length === 0}
            className="px-4 py-2 text-sm font-bold rounded-lg transition-colors admin-muted hover:admin-heading disabled:opacity-40"
            style={{ border: "1px solid var(--admin-border)" }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Which pile you are looking at */}
      <div className="fin-seg mb-4" role="tablist" aria-label="Kind of document">
        {([
          ["invoices", "Invoices", counts.invoices],
          ["stornos", "Stornos", counts.stornos],
          ["credits", "Credit notes", counts.credits],
          ["proforma", "Pro-formas", counts.proforma],
          ["all", "All", counts.all],
        ] as const).map(([key, label, n]) => (
          <button key={key} type="button" role="tab" data-on={view === key} aria-selected={view === key} onClick={() => setView(key)}>
            {label} <span style={{ opacity: 0.6 }}>{n}</span>
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

      {notice && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm admin-muted" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          {notice}
        </div>
      )}

      {/* What the selection adds up to */}
      {!loading && shown.length > 0 && (
        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {summaryCards.map((c) => (
            <div key={c.label} className="rounded-xl px-4 py-3" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <div className="fin-label">{c.label}</div>
              <div className="text-xl font-bold admin-heading mt-1 tabular-nums">{c.value}</div>
              <div className="text-[11px] admin-faint mt-0.5">{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* The gap the invoice list cannot show, because it is about documents
          that do not exist. */}
      {unbilled && unbilled.rows.length > 0 && (
        <div className="rounded-xl px-4 py-3.5 mb-4" style={{ border: "1px solid rgb(245 158 11 / 0.5)", backgroundColor: "rgb(245 158 11 / 0.07)" }}>
          <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
            <span className="fin-label text-amber-500">Money in, no invoice</span>
            <span className="text-sm font-bold admin-heading">{formatMoney(unbilled.total)}</span>
            <span className="text-xs admin-faint">
              across {unbilled.rows.length} booking{unbilled.rows.length !== 1 ? "s" : ""}
              {unbilled.since ? ` · counted since ${new Date(unbilled.since).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, when this company issued its first invoice` : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {unbilled.rows.slice(0, 8).map((r) => (
              <Link key={r.id} href={`/admin/bookings/${r.id}`} className="text-xs admin-muted hover:text-[#0aa3c7]">
                {r.name ?? "Booking"} <span className="font-medium tabular-nums text-amber-500">{formatMoney(r.gap)}</span>
              </Link>
            ))}
            {unbilled.rows.length > 8 && <span className="text-xs admin-faint">+{unbilled.rows.length - 8} more</span>}
          </div>
        </div>
      )}

      {/* The sequence, because someone always asks. Stornos and credit notes
          take their numbers from the same counter and are counted here. */}
      {!loading && checks.length > 0 && (
        <div className="rounded-xl px-4 py-3 mb-5 flex flex-wrap gap-x-6 gap-y-2" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <span className="fin-label self-center">Invoice sequence</span>
          {checks.map((c) => (
            <span key={c.key} className="text-xs admin-muted">
              <span className="capitalize admin-heading font-medium">{c.division}</span> {c.year} ·{" "}
              <span className="font-mono">{String(c.first).padStart(4, "0")}–{String(c.last).padStart(4, "0")}</span> ·{" "}
              {c.missing.length === 0 ? (
                <span className="text-green-400">no gaps ({c.count} numbers, corrections included)</span>
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
            {view === "invoices" ? "No invoices match these filters"
              : view === "stornos" ? "No Stornos. An invoice is reversed from its row: Storno…"
              : view === "credits" ? "No credit notes. A partial correction is issued from the invoice's row: Credit note…"
              : "No documents found"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          {/* Header */}
          <div
            className="grid gap-3 px-5 py-3 admin-surface"
            style={{ gridTemplateColumns: cols, borderBottom: "1px solid var(--admin-border)" }}
          >
            {["Number", "Title / Booking", "Guest", "Kind", "Amount", "Date", "Status", ""].map((h) => (
              <span key={h} className="fin-label">{h}</span>
            ))}
          </div>

          {/* Rows */}
          {shown.map((doc) => {
            const kind = docKind(doc);
            const chip = statusChip(doc);
            const cm = correctionMeta(doc);
            const corrected = correctedMeta(doc);
            const allowance = isTaxInvoiceDoc(doc) ? correctionAllowance(doc, byOriginal) : null;
            const sendable = doc.status !== "void" && kind !== "confirmation";
            return (
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
                <span
                  /* A cancelled number has to be able to answer "why is 0004
                     gone?" without opening a database. */
                  title={doc.status === "void" ? chip.title : undefined}
                  className={`text-xs font-mono self-center truncate ${doc.status === "void" ? "line-through admin-faint" : "admin-muted"}`}
                >
                  {doc.invoice_number || "—"}
                </span>
                <div className="min-w-0 self-center">
                  <div className="text-sm font-medium admin-heading truncate">{doc.title || typeLabel(doc)}</div>
                  <div className="text-xs admin-faint truncate flex items-center gap-2">
                    {doc.booking_id && (
                      <Link href={`/admin/bookings/${doc.booking_id}?tab=documents`} className="hover:text-[#0aa3c7] truncate">
                        {doc.booking_name || "Open booking"}
                      </Link>
                    )}
                    {/* The link both ways: a correction names its invoice, an
                        invoice names what corrected it. */}
                    {cm.original_invoice_number && (
                      <span className="shrink-0">corrects <span className="font-mono">{cm.original_invoice_number}</span></span>
                    )}
                    {corrected.reversed_by_number && doc.status !== "void" && (
                      <span className="shrink-0">reversed by <span className="font-mono">{corrected.reversed_by_number}</span></span>
                    )}
                    {!corrected.reversed_by_number && allowance && allowance.credited > 0 && (
                      <span className="shrink-0">{formatMoney(allowance.credited, doc.currency)} credited back</span>
                    )}
                  </div>
                </div>
                <span className="text-xs admin-muted self-center truncate">
                  {doc.contact_id ? (
                    <Link href={`/admin/contacts/${doc.contact_id}`} className="hover:text-[#0aa3c7]">
                      {doc.contact_name || "Unnamed contact"}
                    </Link>
                  ) : "—"}
                </span>
                <span className="text-xs admin-muted self-center truncate" title={typeLabel(doc)}>
                  {kind === "invoice" ? typeLabel(doc).replace(" invoice", "") : KIND_LABELS[kind]}
                  {cm.needs_tax_review && <span className="block text-[10px] text-amber-500">Steuerberater</span>}
                </span>
                <span className={`text-sm font-medium self-center tabular-nums ${Number(doc.amount) < 0 ? "text-red-400" : "admin-heading"}`}>
                  {formatMoney(doc.amount, doc.currency)}
                </span>
                <span className="text-xs admin-faint self-center">{fmtDate(doc.issued_at)}</span>
                <span className="self-center">
                  <span title={chip.title} className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap ${chip.cls}`}>
                    {chip.text}
                  </span>
                </span>
                <div className="self-center flex items-center gap-2 flex-wrap justify-end">
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
                  {sendable && (
                    <button
                      onClick={() => handleSend(doc)}
                      disabled={sending === doc.id}
                      title={doc.sent_at ? `Sent ${fmtDate(doc.sent_at)}. Send again` : "Email this to the guest, PDF attached"}
                      className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors disabled:opacity-50"
                    >
                      {sending === doc.id ? "Sending…" : doc.sent_at ? "Resend" : "Send"}
                    </button>
                  )}
                  {/* The correction doors, on the invoice they belong to.
                      Storno reverses it whole; a credit note takes part off. */}
                  {allowance && !allowance.blocker && allowance.canStorno && (
                    <button
                      onClick={() => setCorrecting({ id: doc.id, mode: "storno" })}
                      title="Reverse this invoice in full with a Stornorechnung"
                      className="text-xs text-amber-500/80 hover:text-amber-500 transition-colors"
                    >
                      Storno…
                    </button>
                  )}
                  {allowance && !allowance.blocker && allowance.canCredit && (
                    <button
                      onClick={() => setCorrecting({ id: doc.id, mode: "credit" })}
                      title="Take an amount off this invoice with a credit note"
                      className="text-xs text-amber-500/80 hover:text-amber-500 transition-colors"
                    >
                      Credit note…
                    </button>
                  )}
                  {doc.status !== "void" && (isCancellableTax(doc) || (kind === "storno" || kind === "credit" ? !doc.sent_at : !isTaxInvoiceDoc(doc))) && (
                    <button
                      onClick={() => handleVoid(doc)}
                      title={kind === "proforma" || kind === "confirmation"
                        ? "Void this document"
                        : "Cancel this number: only for paper that was never sent"}
                      className="text-xs text-red-400/50 hover:text-red-400 transition-colors"
                    >
                      {kind === "proforma" || kind === "confirmation" ? "Void" : "Cancel unsent…"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {correcting && (
        <CorrectionDialog
          documentId={correcting.id}
          initialMode={correcting.mode}
          onClose={() => setCorrecting(null)}
          onIssued={() => fetchDocs()}
        />
      )}
    </div>
  );
}
