"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Board, BoardGroup, BoardRow, BoardCategory, BoardEntity, BoardPlan, Pnl } from "@/lib/finance/board";
import { r2 } from "@/lib/finance/board";
import { MONTHS } from "@/lib/finance/board";
import { RecordCostDialog } from "@/components/admin/record-cost-dialog";
import { useAdminEnv } from "@/app/admin/env-context";
import { CashChart, FlowChart, ObjectChart, VIZ_CSS } from "@/components/admin/finance-charts";
import { FinanceTimeline } from "@/components/admin/finance-timeline";
import { Roadmap } from "@/components/admin/roadmap";
import { AllocateDialog } from "@/components/admin/allocate-dialog";
import { CostObjectPanel } from "@/components/admin/cost-object-panel";
import type { CostObjectNode } from "@/lib/finance/objects";

/* The budget grid: rows are cost or revenue items, columns are the twelve
   months of one company's year. Planned amounts are typed straight into the
   cells; actuals appear underneath them and are never editable here, because
   they come from a recorded invoice rather than from an opinion. */

const eur = (n: number, dash = true) =>
  n === 0 && dash ? "" : n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const eurExact = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

const GRID = "minmax(240px, 260px) repeat(12, minmax(78px, 1fr)) minmax(104px, 116px)";

