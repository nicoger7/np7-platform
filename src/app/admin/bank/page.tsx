"use client";

/**
 * The bank, in the admin.
 *
 * Every row here is a movement that really happened — pulled from Qonto and
 * Stripe, never typed. The job of the page is one question per row: whose
 * money is this? So an unmatched credit does not just sit there, it arrives
 * carrying the system's best answer and the reasons for it, and connecting it
 * is one click. What the system is not sure about it says so, rather than
 * guessing: eleven guests owe €2,445 for the same Bonaire week, and a matcher
 * that picks one on price alone is wrong ten times out of eleven.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  ignored_at: string | null;
  ignored_reason: string | null;
  suggestions: Suggestion[];
  /** Said when the answer is known but is not "connect this to an open
      invoice" — above all, that the invoice it names is already paid. */
  note?: string;
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

const money = (n: number, ccy = "EUR") =>
  `${ccy === "EUR" ? "€" : ccy + " "}${Math.abs(Number(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const VIEWS = [
  { key: "unmatched", label: "To match" },
  { key: "matched", label: "Connected" },
  { key: "ignored", label: "Set aside" },
  { key: "all", label: "All" },
] as const;

const KIND_LABEL: Record<string, string> = {
  income: "Money in",
  expense: "Money out",
  payout: "Stripe payout",
  fee: "Fee",
  transfer: "Own transfer",
  unknown: "Unclassified",
};

export default function BankPage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [count, setCount] = useState(0);
  const [sources, setSources] = useState<{ bank: boolean; stripe: boolean }>({ bank: false, stripe: false });
  const [view, setView] = useState<string>("unmatched");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bank/transactions?view=${view}&q=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load the ledger.");
      setTxs(json.transactions ?? []);
      setCandidates(json.candidates ?? []);
      setCount(json.count ?? 0);
      setSources(json.sources ?? { bank: false, stripe: false });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [view, search]);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  const noSources = !sources.bank && !sources.stripe;

  return (
    <div className="fin">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="fin-hero mb-1">Bank</h1>
          <p className="fin-sub">
            Straight from Qonto and Stripe. This is the whole NP7 account, so most of it
            is not Experience money · {count} shown
          </p>
        </div>
        <button
          onClick={sync}
          disabled={syncing}
          className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

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

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="fin-seg inline-flex">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => { setView(v.key); setOpenId(null); }} data-on={view === v.key ? "true" : "false"}>
              {v.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search payer, reference…"
          className="admin-input text-sm px-3 py-1.5 rounded-lg w-64"
        />
        <span className="text-xs admin-faint ml-auto">{txs.length} shown</span>
      </div>

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
                const isIncome = t.kind === "income" && Number(t.amount) > 0;
                return (
                  <Fragment key={t.id}>
                    <tr
                      onClick={() => { setOpenId(open ? null : t.id); setPickerQuery(""); }}
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
                        ) : t.document_id ? (
                          <span className="text-green-600 font-medium">Connected</span>
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
                                {t.document_id ? (
                                  <button
                                    onClick={() => act(t.id, { action: "unmatch" })}
                                    disabled={busyId === t.id}
                                    className="px-3 py-1.5 text-xs rounded-lg admin-surface admin-muted disabled:opacity-50"
                                    style={{ border: "1px solid var(--admin-border)" }}
                                  >
                                    Disconnect
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
                                      const reason = window.prompt("Why is this not a guest payment?");
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

                            {isIncome && !t.document_id && !t.ignored_at && (
                              <>
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
                                          onClick={() => act(t.id, { action: "match", documentId: s.candidate.documentId, fromSuggestion: true })}
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
                                      onClick={() => act(t.id, { action: "match", documentId: c.documentId })}
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

                            {t.document_id && (
                              <p className="text-sm admin-muted">
                                Booked as a payment against{" "}
                                <Link href="/admin/documents" className="underline">this invoice</Link>
                                {t.match_confidence === "auto" ? " automatically." : t.match_confidence === "suggested" ? " from a suggestion." : " by hand."}
                              </p>
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
