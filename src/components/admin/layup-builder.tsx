"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { finSilhouettePath } from "@/components/admin/ply-diagram";
import { shortMaterialName, type PdMaterial } from "@/lib/product-dev";
import {
  clampLength, duplicatePly, insertPly, movePly, reorderTarget, slotFromX,
  stackBoundaries, withBoundaryToggled, type BuilderPlyBase,
} from "@/lib/layup-ops";

/**
 * The layup Baukasten — the sheet as a construction kit.
 *
 * The table edits numbers; this edits the THING. Materials are bricks in a
 * palette: drag one into the stack (or click to append) and a ply appears.
 * Drag a ply sideways to reorder it, drag its tip to change its length, click
 * it to get the precise fields. Everything resolves through the pure ops in
 * src/lib/layup-ops.ts, which is where the semantics live and are tested.
 *
 * Undo is load-bearing, not a nicety: direct manipulation without ⌘Z teaches
 * people not to touch anything.
 *
 * Keyboard, once a ply is selected: ←/→ select · ↑/↓ length ±0.5 (⇧ ±0.1) ·
 * ⌘D duplicate · Delete remove · ⌘Z / ⇧⌘Z undo / redo.
 */

// Geometry. Wider pitch than the read-only diagram — these are touch targets.
const PAD = 10;
const COL = 56;
const W = 38;
const TOP = 30;
const H = 320;
const BOTTOM = 26;
const DRAG_THRESHOLD = 6;

type Gesture =
  | { kind: "ply"; id: string; from: number; startX: number; startY: number; moved: boolean; target: number }
  | { kind: "resize"; id: string; index: number; pxPerCm: number; liveLen: number }
  | { kind: "palette"; materialId: string; startX: number; startY: number; moved: boolean; slot: number | null };

