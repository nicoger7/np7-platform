"use client";

/**
 * The feed: the first view of the Payments page.
 *
 * Every row here is a movement that really happened — pulled from Qonto and
 * Stripe, never typed. The job of the view is one question per row: whose
 * money is this? So an unmatched credit does not just sit there, it arrives
 * carrying the system's best answer and the reasons for it, and connecting it
 * is one click. What the system is not sure about it says so, rather than
 * guessing: eleven guests owe €2,445 for the same Bonaire week, and a matcher
 * that picks one on price alone is wrong ten times out of eleven.
 *
 * Money OUT asks the mirror question: which cost line did this pay for? A
 * debit arrives with the expected lines it most likely settles, can be placed
 * on one or several of them (partial allowed, never more than the debit), and
 * when no expected line exists a new one is created from the debit itself, in
 * whatever scope the person chooses, marked unplanned. From then on that cost
 * is REAL: its actual can be walked back to a movement the bank saw. Nothing
 * on either side is booked without a click.
 *
 * This was /admin/bank until 2026-09-13. Nico: "bank and payments are one
 * thing basically." The page around it now also holds what was written down
 * by hand (unverified, off-bank, legacy); this file is the feed, unchanged in
 * what it can do. "Connected" here means matched_at or a payment names the
 * movement: a transfer split over several invoices carries its payments and
 * names none of them on the row, and used to sit in the to-match pile after
 * it was done.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { COST_SCOPES, MARGIN_CLASSES, type CostScope } from "@/lib/finance/costs";
import { editionOptionLabel } from "@/lib/edition-label";

type Suggestion = {
  candidate: {
    documentId: string;
    invoiceNumber: string | null;
    bookingId: string | null;
    guestName: string | null;
    experienceTitle: string | null;
    editionLabel: string | null;
    invoiced: number;
    remaining: number;
    currency: string | null;
  };
  score: number;
  reasons: string[];
  confidence: "exact" | "strong" | "possible";
};

type CostSuggestion = {
  candidate: {
    costId: string; item: string; scope: CostScope; scopeLabel: string;
    open: number; estimated: number; state: string; unplanned: boolean; marginClass: string | null;
  };
  score: number;
  reasons: string[];
  confidence: "strong" | "possible";
  suggestedAmount: number;
};

type CostAllocationView = { paymentId: string; costId: string; item: string; scope: CostScope; scopeLabel: string; amount: number };

/** Money in: one payment per invoice a credit settled. `adopted` marks a row
    that was typed by hand before the feed and later adopted onto it. */
type InvoiceAllocation = { paymentId: string; amount: number; documentId: string | null; invoiceNumber: string | null; bookingId: string | null; guestName: string | null; adopted: boolean };

type Tx = {
  id: string;
  source: string;
  external_id: string;
  booked_on: string;
  amount: number;
  currency: string;
  counterparty: string | null;
  counterparty_iban: string | null;
  reference: string | null;
  label: string | null;
  status: string;
  kind: string;
  payment_id: string | null;
  document_id: string | null;
  matched_by: string | null;
  match_confidence: string | null;
  matched_at: string | null;
  ignored_at: string | null;
  ignored_reason: string | null;
  suggestions: Suggestion[];
  /** Said when the answer is known but is not "connect this to an open
      invoice" — above all, that the invoice it names is already paid. */
  note?: string;
  /** Money out: what the debit is placed on, and what it might be placed on. */
  costSuggestions: CostSuggestion[];
  costAllocations: CostAllocationView[];
  costAllocated: number;
  costRemaining: number;
  /** Money in: what this credit was booked as, and what is left of it. */
  invoiceAllocations: InvoiceAllocation[];
  invoiceAllocated: number;
  invoiceRemaining: number;
};

type Candidate = {
  documentId: string;
  invoiceNumber: string | null;
  guestName: string | null;
  experienceTitle: string | null;
  editionLabel: string | null;
  remaining: number;
  invoiced: number;
  currency: string | null;
  dueDate: string | null;
  bookingId: string | null;
};

type CostCandidate = {
  costId: string; item: string; scope: CostScope; scopeLabel: string;
  editionId: string | null; experienceId: string | null; experienceTitle: string | null;
  year: number | null; open: number; estimated: number; state: string;
  marginClass: string | null; unplanned: boolean;
};

type ScopeTotals = {
  byScope: Record<CostScope, number>;
  allocated: number; debits: number; unallocated: number; debitCount: number; unallocatedCount: number;
};

