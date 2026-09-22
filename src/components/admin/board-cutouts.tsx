"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import { CUTOUT_KINDS, CUTOUT_BY_KIND, type CutoutKind, type PdBoard, type PdBoardCutout } from "@/lib/board-measurements";
import {
  Chip, Empty, Icon, InfoTip, SaveNote, btnPrimary, btnPrimaryStyle, btnSecondary, btnSecondaryStyle,
} from "@/components/admin/pd-ui";

/**
 * Cut-outs and fittings — where along the board, how far off the centreline.
 *
 * One table for the hull cut-outs (the recessed tail areas that cut wetted
 * surface) and the fittings (fin box, mast track, strap inserts), because the
 * plan draws both on the same outline and they answer the same two questions.
 * `mirrored` is the reason the table stays short: a slalom board's tail
 * cut-outs are a matched pair, and one row at +offset with the flag on is that
 * pair — no second row to keep in sync.
 */

const inputClass = "w-full px-2 py-1.5 admin-input border rounded text-sm focus:outline-none focus:border-[var(--admin-accent)] transition-colors";
const GRID = "130px 1fr 78px 78px 78px 60px 78px 78px 1fr 30px";

type Draft = Omit<PdBoardCutout, "id" | "board_id"> & { id?: string };

const EMPTY = (kind: CutoutKind = "tail_cutout"): Draft => ({
  kind, label: null, station_from: null, station_to: null, offset_cm: null,
  mirrored: CUTOUT_BY_KIND[kind]?.hull ?? false, width_cm: null, depth_mm: null,
  angle_deg: null, spec: null, notes: null, sort_order: 0,
});

