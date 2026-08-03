"use client";

import { useState } from "react";

/**
 * When the dated mails go out — the whole chain, editable.
 *
 * The lead times were in code, so "send the packing list a week earlier" was a
 * deploy. They are also chained: each mail fires until the next one takes over,
 * which is why every row shows the WINDOW and not just the ideal day. Move one
 * lead and the neighbouring window moves with it — the numbers here are
 * recomputed from the server's answer after every save, so the row you did not
 * touch never shows a stale boundary.
 */

export type TimingRow = {
  key: string;
  name: string;
  trigger: string;
  anchor: "before" | "afterEnd";
  days: number;
  defaultDays: number;
  windowClose: number;
  overridden: boolean;
};

type Timing = {
  before: Record<string, number>;
  afterEnd: Record<string, number>;
  windowClose: Record<string, number>;
  windowCloseAfterEnd: Record<string, number>;
  overridden: string[];
};

/** The stretch of days the nightly job may still fire this one in. */
function windowText(r: TimingRow): string {
  if (r.anchor === "before") {
    const last = r.windowClose + 1;
    return last <= 0
      ? `Sends any day from ${r.days} days out until the trip starts`
      : `Sends any day from ${r.days} to ${last} days out`;
  }
  return `Sends any day from ${r.days} to ${r.windowClose} days after it ends`;
}

export function SendTiming({ rows: initial }: { rows: TimingRow[] }) {
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const apply = (t: Timing) =>
    setRows((rs) => rs.map((r) => ({
      ...r,
      days: (r.anchor === "before" ? t.before[r.key] : t.afterEnd[r.key]) ?? r.days,
      windowClose: (r.anchor === "before" ? t.windowClose[r.key] : t.windowCloseAfterEnd[r.key]) ?? r.windowClose,
      overridden: t.overridden.includes(r.key),
    })));

  async function save(key: string, days: number | null) {
    setBusy(key); setErr(null); setSavedKey(null);
    try {
      const res = await fetch("/api/admin/emails/timing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey: key, days }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "Couldn't save that."); return; }
      if (j.timing) apply(j.timing as Timing);
      setDraft((d) => { const n = { ...d }; delete n[key]; return n; });
      setSavedKey(key);
    } catch {
      setErr("Couldn't save that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl mb-6 overflow-hidden" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--admin-border)" }}>
        <h2 className="text-sm font-bold admin-heading">When the scheduled mails go out</h2>
        <p className="text-[12px] admin-muted mt-0.5 max-w-[80ch]">
          Counted from the trip dates, the same for every trip. Each mail keeps sending until the next one takes over,
          so a guest who books late still gets whichever one their date falls into — change a number and the handover
          moves with it.
        </p>
      </div>

      {err && <p className="px-4 pt-3 text-[12.5px] font-semibold text-red-400">{err}</p>}

      {rows.map((r, i) => {
        const raw = draft[r.key];
        const dirty = raw != null && raw.trim() !== "" && Number(raw) !== r.days;
        return (
          <div key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
            style={{ borderTop: i ? "1px solid var(--admin-border)" : undefined }}>
            <div className="min-w-[190px] flex-1">
              <p className="text-[13px] font-bold admin-heading">{r.name}</p>
              <p className="text-[11.5px] admin-faint">{windowText(r)}</p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={400} inputMode="numeric"
                value={raw ?? String(r.days)}
                onChange={(e) => { setDraft((d) => ({ ...d, [r.key]: e.target.value })); setSavedKey(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && dirty) save(r.key, Number(raw)); }}
                className="w-16 rounded-lg px-2 py-1.5 text-[13px] text-right outline-none focus:border-[#0aa3c7]"
                style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)", color: "var(--admin-text)" }}
              />
              <span className="text-[12px] admin-muted w-[112px]">
                {r.anchor === "before" ? "days before it starts" : "days after it ends"}
              </span>
            </div>

            <div className="flex items-center gap-2 min-w-[150px] justify-end">
              {dirty && (
                <button onClick={() => save(r.key, Number(raw))} disabled={busy === r.key}
                  className="text-[12px] font-bold px-3 py-1 rounded-lg bg-[#0aa3c7] text-white disabled:opacity-50">
                  {busy === r.key ? "Saving…" : "Save"}
                </button>
              )}
              {!dirty && savedKey === r.key && <span className="text-[12px] font-semibold text-green-500">Saved</span>}
              {/* The way back. A number someone regrets is only a mistake if it
                  is permanent. */}
              {r.overridden && !dirty && (
                <button onClick={() => save(r.key, null)} disabled={busy === r.key}
                  className="text-[11.5px] admin-faint hover:text-[#0aa3c7] transition-colors">
                  ↺ Back to {r.defaultDays}d
                </button>
              )}
              {!r.overridden && !dirty && savedKey !== r.key && <span className="text-[11.5px] admin-faint">default</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
