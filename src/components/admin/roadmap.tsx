"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VIZ_CSS } from "./finance-charts";

/**
 * The Zeitstrahl: drag a milestone and the date moves, in the database and, when
 * it was read out of another table, in that table too.
 *
 * Lanes are derived from what a milestone points at, never stored, so a new
 * product or project brings its own row. A moved milestone keeps a ghost at the
 * date it was first committed to, because the useful question about a roadmap is
 * not where things are but how far they have slipped.
 *
 * Dependencies exist in the schema and the API returns them; nothing draws them
 * yet, so they are deliberately not read here rather than held unused.
 */

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * DAY));
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);
const eur0 = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const MONTH_LABEL = (d: Date) =>
  d.toLocaleDateString("en-GB", { month: "short", year: d.getUTCMonth() === 0 ? "numeric" : undefined, timeZone: "UTC" });

export type RoadmapItem = {
  id: string; entity_id: string | null; title: string; kind: string; status: string;
  starts_on: string; ends_on: string | null;
  baseline_starts_on: string | null; baseline_ends_on: string | null;
  product_id: string | null; project_id: string | null; purchase_order_id: string | null;
  edition_id: string | null; cost_object_id: string | null; plan_line_id: string | null;
  source_table: string | null; source_field: string | null;
  amount_net: number | null; note: string | null; sort: number;
};
type Named = { id: string; name?: string; po_number?: string };
type Lanes = { products: Named[]; projects: Named[]; purchaseOrders: Named[]; costObjects: Named[] };

const KIND_VAR: Record<string, string> = {
  tooling: "--s-development", production: "--s-cogs", shipping: "--s-inventory",
  funding: "--s-funding", revenue: "--s-revenue", legal: "--s-opex",
  launch: "--s-revenue", trip: "--s-revenue", hiring: "--s-opex", other: "--s-opex",
};
const KINDS = ["tooling", "production", "shipping", "funding", "revenue", "legal", "launch", "trip", "hiring", "other"];
const STATUSES = ["planned", "committed", "done", "at_risk", "cancelled"];

