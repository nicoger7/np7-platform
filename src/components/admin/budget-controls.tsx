"use client";

import { useEffect, useRef, useState } from "react";
import { MONTHS } from "@/lib/finance/board";
import { QUARTERS, FULL_YEAR, isFullYear, normalise, type Period } from "@/lib/finance/period";
import { SORTS, isFiltering, NO_FILTER, type RowFilter, type RowSort } from "@/lib/finance/rows";

/**
 * Choosing what part of the year, and which rows.
 *
 * Two controls that look alike and mean different things, so they are kept
 * apart on the bar. The period changes what the numbers ARE: a quarter's costs
 * are a different figure from a year's. The row filter only changes what you
 * can see: hiding a row never changes the plan, and the panel says so where it
 * would otherwise be ambiguous.
 */

const CUSTOM = "custom";

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [openCustom, setOpenCustom] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const activeQuarter = QUARTERS.find((q) => q.period.from === value.from && q.period.to === value.to);
  const singleMonth = value.from === value.to;
  const mode = isFullYear(value) ? "year" : activeQuarter ? activeQuarter.key : CUSTOM;

  useEffect(() => {
    if (!openCustom) return;
    const away = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpenCustom(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenCustom(false); };
    window.addEventListener("mousedown", away); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [openCustom]);

  return (
    <div ref={wrap} className="relative flex items-center gap-1">
      <div className="fin-seg">
        <button data-on={mode === "year"} onClick={() => { onChange(FULL_YEAR); setOpenCustom(false); }}>Year</button>
        {QUARTERS.map((q) => (
          <button key={q.key} data-on={mode === q.key}
                  onClick={() => { onChange(q.period); setOpenCustom(false); }}>{q.label}</button>
        ))}
        <button data-on={mode === CUSTOM} onClick={() => setOpenCustom((o) => !o)}
                title="One month, or any run of months">
          {mode === CUSTOM
            ? (singleMonth ? MONTHS[value.from - 1] : `${MONTHS[value.from - 1]}–${MONTHS[value.to - 1]}`)
            : "Custom"}
          <span className="admin-faint ml-1 text-[10px]">▾</span>
        </button>
      </div>

      {openCustom && (
        <div className="absolute z-50 top-full left-0 mt-1 rounded-xl p-3 w-[19rem]"
             style={{ background: "var(--admin-surface)", border: ".5px solid var(--fin-hairline)", boxShadow: "var(--fin-raise)" }}>
          <p className="fin-label mb-2">One month, or a run of them</p>
          <div className="grid grid-cols-6 gap-1">
            {MONTHS.map((m, i) => {
              const n = i + 1;
              const inside = n >= value.from && n <= value.to;
              return (
                <button key={m} onClick={() => onChange({ from: n, to: n })}
                        onDoubleClick={() => onChange(normalise({ from: value.from, to: n }))}
                        title={`${m} · click for this month alone, shift-click to extend`}
                        onMouseDown={(e) => { if (e.shiftKey) { e.preventDefault(); onChange(normalise({ from: value.from, to: n })); } }}
                        className="px-1 py-1.5 rounded-md text-[11px] transition-colors"
                        style={inside
                          ? { background: "var(--admin-accent-weak)", color: "var(--admin-text)", fontWeight: 600 }
                          : { color: "var(--admin-text-muted)" }}>
                  {m}
                </button>
              );
            })}
          </div>
          <p className="fin-sub mt-2">
            Click one month. Shift-click a second to run from the first to it.
          </p>
        </div>
      )}
    </div>
  );
}

const CONFIDENCE: { key: string; label: string; what: string }[] = [
  { key: "committed", label: "Committed", what: "ordered or signed" },
  { key: "expected",  label: "Expected",  what: "will almost certainly happen" },
  { key: "possible",  label: "Possible",  what: "might not happen at all" },
];