type ScopeOptions = {
  experiences: { id: string; title: string }[];
  editions: { id: string; label: string | null; year: number | null; date_start: string | null; date_end: string | null; experience_id: string }[];
};

const money = (n: number, ccy = "EUR") =>
  `${ccy === "EUR" ? "€" : ccy + " "}${Math.abs(Number(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export type FeedView = "unmatched" | "matched" | "ignored" | "all";

const DIRECTIONS = [
  { key: "", label: "Both ways" },
  { key: "in", label: "Money in" },
  { key: "out", label: "Money out" },
] as const;

const KIND_LABEL: Record<string, string> = {
  income: "Money in",
  expense: "Money out",
  payout: "Stripe payout",
  fee: "Fee",
  transfer: "Own transfer",
  unknown: "Unclassified",
};

/** A debit that can be a cost. Same rule as isCostDebit() on the server. */
const costable = (t: Tx) => Number(t.amount) < 0 && !t.ignored_at && (t.kind === "expense" || t.kind === "fee" || t.kind === "unknown");

const emptyNewCost = () => ({
  item: "", scope: "edition" as CostScope, experience_id: "", edition_id: "", year: "", scope_reason: "", margin_class: "", amount: "",
});

/** Mounted with a key that includes the view, so switching views resets the
    open row and the pickers without an effect. */
export function BankFeed({ view }: { view: FeedView }) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [costCandidates, setCostCandidates] = useState<CostCandidate[]>([]);
  const [costTotals, setCostTotals] = useState<ScopeTotals | null>(null);
  const [scopeOptions, setScopeOptions] = useState<ScopeOptions>({ experiences: [], editions: [] });
  const [count, setCount] = useState(0);
  const [sources, setSources] = useState<{ bank: boolean; stripe: boolean }>({ bank: false, stripe: false });
  const [direction, setDirection] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [costQuery, setCostQuery] = useState("");
  const [allocAmount, setAllocAmount] = useState("");
  const [showNewCost, setShowNewCost] = useState(false);
  const [newCost, setNewCost] = useState(emptyNewCost());
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bank/transactions?view=${view}&direction=${direction}&q=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load the ledger.");
      setTxs(json.transactions ?? []);
      setCandidates(json.candidates ?? []);
      setCostCandidates(json.costCandidates ?? []);
      setCostTotals(json.costTotals ?? null);
      setScopeOptions(json.scopeOptions ?? { experiences: [], editions: [] });
      setCount(json.count ?? 0);
      setSources(json.sources ?? { bank: false, stripe: false });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [view, direction, search]);

  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load, search]);

  async function sync() {
    setSyncing(true); setNote(null); setError(null);
    try {
      const res = await fetch("/api/admin/bank/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since: "2026-01-01" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed.");
      const parts = (json.results ?? []).map((r: { source: string; fetched: number; inserted: number; configured: boolean; errors: string[] }) =>
        r.configured ? `${r.source}: ${r.inserted} new of ${r.fetched}` : `${r.source}: not configured`);
      setNote(parts.join(" · "));
      const errs = (json.results ?? []).flatMap((r: { errors: string[] }) => r.errors);
      if (errs.length) setError(errs.join(" · "));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function act(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/bank/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "That did not work.");
      setError(null);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const filteredCandidates = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const list = q
      ? candidates.filter((c) =>
          [c.guestName, c.invoiceNumber, c.experienceTitle, c.editionLabel].filter(Boolean).join(" ").toLowerCase().includes(q))
      : candidates;
    return list.slice(0, 40);
  }, [candidates, pickerQuery]);

  const filteredCostCandidates = useMemo(() => {
    const q = costQuery.trim().toLowerCase();
    const list = q
      ? costCandidates.filter((c) =>
          [c.item, c.scopeLabel, c.experienceTitle].filter(Boolean).join(" ").toLowerCase().includes(q))
      : costCandidates;
    return list.slice(0, 40);
  }, [costCandidates, costQuery]);

  /* What to allocate when a line is pressed: the typed amount if there is
     one, else as much of the debit as the line still expects. Never more than
     the debit holds; the server refuses that too, with the figures. */
  function allocate(t: Tx, costId: string, open: number, fromSuggestion = false) {
    const typed = Number(allocAmount);
    const amount = allocAmount.trim() && Number.isFinite(typed) && typed > 0 ? typed : Math.min(t.costRemaining, open);
    return act(t.id, { action: "allocate-cost", allocations: [{ costId, amount }], fromSuggestion });
  }

  async function createCost(t: Tx) {
    const body = {
      action: "create-cost",
      cost: {
        item: newCost.item,
        scope: newCost.scope,
        edition_id: newCost.scope === "edition" ? newCost.edition_id || null : null,
        experience_id: newCost.scope === "edition" || newCost.scope === "experience_year" ? newCost.experience_id || null : null,
        year: newCost.scope === "experience_year" || newCost.scope === "year" ? (newCost.year ? Number(newCost.year) : null) : null,
        scope_reason: newCost.scope === "edition" ? null : newCost.scope_reason || null,
        margin_class: newCost.margin_class || null,
      },
      amount: newCost.amount.trim() ? Number(newCost.amount) : null,
    };
    if (await act(t.id, body)) { setShowNewCost(false); setNewCost(emptyNewCost()); }
  }

  /* Connect a credit to an invoice. A credit that is already partly placed
     offers only what is left of it; the server refuses more than it holds. */
  function connect(t: Tx, documentId: string, fromSuggestion = false) {
    const left = t.invoiceAllocated > 0 ? t.invoiceRemaining : Number(t.amount);
    return act(t.id, { action: "match", allocations: [{ documentId, amount: left }], fromSuggestion });
  }

  const openRow = (t: Tx) => {
    const isOpen = openId === t.id;
    setOpenId(isOpen ? null : t.id);
    setPickerQuery(""); setCostQuery(""); setAllocAmount(""); setShowNewCost(false);
    setNewCost({ ...emptyNewCost(), item: t.counterparty ?? "", amount: t.costRemaining > 0 ? String(t.costRemaining) : "" });
  };

  const noSources = !sources.bank && !sources.stripe;
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const ys = new Set<number>([now - 1, now, now + 1, now + 2]);
    for (const e of scopeOptions.editions) if (e.year) ys.add(e.year);
    return [...ys].sort();
  }, [scopeOptions.editions]);
  const formEditions = scopeOptions.editions.filter((ed) => !newCost.experience_id || ed.experience_id === newCost.experience_id);
  const experienceTitle = (id: string) => scopeOptions.experiences.find((x) => x.id === id)?.title ?? null;
  const input = "admin-input text-sm px-3 py-1.5 rounded-lg w-full";
  const label = "fin-label mb-1 block";

  return (
    <div>
      {noSources && (
        <div className="fin-card mb-5" style={{ borderColor: "rgba(245,158,11,.4)" }}>
          <div className="fin-label mb-1.5 text-amber-500">No source connected yet</div>
          <p className="text-sm admin-muted leading-relaxed">
            Set <code className="px-1 rounded bg-black/5">QONTO_API_LOGIN</code> and{" "}
            <code className="px-1 rounded bg-black/5">QONTO_API_SECRET</code> (Qonto → Settings →
            Integrations → API), plus <code className="px-1 rounded bg-black/5">STRIPE_SECRET_KEY</code>{" "}
            for the card payments. Everything on this page works the moment they are there.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="fin-seg inline-flex">
          {DIRECTIONS.map((d) => (
            <button key={d.key} onClick={() => { setDirection(d.key); setOpenId(null); }} data-on={direction === d.key ? "true" : "false"}>
              {d.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search payer, reference…"
          className="admin-input text-sm px-3 py-1.5 rounded-lg w-64"
        />
        <span className="text-xs admin-faint ml-auto">{count} shown</span>
        <button
          onClick={sync}
          disabled={syncing}
          className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
          title="Import what Qonto and Stripe have. Imports only; nothing is booked."
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {/* The one total this page is about: not the balance, the work. How much
          of the money out has been placed on a cost line, and where. */}
      {costTotals && costTotals.debitCount > 0 && (
        <p className="text-xs admin-muted mb-5">
          Money out: {money(costTotals.debits)} across {costTotals.debitCount} debits ·{" "}
          <span className={costTotals.allocated > 0 ? "text-green-600 font-medium" : ""}>{money(costTotals.allocated)} placed on cost lines</span>
          {costTotals.allocated > 0 && (
            <span className="admin-faint">
              {" "}({COST_SCOPES.map((s) => `${s.short.toLowerCase()} ${money(costTotals.byScope[s.key] ?? 0)}`).join(" · ")})
            </span>
          )}
          {" · "}
          <span className={costTotals.unallocatedCount > 0 ? "text-amber-600 font-medium" : "text-green-600"}>
            {costTotals.unallocatedCount > 0
              ? `${money(costTotals.unallocated)} on ${costTotals.unallocatedCount} debits still unplaced`
              : "every debit placed"}
          </span>
        </p>
      )}

      {note && <div className="mb-4 text-sm admin-muted">{note}</div>}
      {error && <div className="mb-4 text-sm text-red-500">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : !txs.length ? (
        <div className="fin-card text-center py-10">
          <div className="fin-title mb-1">Nothing here yet</div>
          <p className="fin-sub">
            {view === "unmatched" ? "Every transaction is connected or set aside." : "No transactions in this view."}
          </p>
        </div>
      ) : (
        <div className="admin-tablecard overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="fin-label px-4 py-3">Date</th>
                <th className="fin-label px-4 py-3 text-right">Amount</th>
                <th className="fin-label px-4 py-3">Payer</th>
                <th className="fin-label px-4 py-3">Reference</th>
                <th className="fin-label px-4 py-3">Belongs to</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => {
                const open = openId === t.id;
                const best = t.suggestions[0];
                const bestCost = t.costSuggestions?.[0];
                const isIncome = t.kind === "income" && Number(t.amount) > 0;
                const isDebit = Number(t.amount) < 0;
                const placed = t.costAllocations?.length ?? 0;
                // Connected = matched_at, or a payment naming the movement.
                // The row's own document_id only covers the one-invoice case.
                const connected = Number(t.amount) > 0 && (!!t.document_id || !!t.matched_at || !!t.payment_id || (t.invoiceAllocations?.length ?? 0) > 0);
                return (
                  <Fragment key={t.id}>
                    <tr
                      onClick={() => openRow(t)}
                      className="fin-rule fin-row cursor-pointer"
                    >
                      <td className="px-4 py-3 whitespace-nowrap admin-muted">{fmtDate(t.booked_on)}</td>
                      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${Number(t.amount) < 0 ? "text-red-500" : "text-green-600"}`}>
                        {Number(t.amount) < 0 ? "−" : "+"}{money(t.amount, t.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{t.counterparty || "—"}</span>
                        {t.kind !== "income" && t.kind !== "expense" && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-slate-500/15 admin-faint">
                            {KIND_LABEL[t.kind] ?? t.kind}
                          </span>
                        )}
                        <span className="ml-2 text-[10px] admin-faint uppercase">{t.source}</span>
                      </td>
                      <td className="px-4 py-3 admin-muted max-w-[280px] truncate">{t.reference || t.label || "—"}</td>
                      <td className="px-4 py-3">
                        {t.ignored_at ? (
                          <span className="admin-faint">Set aside · {t.ignored_reason}</span>
                        ) : connected ? (
                          <span>
                            <span className="text-green-600 font-medium">Connected</span>
                            <span className="admin-faint">
                              {" · "}
                              {t.invoiceAllocations.length === 1
                                ? [t.invoiceAllocations[0].guestName, t.invoiceAllocations[0].invoiceNumber].filter(Boolean).join(" · ") || "one invoice"
                                : t.invoiceAllocations.length > 1
                                  ? `${t.invoiceAllocations.length} invoices${t.invoiceAllocations[0].guestName ? ` · ${t.invoiceAllocations[0].guestName}` : ""}`
                                  : "an invoice"}
                            </span>
                            {t.invoiceRemaining > 0.01 && <span className="text-amber-600"> · {money(t.invoiceRemaining)} still unplaced</span>}
                          </span>
                        ) : isDebit ? (
                          placed > 0 ? (
                            <span>
                              <span className="text-green-600 font-medium">
                                {placed === 1 ? t.costAllocations[0].item : `${placed} cost lines`}
                              </span>
                              <span className="admin-faint"> · {placed === 1 ? t.costAllocations[0].scopeLabel : money(t.costAllocated)}</span>
                              {t.costRemaining > 0.01 && <span className="text-amber-600"> · {money(t.costRemaining)} still unplaced</span>}
                            </span>
                          ) : !costable(t) ? (
                            <span className="admin-faint">—</span>
                          ) : bestCost ? (
                            <span className={bestCost.confidence === "strong" ? "text-amber-500" : "admin-muted"}>
                              {bestCost.candidate.item}
                              <span className="admin-faint"> · {bestCost.candidate.scopeLabel} · {bestCost.reasons[0]}</span>
                            </span>
                          ) : (
                            <span className="admin-faint">No expected line yet</span>
                          )
                        ) : !isIncome ? (
                          <span className="admin-faint">—</span>
                        ) : best ? (
                          <span className={best.confidence === "exact" ? "text-green-600" : best.confidence === "strong" ? "text-amber-500" : "admin-muted"}>
                            {best.candidate.guestName ?? best.candidate.invoiceNumber ?? "a match"}
                            <span className="admin-faint"> · {best.reasons[0]}</span>
                          </span>
                        ) : t.note ? (
                          <span className="admin-muted">{t.note}</span>
                        ) : (
                          <span className="admin-faint">No idea yet</span>
                        )}
                      </td>
                    </tr>

                    {open && (
                      <tr>
                        <td colSpan={5} className="px-4 pb-5 pt-1">
                          <div className="fin-card">
                            <div className="grid sm:grid-cols-2 gap-4 mb-4">
                              <div>
                                <div className="fin-label mb-1">The transaction</div>
                                <p className="text-sm admin-muted leading-relaxed">
                                  {t.source} · {t.external_id}
                                  {t.counterparty_iban ? <><br />IBAN {t.counterparty_iban}</> : null}
                                  {t.label ? <><br />{t.label}</> : null}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-start gap-2 sm:justify-end">
                                {connected ? (
                                  <button
                                    onClick={() => act(t.id, { action: "unmatch" })}
                                    disabled={busyId === t.id}
                                    className="px-3 py-1.5 text-xs rounded-lg admin-surface admin-muted disabled:opacity-50"
                                    style={{ border: "1px solid var(--admin-border)" }}
                                  >
                                    Disconnect
                                  </button>
                                ) : placed > 0 ? (
                                  <button
                                    onClick={() => act(t.id, { action: "unallocate-cost" })}
                                    disabled={busyId === t.id}
                                    className="px-3 py-1.5 text-xs rounded-lg admin-surface admin-muted disabled:opacity-50"
                                    style={{ border: "1px solid var(--admin-border)" }}
                                  >
                                    Undo all
                                  </button>
                                ) : t.ignored_at ? (
                                  <button
                                    onClick={() => act(t.id, { action: "unignore" })}
                                    disabled={busyId === t.id}
                                    className="px-3 py-1.5 text-xs rounded-lg admin-surface admin-muted disabled:opacity-50"
                                    style={{ border: "1px solid var(--admin-border)" }}
                                  >
                                    Bring back
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      const reason = window.prompt(isDebit ? "Why is this not an Experience cost?" : "Why is this not a guest payment?");
                                      if (reason?.trim()) act(t.id, { action: "ignore", reason: reason.trim() });
                                    }}
                                    disabled={busyId === t.id}
                                    className="px-3 py-1.5 text-xs rounded-lg admin-surface admin-muted disabled:opacity-50"
                                    style={{ border: "1px solid var(--admin-border)" }}
                                  >
                                    Set aside
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* ── Money in: the invoice it settles ── */}
                            {isIncome && !t.ignored_at && (!connected || t.invoiceRemaining > 0.01) && (
                              <>
                                {connected && (
                                  <p className="text-xs admin-muted mb-3">
                                    {money(t.invoiceAllocated)} of this credit is placed · {money(t.invoiceRemaining)} still to place.
                                  </p>
                                )}
                                <div className="fin-label mb-2">Best guesses</div>
                                {t.suggestions.length ? (
                                  <div className="flex flex-col gap-2 mb-4">
                                    {t.suggestions.map((s) => (
                                      <div key={s.candidate.documentId} className="flex flex-wrap items-center gap-3 p-3 rounded-xl" style={{ background: "var(--fin-inset)" }}>
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                                            s.confidence === "exact" ? "bg-green-500/15 text-green-600"
                                            : s.confidence === "strong" ? "bg-amber-500/15 text-amber-600"
                                            : "bg-slate-500/15 admin-faint"}`}
                                        >
                                          {s.confidence}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <div className="font-medium truncate">
                                            {s.candidate.guestName ?? "Unnamed"} · {s.candidate.invoiceNumber ?? "no number"}
                                          </div>
                                          <div className="fin-sub truncate">
                                            {[s.candidate.experienceTitle, s.candidate.editionLabel].filter(Boolean).join(" · ")}
                                            {" — owes "}{money(s.candidate.remaining, s.candidate.currency ?? "EUR")}
                                            {" · "}{s.reasons.join(" · ")}
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => connect(t, s.candidate.documentId, true)}
                                          disabled={busyId === t.id}
                                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-50"
                                        >
                                          Connect
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm admin-faint mb-4">
                                    Nothing matches this well enough to propose. Pick the invoice by hand below.
                                  </p>
                                )}

                                <div className="fin-label mb-2">Or choose the invoice</div>
                                <input
                                  value={pickerQuery}
                                  onChange={(e) => setPickerQuery(e.target.value)}
                                  placeholder="Search guest, invoice number, trip…"
                                  className="admin-input text-sm px-3 py-1.5 rounded-lg w-full sm:w-96 mb-2"
                                />
                                <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
                                  {filteredCandidates.map((c) => (
                                    <button
                                      key={c.documentId}
                                      onClick={() => connect(t, c.documentId)}
                                      disabled={busyId === t.id}
                                      className="fin-row text-left px-3 py-2 rounded-lg disabled:opacity-50"
                                    >
                                      <span className="font-medium">{c.guestName ?? "Unnamed"}</span>
                                      <span className="admin-faint"> · {c.invoiceNumber ?? "no number"} · owes {money(c.remaining, c.currency ?? "EUR")}</span>
                                      {c.experienceTitle && <span className="admin-faint"> · {c.experienceTitle}</span>}
                                    </button>
                                  ))}
                                  {!filteredCandidates.length && (
                                    <span className="text-sm admin-faint px-3 py-2">No open invoice matches that search.</span>
                                  )}
                                </div>
                              </>
                            )}

                            {connected && (
                              <div className="mb-4">
                                <div className="fin-label mb-2">Booked as</div>
                                <div className="flex flex-col gap-1.5">
                                  {t.invoiceAllocations.map((a) => (
                                    <div key={a.paymentId} className="flex flex-wrap items-center gap-3 p-3 rounded-xl" style={{ background: "var(--fin-inset)" }}>
                                      <div className="min-w-0 flex-1">
                                        <div className="font-medium truncate">
                                          {a.bookingId
                                            ? <Link href={`/admin/bookings/${a.bookingId}?tab=payments`} className="hover:underline">{a.guestName ?? "Unnamed booking"}</Link>
                                            : (a.guestName ?? "No booking")}
                                          {a.invoiceNumber && <span className="admin-faint"> · {a.invoiceNumber}</span>}
                                        </div>
                                        <div className="fin-sub truncate">
                                          {a.adopted ? "A row typed by hand, adopted onto this movement" : "Payment written from this movement"}
                                          {t.match_confidence === "auto" ? " · automatically" : t.match_confidence === "suggested" ? " · from a suggestion" : " · by hand"}
                                        </div>
                                      </div>
                                      <span className="font-semibold text-green-600">{money(a.amount)}</span>
                                    </div>
                                  ))}
                                  {!t.invoiceAllocations.length && (
                                    <p className="text-sm admin-muted">Marked connected, but no payment row carries this movement. Disconnect it and connect it again.</p>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* ── Money out: the cost line it paid for ── */}
                            {isDebit && !t.ignored_at && (
                              <>
                                {placed > 0 && (
                                  <div className="mb-4">
                                    <div className="fin-label mb-2">Placed on</div>
                                    <div className="flex flex-col gap-1.5">
                                      {t.costAllocations.map((a) => (
                                        <div key={a.paymentId} className="flex flex-wrap items-center gap-3 p-3 rounded-xl" style={{ background: "var(--fin-inset)" }}>
                                          <div className="min-w-0 flex-1">
                                            <div className="font-medium truncate">{a.item}</div>
                                            <div className="fin-sub truncate">
                                              <span className="px-1.5 py-0.5 mr-1 rounded text-[9px] font-bold uppercase tracking-wide bg-slate-500/15 admin-faint">
                                                {COST_SCOPES.find((s) => s.key === a.scope)?.short ?? a.scope}
                                              </span>
                                              {a.scopeLabel} · <Link href="/admin/exp-costs" className="underline">costs</Link>
                                            </div>
                                          </div>
                                          <span className="font-semibold text-green-600">{money(a.amount)}</span>
                                          <button
                                            onClick={() => act(t.id, { action: "unallocate-cost", costId: a.costId })}
                                            disabled={busyId === t.id}
                                            className="px-3 py-1.5 text-xs rounded-lg admin-surface admin-muted disabled:opacity-50"
                                            style={{ border: "1px solid var(--admin-border)" }}
                                          >
                                            Undo
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                    <p className="text-xs admin-muted mt-2">
                                      {t.costRemaining > 0.01
                                        ? `${money(t.costAllocated)} placed · ${money(t.costRemaining)} of this debit still unplaced.`
                                        : "Fully placed. These lines are now real: their actual can be walked back to this movement."}
                                    </p>
                                  </div>
                                )}

                                {!costable(t) && placed === 0 && (
                                  <p className="text-sm admin-faint">
                                    A {KIND_LABEL[t.kind]?.toLowerCase() ?? t.kind} is not a cost. If that is wrong, change its kind first.
                                  </p>
                                )}

                                {costable(t) && t.costRemaining > 0.01 && (
                                  <>
                                    <div className="flex flex-wrap items-end gap-3 mb-3">
                                      <div>
                                        <label className={label}>Amount to place</label>
                                        <input
                                          value={allocAmount}
                                          onChange={(e) => setAllocAmount(e.target.value)}
                                          placeholder={`blank = what fits, up to ${money(t.costRemaining)}`}
                                          className="admin-input text-sm px-3 py-1.5 rounded-lg w-64"
                                          type="number" step="0.01" min="0"
                                        />
                                      </div>
                                      <p className="text-xs admin-faint pb-2">
                                        Part of a debit may go on one line and the rest on another; more than the debit holds is refused.
                                      </p>
                                    </div>

                                    <div className="fin-label mb-2">Best guesses</div>
                                    {t.costSuggestions?.length ? (
                                      <div className="flex flex-col gap-2 mb-4">
                                        {t.costSuggestions.map((s) => (
                                          <div key={s.candidate.costId} className="flex flex-wrap items-center gap-3 p-3 rounded-xl" style={{ background: "var(--fin-inset)" }}>
                                            <span
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                                                s.confidence === "strong" ? "bg-amber-500/15 text-amber-600" : "bg-slate-500/15 admin-faint"}`}
                                            >
                                              {s.confidence}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                              <div className="font-medium truncate">
                                                {s.candidate.item}
                                                {s.candidate.unplanned && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-500">unplanned</span>}
                                              </div>
                                              <div className="fin-sub truncate">
                                                {s.candidate.scopeLabel}
                                                {" — still expects "}{money(s.candidate.open)}
                                                {" · "}{s.reasons.join(" · ")}
                                              </div>
                                            </div>
                                            <button
                                              onClick={() => allocate(t, s.candidate.costId, s.candidate.open, true)}
                                              disabled={busyId === t.id}
                                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-50"
                                            >
                                              Place {money(allocAmount.trim() && Number(allocAmount) > 0 ? Number(allocAmount) : s.suggestedAmount)}
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm admin-faint mb-4">
                                        No expected line names this payee or wants exactly this amount. Pick one by hand below, or create the line this debit paid for.
                                      </p>
                                    )}

                                    <div className="fin-label mb-2">Or choose the cost line</div>
                                    <input
                                      value={costQuery}
                                      onChange={(e) => setCostQuery(e.target.value)}
                                      placeholder="Search item, trip, experience…"
                                      className="admin-input text-sm px-3 py-1.5 rounded-lg w-full sm:w-96 mb-2"
                                    />
                                    <div className="max-h-56 overflow-y-auto flex flex-col gap-1 mb-4">
                                      {filteredCostCandidates.map((c) => (
                                        <button
                                          key={c.costId}
                                          onClick={() => allocate(t, c.costId, c.open)}
                                          disabled={busyId === t.id}
                                          className="fin-row text-left px-3 py-2 rounded-lg disabled:opacity-50"
                                        >
                                          <span className="font-medium">{c.item}</span>
                                          <span className="admin-faint"> · {c.scopeLabel} · still expects {money(c.open)}</span>
                                          {c.state === "hand" && <span className="admin-faint"> · recorded by hand so far</span>}
                                        </button>
                                      ))}
                                      {!filteredCostCandidates.length && (
                                        <span className="text-sm admin-faint px-3 py-2">No open cost line matches that search.</span>
                                      )}
                                    </div>

                                    {/* No expected line: create one from the debit, in the chosen scope. */}
                                    {!showNewCost ? (
                                      <button
                                        onClick={() => setShowNewCost(true)}
                                        className="px-3 py-1.5 text-xs font-semibold rounded-lg admin-surface"
                                        style={{ border: "1px solid var(--admin-border)" }}
                                      >
                                        No expected line? Create one from this debit
                                      </button>
                                    ) : (
                                      <div className="p-3 rounded-xl" style={{ background: "var(--fin-inset)" }}>
                                        <div className="fin-label mb-2">New cost line, from this debit</div>
                                        <p className="text-xs admin-muted mb-3">
                                          Created as confirmed and marked unplanned, so the expected-versus-real view can say this was never budgeted. One trip is the default; anything broader needs a reason.
                                        </p>
                                        <div className="grid sm:grid-cols-3 gap-3 mb-3">
                                          <div className="sm:col-span-2">
                                            <label className={label}>Item</label>
                                            <input className={input} value={newCost.item} onChange={(e) => setNewCost({ ...newCost, item: e.target.value })} />
                                          </div>
                                          <div>
                                            <label className={label}>Amount to place</label>
                                            <input className={input} type="number" step="0.01" min="0" value={newCost.amount} onChange={(e) => setNewCost({ ...newCost, amount: e.target.value })} placeholder={money(t.costRemaining)} />
                                          </div>
                                        </div>
                                        <label className={label}>Belongs to</label>
                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                          {COST_SCOPES.map((s) => (
                                            <button
                                              key={s.key}
                                              type="button"
                                              onClick={() => setNewCost({
                                                ...newCost, scope: s.key,
                                                edition_id: s.key === "edition" ? newCost.edition_id : "",
                                                year: s.key === "experience_year" || s.key === "year" ? newCost.year || String(new Date(t.booked_on).getFullYear()) : "",
                                                experience_id: s.key === "year" || s.key === "general" ? "" : newCost.experience_id,
                                              })}
                                              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                                              style={{ border: "1px solid var(--admin-border)", backgroundColor: newCost.scope === s.key ? "var(--admin-accent)" : "transparent", color: newCost.scope === s.key ? "var(--admin-accent-contrast)" : undefined }}
                                            >
                                              {s.label}
                                            </button>
                                          ))}
                                        </div>
                                        <p className="text-xs admin-faint mb-3">{COST_SCOPES.find((s) => s.key === newCost.scope)?.blurb}</p>
                                        <div className="grid sm:grid-cols-3 gap-3 mb-3">
                                          {(newCost.scope === "edition" || newCost.scope === "experience_year") && (
                                            <div>
                                              <label className={label}>Experience{newCost.scope === "edition" ? " (narrows the list)" : ""}</label>
                                              <select className={input} value={newCost.experience_id} onChange={(e) => setNewCost({ ...newCost, experience_id: e.target.value, edition_id: "" })}>
                                                <option value="">{newCost.scope === "edition" ? "Any" : "—"}</option>
                                                {scopeOptions.experiences.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                                              </select>
                                            </div>
                                          )}
                                          {newCost.scope === "edition" && (
                                            <div className="sm:col-span-2">
                                              <label className={label}>Edition</label>
                                              <select className={input} value={newCost.edition_id} onChange={(e) => { const ed = scopeOptions.editions.find((x) => x.id === e.target.value); setNewCost({ ...newCost, edition_id: e.target.value, experience_id: ed?.experience_id ?? newCost.experience_id }); }}>
                                                <option value="">Pick the trip…</option>
                                                {formEditions.map((ed) => <option key={ed.id} value={ed.id}>{editionOptionLabel(ed, newCost.experience_id ? null : experienceTitle(ed.experience_id))}</option>)}
                                              </select>
                                            </div>
                                          )}
                                          {(newCost.scope === "experience_year" || newCost.scope === "year") && (
                                            <div>
                                              <label className={label}>Year</label>
                                              <select className={input} value={newCost.year} onChange={(e) => setNewCost({ ...newCost, year: e.target.value })}>
                                                <option value="">—</option>
                                                {years.map((y) => <option key={y} value={y}>{y}</option>)}
                                              </select>
                                            </div>
                                          )}
                                          {newCost.scope !== "edition" && (
                                            <div className="sm:col-span-3">
                                              <label className={label}>Why not one trip?</label>
                                              <input className={input} value={newCost.scope_reason} onChange={(e) => setNewCost({ ...newCost, scope_reason: e.target.value })} placeholder="e.g. one flight for the coach covers all three Bonaire weeks" />
                                            </div>
                                          )}
                                          <div>
                                            <label className={label}>§ 25 bucket</label>
                                            <select className={input} value={newCost.margin_class} onChange={(e) => setNewCost({ ...newCost, margin_class: e.target.value })}>
                                              <option value="">Unsorted</option>
                                              {MARGIN_CLASSES.map((m) => <option key={m.key} value={m.key} disabled={m.key === "travel_input" && newCost.scope === "general"}>{m.label}</option>)}
                                            </select>
                                          </div>
                                        </div>
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => createCost(t)}
                                            disabled={busyId === t.id || !newCost.item.trim() || (newCost.scope === "edition" && !newCost.edition_id)}
                                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-50"
                                          >
                                            Create and place
                                          </button>
                                          <button onClick={() => setShowNewCost(false)} className="px-3 py-1.5 text-xs rounded-lg admin-muted">Cancel</button>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
