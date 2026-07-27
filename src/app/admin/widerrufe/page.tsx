"use client";

import { useEffect, useState } from "react";

/**
 * Widerrufe — withdrawal declarations received through the statutory online
 * withdrawal function at /widerruf (§ 356a BGB). The timestamp shown is the
 * legal date/time of receipt; the acknowledgment email echoes it. Process each
 * one (refund within 14 days for valid withdrawals) and mark it done.
 */

type Row = {
  id: string;
  created_at: string;
  name: string;
  contract_ref: string;
  email: string;
  note: string | null;
  status: "new" | "processed";
  ack_sent_at: string | null;
};

export default function WiderrufePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  function load() {
    fetch("/api/admin/widerrufe")
      .then((r) => r.json())
      .then((d) => { setRows(d.requests ?? []); setErr(d.error || ""); setLoading(false); })
      .catch(() => { setErr("Couldn't load."); setLoading(false); });
  }
  useEffect(load, []);

  async function setStatus(row: Row, status: Row["status"]) {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status } : r)));
    try {
      const res = await fetch("/api/admin/widerrufe", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status }),
      });
      if (!res.ok) load();
    } catch { load(); }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

  const open = rows.filter((r) => r.status === "new");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold admin-heading mb-1">Widerrufe</h1>
        <p className="text-sm admin-muted">
          Withdrawal declarations from the statutory online function at <code>/widerruf</code>
          {open.length > 0 && <> — <strong style={{ color: "#f59e0b" }}>{open.length} open</strong> (refund valid withdrawals within 14 days)</>}
        </p>
      </div>

      {loading ? (
        <p className="text-sm admin-faint py-8">Loading…</p>
      ) : err ? (
        <p className="text-sm text-red-400 py-8">{err}</p>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint">No withdrawals received — hopefully it stays that way. 🤙</p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="hidden sm:grid grid-cols-[150px_1fr_1fr_1fr_110px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {["Received", "Name", "Contract / order", "Email", ""].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.id} className="grid sm:grid-cols-[150px_1fr_1fr_1fr_110px] gap-1.5 sm:gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--admin-border)", opacity: r.status === "processed" ? 0.55 : 1 }}>
              <span className="text-xs admin-muted self-center">{fmt(r.created_at)}</span>
              <span className="text-sm font-medium admin-heading self-center truncate" title={r.note || undefined}>
                {r.name}
                {r.note && <span className="block text-[11px] admin-faint font-normal truncate">„{r.note}"</span>}
              </span>
              <span className="text-xs admin-muted self-center truncate">{r.contract_ref}</span>
              <span className="text-xs admin-muted self-center truncate">
                <a href={`mailto:${r.email}`} className="hover:text-[var(--admin-accent)]">{r.email}</a>
                {!r.ack_sent_at && <span className="block text-[10px]" style={{ color: "#f59e0b" }}>⚠ ack email not sent</span>}
              </span>
              <span className="self-center sm:text-right">
                {r.status === "new" ? (
                  <button onClick={() => setStatus(r, "processed")} className="px-3 py-1.5 text-xs font-bold rounded-lg text-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/10 transition-colors" style={{ border: "1px solid var(--admin-accent)" }}>
                    Mark done
                  </button>
                ) : (
                  <button onClick={() => setStatus(r, "new")} className="px-3 py-1.5 text-xs rounded-lg admin-faint hover:admin-muted transition-colors" style={{ border: "1px solid var(--admin-border)" }}>
                    Reopen
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