export function Roadmap({ world }: { world: string }) {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [lanes, setLanes] = useState<Lanes>({ products: [], projects: [], purchaseOrders: [], costObjects: [] });
  const [entityId, setEntityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(3.4);            // px per day
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; x0: number; s0: string; e0: string | null } | null>(null);
  const [offset, setOffset] = useState(0);           // live pixel offset while dragging
  const [editing, setEditing] = useState<RoadmapItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/roadmap?world=${encodeURIComponent(world)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setItems(d.items ?? []);
        setLanes(d.lanes ?? { products: [], projects: [], purchaseOrders: [], costObjects: [] });
        setEntityId(d.entity?.id ?? null); setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [world, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // ── the window ────────────────────────────────────────────────────────────
  const { start, days } = useMemo(() => {
    if (!items.length) return { start: iso(new Date()), days: 180 };
    const all = items.flatMap((i) => [i.starts_on, i.ends_on ?? i.starts_on, i.baseline_starts_on ?? i.starts_on]);
    const lo = parse(all.reduce((a, b) => (a < b ? a : b)));
    const hi = parse(all.reduce((a, b) => (a > b ? a : b)));
    const s = new Date(Date.UTC(lo.getUTCFullYear(), lo.getUTCMonth(), 1));
    const e = new Date(Date.UTC(hi.getUTCFullYear(), hi.getUTCMonth() + 2, 0));
    return { start: iso(s), days: Math.max(60, daysBetween(iso(s), iso(e))) };
  }, [items]);

  const x = useCallback((d: string) => daysBetween(start, d) * zoom, [start, zoom]);
  const width = days * zoom;

  const months = useMemo(() => {
    const out: { label: string; left: number; width: number; first: boolean }[] = [];
    const s = parse(start);
    for (let m = 0; ; m++) {
      const from = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + m, 1));
      const to = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + m + 1, 1));
      const left = daysBetween(start, iso(from)) * zoom;
      if (left >= width) break;
      out.push({ label: MONTH_LABEL(from), left, width: daysBetween(iso(from), iso(to)) * zoom, first: from.getUTCMonth() === 0 });
    }
    return out;
  }, [start, zoom, width]);

  // ── lanes, derived ────────────────────────────────────────────────────────
  const laneOf = useCallback((i: RoadmapItem) => {
    const find = (arr: Named[], id: string | null) => (id ? arr.find((a) => a.id === id) : undefined);
    const p = find(lanes.projects, i.project_id); if (p) return { key: `proj:${p.id}`, name: p.name!, group: "Projects" };
    const pr = find(lanes.products, i.product_id); if (pr) return { key: `prod:${pr.id}`, name: pr.name!, group: "Products" };
    const po = find(lanes.purchaseOrders, i.purchase_order_id); if (po) return { key: `po:${po.id}`, name: po.po_number!, group: "Orders" };
    const co = find(lanes.costObjects, i.cost_object_id); if (co) return { key: `obj:${co.id}`, name: co.name!, group: "Ranges" };
    return { key: "none", name: "Unassigned", group: "Other" };
  }, [lanes]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; group: string; items: RoadmapItem[] }>();
    for (const i of items) {
      const l = laneOf(i);
      if (!map.has(l.key)) map.set(l.key, { name: l.name, group: l.group, items: [] });
      map.get(l.key)!.items.push(i);
    }
    return [...map.entries()].sort((a, b) => a[1].group.localeCompare(b[1].group) || a[1].name.localeCompare(b[1].name));
  }, [items, laneOf]);

  // ── dragging ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setOffset(e.clientX - drag.x0);
    const up = async (e: PointerEvent) => {
      const shiftDays = Math.round((e.clientX - drag.x0) / zoom);
      setDrag(null); setOffset(0);
      if (!shiftDays) return;
      const body = drag.mode === "move"
        ? { id: drag.id, starts_on: addDays(drag.s0, shiftDays), ends_on: drag.e0 ? addDays(drag.e0, shiftDays) : undefined }
        : { id: drag.id, ends_on: addDays(drag.e0 ?? drag.s0, shiftDays) };
      // optimistic, so the bar does not snap back while the request is in flight
      setItems((prev) => prev.map((i) => i.id === drag.id
        ? { ...i, starts_on: body.starts_on ?? i.starts_on, ends_on: body.ends_on ?? i.ends_on } : i));
      const res = await fetch("/api/admin/roadmap", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setToast(data.error ?? "Could not move it."); reload(); return; }
      if (data.wroteBack) setToast(data.wroteBack);
      reload();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, zoom, reload]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading) return <p className="fin-sub py-10 text-center">Loading the roadmap…</p>;

  const today = iso(new Date());
  const todayX = x(today);

  return (
    <div className="fin viz space-y-3">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="fin-title">Roadmap</h3>
          <p className="fin-sub">
            Drag a milestone to move it. Where it was read out of a purchase order or a budget line,
            moving it updates that too.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="fin-seg">
            {([["Months", 1.6], ["Weeks", 3.4], ["Days", 8]] as const).map(([label, z]) => (
              <button key={label} data-on={zoom === z} onClick={() => setZoom(z)}>{label}</button>
            ))}
          </div>
          <button onClick={() => setEditing({
            id: "", entity_id: entityId, title: "", kind: "production", status: "planned",
            starts_on: today, ends_on: null, baseline_starts_on: null, baseline_ends_on: null,
            product_id: null, project_id: null, purchase_order_id: null, edition_id: null,
            cost_object_id: null, plan_line_id: null, source_table: null, source_field: null,
            amount_net: null, note: null, sort: 0,
          })} className="px-3.5 py-2 admin-btn-primary text-xs font-bold rounded-lg">+ Milestone</button>
        </div>
      </div>

      {toast && <div className="fin-card !py-2.5 !px-4 fin-sub">{toast}</div>}

      <div className="fin-card !p-0 overflow-hidden">
        <div className="flex">
          {/* lane names stay put while the years scroll */}
          <div className="shrink-0 border-r" style={{ width: 168, borderColor: "var(--fin-hairline)" }}>
            <div className="h-9 fin-label flex items-end px-4 pb-1.5">Lane</div>
            {grouped.map(([key, lane]) => (
              <div key={key} className="px-4 flex items-center border-t"
                   style={{ height: 44 + (lane.items.length - 1) * 0, borderColor: "var(--fin-hairline)" }}>
                <div className="min-w-0">
                  <div className="text-[12.5px] fin-num truncate" title={lane.name}>{lane.name}</div>
                  <div className="fin-sub text-[10.5px]">{lane.group}</div>
                </div>
              </div>
            ))}
          </div>

          <div ref={scroller} className="flex-1 overflow-x-auto">
            <div style={{ width, minWidth: "100%", position: "relative" }}>
              {/* month ruler */}
              <div className="h-9 relative">
                {months.map((m) => (
                  <div key={m.left} className="absolute top-0 bottom-0 border-l flex items-end pb-1.5 pl-1.5"
                       style={{ left: m.left, width: m.width, borderColor: "var(--fin-hairline)" }}>
                    <span className={`fin-label ${m.first ? "" : "opacity-70"}`}>{m.label}</span>
                  </div>
                ))}
              </div>

              {todayX >= 0 && todayX <= width && (
                <div className="absolute top-0 bottom-0 pointer-events-none z-10"
                     style={{ left: todayX, width: 1, background: "var(--viz-neg)", opacity: .5 }} />
              )}

              {grouped.map(([key, lane]) => (
                <div key={key} className="relative border-t" style={{ height: 44, borderColor: "var(--fin-hairline)" }}>
                  {months.map((m) => (
                    <div key={m.left} className="absolute top-0 bottom-0 border-l"
                         style={{ left: m.left, borderColor: "var(--fin-hairline)", opacity: .6 }} />
                  ))}
                  {lane.items.map((i) => (
                    <Bar key={i.id} item={i} x={x}
                         dragging={drag?.id === i.id ? { mode: drag.mode, offset } : null}
                         onGrab={(mode, ev) => setDrag({ id: i.id, mode, x0: ev.clientX, s0: i.starts_on, e0: i.ends_on })}
                         onOpen={() => setEditing(i)} />
                  ))}
                </div>
              ))}
              {!grouped.length && (
                <p className="fin-sub py-10 text-center">Nothing on the roadmap yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {Object.entries(KIND_VAR).filter(([k]) => items.some((i) => i.kind === k)).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[11.5px] admin-muted">
            <span className="w-2 h-2 rounded-full" style={{ background: `var(${v})` }} />{k}
          </span>
        ))}
        {items.some((i) => i.baseline_starts_on && i.baseline_starts_on !== i.starts_on) && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] admin-faint">
            <span className="w-2 h-2 rounded-full border" style={{ borderColor: "var(--admin-text-faint)" }} />
            where it was first planned
          </span>
        )}
      </div>

      {editing && (
        <MilestoneEditor item={editing} lanes={lanes} entityId={entityId}
                         onClose={() => setEditing(null)}
                         onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

/* ── one milestone ────────────────────────────────────────────────────────── */

function Bar({ item, x, dragging, onGrab, onOpen }: {
  item: RoadmapItem; x: (d: string) => number;
  dragging: { mode: "move" | "resize"; offset: number } | null;
  onGrab: (mode: "move" | "resize", e: React.PointerEvent) => void;
  onOpen: () => void;
}) {
  const span = !!item.ends_on;
  const dx = dragging?.mode === "move" ? dragging.offset : 0;
  const dw = dragging?.mode === "resize" ? dragging.offset : 0;
  const left = x(item.starts_on) + dx;
  const w = span ? Math.max(12, x(item.ends_on!) - x(item.starts_on) + dw) : 0;
  const colour = `var(${KIND_VAR[item.kind] ?? "--s-opex"})`;
  const slipped = item.baseline_starts_on && item.baseline_starts_on !== item.starts_on;
  const slipDays = slipped ? daysBetween(item.baseline_starts_on!, item.starts_on) : 0;
  const done = item.status === "done";
  const risk = item.status === "at_risk";

  return (
    <>
      {slipped && (
        <div className="absolute pointer-events-none" title={`first planned ${item.baseline_starts_on}`}
             style={{ left: x(item.baseline_starts_on!) - 4, top: 17, width: 9, height: 9, borderRadius: 9,
                      border: "1px dashed var(--admin-text-faint)", opacity: .8 }} />
      )}
      <div
        onPointerDown={(e) => { e.preventDefault(); onGrab("move", e); }}
        onDoubleClick={onOpen}
        title={`${item.title}${item.amount_net ? ` · ${eur0(Number(item.amount_net))}` : ""}` +
               `${slipped ? ` · moved ${slipDays > 0 ? "+" : ""}${slipDays} days` : ""}\nDouble-click to edit`}
        className="absolute flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none"
        style={{ left, top: 10, height: 24, zIndex: dragging ? 20 : 1 }}
      >
        {span ? (
          <div className="rounded-full flex items-center px-2 h-6"
               style={{ width: w, background: colour, opacity: done ? .5 : 1,
                        boxShadow: risk ? "0 0 0 1.5px var(--viz-neg)" : undefined }}>
            <span className="text-[11px] font-medium truncate" style={{ color: "#fff" }}>{item.title}</span>
          </div>
        ) : (
          <>
            <span className="rounded-full shrink-0" style={{ width: 10, height: 10, background: colour,
                    opacity: done ? .5 : 1, boxShadow: risk ? "0 0 0 2px var(--viz-neg)" : undefined }} />
            <span className="text-[11.5px] whitespace-nowrap fin-num"
                  style={{ opacity: done ? .55 : 1, textDecoration: item.status === "cancelled" ? "line-through" : undefined }}>
              {item.title}
              {item.amount_net ? <span className="admin-faint"> · {eur0(Number(item.amount_net))}</span> : null}
            </span>
          </>
        )}
        {span && (
          <span onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onGrab("resize", e); }}
                className="absolute right-0 top-0 h-6 cursor-ew-resize"
                style={{ width: 10 }} aria-hidden />
        )}
      </div>
    </>
  );
}