export function RowControls({ filter, onFilter, sort, onSort, shown, hidden }: {
  filter: RowFilter; onFilter: (f: RowFilter) => void;
  sort: RowSort; onSort: (s: RowSort) => void;
  shown: number; hidden: number;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const on = isFiltering(filter);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", away); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [open]);

  const toggleConfidence = (k: string) => onFilter({
    ...filter,
    confidence: filter.confidence.includes(k)
      ? filter.confidence.filter((c) => c !== k)
      : [...filter.confidence, k],
  });

  return (
    <div ref={wrap} className="relative flex items-center gap-2 flex-wrap">
      <div className="relative">
        <input
          value={filter.q}
          onChange={(e) => onFilter({ ...filter, q: e.target.value })}
          placeholder="Find a row…"
          aria-label="Find a budget row"
          className="admin-input border rounded-lg pl-2.5 pr-7 py-1.5 text-[12.5px] w-44"
        />
        {filter.q && (
          <button onClick={() => onFilter({ ...filter, q: "" })} aria-label="Clear the search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 admin-faint text-[11px] px-1">✕</button>
        )}
      </div>

      <select value={sort} onChange={(e) => onSort(e.target.value as RowSort)}
              aria-label="Sort the rows"
              className="admin-input border rounded-lg px-2 py-1.5 text-[12.5px]">
        {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>

      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
              className="px-2.5 py-1.5 rounded-lg text-[12.5px] border admin-input"
              style={on ? { borderColor: "var(--admin-accent)", color: "var(--admin-text)" } : undefined}>
        Filter{on ? " ·" : ""}
        {on && <span className="ml-1 fin-num">{shown}</span>}
        <span className="admin-faint ml-1 text-[10px]">▾</span>
      </button>

      {on && (
        <button onClick={() => onFilter(NO_FILTER)} className="fin-sub underline underline-offset-2 hover:no-underline">
          Clear
        </button>
      )}
      {hidden > 0 && <span className="fin-sub">{hidden} hidden</span>}

      {open && (
        <div className="absolute z-50 top-full right-0 mt-1 rounded-xl p-3 w-[20rem]"
             style={{ background: "var(--admin-surface)", border: ".5px solid var(--fin-hairline)", boxShadow: "var(--fin-raise)" }}>
          <p className="fin-label mb-1.5">How sure is it</p>
          <div className="flex gap-1 flex-wrap">
            {CONFIDENCE.map((c) => (
              <button key={c.key} onClick={() => toggleConfidence(c.key)} title={c.what}
                      className="px-2 py-1 rounded-md text-[12px] transition-colors"
                      style={filter.confidence.includes(c.key)
                        ? { background: "var(--admin-accent-weak)", color: "var(--admin-text)", fontWeight: 600 }
                        : { color: "var(--admin-text-muted)", background: "var(--fin-inset)" }}>
                {c.label}
              </button>
            ))}
          </div>

          <p className="fin-label mt-3 mb-1.5">Rows switched off</p>
          <div className="fin-seg">
            {([["show", "Show"], ["hide", "Hide"], ["only", "Only these"]] as const).map(([k, label]) => (
              <button key={k} data-on={filter.excluded === k}
                      onClick={() => onFilter({ ...filter, excluded: k })}>{label}</button>
            ))}
          </div>

          <p className="fin-label mt-3 mb-1.5">Against what actually happened</p>
          <div className="fin-seg">
            {([["any", "All"], ["over", "Over plan"], ["under", "Under plan"]] as const).map(([k, label]) => (
              <button key={k} data-on={filter.variance === k}
                      onClick={() => onFilter({ ...filter, variance: k })}>{label}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 mt-2.5 text-[12.5px] admin-muted cursor-pointer">
            <input type="checkbox" checked={filter.withActuals}
                   onChange={(e) => onFilter({ ...filter, withActuals: e.target.checked })} />
            Only rows where something has been booked
          </label>

          <p className="fin-sub mt-3 pt-2 fin-rule">
            Filtering changes what you see, never what the plan says. The totals below a
            group follow the rows still on screen; the P&amp;L and the cash line do not move.
          </p>
        </div>
      )}
    </div>
  );
}
