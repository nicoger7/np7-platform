"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Narrowing to a product line, one level at a time.
 *
 * A single flat list held every range and every size, indented with spaces, and
 * it was already 30 entries with two board lines and two fin lines in it. Ten
 * models with eight sizes each would make it 90 and unusable.
 *
 * So it walks: Boards, then Slalom, then 72. Each level shows only its own
 * siblings, and the levels you have chosen stay on screen as the path you took,
 * which is also how you go back up.
 */

export type ScopeObject = { id: string; name: string; kind: string; parent_id: string | null; sort: number };

export function ScopePicker({ objects, value, onChange }: {
  objects: ScopeObject[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [openLevel, setOpenLevel] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, ScopeObject[]>();
    for (const o of [...objects].sort((a, b) => a.sort - b.sort)) {
      const k = o.parent_id;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
    }
    return m;
  }, [objects]);

  /** Root first, down to whatever is selected. */
  const path = useMemo(() => {
    const out: ScopeObject[] = [];
    let cur = value ? byId.get(value) : undefined;
    while (cur) { out.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    return out;
  }, [value, byId]);

  // One level past the selection, so there is always somewhere to go deeper.
  const levels = useMemo(() => {
    const out: { options: ScopeObject[]; chosen: ScopeObject | null }[] = [];
    out.push({ options: childrenOf.get(null) ?? [], chosen: path[0] ?? null });
    for (const step of path) {
      const kids = childrenOf.get(step.id) ?? [];
      if (!kids.length) break;
      const next = path[path.indexOf(step) + 1] ?? null;
      out.push({ options: kids, chosen: next });
    }
    return out;
  }, [path, childrenOf]);

  useEffect(() => {
    if (openLevel === null) return;
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpenLevel(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenLevel(null); };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [openLevel]);

  const pick = (o: ScopeObject | null, level: number) => {
    setOpenLevel(null);
    // Choosing nothing at a level means "all of the level above it".
    onChange(o ? o.id : (level === 0 ? "" : path[level - 1]?.id ?? ""));
  };

  return (
    <div ref={wrap} className="flex items-center gap-1 flex-wrap">
      {levels.map((lvl, i) => (
        <div key={i} className="relative flex items-center">
          {i > 0 && <span className="admin-faint text-[11px] px-0.5">›</span>}
          <button
            onClick={() => setOpenLevel(openLevel === i ? null : i)}
            aria-haspopup="listbox" aria-expanded={openLevel === i}
            className={`px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
              lvl.chosen ? "fin-num" : "admin-faint"
            } hover:bg-[var(--fin-inset)]`}
            style={lvl.chosen ? undefined : { fontWeight: 400 }}
          >
            {lvl.chosen?.name ?? (i === 0 ? "Everything" : "All")}
            <span className="admin-faint ml-1.5 text-[10px]">▾</span>
          </button>

          {openLevel === i && (
            <div role="listbox"
                 className="absolute z-50 top-full left-0 mt-1 min-w-[11rem] max-h-72 overflow-y-auto rounded-xl p-1"
                 style={{ background: "var(--admin-surface)", border: ".5px solid var(--fin-hairline)",
                          boxShadow: "var(--fin-raise)" }}>
              <button onClick={() => pick(null, i)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] admin-muted hover:bg-[var(--fin-inset)]">
                {i === 0 ? "Everything" : `All of ${path[i - 1]?.name ?? "it"}`}
              </button>
              {lvl.options.map((o) => (
                <button key={o.id} role="option" aria-selected={lvl.chosen?.id === o.id}
                        onClick={() => pick(o, i)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] hover:bg-[var(--fin-inset)] ${
                          lvl.chosen?.id === o.id ? "fin-num" : "admin-muted"}`}>
                  {o.name}
                  {o.kind === "overhead" && <span className="fin-sub"> · no product</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {value && (
        <button onClick={() => onChange("")} title="Show everything again"
                className="ml-0.5 px-1.5 py-1 rounded-md admin-faint hover:bg-[var(--fin-inset)] text-[12px]">
          ✕
        </button>
      )}
    </div>
  );
}
