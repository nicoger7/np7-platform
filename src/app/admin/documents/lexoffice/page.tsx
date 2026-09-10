"use client";

/**
 * What has reached the books, what has not, and why not.
 *
 * The page is small on purpose. There is one question a bookkeeper asks here —
 * "is everything in lexoffice?" — and one action, which writes into a real set
 * of company books and cannot be undone through the API. So the pending pile
 * is the whole page, every push shows the exact Beschreibung line before it is
 * sent, and anything the pusher refuses says why in the sentence a person
 * would have said.
 *
 * It sits under /admin/documents rather than at the top level because both
 * gates in access.ts match by path prefix and fail open for an unregistered
 * path. Nesting it makes it owner-only by inheritance rather than by an entry
 * someone has to remember to add.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/invoices/types";

type Doc = {
  id: string;
  booking_id: string | null;
  division: string;
  type: string;
  invoice_number: string | null;
  title: string | null;
  amount: number | null;
  currency: string;
  issued_at: string;
  lexoffice_voucher_id: string | null;
  lexoffice_pushed_at: string | null;
  lexoffice_remark: string | null;
  lexoffice_error: string | null;
  lexoffice_attempts: number | null;
  lexofficeState: "pushed" | "failed" | "pending";
};

type Account = {
  id: string;
  label: string;
  envKey: string;
  hasKey: boolean;
  enabled: boolean;
  validFrom: string | null;
  validTo: string | null;
  salesCategoryId: string | null;
  problems: string[];
};

type Preview = {
  remark: string | null;
  territory: "DRITTLAND" | "EU" | "UNKLAR";
  territoryReason: string;
  place: string | null;
  departure: string | null;
  stage: string | null;
  blockers: string[];
  warnings: string[];
  account: { id: string; label: string } | null;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const TERRITORY_STYLE: Record<string, string> = {
  DRITTLAND: "var(--admin-accent)",
  EU: "var(--admin-border)",
  UNKLAR: "#b45309",
};

export default function LexofficePage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "failed" | "pushed">("pending");
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /* The fetch is written out inside the effect rather than called from it, and
     nothing sets state before the first await. A setState in an effect body
     runs before paint and cascades a second render, which on this page would
     mean the account readiness panel flashing "not ready" while the real
     answer is still in flight. `reload` is the same request for the button and
     for after a push, where a synchronous setState is a click, not a render. */
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/documents/lexoffice");
      const j = await res.json().catch(() => ({ error: "lexoffice status could not be read" }));
      if (cancelled) return;
      if (j.error) setLoadError(j.needsMigration ? "Migration 236 has not been applied to this database yet." : j.error);
      else {
        setLoadError(null);
        setDocs(j.documents ?? []);
        setAccounts(j.accounts ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const openPreview = async (id: string) => {
    if (open === id) {
      setOpen(null);
      setPreview(null);
      return;
    }
    setOpen(id);
    setPreview(null);
    const res = await fetch(`/api/admin/documents/lexoffice?preview=${id}`);
    const j = await res.json();
    setPreview(j.preview ?? null);
  };

  const push = async (id: string) => {
    setBusy(id);
    setNote(null);
    const res = await fetch("/api/admin/documents/lexoffice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: id }),
    });
    const j = await res.json();
    const r = j.results?.[0];
    setNote(
      r?.ok
        ? r.already
          ? "That Beleg was already in lexoffice. Nothing was created a second time."
          : "Pushed."
        : r?.reason ?? j.error ?? "The push failed.",
    );
    setBusy(null);
    setOpen(null);
    setPreview(null);
    reload();
  };

  const rows = docs.filter((d) => d.lexofficeState === tab);
  const counts = {
    pending: docs.filter((d) => d.lexofficeState === "pending").length,
    failed: docs.filter((d) => d.lexofficeState === "failed").length,
    pushed: docs.filter((d) => d.lexofficeState === "pushed").length,
  };

  const blocked = accounts.length === 0 || accounts.every((a) => a.problems.length > 0);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold admin-heading">lexoffice</h1>
          <p className="text-sm admin-muted mt-0.5">
            NP7 keeps the numbers, lexoffice keeps the books. An invoice goes across as a Beleg carrying its own
            number, with the PDF attached, and stays unpaid on purpose so the bank matching can find it.
          </p>
        </div>
        <Link
          href="/admin/documents"
          className="px-4 py-2 text-sm font-bold rounded-lg transition-colors admin-muted hover:admin-heading"
          style={{ border: "1px solid var(--admin-border)" }}
        >
          Back to invoices
        </Link>
      </div>

      {loadError && (
        <div className="rounded-xl p-4 mb-5 text-sm" style={{ border: "1px solid #b45309", color: "#b45309" }}>
          {loadError}
        </div>
      )}

      {/* Whether the books can be written to at all. Shown first, because every
          refusal further down traces back to something on this list. */}
      <div className="rounded-xl admin-tablecard mb-5" style={{ border: "1px solid var(--admin-border)" }}>
        <div className="px-4 py-3 text-xs font-bold uppercase tracking-wide admin-muted" style={{ borderBottom: "1px solid var(--admin-border)" }}>
          Company accounts
        </div>
        {accounts.length === 0 && !loading && (
          <div className="px-4 py-4 text-sm admin-muted">No lexoffice account is set up. One account is one company.</div>
        )}
        {accounts.map((a) => (
          <div key={a.id} className="px-4 py-3 text-sm" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-bold admin-heading">{a.label}</span>
              <span className="admin-faint text-xs">
                {a.validFrom ? fmtDate(a.validFrom) : "from the start"} to {a.validTo ? fmtDate(a.validTo) : "open"}
              </span>
              <span className="admin-faint text-xs">key {a.envKey}</span>
              <span className="text-xs font-bold" style={{ color: a.problems.length ? "#b45309" : "var(--admin-accent)" }}>
                {a.problems.length ? "not ready" : "ready"}
              </span>
            </div>
            {a.problems.map((p, i) => (
              <p key={i} className="mt-1 text-xs" style={{ color: "#b45309" }}>
                {p}
              </p>
            ))}
          </div>
        ))}
      </div>

      {note && (
        <div className="rounded-xl p-4 mb-5 text-sm admin-heading" style={{ border: "1px solid var(--admin-border)" }}>
          {note}
        </div>
      )}

      <div className="flex rounded-lg overflow-hidden w-fit mb-4" style={{ border: "1px solid var(--admin-border)" }}>
        {(
          [
            ["pending", "Not yet in lexoffice", counts.pending],
            ["failed", "Failed", counts.failed],
            ["pushed", "In lexoffice", counts.pushed],
          ] as const
        ).map(([key, label, n]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-bold transition-colors ${tab === key ? "text-[var(--admin-accent-contrast)]" : "admin-muted hover:admin-heading"}`}
            style={tab === key ? { backgroundColor: "var(--admin-accent)" } : undefined}
          >
            {label} <span className={tab === key ? "opacity-70" : "admin-faint"}>{n}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
        {loading && <div className="px-4 py-6 text-sm admin-muted">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-6 text-sm admin-muted">
            {tab === "pending" ? "Every issued invoice is in lexoffice." : tab === "failed" ? "Nothing has failed." : "Nothing has been pushed yet."}
          </div>
        )}
        {rows.map((d) => (
          <div key={d.id} style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-mono font-bold admin-heading">{d.invoice_number ?? "no number"}</span>
              <span className="admin-muted flex-1 min-w-[12rem] truncate">{d.title ?? d.type.replace(/_/g, " ")}</span>
              <span className="admin-muted">{fmtDate(d.issued_at)}</span>
              <span className="font-bold admin-heading tabular-nums">{formatMoney(d.amount, d.currency)}</span>
              {d.lexofficeState === "pending" && (
                <button
                  onClick={() => openPreview(d.id)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg admin-muted hover:admin-heading"
                  style={{ border: "1px solid var(--admin-border)" }}
                >
                  {open === d.id ? "Close" : "Review"}
                </button>
              )}
              {d.lexofficeState === "failed" && (
                <button
                  onClick={() => openPreview(d.id)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg"
                  style={{ border: "1px solid #b45309", color: "#b45309" }}
                >
                  {open === d.id ? "Close" : "Retry"}
                </button>
              )}
              {d.lexofficeState === "pushed" && <span className="text-xs admin-faint">{fmtDate(d.lexoffice_pushed_at)}</span>}
            </div>

            {d.lexoffice_remark && d.lexofficeState === "pushed" && (
              <div className="px-4 pb-3 font-mono text-xs admin-faint break-all">{d.lexoffice_remark}</div>
            )}
            {d.lexoffice_error && d.lexofficeState === "failed" && (
              <div className="px-4 pb-3 text-xs" style={{ color: "#b45309" }}>
                {d.lexoffice_error}
                {d.lexoffice_attempts ? ` · ${d.lexoffice_attempts} attempt${d.lexoffice_attempts === 1 ? "" : "s"}` : ""}
              </div>
            )}

            {open === d.id && (
              <div className="px-4 pb-4">
                {!preview && <p className="text-sm admin-muted">Working out what would be sent…</p>}
                {preview && (
                  <div className="rounded-lg p-3" style={{ border: "1px solid var(--admin-border)" }}>
                    <p className="text-xs font-bold uppercase tracking-wide admin-muted mb-1">Beschreibung</p>
                    <p className="font-mono text-xs admin-heading break-all mb-3">{preview.remark ?? "could not be written"}</p>

                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs admin-muted mb-3">
                      <span>
                        Territory{" "}
                        <span className="font-bold" style={{ color: TERRITORY_STYLE[preview.territory] }}>
                          {preview.territory}
                        </span>{" "}
                        <span className="admin-faint">({preview.territoryReason})</span>
                      </span>
                      {preview.stage && <span>{preview.stage}</span>}
                      {preview.account && <span>into {preview.account.label}</span>}
                      <span>Steuersatz keine · noch nicht bezahlt</span>
                    </div>

                    {preview.blockers.map((b, i) => (
                      <p key={i} className="text-xs mb-1" style={{ color: "#b45309" }}>
                        {b}
                      </p>
                    ))}
                    {preview.warnings.map((w, i) => (
                      <p key={i} className="text-xs admin-muted mb-1">
                        {w}
                      </p>
                    ))}

                    <button
                      onClick={() => push(d.id)}
                      disabled={busy === d.id || preview.blockers.length > 0 || blocked}
                      className="mt-2 px-4 py-2 text-sm font-bold rounded-lg disabled:opacity-40"
                      style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}
                    >
                      {busy === d.id ? "Pushing…" : "Push to lexoffice"}
                    </button>
                    <p className="mt-2 text-xs admin-faint">
                      lexoffice has no way to delete or void a Beleg through its API. A push that turns out to be wrong
                      has to be removed by hand in the browser.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
