"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Splitting one budget row across the things it was actually for.
 *
 * The split is a percentage, not an amount, because the row changes: a hotel
 * line that grows from 8,000 to 8,340 stays "all Slalom" without anyone
 * revisiting the allocation. Shares may total less than 100, and the remainder
 * is shown rather than silently forced onto something, because "we have not
 * decided yet" is a real answer and rounding it away hides it.
 */

type CostObject = { id: string; name: string; kind: string; parent_id: string | null; sort: number };
type Row = {
  plan_id: string; category_id: string | null; label: string;
  edition_id: string | null; vendor_id: string | null;
};

const eur0 = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function AllocateDialog({ row, onClose, onSaved }: {
  row: Row; onClose: () => void; onSaved: () => void;
}) {
  const [objects, setObjects] = useState<CostObject[]>([]);
  const [shares, setShares] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [lineCount, setLineCount] = useState(0);
  const [uneven, setUneven] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ plan_id: row.plan_id, label: row.label });
    if (row.category_id) qs.set("category_id", row.category_id);
    if (row.edition_id) qs.set("edition_id", row.edition_id);
    if (row.vendor_id) qs.set("vendor_id", row.vendor_id);
    fetch(`/api/admin/finance/line-objects?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setErr(d.error); setLoading(false); return; }
        setObjects(d.objects ?? []);
        setShares(Object.fromEntries(((d.current ?? []) as { cost_object_id: string; share: number }[])
          .map((c) => [c.cost_object_id, String(c.share)])));
        setTotal(d.total ?? 0); setLineCount(d.lineCount ?? 0); setUneven(!!d.uneven);
        setLoading(false);
      })
      .catch(() => { setErr("Could not load the split."); setLoading(false); });
  }, [row]);

  // parents before children, so the tree reads top down
  const ordered = useMemo(() => {
    const byParent = new Map<string | null, CostObject[]>();
    for (const o of [...objects].sort((a, b) => a.sort - b.sort)) {
      if (!byParent.has(o.parent_id)) byParent.set(o.parent_id, []);
      byParent.get(o.parent_id)!.push(o);
    }
    const out: { o: CostObject; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const o of byParent.get(parent) ?? []) { out.push({ o, depth }); walk(o.id, depth + 1); }
    };
    walk(null, 0);
    return out;
  }, [objects]);

  const allocated = useMemo(
    () => Math.round(Object.values(shares).reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100,
    [shares],
  );
  const remainder = Math.round((100 - allocated) * 100) / 100;

  const setOnly = (id: string) => setShares({ [id]: "100" });

  async function save() {
    if (allocated > 100.005) { setErr(`That splits the row ${allocated}% ways.`); return; }
    setSaving(true);
    const res = await fetch("/api/admin/finance/line-objects", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...row,
        allocations: Object.entries(shares)
          .map(([cost_object_id, share]) => ({ cost_object_id, share: Number(share) || 0 }))
          .filter((a) => a.share > 0),
      }),
    });
    setSaving(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Could not save the split."); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 fin" onClick={onClose}>
      <div className="fin-card w-full max-w-lg max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="fin-title">What was this for?</h2>
          <p className="fin-sub mt-0.5">
            <span className="fin-num">{row.label}</span>
            {total > 0 && <> · {eur0(total)} across {lineCount} month{lineCount === 1 ? "" : "s"}</>}
          </p>
        </div>

        {uneven && (
          <p className="fin-sub mt-3" style={{ color: "var(--viz-neg)" }}>
            The months of this row are currently split differently. Saving makes them all the same.
          </p>
        )}

        {loading ? (
          <p className="fin-sub py-10 text-center">Loading…</p>
        ) : !objects.length ? (
          <p className="fin-sub py-10 text-center">This company has nothing to allocate to yet.</p>
        ) : (
          <div className="mt-4 flex-1 overflow-y-auto -mx-1 px-1">
            {ordered.map(({ o, depth }) => {
              const share = Number(shares[o.id]) || 0;
              return (
                <div key={o.id} className="fin-row grid items-center gap-2 py-1.5 px-1 rounded-lg"
                     style={{ gridTemplateColumns: "1fr 5.5rem 5rem 3rem" }}>
                  <span className="text-[13px] truncate" title={o.name}
                        style={{ paddingLeft: depth * 14, color: share > 0 ? "var(--admin-text)" : "var(--admin-text-muted)" }}>
                    {o.name}
                    {o.kind === "overhead" && <span className="fin-sub"> · belongs to no product</span>}
                  </span>
                  <div className="flex items-center gap-1">
                    <input inputMode="decimal" value={shares[o.id] ?? ""}
                           onChange={(e) => setShares((p) => ({ ...p, [o.id]: e.target.value }))}
                           placeholder="0"
                           className="w-full admin-input border rounded-lg px-2 py-1 text-[13px] text-right tabular-nums" />
                    <span className="fin-sub">%</span>
                  </div>
                  <span className="text-[12px] tabular-nums text-right admin-muted">
                    {share > 0 ? eur0((total * share) / 100) : ""}
                  </span>
                  <button onClick={() => setOnly(o.id)} title="All of it, and clear the rest"
                          className="text-[11px] admin-faint hover:text-[var(--admin-text)] text-right">all</button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 pt-3 fin-rule flex items-center justify-between gap-3 flex-wrap">
          <span className="fin-sub">
            {allocated}% allocated
            {remainder > 0.005 && (
              <span style={{ color: "var(--admin-text-faint)" }}>
                {" · "}{remainder}% unassigned{total > 0 ? ` (${eur0((total * remainder) / 100)})` : ""}
              </span>
            )}
            {allocated > 100.005 && <span style={{ color: "var(--viz-neg)" }}>{" · over by "}{Math.round((allocated - 100) * 100) / 100}%</span>}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setShares({})} className="px-3 py-2 text-sm rounded-lg border admin-input">Clear</button>
            <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border admin-input">Cancel</button>
            <button onClick={save} disabled={saving || loading || allocated > 100.005}
                    className="px-4 py-2 text-sm font-bold rounded-lg admin-btn-primary disabled:opacity-50">
              {saving ? "Saving…" : "Save split"}
            </button>
          </div>
        </div>

        {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
      </div>
    </div>
  );
}