/* ── editor ───────────────────────────────────────────────────────────────── */

function MilestoneEditor({ item, lanes, entityId, onClose, onSaved }: {
  item: RoadmapItem; lanes: Lanes; entityId: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState(item);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isNew = !item.id;

  const set = (k: keyof RoadmapItem, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.title.trim()) { setErr("Give the milestone a name."); return; }
    setSaving(true);
    const res = await fetch("/api/admin/roadmap", {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, id: isNew ? undefined : f.id, entity_id: entityId }),
    });
    setSaving(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
    onSaved();
  }

  async function remove() {
    if (!confirm(`Remove "${f.title}" from the roadmap?`)) return;
    setSaving(true);
    await fetch("/api/admin/roadmap", { method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id }) });
    setSaving(false); onSaved();
  }

  const laneValue = f.project_id ? `proj:${f.project_id}` : f.product_id ? `prod:${f.product_id}`
    : f.purchase_order_id ? `po:${f.purchase_order_id}` : f.cost_object_id ? `obj:${f.cost_object_id}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 fin" onClick={onClose}>
      <div className="fin-card w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="fin-title mb-4">{isNew ? "New milestone" : "Milestone"}</h2>

        <label className="fin-label">What happens</label>
        <input value={f.title} onChange={(e) => set("title", e.target.value)} autoFocus
               className="w-full admin-input border rounded-lg px-3 py-2 text-sm mb-3 mt-1" />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="fin-label">Kind</label>
            <select value={f.kind} onChange={(e) => set("kind", e.target.value)}
                    className="w-full admin-input border rounded-lg px-3 py-2 text-sm mt-1">
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="fin-label">Status</label>
            <select value={f.status} onChange={(e) => set("status", e.target.value)}
                    className="w-full admin-input border rounded-lg px-3 py-2 text-sm mt-1">
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="fin-label">Starts</label>
            <input type="date" value={f.starts_on} onChange={(e) => set("starts_on", e.target.value)}
                   className="w-full admin-input border rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="fin-label">Ends</label>
            <input type="date" value={f.ends_on ?? ""} onChange={(e) => set("ends_on", e.target.value || null)}
                   className="w-full admin-input border rounded-lg px-3 py-2 text-sm mt-1" />
            <p className="fin-sub mt-1">Leave empty for a moment rather than a stretch.</p>
          </div>
        </div>

        <label className="fin-label">Belongs to</label>
        <select value={laneValue}
                onChange={(e) => {
                  const [k, id] = e.target.value.split(":");
                  setF((p) => ({ ...p, project_id: k === "proj" ? id : null, product_id: k === "prod" ? id : null,
                    purchase_order_id: k === "po" ? id : null, cost_object_id: k === "obj" ? id : null }));
                }}
                className="w-full admin-input border rounded-lg px-3 py-2 text-sm mb-3 mt-1">
          <option value="">Unassigned</option>
          <optgroup label="Projects">{lanes.projects.map((p) => <option key={p.id} value={`proj:${p.id}`}>{p.name}</option>)}</optgroup>
          <optgroup label="Products">{lanes.products.map((p) => <option key={p.id} value={`prod:${p.id}`}>{p.name}</option>)}</optgroup>
          <optgroup label="Orders">{lanes.purchaseOrders.map((p) => <option key={p.id} value={`po:${p.id}`}>{p.po_number}</option>)}</optgroup>
          <optgroup label="Ranges">{lanes.costObjects.map((p) => <option key={p.id} value={`obj:${p.id}`}>{p.name}</option>)}</optgroup>
        </select>

        <label className="fin-label">Amount, net</label>
        <input value={f.amount_net ?? ""} onChange={(e) => set("amount_net", e.target.value)} inputMode="decimal"
               className="w-full admin-input border rounded-lg px-3 py-2 text-sm mb-3 mt-1 tabular-nums" />

        {f.source_table && (
          <p className="fin-sub mb-3">
            Read from <span className="fin-num">{f.source_table}.{f.source_field}</span>. Moving it writes the date back there.
          </p>
        )}
        {f.baseline_starts_on && f.baseline_starts_on !== f.starts_on && (
          <p className="fin-sub mb-3">
            First planned for {f.baseline_starts_on}, now {f.starts_on}
            {" · "}{daysBetween(f.baseline_starts_on, f.starts_on) > 0 ? "+" : ""}
            {daysBetween(f.baseline_starts_on, f.starts_on)} days.
          </p>
        )}

        {err && <p className="text-xs text-red-400 mb-3">{err}</p>}
        <div className="flex justify-between gap-2">
          {!isNew ? <button onClick={remove} className="px-3 py-2 text-sm rounded-lg border admin-input">Remove</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border admin-input">Cancel</button>
            <button onClick={save} disabled={saving}
                    className="px-4 py-2 text-sm font-bold rounded-lg admin-btn-primary disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