export function LayupBuilder<T extends BuilderPlyBase>({
  plies, materials, maxLengthCm, onChange,
}: {
  plies: T[];
  materials: PdMaterial[];
  /** Shared scale so switching sheets doesn't rescale the world. */
  maxLengthCm: number;
  onChange: (next: T[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const undoRef = useRef<T[][]>([]);
  const redoRef = useRef<T[][]>([]);
  // Mirror of `plies` for the window-level keyboard handler, which outlives any
  // single render. Written in an effect, not during render — the lint rule is
  // right that render-time ref writes misbehave under concurrent rendering.
  const pliesRef = useRef(plies);
  useEffect(() => { pliesRef.current = plies; }, [plies]);

  const matById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const active = useMemo(() => materials.filter((m) => m.active !== false), [materials]);

  /** Every mutation goes through here so ⌘Z always has somewhere to go back to. */
  function commit(next: T[]) {
    undoRef.current.push(pliesRef.current);
    if (undoRef.current.length > 60) undoRef.current.shift();
    redoRef.current = [];
    onChange(next);
  }
  function undo() {
    const prev = undoRef.current.pop();
    if (prev) { redoRef.current.push(pliesRef.current); onChange(prev); }
  }
  function redo() {
    const next = redoRef.current.pop();
    if (next) { undoRef.current.push(pliesRef.current); onChange(next); }
  }

  const newId = () => `new-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  function freshPly(materialId: string, neighbour?: T): T {
    return {
      id: newId(), material_id: materialId, orientation: null, template_ref: null,
      length_cm: neighbour?.length_cm ?? 30, width_mm: null, stack: neighbour?.stack ?? null, note: null,
    } as unknown as T;
  }

  // ── Scale ──────────────────────────────────────────────────────────────────
  // Frozen per render set, and resize gestures freeze it again at gesture
  // start: rescaling the ruler mid-drag makes the ply chase the pointer.
  const longest = Math.max(maxLengthCm, 1, ...plies.map((p) => Number(p.length_cm) || 0));
  const pxPerCm = H / longest;

  // ── Display order: during a reorder drag, preview the array with the dragged
  // ply moved to its target slot; everyone else animates into place.
  const display = useMemo(() => {
    if (gesture?.kind !== "ply" || !gesture.moved) return plies;
    const arr = [...plies];
    const [moved] = arr.splice(gesture.from, 1);
    arr.splice(gesture.target, 0, moved);
    return arr;
  }, [plies, gesture]);

  const boundaries = stackBoundaries(display);
  const width = Math.max(display.length, 1) * COL + PAD * 2;
  const height = TOP + H + BOTTOM;

  const selectedIndex = plies.findIndex((p) => p.id === selectedId);
  const selected = selectedIndex >= 0 ? plies[selectedIndex] : null;

  // ── Pointer plumbing ───────────────────────────────────────────────────────

  function svgX(e: { clientX: number }): number {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect ? e.clientX - rect.left : 0;
  }
  function svgY(e: { clientY: number }): number {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect ? e.clientY - rect.top : 0;
  }

  function onPlyDown(e: React.PointerEvent, id: string, index: number) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setGesture({ kind: "ply", id, from: index, startX: e.clientX, startY: e.clientY, moved: false, target: index });
  }

  function onTipDown(e: React.PointerEvent, id: string, index: number) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setGesture({ kind: "resize", id, index, pxPerCm, liveLen: Number(plies[index]?.length_cm) || 1 });
  }

  function onPaletteDown(e: React.PointerEvent, materialId: string) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setGesture({ kind: "palette", materialId, startX: e.clientX, startY: e.clientY, moved: false, slot: null });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!gesture) return;
    if (gesture.kind === "ply") {
      const moved = gesture.moved || Math.abs(e.clientX - gesture.startX) > DRAG_THRESHOLD || Math.abs(e.clientY - gesture.startY) > DRAG_THRESHOLD;
      const target = reorderTarget(svgX(e), PAD, COL, plies.length);
      if (moved !== gesture.moved || target !== gesture.target) setGesture({ ...gesture, moved, target });
    } else if (gesture.kind === "resize") {
      const liveLen = clampLength((svgY(e) - TOP) / gesture.pxPerCm);
      if (liveLen !== gesture.liveLen) setGesture({ ...gesture, liveLen });
    } else if (gesture.kind === "palette") {
      const moved = gesture.moved || Math.abs(e.clientX - gesture.startX) > DRAG_THRESHOLD || Math.abs(e.clientY - gesture.startY) > DRAG_THRESHOLD;
      const rect = svgRef.current?.getBoundingClientRect();
      const over = rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top - 40 && e.clientY <= rect.bottom + 40;
      const slot = over ? slotFromX(svgX(e), PAD, COL, plies.length) : null;
      if (moved !== gesture.moved || slot !== gesture.slot) setGesture({ ...gesture, moved, slot });
    }
  }

  function onPointerUp() {
    if (!gesture) return;
    if (gesture.kind === "ply") {
      if (!gesture.moved) setSelectedId(gesture.id);
      else if (gesture.target !== gesture.from) commit(movePly(plies, gesture.from, gesture.target));
    } else if (gesture.kind === "resize") {
      const p = plies[gesture.index];
      if (p && Number(p.length_cm) !== gesture.liveLen) {
        commit(plies.map((r, i) => (i === gesture.index ? { ...r, length_cm: gesture.liveLen } : r)));
      }
    } else if (gesture.kind === "palette") {
      if (gesture.moved && gesture.slot != null) {
        const neighbour = plies[Math.max(0, gesture.slot - 1)] ?? plies[0];
        const ply = freshPly(gesture.materialId, neighbour);
        commit(insertPly(plies, ply, gesture.slot));
        setSelectedId(ply.id);
      } else if (!gesture.moved) {
        // A plain click appends after the selection (or at the end).
        const at = selectedIndex >= 0 ? selectedIndex + 1 : plies.length;
        const ply = freshPly(gesture.materialId, plies[at - 1] ?? plies[0]);
        commit(insertPly(plies, ply, at));
        setSelectedId(ply.id);
      }
    }
    setGesture(null);
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.closest("input, select, textarea, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      const idx = pliesRef.current.findIndex((p) => p.id === selectedId);
      if (idx < 0) return;
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const id = newId();
        commit(duplicatePly(pliesRef.current, idx, id)); setSelectedId(id); return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        commit(pliesRef.current.filter((_, i) => i !== idx)); setSelectedId(null); return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const next = pliesRef.current[idx + (e.key === "ArrowRight" ? 1 : -1)];
        if (next) setSelectedId(next.id); return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const step = (e.shiftKey ? 0.1 : 0.5) * (e.key === "ArrowDown" ? 1 : -1); // down = longer, like dragging the tip
        commit(pliesRef.current.map((p, i) => (i === idx ? { ...p, length_cm: clampLength((Number(p.length_cm) || 0) + step) } : p)));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── Inspector field commits ────────────────────────────────────────────────
  function patchSelected(patch: Partial<BuilderPlyBase>) {
    if (selectedIndex < 0) return;
    commit(plies.map((p, i) => (i === selectedIndex ? { ...p, ...patch } : p)));
  }

  const dragging = gesture?.kind === "ply" && gesture.moved;
  const inserting = gesture?.kind === "palette" && gesture.moved && gesture.slot != null;

  return (
    <div className="select-none">
      {/* The kit: material bricks. Click appends, drag places. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mr-1">Materials</span>
        {active.map((m) => (
          <button key={m.id}
            onPointerDown={(e) => onPaletteDown(e, m.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            title={`${m.name} — click to add, drag into the stack to place`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs admin-muted hover:admin-heading transition-colors cursor-grab active:cursor-grabbing"
            style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)", touchAction: "none" }}>
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: m.diagram_color || "var(--admin-border-strong)" }} />
            {shortMaterialName(m)}
          </button>
        ))}
      </div>

      {/* The stack. */}
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        {plies.length === 0 && (
          <p className="text-xs admin-faint text-center pt-10 -mb-6">Drag a material in — the first ply starts the stack.</p>
        )}
        <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
          style={{ touchAction: "none", display: "block" }}
          onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setGesture(null)}>
          <line x1={4} y1={TOP} x2={width - 4} y2={TOP} stroke="var(--admin-border-strong)" strokeWidth="1" />
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={4} y1={TOP + H * f} x2={width - 4} y2={TOP + H * f} stroke="var(--admin-border)" strokeWidth="0.5" />
          ))}

          {display.map((p, i) => {
            const isDragged = gesture?.kind === "ply" && gesture.moved && p.id === gesture.id;
            const isSelected = p.id === selectedId;
            const isResizing = gesture?.kind === "resize" && gesture.id === p.id;
            const len = isResizing ? (gesture as Extract<Gesture, { kind: "resize" }>).liveLen : Number(p.length_cm) || 0;
            const h = Math.max(12, len * pxPerCm);
            const x = PAD + i * COL + (COL - W) / 2;
            const mat = matById.get(p.material_id);
            return (
              <g key={p.id}
                style={{
                  transform: `translate(${x}px, ${TOP}px)`,
                  transition: dragging && !isDragged ? "transform 130ms ease" : undefined,
                  opacity: isDragged ? 0.75 : 1,
                  cursor: "grab",
                }}>
                {boundaries.has(i) && (
                  <line x1={-(COL - W) / 2 - 1} y1={-8} x2={-(COL - W) / 2 - 1} y2={H + 8}
                    stroke="var(--admin-border-strong)" strokeWidth="1" strokeDasharray="3 3" />
                )}
                <text x={W / 2} y={-11} textAnchor="middle" fontSize="12" fontWeight="600"
                  fill="currentColor" className={isSelected ? "admin-heading" : "admin-muted"}>{i + 1}</text>
                <path d={finSilhouettePath(W, h)}
                  fill={mat?.diagram_color || "var(--admin-border-strong)"}
                  stroke={isSelected ? "var(--admin-accent)" : "rgba(0,0,0,0.15)"}
                  strokeWidth={isSelected ? 2 : 0.5}
                  onPointerDown={(e) => onPlyDown(e, p.id, i)}>
                  <title>{`Ply ${i + 1} · ${mat?.name ?? "no material"} · ${len} cm`}</title>
                </path>
                {/* The tip handle — drag down for longer, up for shorter. */}
                {(isSelected || isResizing) && (
                  <circle cx={W * 0.42} cy={h} r={8}
                    fill="var(--admin-accent)" stroke="#fff" strokeWidth="2"
                    style={{ cursor: "ns-resize" }}
                    onPointerDown={(e) => onTipDown(e, p.id, i)} />
                )}
                <text x={W / 2} y={H + 17} textAnchor="middle" fontSize="11"
                  fill="currentColor" className={isResizing ? "admin-heading" : "admin-muted"}
                  fontWeight={isResizing ? 700 : 400}>{len || "—"}</text>
              </g>
            );
          })}

          {/* Insertion caret while a material brick hovers over the stack. */}
          {inserting && (
            <line
              x1={PAD + (gesture as Extract<Gesture, { kind: "palette" }>).slot! * COL}
              x2={PAD + (gesture as Extract<Gesture, { kind: "palette" }>).slot! * COL}
              y1={TOP - 12} y2={TOP + H + 12}
              stroke="var(--admin-accent)" strokeWidth="3" strokeLinecap="round" />
          )}
        </svg>
      </div>

      {/* Inspector — precision for the selected brick. keyed so fields reset on selection. */}
      {selected ? (
        <div key={selected.id} className="mt-3 p-3 rounded-xl flex flex-wrap items-end gap-3"
          style={{ border: "1px solid var(--admin-accent)", backgroundColor: "var(--admin-surface)" }}>
          <span className="text-xs font-bold admin-heading self-center">Ply {selectedIndex + 1}</span>
          <label className="text-[10px] admin-faint uppercase font-bold">Material
            <select className="block mt-1 text-xs admin-input border rounded px-1.5 py-1.5" value={selected.material_id}
              onChange={(e) => patchSelected({ material_id: e.target.value })}>
              {materials.map((m) => <option key={m.id} value={m.id}>{shortMaterialName(m)}</option>)}
            </select>
          </label>
          <label className="text-[10px] admin-faint uppercase font-bold">Length cm
            <input type="number" step="0.1" className="block mt-1 w-20 text-xs admin-input border rounded px-1.5 py-1.5"
              defaultValue={selected.length_cm ?? ""}
              onBlur={(e) => patchSelected({ length_cm: e.target.value === "" ? null : clampLength(Number(e.target.value)) })}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          </label>
          <label className="text-[10px] admin-faint uppercase font-bold">Orientation
            <input className="block mt-1 w-20 text-xs admin-input border rounded px-1.5 py-1.5"
              defaultValue={selected.orientation ?? ""}
              placeholder={matById.get(selected.material_id)?.default_orientation ?? ""}
              onBlur={(e) => patchSelected({ orientation: e.target.value || null })}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          </label>
          <label className="text-[10px] admin-faint uppercase font-bold">Template
            <input className="block mt-1 w-16 text-xs admin-input border rounded px-1.5 py-1.5"
              defaultValue={selected.template_ref ?? ""}
              onBlur={(e) => patchSelected({ template_ref: e.target.value || null })}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          </label>
          <label className="text-[10px] admin-faint uppercase font-bold">Note
            <input className="block mt-1 w-40 text-xs admin-input border rounded px-1.5 py-1.5"
              defaultValue={selected.note ?? ""}
              onBlur={(e) => patchSelected({ note: e.target.value || null })}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          </label>
          <label className="flex items-center gap-1.5 text-xs admin-muted cursor-pointer pb-1.5"
            title="The two sides of a blade (or a board's deck vs bottom) are separate stacks — lengths restart here.">
            <input type="checkbox" disabled={selectedIndex === 0}
              checked={selectedIndex > 0 && stackBoundaries(plies).has(selectedIndex)}
              onChange={() => commit(withBoundaryToggled(plies, selectedIndex))} />
            starts a new stack
          </label>
          <div className="ml-auto flex items-center gap-2 pb-0.5">
            <button onClick={() => { const id = newId(); commit(duplicatePly(plies, selectedIndex, id)); setSelectedId(id); }}
              className="text-xs px-2.5 py-1.5 rounded-lg admin-muted hover:text-[var(--admin-accent)]"
              style={{ border: "1px solid var(--admin-border)" }}>
              Duplicate
            </button>
            <button onClick={() => { commit(plies.filter((_, i) => i !== selectedIndex)); setSelectedId(null); }}
              className="text-xs px-2.5 py-1.5 rounded-lg admin-muted hover:text-red-400"
              style={{ border: "1px solid var(--admin-border)" }}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[11px] admin-faint">
          Click a ply for its exact numbers · drag it sideways to reorder · drag its tip to change length ·
          ⌘Z undoes anything.
        </p>
      )}
    </div>
  );
}
