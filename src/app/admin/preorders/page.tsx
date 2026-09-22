"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AUDIENCE_LABEL, BALANCE_DUE_LABEL, daysLeft, depositLabel, termsLine, windowState,
  type PreorderWindow,
} from "@/lib/hardware/preorders";

interface Demand {
  orders: number; units: number; value: number; deposits: number;
  models: { title: string; units: number }[];
}

const STATE_STYLE: Record<string, string> = {
  draft: "bg-neutral-500/15 text-neutral-400",
  upcoming: "bg-blue-500/15 text-blue-400",
  open: "bg-green-500/15 text-green-400",
  closed: "bg-amber-500/15 text-amber-500",
};

const eur = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function PreordersPage() {
  const [windows, setWindows] = useState<PreorderWindow[]>([]);
  const [demand, setDemand] = useState<Record<string, Demand>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<PreorderWindow>>>({});
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/preorders").then((r) => r.json()).then((d) => {
      setWindows(Array.isArray(d.windows) ? d.windows : []);
      setDemand(d.demand ?? {});
      setLoading(false);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const field = (w: PreorderWindow, key: keyof PreorderWindow) =>
    (draft[w.id]?.[key] ?? w[key]) as string | number;

  const edit = (id: string, key: keyof PreorderWindow, value: string | number) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));

  async function save(w: PreorderWindow, extra: Partial<PreorderWindow> = {}) {
    setSaving(w.id); setError(null);
    const body = { ...draft[w.id], ...extra };
    const res = await fetch(`/api/admin/preorders/${w.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(null);
    if (!res.ok) { setError(json.error ?? "Could not save"); return; }
    setDraft((d) => ({ ...d, [w.id]: {} }));
    load();
  }

  async function create(form: HTMLFormElement) {
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch("/api/admin/preorders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Could not create"); return; }
    setAdding(false); load();
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Pre-orders</h1>
          <p className="text-sm admin-muted">
            A window is a period, never a single date. Dealers order first, because their orders size the
            production run. Riders fill what is left.
          </p>
        </div>
        <button onClick={() => setAdding((v) => !v)}
          className="px-3 py-2 rounded-lg text-sm font-medium admin-accent-bg self-start">
          {adding ? "Cancel" : "New window"}
        </button>
      </div>

      {error && <div className="mb-4 px-3 py-2 rounded-lg text-sm bg-red-500/10 text-red-400">{error}</div>}

      {adding && (
        <form onSubmit={(e) => { e.preventDefault(); create(e.currentTarget); }}
          className="admin-tablecard p-4 mb-6 grid gap-3 sm:grid-cols-3">
          <label className="text-xs admin-faint">Season
            <input name="season" type="number" defaultValue={new Date().getFullYear() + 1} className="admin-input w-full mt-1 px-3 py-2 rounded-lg text-sm" />
          </label>
          <label className="text-xs admin-faint">Who for
            <select name="audience" className="admin-input w-full mt-1 px-3 py-2 rounded-lg text-sm">
              <option value="dealer">Dealers</option>
              <option value="rider">Riders</option>
            </select>
          </label>
          <label className="text-xs admin-faint">Name
            <input name="label" placeholder="Dealer pre-order 2028" className="admin-input w-full mt-1 px-3 py-2 rounded-lg text-sm" />
          </label>
          <label className="text-xs admin-faint">Opens
            <input name="opens_on" type="date" required className="admin-input w-full mt-1 px-3 py-2 rounded-lg text-sm" />
          </label>
          <label className="text-xs admin-faint">Closes
            <input name="closes_on" type="date" required className="admin-input w-full mt-1 px-3 py-2 rounded-lg text-sm" />
          </label>
          <label className="text-xs admin-faint">Boards expected
            <input name="ships_from" type="date" className="admin-input w-full mt-1 px-3 py-2 rounded-lg text-sm" />
          </label>
          <label className="text-xs admin-faint">Deposit is
            <select name="deposit_kind" className="admin-input w-full mt-1 px-3 py-2 rounded-lg text-sm">
              <option value="pct">a share of the order</option>
              <option value="amount">a flat amount per board</option>
            </select>
          </label>
          <label className="text-xs admin-faint">Deposit value (0.30 or 500)
            <input name="deposit_value" type="number" step="0.01" defaultValue="0.3" className="admin-input w-full mt-1 px-3 py-2 rounded-lg text-sm" />
          </label>
          <label className="text-xs admin-faint">Discount (0.03 = 3%)
            <input name="discount_pct" type="number" step="0.01" defaultValue="0.03" className="admin-input w-full mt-1 px-3 py-2 rounded-lg text-sm" />
          </label>
          <label className="text-xs admin-faint sm:col-span-2">Balance due
            <select name="balance_due" className="admin-input w-full mt-1 px-3 py-2 rounded-lg text-sm">
              <option value="on_arrival">when the boards arrive</option>
              <option value="before_shipping">before the boards leave the factory</option>
              <option value="on_dispatch">when the board ships</option>
            </select>
          </label>
          <button className="px-3 py-2 rounded-lg text-sm font-medium admin-accent-bg self-end">Create as draft</button>
        </form>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : windows.length === 0 ? (
        <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint">No pre-order windows yet.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {windows.map((w) => {
            const state = windowState(w);
            const left = daysLeft(w);
            const d = demand[w.id];
            return (
              <div key={w.id} className="admin-tablecard p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="font-semibold admin-heading">{w.label ?? `${AUDIENCE_LABEL[w.audience]} ${w.season}`}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--admin-accent)]/15 text-[var(--admin-accent)]">
                    {AUDIENCE_LABEL[w.audience]}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATE_STYLE[state]}`}>
                    {state === "open" ? `open, ${left} days left` : state}
                  </span>
                  {w.audience === "dealer" && (
                    <span className="text-xs admin-faint">closes before the factory order goes in</span>
                  )}
                </div>

                <p className="text-sm admin-muted mb-3">{termsLine(w)}</p>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-3">
                  <label className="text-xs admin-faint">Opens
                    <input type="date" value={String(field(w, "opens_on"))} onChange={(e) => edit(w.id, "opens_on", e.target.value)}
                      className="admin-input w-full mt-1 px-2 py-1.5 rounded-lg text-sm" />
                  </label>
                  <label className="text-xs admin-faint">Closes
                    <input type="date" value={String(field(w, "closes_on"))} onChange={(e) => edit(w.id, "closes_on", e.target.value)}
                      className="admin-input w-full mt-1 px-2 py-1.5 rounded-lg text-sm" />
                  </label>
                  <label className="text-xs admin-faint">Boards expected
                    <input type="date" value={String(field(w, "ships_from") ?? "")} onChange={(e) => edit(w.id, "ships_from", e.target.value)}
                      className="admin-input w-full mt-1 px-2 py-1.5 rounded-lg text-sm" />
                  </label>
                  <label className="text-xs admin-faint">Deposit ({w.deposit_kind === "pct" ? "share" : "€ per board"})
                    <input type="number" step="0.01" value={Number(field(w, "deposit_value"))} onChange={(e) => edit(w.id, "deposit_value", Number(e.target.value))}
                      className="admin-input w-full mt-1 px-2 py-1.5 rounded-lg text-sm" />
                  </label>
                  <label className="text-xs admin-faint">Discount
                    <input type="number" step="0.01" value={Number(field(w, "discount_pct"))} onChange={(e) => edit(w.id, "discount_pct", Number(e.target.value))}
                      className="admin-input w-full mt-1 px-2 py-1.5 rounded-lg text-sm" />
                  </label>
                  <label className="text-xs admin-faint">Balance due
                    <select value={String(field(w, "balance_due"))} onChange={(e) => edit(w.id, "balance_due", e.target.value)}
                      className="admin-input w-full mt-1 px-2 py-1.5 rounded-lg text-sm">
                      {Object.entries(BALANCE_DUE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => save(w)} disabled={saving === w.id}
                    className="px-3 py-1.5 rounded-lg text-sm admin-input">
                    {saving === w.id ? "Saving…" : "Save"}
                  </button>
                  {w.status !== "open" && (
                    <button onClick={() => save(w, { status: "open" })}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium admin-accent-bg">Open it</button>
                  )}
                  {w.status === "open" && (
                    <button onClick={() => save(w, { status: "closed" })}
                      className="px-3 py-1.5 rounded-lg text-sm admin-input">Close it</button>
                  )}
                  <span className="text-xs admin-faint">{depositLabel(w)}</span>
                </div>

                <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--admin-border)" }}>
                  {!d ? (
                    <p className="text-sm admin-faint">
                      Nothing ordered yet. When this window closes, the count here is what we order from the factory.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-6 text-sm">
                      <div><span className="admin-faint text-xs block">Orders</span><span className="admin-heading font-semibold">{d.orders}</span></div>
                      <div><span className="admin-faint text-xs block">Boards</span><span className="admin-heading font-semibold">{d.units}</span></div>
                      <div><span className="admin-faint text-xs block">Value</span><span className="admin-heading font-semibold">{eur(d.value)}</span></div>
                      <div><span className="admin-faint text-xs block">Deposits in</span><span className="admin-heading font-semibold">{eur(d.deposits)}</span></div>
                      <div className="min-w-[200px]">
                        <span className="admin-faint text-xs block">By model</span>
                        <span className="admin-muted">{d.models.map((m) => `${m.title} ${m.units}`).join(" · ")}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