export function BoardCutouts({ board, cutouts, onSaved, dirtyRef }: {
  board: PdBoard; cutouts: PdBoardCutout[]; onSaved: () => void;
  dirtyRef: MutableRefObject<boolean>;
}) {
  const [rows, setRows] = useState<Draft[]>(() => cutouts.map((c) => ({ ...c })));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { dirtyRef.current = dirty; return () => { dirtyRef.current = false; }; }, [dirty, dirtyRef]);

  function patch(i: number, p: Partial<Draft>) {
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
    setDirty(true);
  }
  const numOrNull = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));

  async function save() {
    setSaving(true); setMsg("");
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/cutouts`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cutouts: rows }),
    });
    setSaving(false);
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).error ?? "Save failed. Your changes are NOT stored."); return; }
    setDirty(false); setMsg("Saved."); onSaved();
    setTimeout(() => setMsg(""), 2000);
  }

  const hull = rows.filter((r) => CUTOUT_BY_KIND[r.kind]?.hull);
  const fittings = rows.filter((r) => !CUTOUT_BY_KIND[r.kind]?.hull);

  const help = (
    <InfoTip align="right">
      Stations are cm from the {board.station_origin}, the same as every reading. Offset is from the centreline,
      positive to the right looking down at the deck; tick &ldquo;both sides&rdquo; for a mirrored pair instead of adding a second row.
    </InfoTip>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => { setRows([...rows, EMPTY("tail_cutout")]); setDirty(true); }} className={btnSecondary} style={btnSecondaryStyle}>
          <Icon name="plus" className="w-4 h-4" strokeWidth={2.2} />Cut-out
        </button>
        <button onClick={() => { setRows([...rows, EMPTY("fin_box")]); setDirty(true); }} className={btnSecondary} style={btnSecondaryStyle}>
          <Icon name="plus" className="w-4 h-4" strokeWidth={2.2} />Fitting
        </button>
        {help}
        <div className="ml-auto flex items-center gap-3">
          <SaveNote msg={msg} />
          {(dirty || saving) && (
            <button onClick={save} disabled={saving} className={btnPrimary} style={btnPrimaryStyle}>
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      {!rows.length ? (
        <Empty icon="cut" tone="orange" title="No cut-outs or fittings yet">
          A cut-out is a recessed area in the hull: where it starts and ends along the board, how far off the centreline,
          how wide and how deep. Fittings (fin box, mast track, straps) go in the same table and show on the plan.
        </Empty>
      ) : (
        <>
          {hull.length > 0 && <Section title="Hull cut-outs" tone="orange" rows={rows} filter={(r) => Boolean(CUTOUT_BY_KIND[r.kind]?.hull)} patch={patch} setRows={(r) => { setRows(r); setDirty(true); }} numOrNull={numOrNull} origin={board.station_origin} />}
          {fittings.length > 0 && <Section title="Fittings" tone="sky" rows={rows} filter={(r) => !CUTOUT_BY_KIND[r.kind]?.hull} patch={patch} setRows={(r) => { setRows(r); setDirty(true); }} numOrNull={numOrNull} origin={board.station_origin} />}
        </>
      )}
    </div>
  );
}

function Section({ title, tone, rows, filter, patch, setRows, numOrNull, origin }: {
  title: string; tone: "orange" | "sky"; rows: Draft[]; filter: (r: Draft) => boolean;
  patch: (i: number, p: Partial<Draft>) => void; setRows: (r: Draft[]) => void;
  numOrNull: (v: string) => number | null; origin: "tail" | "nose";
}) {
  const N = (v: number | null) => (v == null ? "" : String(v));
  return (
    <div className="mb-6">
      <div className="mb-2"><Chip tone={tone} icon="cut">{title}</Chip></div>
      <div className="rounded-2xl admin-tablecard" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <div className="gap-2 px-3 py-2" style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)" }}>
          {["Kind", "Label", `From (${origin})`, "To", "Offset cm", "Both", "Width cm", "Depth mm", "Spec / notes", ""].map((h, i) => (
            <span key={i} className="text-[11px] font-semibold admin-faint truncate">{h}</span>
          ))}
        </div>
        {rows.map((r, i) => {
          if (!filter(r)) return null;
          return (
            <div key={i} className="gap-2 px-3 py-1.5 group" style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--admin-border)" }}>
              <select className={inputClass} value={r.kind} onChange={(e) => patch(i, { kind: e.target.value as CutoutKind })}>
                {CUTOUT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
              <input className={inputClass} value={r.label ?? ""} placeholder="front strap, inboard" onChange={(e) => patch(i, { label: e.target.value || null })} />
              <input className={`${inputClass} tabular-nums`} inputMode="decimal" value={N(r.station_from)} onChange={(e) => patch(i, { station_from: numOrNull(e.target.value) })} />
              <input className={`${inputClass} tabular-nums`} inputMode="decimal" value={N(r.station_to)} onChange={(e) => patch(i, { station_to: numOrNull(e.target.value) })} />
              <input className={`${inputClass} tabular-nums`} inputMode="decimal" value={N(r.offset_cm)} onChange={(e) => patch(i, { offset_cm: numOrNull(e.target.value) })} />
              <label className="flex items-center justify-center">
                <input type="checkbox" checked={r.mirrored} onChange={(e) => patch(i, { mirrored: e.target.checked })} />
              </label>
              <input className={`${inputClass} tabular-nums`} inputMode="decimal" value={N(r.width_cm)} onChange={(e) => patch(i, { width_cm: numOrNull(e.target.value) })} />
              <input className={`${inputClass} tabular-nums`} inputMode="decimal" value={N(r.depth_mm)} onChange={(e) => patch(i, { depth_mm: numOrNull(e.target.value) })} />
              <input className={inputClass} value={r.spec ?? r.notes ?? ""} placeholder="Deep Tuttle · M8" onChange={(e) => patch(i, { spec: e.target.value || null })} />
              <button onClick={() => setRows(rows.filter((_, j) => j !== i))} title="Remove"
                className="admin-faint hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity self-center"><Icon name="x" className="w-3.5 h-3.5" /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