export default function FinancePage() {
  const env = useAdminEnv();
  const [board, setBoard] = useState<Board | null>(null);
  const [entities, setEntities] = useState<BoardEntity[]>([]);
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [plans, setPlans] = useState<BoardPlan[]>([]);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  // A pick belongs to the world it was made in. Switching worlds re-renders this
  // page in place, and an Experience company left selected in the Hardware world
  // would quietly show the wrong company's books.
  const [entityPick, setEntityPick] = useState<{ world: string; key: string } | null>(null);
  const [planPick, setPlanPick] = useState<{ world: string; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [recordFor, setRecordFor] = useState<{ row: BoardRow; month: number } | null>(null);
  const [editing, setEditing] = useState<{ rowKey: string; month: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<"grid" | "dashboard" | "timeline" | "roadmap">("dashboard");
  const [objects, setObjects] = useState<CostObjectNode[] | null>(null);
  const [allocating, setAllocating] = useState<BoardRow | null>(null);
  // Narrowing to one project, range or size. Kept per world like the other
  // picks, so a Hardware filter cannot follow you into Experience.
  const [objectPick, setObjectPick] = useState<{ world: string; id: string } | null>(null);
  const [filterObjects, setFilterObjects] = useState<{ id: string; name: string; kind: string; parent_id: string | null; sort: number }[]>([]);
  const [scope, setScope] = useState<{ id: string; name: string } | null>(null);
  const [openObject, setOpenObject] = useState<string | null>(null);
  // How overheads are shared out over the ranges. A view, never stored.
  const [driver, setDriver] = useState<"none" | "revenue" | "units" | "equal">("none");

  // These hold what the user PICKED, not what is shown. Empty means "let the
  // server choose for this world", and the choice comes back on the board, so
  // selecting never has to be echoed back into state and cannot loop.
  const entityKey = entityPick?.world === env ? entityPick.key : "";
  const planId = planPick?.world === env ? planPick.id : "";
  const objectId = objectPick?.world === env ? objectPick.id : "";
  const selectedEntity = entityKey || board?.entity?.key || "";
  const selectedPlan = planId || board?.plan?.id || "";

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ year: String(year) });
    if (entityKey) qs.set("entity", entityKey);
    if (planId) qs.set("plan", planId);
    if (env === "experience" || env === "hardware") qs.set("world", env);
    if (objectId) qs.set("object", objectId);
    fetch(`/api/admin/finance/board?${qs}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setError(data.error ?? "Could not load the budget."); setLoading(false); return; }
        setBoard(data);
        setEntities(data.entities ?? []);
        setCategories(data.categories ?? []);
        setPlans(data.plans ?? []);
        setFilterObjects(data.filterObjects ?? []);
        setScope(data.scope ?? null);
        setError(null);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setError("Could not reach the budget."); setLoading(false); } });
    fetch(`/api/admin/finance/objects?${qs}&driver=${driver}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setObjects(d.planned ?? []); })
      .catch(() => { /* the dashboard degrades to totals without it */ });
    return () => { cancelled = true; };
  }, [entityKey, year, planId, nonce, env, objectId, driver]);

  /** Re-read the board after a write. */
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  async function saveCell(row: BoardRow, month: number, raw: string) {
    const value = raw.trim() === "" ? 0 : Number(raw.replace(",", "."));
    if (Number.isNaN(value)) { setError("That is not a number."); return; }
    if (!board?.plan) return;
    setBusy(true);
    const res = await fetch("/api/admin/finance/lines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: board.plan.id, year, months: [month], amount_net: value,
        category_id: row.categoryId, label: row.label,
        edition_id: row.editionId, vendor_id: row.vendorId, confidence: row.confidence,
      }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
    setError(null);
    reload();
  }

  async function deleteRow(row: BoardRow) {
    if (!board?.plan) return;
    if (!confirm(`Remove "${row.label}" from this plan for all of ${year}?`)) return;
    setBusy(true);
    await fetch("/api/admin/finance/lines", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: board.plan.id, label: row.label, category_id: row.categoryId,
        edition_id: row.editionId, vendor_id: row.vendorId,
      }),
    });
    setBusy(false);
    reload();
  }

  async function createPlan(copyFrom?: string) {
    const entity = entities.find((e) => e.key === selectedEntity);
    if (!entity) return;
    setBusy(true);
    const res = await fetch("/api/admin/finance/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_id: entity.id, year, copy_from: copyFrom }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not create the plan."); return; }
    const plan = await res.json();
    setPlanPick({ world: env, id: plan.id });
    reload();
  }

  async function setPlanStatus(status: string) {
    if (!board?.plan) return;
    setBusy(true);
    await fetch("/api/admin/finance/plans", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: board.plan.id, status }),
    });
    setBusy(false);
    reload();
  }

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  if (loading && !board) {
    return <div className="p-6 admin-muted text-sm">Loading the budget…</div>;
  }

  const t = board?.totals;

  return (
    <div className="fin p-4 sm:p-6 space-y-5">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold admin-heading mb-0.5" style={{ letterSpacing: "-.028em" }}>Budget</h1>
          <p className="fin-sub max-w-prose">
            Plan what a company spends and earns, month by month. Real costs attach to a planned
            line and update it themselves.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAdd(true)}
            disabled={!board?.plan}
            className="px-4 py-2 admin-btn-primary text-sm font-bold rounded-lg disabled:opacity-40"
          >
            + Add row
          </button>
          <button
            onClick={() => setRecordFor({ row: null as unknown as BoardRow, month: 0 })}
            className="px-4 py-2 text-sm font-semibold rounded-lg border admin-input"
          >
            Record a cost
          </button>
        </div>
      </div>

      {/* ── Company · year · version ────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {entities.map((e) => (
            <button
              key={e.key}
              onClick={() => { setEntityPick({ world: env, key: e.key }); setPlanPick(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                selectedEntity === e.key
                  ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] border-transparent"
                  : "admin-input admin-muted"
              }`}
              title={e.note ?? undefined}
            >
              {e.name}
              {e.status === "planned" && <span className="ml-1.5 opacity-60">planned</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => { setYear(year - 1); setPlanPick(null); }} className="px-2 py-1.5 rounded-lg border admin-input text-sm">‹</button>
          <span className="px-3 py-1.5 text-sm font-bold admin-heading tabular-nums">{year}</span>
          <button onClick={() => { setYear(year + 1); setPlanPick(null); }} className="px-2 py-1.5 rounded-lg border admin-input text-sm">›</button>
        </div>

        {plans.length > 1 && (
          <select
            value={selectedPlan}
            onChange={(e) => setPlanPick({ world: env, id: e.target.value })}
            className="admin-input border rounded-lg px-2 py-1.5 text-xs"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.status}</option>
            ))}
          </select>
        )}
        {board?.plan && (
          <>
            {board.plan.status !== "active" && (
              <button onClick={() => setPlanStatus("active")} className="px-2.5 py-1.5 rounded-lg border admin-input text-xs font-semibold">
                Put in force
              </button>
            )}
            <button onClick={() => createPlan(board.plan!.id)}
                    title="Copy this plan so you can change one and compare. Not needed until you want scenarios."
                    className="px-2.5 py-1.5 rounded-lg border admin-input text-xs admin-muted">
              Fork
            </button>
          </>
        )}
      </div>

      {filterObjects.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="fin-label" htmlFor="fin-scope">Showing</label>
          <select id="fin-scope" value={objectId}
                  onChange={(e) => setObjectPick(e.target.value ? { world: env, id: e.target.value } : null)}
                  className="admin-input border rounded-lg px-2.5 py-1.5 text-xs">
            <option value="">Everything</option>
            {objectTree(filterObjects).map(({ o, depth }) => (
              <option key={o.id} value={o.id}>{"\u00a0\u00a0".repeat(depth)}{o.name}</option>
            ))}
          </select>
          {scope && (
            <span className="fin-sub">
              only what is allocated to {scope.name}. Funding belongs to no product, so the running
              line here is this project&rsquo;s own contribution from zero, not a bank balance.
            </span>
          )}
        </div>
      )}

      {board?.plan && (
        <div className="fin-seg" role="tablist" aria-label="Budget view">
          {([["dashboard", "Dashboard"], ["roadmap", "Roadmap"], ["timeline", "Timeline"], ["grid", "Grid"]] as const).map(([v, label]) => (
            <button key={v} role="tab" aria-selected={view === v} data-on={view === v}
                    onClick={() => setView(v)}>{label}</button>
          ))}
        </div>
      )}

      {/* An entity here is a BUSINESS. Until Experience has its own GmbH the
          invoices go out under the holding's name, and whoever is budgeting
          should not have to remember that. */}
      {board?.entity?.own_entity_from && board.entity.legal_name && (
        <p className="text-[11px] admin-faint">
          Legally {board.entity.legal_name} until{" "}
          {new Date(board.entity.own_entity_from).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          , when {board.entity.name} GmbH takes over.
        </p>
      )}

      {error && (
        <div className="px-3 py-2 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      {/* ── No plan yet ────────────────────────────────────────── */}
      {!board?.entity ? (
        <div className="fin-card text-center py-10">
          <p className="admin-muted text-sm">
            No company is set up for this world yet, so there is nothing to budget.
          </p>
        </div>
      ) : !board?.plan ? (
        <div className="fin-card text-center space-y-3 py-10">
          <p className="admin-muted text-sm">
            No budget for {entities.find((e) => e.key === selectedEntity)?.name ?? "this company"} in {year} yet.
          </p>
          <button onClick={() => createPlan()} disabled={busy} className="px-4 py-2 admin-btn-primary text-sm font-bold rounded-lg">
            Start the {year} budget
          </button>
        </div>
      ) : (
        <>
          <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

          {/* One line you can read without scrolling. Everything below is detail. */}
          <Overview pnl={board.pnlPlanned} scopeName={scope?.name ?? null} />

          {view === "grid" && <KeyNumbers planned={board.pnlPlanned} actual={board.pnlActual} />}

          {view === "dashboard" && (
            <div className="flex flex-col gap-4">
              <CashChart pnl={board.pnlPlanned} opening={board.openingBalance} scopeName={scope?.name ?? null} />
              <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)" }}>
                <FlowChart pnl={board.pnlPlanned} />
                <ObjectChart nodes={objects ?? []} onOpen={setOpenObject} driver={driver} onDriver={setDriver} />
              </div>
              <details className="fin-card">
                <summary className="fin-title cursor-pointer select-none">
                  The full P&amp;L
                  <span className="fin-sub font-normal"> · every line, planned against actual</span>
                </summary>
                <div className="mt-4"><KeyNumbers planned={board.pnlPlanned} actual={board.pnlActual} /></div>
              </details>
            </div>
          )}

          {view === "roadmap" && <Roadmap world={env} />}

          {view === "timeline" && (
            <FinanceTimeline board={board}
                             categoryGroup={new Map(categories.map((c) => [c.id, c.pnl_group]))} />
          )}

          {/* ── The grid ─────────────────────────────────────────── */}
          <div className={`fin-card !p-0 overflow-x-auto ${view === "grid" ? "" : "hidden"}`}>
            <div style={{ minWidth: 1180 }}>
              {/* month header */}
              <div className="grid text-[10px] uppercase tracking-wider admin-faint font-semibold border-b"
                   style={{ gridTemplateColumns: GRID, borderColor: "var(--admin-input-border)" }}>
                <div className="px-3 py-2 sticky left-0 z-10" style={{ background: "var(--admin-card-bg, inherit)" }}>Item</div>
                {MONTHS.map((m) => <div key={m} className="px-2 py-2 text-right">{m}</div>)}
                <div className="px-3 py-2 text-right">Year</div>
              </div>

              {board.revenue.length > 0 && <SectionLabel>Revenue</SectionLabel>}
              {board.revenue.map((g) => (
                <Group key={g.category?.id ?? "rev-other"} group={g}
                       editing={editing} setEditing={setEditing} draft={draft} setDraft={setDraft}
                       onSave={saveCell} onDelete={deleteRow} onRecord={(row, month) => setRecordFor({ row, month })}
                       onAllocate={setAllocating} />
              ))}

              {board.cost.length > 0 && <SectionLabel>Costs</SectionLabel>}
              {board.cost.map((g) => (
                <Group key={g.category?.id ?? "uncategorised"} group={g}
                       editing={editing} setEditing={setEditing} draft={draft} setDraft={setDraft}
                       onSave={saveCell} onDelete={deleteRow} onRecord={(row, month) => setRecordFor({ row, month })}
                       onAllocate={setAllocating} />
              ))}

              {/* gross profit, so the margin is visible without doing arithmetic */}
              {board.pnlPlanned.revenue.total !== 0 && (
                <div className="grid border-t" style={{ gridTemplateColumns: GRID, borderColor: "var(--admin-input-border)" }}>
                  <div className="px-3 py-2 text-[11px] font-bold admin-heading sticky left-0 z-10"
                       style={{ background: "var(--admin-card-bg, inherit)" }}>
                    Gross profit
                    <span className="ml-2 font-normal admin-faint">revenue less cost of goods</span>
                  </div>
                  {board.pnlPlanned.grossProfit.byMonth.map((v, i) => (
                    <div key={i} className="px-2 py-2 text-right text-[11px] tabular-nums admin-muted">{eur(v)}</div>
                  ))}
                  <div className="px-3 py-2 text-right text-[11px] tabular-nums admin-heading font-semibold">
                    {eur(board.pnlPlanned.grossProfit.total, false)}
                  </div>
                </div>
              )}

              {/* Funding, kept visually apart from trading because it is not
                  earned and never belongs in a margin. */}
              {board.pnlPlanned.financing.total !== 0 && (
                <div className="grid border-t" style={{ gridTemplateColumns: GRID, borderColor: "var(--admin-input-border)" }}>
                  <div className="px-3 py-2 text-[11px] font-bold admin-heading sticky left-0 z-10"
                       style={{ background: "var(--admin-card-bg, inherit)" }}>
                    Funding
                    <span className="ml-2 font-normal admin-faint">capital and tranches, not revenue</span>
                  </div>
                  {board.pnlPlanned.financing.byMonth.map((v, i) => (
                    <div key={i} className="px-2 py-2 text-right text-[11px] tabular-nums admin-muted">{eur(v)}</div>
                  ))}
                  <div className="px-3 py-2 text-right text-[11px] tabular-nums admin-heading font-semibold">
                    {eur(board.pnlPlanned.financing.total, false)}
                  </div>
                </div>
              )}

              {/* net */}
              <div className="grid border-t-2 font-bold" style={{ gridTemplateColumns: GRID, borderColor: "var(--admin-accent)" }}>
                <div className="px-3 py-2.5 text-xs admin-heading sticky left-0 z-10" style={{ background: "var(--admin-card-bg, inherit)" }}>
                  Net
                </div>
                {t!.netPlanned.map((v, i) => (
                  <div key={i} className="px-2 py-2.5 text-right text-[11px] tabular-nums">
                    <div className={v < 0 ? "text-red-400" : "admin-heading"}>{eur(v)}</div>
                    {t!.netActual[i] !== 0 && (
                      <div className={`text-[10px] font-medium ${t!.netActual[i] < 0 ? "text-red-400" : "text-green-400"}`}>
                        {eur(t!.netActual[i])}
                      </div>
                    )}
                  </div>
                ))}
                <div className="px-3 py-2.5 text-right text-[11px] tabular-nums">
                  <div className={t!.netPlannedTotal < 0 ? "text-red-400" : "admin-heading"}>{eur(t!.netPlannedTotal, false)}</div>
                  {t!.netActualTotal !== 0 && (
                    <div className={`text-[10px] ${t!.netActualTotal < 0 ? "text-red-400" : "text-green-400"}`}>
                      {eur(t!.netActualTotal)}
                    </div>
                  )}
                </div>
              </div>

              {/* The running position. The question everyone actually asks is
                  not whether the year adds up, it is when money is on the
                  account, and that is this row. */}
              <div className="grid border-t" style={{ gridTemplateColumns: GRID, borderColor: "var(--admin-input-border)" }}>
                <div className="px-3 py-2 text-[11px] font-bold admin-heading sticky left-0 z-10"
                     style={{ background: "var(--admin-card-bg, inherit)" }}>
                  Cash position
                  <span className="ml-2 font-normal admin-faint">
                    {board.openingBalance !== 0 ? `opening ${eur(board.openingBalance, false)}` : "closing balance each month"}
                  </span>
                </div>
                {board.pnlPlanned.accumulated.map((v, i) => (
                  <div key={i} className={`px-2 py-2 text-right text-[11px] tabular-nums font-medium ${v < 0 ? "text-red-400" : "admin-muted"}`}>
                    {eur(v)}
                  </div>
                ))}
                <div className={`px-3 py-2 text-right text-[11px] tabular-nums font-semibold ${board.pnlPlanned.lowestPoint < 0 ? "text-red-400" : "admin-heading"}`}
                     title="Lowest point across the year, which is the funding the plan needs">
                  low {eur(board.pnlPlanned.lowestPoint, false)}
                </div>
              </div>
            </div>
          </div>

          {view === "grid" && (
            <p className="text-[11px] admin-faint">
              Grey is planned, colour is what actually happened. Click any cell to change the plan, or a
              row&rsquo;s name to say what it was for. Amounts are net, because the VAT comes back.
            </p>
          )}

          {/* ── Costs with nowhere to go ─────────────────────────── */}
          {view !== "timeline" && view !== "roadmap" && board.unallocated.length > 0 && (
            <div className="fin-card space-y-2">
              <h2 className="text-sm font-bold admin-heading">
                Recorded but not attached
                <span className="ml-2 text-xs font-normal admin-muted">
                  {board.unallocated.length} cost{board.unallocated.length === 1 ? "" : "s"} nothing in the plan accounts for
                </span>
              </h2>
              <div className="divide-y" style={{ borderColor: "var(--admin-input-border)" }}>
                {board.unallocated.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 py-2 text-xs">
                    <span className="admin-faint tabular-nums w-20 shrink-0">{a.incurred_on}</span>
                    <span className="admin-heading flex-1 truncate">{a.description}</span>
                    {a.vendorName && <span className="admin-faint truncate hidden sm:block">{a.vendorName}</span>}
                    <span className="admin-muted tabular-nums">{catById.get(a.categoryId ?? "")?.name ?? "no category"}</span>
                    <span className="font-semibold admin-heading tabular-nums w-24 text-right">{eurExact(a.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showAdd && board?.plan && (
        <AddRowDialog
          categories={categories}
          year={year}
          planId={board.plan.id}
          onClose={() => setShowAdd(false)}
          onDone={() => { setShowAdd(false); reload(); }}
        />
      )}

      {openObject && (
        <CostObjectPanel
          id={openObject} year={year}
          onClose={() => setOpenObject(null)}
          onOpenObject={(id) => setOpenObject(id)}
          onFilter={(id) => setObjectPick({ world: env, id })}
        />
      )}

      {allocating && board?.plan && (
        <AllocateDialog
          row={{ plan_id: board.plan.id, category_id: allocating.categoryId, label: allocating.label,
                 edition_id: allocating.editionId, vendor_id: allocating.vendorId }}
          onClose={() => setAllocating(null)}
          onSaved={() => { setAllocating(null); reload(); }}
        />
      )}

      {recordFor && board && (
        <RecordCostDialog
          categories={categories}
          entityId={board.entity?.id ?? null}
          year={year}
          planLine={
            recordFor.row
              ? { lineId: recordFor.row.cells[recordFor.month - 1]?.lineId ?? null, label: recordFor.row.label, month: recordFor.month }
              : null
          }
          defaultCategoryId={recordFor.row?.categoryId ?? null}
          onClose={() => setRecordFor(null)}
          onDone={() => { setRecordFor(null); reload(); }}
        />
      )}
    </div>
  );
}

/**
 * The whole year in one line.
 *
 * The page had no top: it opened on a tall chart and you had to scroll to learn
 * anything. This is the summary, and it is deliberately small, because the
 * things worth knowing at a glance are few.
 */
function Overview({ pnl, scopeName }: { pnl: Pnl; scopeName: string | null }) {
  const cells: { label: string; value: string; tone?: "good" | "bad"; hint?: string }[] = [
    { label: "Revenue", value: eur(pnl.revenue.total, false) },
    { label: "Costs", value: eur(r2(pnl.totalCosts.total + pnl.inventory.total), false),
      hint: "including stock bought, which is money out but not yet a cost" },
    { label: "Result", value: eur(pnl.result.total, false), tone: pnl.result.total >= 0 ? "good" : "bad" },
    ...(pnl.financing.total ? [{ label: "Funding", value: eur(pnl.financing.total, false) }] : []),
    { label: "Low point", value: eur(pnl.lowestPoint, false), tone: pnl.lowestPoint < 0 ? "bad" : "good",
      hint: "the deepest the balance goes, which is what needs funding" },
    { label: "Year end", value: eur(pnl.accumulated[11] ?? 0, false),
      tone: (pnl.accumulated[11] ?? 0) >= 0 ? "good" : "bad" },
    ...(pnl.grossMarginPct != null ? [{ label: "Gross margin", value: `${pnl.grossMarginPct}%` }] : []),
  ];
  return (
    <div className="fin-card !py-3.5">
      {scopeName && <div className="fin-label mb-2">{scopeName} only</div>}
      <div className="grid gap-x-6 gap-y-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(8.5rem, 1fr))` }}>
        {cells.map((c) => (
          <div key={c.label} title={c.hint}>
            <div className="fin-label">{c.label}</div>
            <div className={`text-[19px] font-semibold tabular-nums mt-0.5 ${
              c.tone === "bad" ? "text-red-400" : "fin-num"}`} style={{ letterSpacing: "-.02em" }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Parents before children, so the picker reads as the hierarchy it is. */
function objectTree(objects: { id: string; name: string; kind: string; parent_id: string | null; sort: number }[]) {
  const byParent = new Map<string | null, typeof objects>();
  for (const o of [...objects].sort((a, b) => a.sort - b.sort)) {
    if (!byParent.has(o.parent_id)) byParent.set(o.parent_id, []);
    byParent.get(o.parent_id)!.push(o);
  }
  const out: { o: (typeof objects)[number]; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const o of byParent.get(parent) ?? []) { out.push({ o, depth }); walk(o.id, depth + 1); }
  };
  walk(null, 0);
  return out;
}

/* ── pieces ────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold admin-faint border-b"
         style={{ borderColor: "var(--admin-input-border)" }}>
      {children}
    </div>
  );
}

/**
 * The same lines the business plan reports, in the same order, so a budget and
 * the plan can be read against each other without translating. Gross profit is
 * the one that says whether the products work; the running low point is the one
 * that says how much money the year needs.
 */
function KeyNumbers({ planned, actual }: { planned: Pnl; actual: Pnl }) {
  const rows: { label: string; p: number; a: number; hint?: string; strong?: boolean; good: "up" | "down" }[] = [
    { label: "Revenue", p: planned.revenue.total, a: actual.revenue.total, good: "up" },
    { label: "Cost of goods", p: planned.cogs.total, a: actual.cogs.total, good: "down", hint: "what a sold unit or a delivered trip directly costs" },
    { label: "Gross profit", p: planned.grossProfit.total, a: actual.grossProfit.total, good: "up", strong: true },
    { label: "Stock bought", p: planned.inventory.total, a: actual.inventory.total, good: "down", hint: "out of the bank, not a cost until it sells" },
    { label: "Operating costs", p: planned.opex.total, a: actual.opex.total, good: "down" },
    { label: "Development", p: planned.development.total, a: actual.development.total, good: "down" },
    { label: "Result before tax", p: planned.result.total, a: actual.result.total, good: "up", strong: true },
    { label: "Funding", p: planned.financing.total, a: actual.financing.total, good: "up", hint: "share capital and investor tranches, not earned" },
  ];

  return (
    <div className="fin-card">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="fin-label">Cash movement</div>
          <div className={`fin-hero ${planned.cashMovement.total < 0 ? "text-red-400" : ""}`}>
            {eurExact(planned.cashMovement.total)}
          </div>
          <div className="fin-sub mt-0.5">result plus funding, which is what the bank sees</div>
        </div>
        <div className="flex gap-8">
          <Stat label="Gross margin"
                value={planned.grossMarginPct == null ? "—" : `${planned.grossMarginPct}%`}
                hint={planned.marginMeaningful ? undefined
                  : "Withheld: this plan buys stock faster than it records cost of sale, so any margin off it is an artefact."} />
          <Stat label="Lowest position" value={eurExact(planned.lowestPoint)} warn={planned.lowestPoint < 0}
                hint="the deepest the cash balance goes, which is what the year needs funding for" />
        </div>
      </div>

      <div className="mt-5 fin-rule">
        <div className="grid px-1 pt-2.5 pb-1 fin-label"
             style={{ gridTemplateColumns: "1fr 8.5rem 8.5rem 6.5rem" }}>
          <span>Line</span><span className="text-right">Planned</span>
          <span className="text-right">Actual</span><span className="text-right">Difference</span>
        </div>
        {rows.map((r) => {
          const diff = r.a - r.p;
          const helpful = r.good === "up" ? diff >= 0 : diff <= 0;
          return (
            <div key={r.label} className="fin-row grid px-1 py-[7px] items-baseline rounded-lg"
                 style={{ gridTemplateColumns: "1fr 8.5rem 8.5rem 6.5rem" }}>
              <span className={`text-[13px] ${r.strong ? "fin-num font-semibold" : "admin-muted"}`}
                    style={{ letterSpacing: "-.01em" }}>
                {r.label}
                {r.hint && <span className="ml-2 text-[11px] admin-faint hidden lg:inline">{r.hint}</span>}
              </span>
              <span className={`text-right text-[13px] tabular-nums ${r.strong ? "font-semibold" : ""} ${r.p < 0 ? "text-red-400" : "fin-num"}`}>
                {eurExact(r.p)}
              </span>
              <span className={`text-right text-[13px] tabular-nums ${r.a === 0 ? "admin-faint" : r.a < 0 ? "text-red-400" : "fin-num"}`}>
                {r.a === 0 ? "not yet" : eurExact(r.a)}
              </span>
              <span className={`text-right text-[12px] tabular-nums ${r.a === 0 ? "admin-faint" : helpful ? "text-green-400" : "text-amber-400"}`}>
                {r.a === 0 ? "" : `${diff >= 0 ? "+" : ""}${eur(diff, false)}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, warn, hint }: { label: string; value: string; warn?: boolean; hint?: string }) {
  return (
    <div title={hint}>
      <div className="fin-label">{label}</div>
      <div className={`text-[19px] font-semibold tabular-nums mt-0.5 ${warn ? "text-red-400" : "fin-num"}`}
           style={{ letterSpacing: "-.02em" }}>{value}</div>
      {hint && value === "—" && <div className="fin-sub mt-0.5 max-w-[15rem]">not meaningful here</div>}
    </div>
  );
}

function Group({ group, editing, setEditing, draft, setDraft, onSave, onDelete, onRecord, onAllocate }: {
  group: BoardGroup;
  editing: { rowKey: string; month: number } | null;
  setEditing: (v: { rowKey: string; month: number } | null) => void;
  draft: string; setDraft: (v: string) => void;
  onSave: (row: BoardRow, month: number, raw: string) => void;
  onDelete: (row: BoardRow) => void;
  onRecord: (row: BoardRow, month: number) => void;
  onAllocate: (row: BoardRow) => void;
}) {
  return (
    <div>
      <div className="grid border-b" style={{ gridTemplateColumns: GRID, borderColor: "var(--admin-input-border)" }}>
        <div className="px-3 py-1.5 text-[11px] font-bold admin-heading sticky left-0 z-10 truncate"
             style={{ background: "var(--admin-card-bg, inherit)" }}>
          {group.category?.name ?? "Uncategorised"}
        </div>
        {group.plannedByMonth.map((v, i) => (
          <div key={i} className="px-2 py-1.5 text-right text-[10px] tabular-nums admin-muted font-semibold">{eur(v)}</div>
        ))}
        <div className="px-3 py-1.5 text-right text-[10px] tabular-nums admin-heading font-bold">{eur(group.plannedTotal, false)}</div>
      </div>

      {group.rows.map((row) => (
        <div key={row.key} className="grid border-b group hover:bg-[var(--admin-accent-weak)]/30"
             style={{ gridTemplateColumns: GRID, borderColor: "var(--admin-input-border)" }}>
          <div className="px-3 py-1.5 sticky left-0 z-10 flex items-center gap-2 min-w-0"
               style={{ background: "var(--admin-card-bg, inherit)" }}>
            <button onClick={() => onAllocate(row)}
                    className="text-xs admin-heading truncate text-left hover:underline decoration-dotted underline-offset-2"
                    title={`${row.label}\nClick to say what this was for`}>
              {row.label}
            </button>
            {row.editionLabel && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--admin-accent-weak)] admin-muted shrink-0 truncate max-w-[90px]"
                    title={row.editionLabel}>
                {row.editionLabel}
              </span>
            )}
            <button
              onClick={() => onDelete(row)}
              className="ml-auto opacity-0 group-hover:opacity-100 text-[10px] admin-faint hover:text-red-400 shrink-0"
              title="Remove this row from the plan"
            >
              ✕
            </button>
          </div>

          {row.cells.map((cell) => {
            const isEditing = editing?.rowKey === row.key && editing.month === cell.month;
            const over = cell.actual > cell.planned && cell.planned > 0;
            return (
              <div key={cell.month} className="px-1 py-1 text-right">
                {isEditing ? (
                  <input
                    autoFocus
                    defaultValue={cell.planned || ""}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => { onSave(row, cell.month, draft); setEditing(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { onSave(row, cell.month, draft); setEditing(null); }
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="w-full admin-input border rounded px-1 py-0.5 text-[11px] text-right tabular-nums"
                  />
                ) : (
                  <button
                    onClick={() => { setDraft(String(cell.planned || "")); setEditing({ rowKey: row.key, month: cell.month }); }}
                    onDoubleClick={() => onRecord(row, cell.month)}
                    className="w-full px-1 py-0.5 rounded hover:bg-[var(--admin-accent-weak)] text-[11px] tabular-nums block text-right"
                    title="Click to plan · double-click to record a real cost here"
                  >
                    <span className="admin-heading block">{eur(cell.planned)}</span>
                    {cell.actual !== 0 && (
                      <span className={`block text-[10px] font-medium ${over ? "text-amber-400" : "text-green-400"}`}>
                        {eur(cell.actual)}
                      </span>
                    )}
                  </button>
                )}
              </div>
            );
          })}

          <div className="px-3 py-1.5 text-right text-[11px] tabular-nums">
            <span className="admin-heading font-semibold block">{eur(row.plannedTotal, false)}</span>
            {row.actualTotal !== 0 && (
              <span className={`block text-[10px] ${row.actualTotal > row.plannedTotal ? "text-amber-400" : "text-green-400"}`}>
                {eur(row.actualTotal)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddRowDialog({ categories, year, planId, onClose, onDone }: {
  categories: BoardCategory[]; year: number; planId: string;
  onClose: () => void; onDone: () => void;
}) {
  const [label, setLabel] = useState("");
  const [categoryId, setCategoryId] = useState(categories.find((c) => c.kind === "cost")?.id ?? "");
  const [amount, setAmount] = useState("");
  // Three ways a number arrives: it happens once, it repeats, or it is a
  // year's budget that still has to land somewhere. The business plan spreads
  // annual figures with weight profiles; even twelfths is the honest default
  // until someone sets a real seasonality.
  const [spread, setSpread] = useState<"once" | "each" | "year">("once");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const amountNum = Number(amount.replace(",", ".")) || 0;

  async function submit() {
    if (!label.trim()) { setErr("Give the row a name."); return; }
    const entered = Number(amount.replace(",", ".")) || 0;
    const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);
    setSaving(true);
    const res = await fetch("/api/admin/finance/lines", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId, year, label: label.trim(), category_id: categoryId || null,
        months: spread === "once" ? [month] : allMonths,
        amount_net: spread === "year" ? Math.round((entered / 12) * 100) / 100 : entered,
      }),
    });
    setSaving(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Could not add the row."); return; }
    onDone();
  }

  return (
    <Modal title="Add a row" onClose={onClose}>
      <label className="block text-xs font-semibold admin-muted mb-1">What is it</label>
      <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
             placeholder="Hotel Sorobon, Bonaire Week I"
             className="w-full admin-input border rounded-lg px-3 py-2 text-sm mb-3" />

      <label className="block text-xs font-semibold admin-muted mb-1">Category</label>
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="w-full admin-input border rounded-lg px-3 py-2 text-sm mb-3">
        <optgroup label="Cost">
          {categories.filter((c) => c.kind === "cost").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
        <optgroup label="Revenue">
          {categories.filter((c) => c.kind === "revenue").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      </select>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-semibold admin-muted mb-1">Amount, net</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="8000"
                 className="w-full admin-input border rounded-lg px-3 py-2 text-sm tabular-nums" />
        </div>
        <div>
          <label className="block text-xs font-semibold admin-muted mb-1">Month</label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} disabled={spread !== "once"}
                  className="w-full admin-input border rounded-lg px-3 py-2 text-sm disabled:opacity-40">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m} {year}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-4 space-y-1.5">
        {([
          ["once", `Once, in the month above`],
          ["each", `That amount every month of ${year}, for rent and salaries`],
          ["year", `That is the whole year's budget, spread evenly`],
        ] as const).map(([value, text]) => (
          <label key={value} className="flex items-center gap-2 text-xs admin-muted cursor-pointer">
            <input type="radio" name="spread" checked={spread === value} onChange={() => setSpread(value)} />
            {text}
          </label>
        ))}
        {spread === "year" && amountNum > 0 && (
          <p className="text-[11px] admin-faint pl-5">
            {eurExact(amountNum)} over twelve months is {eurExact(Math.round((amountNum / 12) * 100) / 100)} a month.
          </p>
        )}
      </div>

      {err && <p className="text-xs text-red-400 mb-3">{err}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border admin-input">Cancel</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-bold rounded-lg admin-btn-primary disabled:opacity-50">
          {saving ? "Adding…" : "Add row"}
        </button>
      </div>
    </Modal>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="admin-card border rounded-xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold admin-heading mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}
