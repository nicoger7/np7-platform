"use client";

import { useMemo, useState } from "react";
import {
  BOARD_METRICS, BOARD_METRIC_BY_KEY, describeParse, effectiveValue, fmtReading,
  metricUnit, parseMeasurementText, round,
  type BoardMetric, type ParseResult, type ParsedSeries,
  type PdBoard, type PdBoardPoint, type PdBoardSeries,
} from "@/lib/board-measurements";

/**
 * The measuring table: a row per station, a column per metric.
 *
 * Two things it refuses to do, both learned from the shape of the data itself:
 *
 *   * It never drops a station with no reading. An empty cell on a station you
 *     put in the grid is a to-do — "I meant to measure that and didn't" — and
 *     a table that hides them is a table that cannot tell you what is left.
 *
 *   * It never applies a convention to the numbers. "Alles halbieren" sets the
 *     series scale, the cell keeps showing what the tape said, and the halved
 *     figure appears beside it. The stored number is always the read number,
 *     so a convention can be corrected six months later without the board.
 */

const inputClass = "w-full px-2 py-1.5 admin-input border rounded text-sm focus:outline-none focus:border-[var(--admin-accent)] transition-colors";
const labelClass = "block text-xs font-medium admin-muted mb-1";

type Cell = { value: string; text: string; note: string };
type Draft = Record<string, Record<number, Cell>>;   // metric → station → cell

const cellKey = (v: PdBoardPoint | undefined): Cell => ({
  value: v?.value == null ? "" : String(v.value),
  text: v?.text_value ?? "",
  note: v?.note ?? "",
});

export function BoardMeasureGrid({ board, series, points, onSaved }: {
  board: PdBoard;
  series: PdBoardSeries[];
  points: PdBoardPoint[];
  onSaved: () => void;
}) {
  // Every station the grid should show: the board's own list, plus any station
  // that carries a reading but was never added to it (an import, usually).
  const stations = useMemo(() => {
    const set = new Set<number>([...(board.stations ?? []), ...points.map((p) => p.station)]);
    return Array.from(set).sort((a, b) => a - b);
  }, [board.stations, points]);

  const activeMetrics = useMemo(() => {
    const used = new Set<string>([...series.map((s) => s.metric), ...points.map((p) => p.metric)]);
    return BOARD_METRICS.filter((m) => used.has(m.key));
  }, [series, points]);

  const [draft, setDraft] = useState<Draft>(() => {
    const d: Draft = {};
    for (const p of points) {
      d[p.metric] = d[p.metric] ?? {};
      d[p.metric][p.station] = cellKey(p);
    }
    return d;
  });
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [seriesDraft, setSeriesDraft] = useState<Record<string, Partial<PdBoardSeries>>>(() =>
    Object.fromEntries(series.map((s) => [s.metric, { ...s }])),
  );
  const [openSettings, setOpenSettings] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [addingMetric, setAddingMetric] = useState(false);

  function cell(metric: string, station: number): Cell {
    return draft[metric]?.[station] ?? { value: "", text: "", note: "" };
  }
  function setCell(metric: string, station: number, patch: Partial<Cell>) {
    setDraft((d) => ({ ...d, [metric]: { ...(d[metric] ?? {}), [station]: { ...cell(metric, station), ...patch } } }));
    setDirty((s) => new Set(s).add(metric));
  }
  function seriesFor(metric: string): Partial<PdBoardSeries> {
    return seriesDraft[metric] ?? { metric, scale: 1, enabled: true };
  }
  function setSeries(metric: string, patch: Partial<PdBoardSeries>) {
    setSeriesDraft((s) => ({ ...s, [metric]: { ...seriesFor(metric), ...patch } }));
    setDirty((s) => new Set(s).add(metric));
  }

  async function save() {
    if (!dirty.size) return;
    setSaving(true); setMsg("");
    const failures: string[] = [];
    for (const metric of dirty) {
      const cells = draft[metric] ?? {};
      const payload = {
        metric,
        series: seriesFor(metric),
        points: Object.entries(cells).map(([station, c]) => ({
          station: Number(station),
          value: c.value === "" ? null : Number(c.value.replace(",", ".")),
          text_value: c.text || null,
          note: c.note || null,
        })).filter((p) => Number.isFinite(p.station)),
      };
      const res = await fetch(`/api/admin/product-dev/boards/${board.id}/measurements`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        failures.push(`${BOARD_METRIC_BY_KEY[metric]?.label ?? metric}: ${j.error ?? "save failed"}`);
      }
    }
    setSaving(false);
    if (failures.length) { setMsg(failures.join(" · ")); return; }
    setDirty(new Set());
    setMsg("Saved.");
    onSaved();
    setTimeout(() => setMsg(""), 2000);
  }

  async function addStation() {
    const raw = prompt("Station (cm from the " + board.station_origin + ")");
    if (!raw) return;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n)) return;
    const next = Array.from(new Set([...(board.stations ?? []), n])).sort((a, b) => a - b);
    await patchBoard({ stations: next });
  }

  async function removeStation(station: number) {
    const hasData = activeMetrics.some((m) => {
      const c = cell(m.key, station);
      return c.value || c.text || c.note;
    });
    if (hasData && !confirm(`Station ${station} has readings on it. Remove the row and delete them?`)) return;
    const next = (board.stations ?? []).filter((s) => s !== station);
    // Clear the cells locally so the save that follows writes the removal.
    for (const m of activeMetrics) {
      if (draft[m.key]?.[station]) {
        setDraft((d) => {
          const copy = { ...(d[m.key] ?? {}) };
          delete copy[station];
          return { ...d, [m.key]: copy };
        });
        setDirty((s) => new Set(s).add(m.key));
      }
    }
    await patchBoard({ stations: next });
  }

  async function patchBoard(patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) onSaved();
    else setMsg((await res.json().catch(() => ({}))).error ?? "Couldn't update the board.");
  }

  async function addMetric(key: string) {
    setAddingMetric(false);
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/measurements`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metric: key, series: { metric: key, scale: 1, enabled: true }, points: null }),
    });
    if (res.ok) onSaved();
  }

  async function removeMetric(key: string) {
    const m = BOARD_METRIC_BY_KEY[key];
    if (!confirm(`Remove ${m?.label ?? key} from this board?\n\nEvery reading for it is deleted.`)) return;
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/measurements?metric=${encodeURIComponent(key)}`, { method: "DELETE" });
    if (res.ok) { setDirty((s) => { const n = new Set(s); n.delete(key); return n; }); onSaved(); }
  }

  const unused = BOARD_METRICS.filter((m) => !activeMetrics.some((a) => a.key === m.key));
  const gridCols = `78px repeat(${activeMetrics.length}, minmax(110px, 1fr)) 34px`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setShowImport(true)}
          className="px-3 py-2 text-xs font-bold rounded-lg transition-colors"
          style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
          Paste a measuring session
        </button>
        <button onClick={addStation} className="px-3 py-2 text-xs font-semibold admin-muted rounded-lg"
          style={{ border: "1px solid var(--admin-border)" }}>
          + Station
        </button>
        <div className="relative">
          <button onClick={() => setAddingMetric(!addingMetric)} disabled={!unused.length}
            className="px-3 py-2 text-xs font-semibold admin-muted rounded-lg disabled:opacity-40"
            style={{ border: "1px solid var(--admin-border)" }}>
            + Measurement
          </button>
          {addingMetric && (
            <div className="absolute z-20 mt-1 w-64 rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              {unused.map((m) => (
                <button key={m.key} onClick={() => addMetric(m.key)}
                  className="block w-full text-left px-3 py-2 text-xs admin-heading hover:bg-[var(--admin-surface-hover)]">
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: m.color }} />
                  {m.label} <span className="admin-faint">({m.unit})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {msg && <span className={`text-xs ${msg === "Saved." ? "text-green-400" : "text-red-400"}`}>{msg}</span>}
          <button onClick={save} disabled={!dirty.size || saving}
            className="px-4 py-2 text-xs font-bold rounded-lg disabled:opacity-40 transition-colors"
            style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
            {saving ? "Saving…" : dirty.size ? `Save ${dirty.size} change${dirty.size === 1 ? "" : "s"}` : "Saved"}
          </button>
        </div>
      </div>

      {!activeMetrics.length ? (
        <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint max-w-md mx-auto leading-relaxed">
            No measurements on this board yet. Paste a session straight out of your notes app —
            metric heading, then one station per line — and it fills the table.
          </p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          {/* Header: the metric, its unit, and the button into its settings. */}
          <div className="gap-2 px-3 py-2 admin-surface"
            style={{ display: "grid", gridTemplateColumns: gridCols, borderBottom: "1px solid var(--admin-border)" }}>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase self-center">Station</span>
            {activeMetrics.map((m) => {
              const s = seriesFor(m.key);
              const unit = metricUnit(m.key, s as PdBoardSeries);
              return (
                <button key={m.key} onClick={() => setOpenSettings(openSettings === m.key ? null : m.key)}
                  className="text-left group">
                  <span className="block text-[11px] font-bold admin-heading truncate" style={{ color: m.color }}>
                    {m.label}
                  </span>
                  <span className="block text-[10px] admin-faint truncate">
                    {unit}
                    {s.variant ? ` · ${s.variant}` : ""}
                    {s.scale && s.scale !== 1 ? ` · ×${s.scale}` : ""}
                    {s.convention ? " · ⚑" : ""}
                  </span>
                </button>
              );
            })}
            <span />
          </div>

          {openSettings && (
            <SeriesSettings
              metric={BOARD_METRIC_BY_KEY[openSettings]}
              value={seriesFor(openSettings)}
              onChange={(patch) => setSeries(openSettings, patch)}
              onRemove={() => { setOpenSettings(null); removeMetric(openSettings); }}
              onClose={() => setOpenSettings(null)}
            />
          )}

          {stations.map((station) => {
            const rowHasNote = activeMetrics.some((m) => cell(m.key, station).note);
            return (
              <div key={station}>
                <div className="gap-2 px-3 py-1.5 group"
                  style={{ display: "grid", gridTemplateColumns: gridCols, borderBottom: "1px solid var(--admin-border)" }}>
                  <span className="text-xs font-semibold admin-muted self-center tabular-nums">{station}</span>
                  {activeMetrics.map((m) => (
                    <MetricCell key={m.key} metric={m} cell={cell(m.key, station)}
                      series={seriesFor(m.key)}
                      onChange={(patch) => setCell(m.key, station, patch)}
                      onNote={() => setOpenNote(openNote === `${m.key}:${station}` ? null : `${m.key}:${station}`)} />
                  ))}
                  <button onClick={() => removeStation(station)} title="Remove this station"
                    className="text-xs admin-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity self-center">
                    ✕
                  </button>
                </div>
                {activeMetrics.map((m) => {
                  const key = `${m.key}:${station}`;
                  const c = cell(m.key, station);
                  if (openNote !== key && !c.note) return null;
                  if (openNote !== key) {
                    return (
                      <div key={key} className="px-3 pb-1.5 -mt-0.5">
                        <span className="text-[10px] admin-faint">
                          <span style={{ color: m.color }}>{m.label}</span> @ {station}: {c.note}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div key={key} className="px-3 py-2" style={{ backgroundColor: "var(--admin-surface)", borderBottom: "1px solid var(--admin-border)" }}>
                      <label className={labelClass}>Note on {m.label} at station {station}</label>
                      <input className={inputClass} autoFocus value={c.note}
                        placeholder="e.g. start of the kick, measured off the tail block"
                        onChange={(e) => setCell(m.key, station, { note: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setOpenNote(null); }} />
                    </div>
                  );
                })}
                {rowHasNote && null}
              </div>
            );
          })}
        </div>
      )}

      {showImport && (
        <ImportDialog board={board} onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); onSaved(); }} />
      )}
    </div>
  );
}

// ─── One cell ────────────────────────────────────────────────────────────────

function MetricCell({ metric, cell, series, onChange, onNote }: {
  metric: BoardMetric; cell: Cell; series: Partial<PdBoardSeries>;
  onChange: (patch: Partial<Cell>) => void; onNote: () => void;
}) {
  const scaled = cell.value !== "" && series.scale && series.scale !== 1
    ? round(Number(cell.value.replace(",", ".")) * series.scale, 3)
    : null;

  if (metric.kind === "choice") {
    return (
      <div className="flex items-center gap-1">
        <select className={`${inputClass} py-1`} value={cell.text} onChange={(e) => onChange({ text: e.target.value })}>
          <option value="">—</option>
          {metric.choices?.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button onClick={onNote} title="Note" className={`text-xs px-1 ${cell.note ? "text-[var(--admin-accent)]" : "admin-faint hover:admin-muted"}`}>✎</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 min-w-0">
        <input
          className={`${inputClass} py-1 tabular-nums`} inputMode="decimal"
          value={cell.value !== "" ? cell.value : cell.text}
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value;
            // A word in a number column is a real reading ("start"), not a
            // typo to reject — it goes to text_value instead of value.
            if (raw === "" || /^[-+]?[\d.,]*$/.test(raw)) onChange({ value: raw, text: "" });
            else onChange({ value: "", text: raw });
          }}
        />
        {scaled != null && (
          <span className="block text-[10px] admin-faint tabular-nums leading-none mt-0.5">= {scaled}</span>
        )}
        {metric.signed && cell.value !== "" && Number(cell.value.replace(",", ".")) < 0 && (
          <span className="block text-[10px] leading-none mt-0.5" style={{ color: metric.color }}>{metric.negativeLabel}</span>
        )}
      </div>
      <button onClick={onNote} title="Note" className={`text-xs px-1 self-start mt-1.5 ${cell.note ? "text-[var(--admin-accent)]" : "admin-faint hover:admin-muted opacity-0 group-hover:opacity-100"}`}>✎</button>
    </div>
  );
}

// ─── Series settings ─────────────────────────────────────────────────────────

function SeriesSettings({ metric, value, onChange, onRemove, onClose }: {
  metric: BoardMetric | undefined; value: Partial<PdBoardSeries>;
  onChange: (patch: Partial<PdBoardSeries>) => void; onRemove: () => void; onClose: () => void;
}) {
  if (!metric) return null;
  return (
    <div className="px-4 py-4" style={{ backgroundColor: "var(--admin-surface)", borderBottom: "1px solid var(--admin-border)" }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-sm font-bold admin-heading" style={{ color: metric.color }}>{metric.label}</h4>
          {metric.hint && <p className="text-[11px] admin-faint max-w-xl leading-relaxed mt-0.5">{metric.hint}</p>}
        </div>
        <button onClick={onClose} className="text-xs admin-faint hover:admin-muted">Close</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className={labelClass}>Unit</label>
          <select className={inputClass} value={value.unit ?? metric.unit} onChange={(e) => onChange({ unit: e.target.value })}>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
          </select>
        </div>
        {metric.variants && (
          <div>
            <label className={labelClass}>Variant</label>
            <select className={inputClass} value={value.variant ?? ""} onChange={(e) => onChange({ variant: e.target.value || null })}>
              <option value="">—</option>
              {metric.variants.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={labelClass} title="Readings are stored as read; this is applied when they are shown.">
            Scale
          </label>
          <select className={inputClass} value={String(value.scale ?? 1)} onChange={(e) => onChange({ scale: Number(e.target.value) })}>
            <option value="1">×1 — as read</option>
            <option value="0.5">×0.5 — halve them</option>
            <option value="2">×2 — double them</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Measured against</label>
          <select className={inputClass} value={value.relative_to ?? ""} onChange={(e) => onChange({ relative_to: e.target.value || null })}>
            <option value="">The flat reference</option>
            {BOARD_METRICS.filter((m) => m.key !== metric.key && m.kind === "number").map((m) => (
              <option key={m.key} value={m.key}>The {m.label} line</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mb-3">
        <label className={labelClass}>How it was measured — kept verbatim</label>
        <input className={inputClass} value={value.convention ?? ""} placeholder='e.g. "rail to rail off a straightedge, alles halbieren"'
          onChange={(e) => onChange({ convention: e.target.value })} />
      </div>
      <button onClick={onRemove} className="text-xs text-red-400 hover:underline">Remove this measurement from the board</button>
    </div>
  );
}

// ─── Paste importer ──────────────────────────────────────────────────────────

/**
 * The import is a two-step on purpose: parse, then look at it, then write.
 *
 * The parser is exact on the format it knows, and the review table is where you
 * see what it did with the lines it was less sure about — which stations it
 * read, which it left blank, and which caveats it is PROPOSING to act on rather
 * than acting on. A one-click import would have to guess at "alles halbieren",
 * and guessing wrong scales a whole series by two.
 */
function ImportDialog({ board, onClose, onDone }: { board: PdBoard; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applySuggestion, setApplySuggestion] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assistNote, setAssistNote] = useState("");

  function parse() {
    const r = parseMeasurementText(text);
    setResult(r);
    setPicked(new Set(r.series.map((s) => s.metric)));
    setApplySuggestion(new Set(r.series.flatMap((s) => s.suggestions.map((g) => `${s.metric}:${g.kind}`))));
    setAssistNote("");
  }

  async function askAssistant() {
    setBusy(true); setError("");
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/intake`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (j.needsKey) { setAssistNote(j.message); return; }
    if (!res.ok) { setError(j.error ?? "Couldn't sort that."); return; }
    const proposals: ParsedSeries[] = j.filed?.proposals ?? [];
    setResult({ series: proposals, ignored: j.filed?.bullets ?? [], warnings: j.warnings ?? [] });
    setPicked(new Set(proposals.map((s) => s.metric)));
  }

  async function importIt() {
    if (!result) return;
    setBusy(true); setError("");
    const chosen = result.series.filter((s) => picked.has(s.metric));
    const newStations = new Set<number>(board.stations ?? []);

    for (const s of chosen) {
      const scaleSug = s.suggestions.find((g) => g.kind === "scale");
      const relSug = s.suggestions.find((g) => g.kind === "relative_to");
      const payload = {
        metric: s.metric,
        series: {
          metric: s.metric,
          unit: s.unit ?? BOARD_METRIC_BY_KEY[s.metric]?.unit,
          variant: s.variant,
          scale: scaleSug && applySuggestion.has(`${s.metric}:scale`) ? Number(scaleSug.value) : 1,
          relative_to: relSug && applySuggestion.has(`${s.metric}:relative_to`) ? String(relSug.value) : null,
          convention: s.convention,
          enabled: true,
        },
        points: s.points.map((p) => ({ station: p.station, value: p.value, text_value: p.text, note: p.note })),
      };
      for (const p of s.points) newStations.add(p.station);
      const res = await fetch(`/api/admin/product-dev/boards/${board.id}/measurements`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(`${s.metric}: ${j.error ?? "import failed"}`);
        setBusy(false);
        return;
      }
    }

    await fetch(`/api/admin/product-dev/boards/${board.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stations: Array.from(newStations).sort((a, b) => a - b) }),
    });
    setBusy(false);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-4xl my-8 rounded-xl p-5" onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: "var(--admin-bg)", border: "1px solid var(--admin-border)" }}>
        <h3 className="text-lg font-bold admin-heading mb-1">Paste a measuring session</h3>
        <p className="text-xs admin-faint mb-4 max-w-2xl leading-relaxed">
          A metric heading, then one station per line. Units, comma decimals, missing dashes, bracketed
          caveats and a line like “Normal V from here” are all read correctly. Stations you listed but
          didn’t measure are kept as blanks.
        </p>

        <textarea className={`${inputClass} font-mono text-xs min-h-[220px]`} value={text} autoFocus
          onChange={(e) => { setText(e.target.value); setResult(null); }}
          placeholder={"Rocker\n10 - 0\n50 - 0\n80 - start\n110 - 4.5mm\n\nV - inverted!! (alles halbieren)\n10 0.2mm\n80 - 0\nNormal V from here\n90 - 2.9mm"} />

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button onClick={parse} disabled={!text.trim()}
            className="px-4 py-2 text-xs font-bold rounded-lg disabled:opacity-40"
            style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
            Read it
          </button>
          <button onClick={askAssistant} disabled={!text.trim() || busy}
            className="px-3 py-2 text-xs font-semibold admin-muted rounded-lg disabled:opacity-40"
            style={{ border: "1px solid var(--admin-border)" }}>
            {busy ? "Asking…" : "Ask the assistant instead"}
          </button>
          <button onClick={onClose} className="px-3 py-2 text-xs admin-muted ml-auto">Cancel</button>
        </div>

        {assistNote && (
          <p className="mt-3 text-xs admin-muted leading-relaxed px-3 py-2 rounded-lg"
            style={{ border: "1px solid var(--admin-border)" }}>{assistNote}</p>
        )}
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        {result && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold admin-heading">{describeParse(result)}</h4>
              <button onClick={importIt} disabled={busy || !picked.size}
                className="px-4 py-2 text-xs font-bold rounded-lg disabled:opacity-40"
                style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
                {busy ? "Importing…" : `Import ${picked.size} metric${picked.size === 1 ? "" : "s"}`}
              </button>
            </div>

            {result.series.map((s) => {
              const m = BOARD_METRIC_BY_KEY[s.metric];
              const on = picked.has(s.metric);
              return (
                <div key={s.metric} className="mb-3 rounded-lg p-3" style={{ border: "1px solid var(--admin-border)" }}>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={on} className="mt-1"
                      onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.metric); else n.delete(s.metric); return n; })} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold" style={{ color: m?.color }}>{m?.label ?? s.metric}</span>
                      <span className="block text-[11px] admin-faint truncate">
                        from “{s.heading}” · {s.points.filter((p) => p.value != null).length} readings
                        {s.unit ? ` in ${s.unit}` : ""}{s.variant ? ` · ${s.variant}` : ""}
                      </span>
                    </span>
                  </label>

                  {s.suggestions.length > 0 && (
                    <div className="mt-2 ml-6 space-y-1">
                      {s.suggestions.map((g) => (
                        <label key={g.kind} className="flex items-center gap-2 text-[11px] admin-muted cursor-pointer">
                          <input type="checkbox" checked={applySuggestion.has(`${s.metric}:${g.kind}`)}
                            onChange={(e) => setApplySuggestion((p) => {
                              const n = new Set(p);
                              if (e.target.checked) n.add(`${s.metric}:${g.kind}`); else n.delete(`${s.metric}:${g.kind}`);
                              return n;
                            })} />
                          Apply <strong className="admin-heading">{g.kind === "scale" ? `×${g.value}` : String(g.value)}</strong> — {g.because}
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 ml-6 flex flex-wrap gap-1.5">
                    {s.points.map((p) => (
                      <span key={p.station} title={p.note ?? undefined}
                        className="text-[10px] px-1.5 py-0.5 rounded tabular-nums"
                        style={{
                          border: "1px solid var(--admin-border)",
                          color: p.value == null && !p.text ? "var(--admin-text-faint)" : undefined,
                        }}>
                        {p.station}
                        <span className="admin-faint"> · </span>
                        {p.value != null
                          ? fmtReading(s.metric, p.value, s.unit ?? m?.unit ?? "mm")
                          : p.text ?? "—"}
                        {p.note ? " ⚑" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}

            {result.ignored.length > 0 && (
              <details className="mt-3">
                <summary className="text-xs admin-faint cursor-pointer">
                  {result.ignored.length} line{result.ignored.length === 1 ? "" : "s"} not read as measurements
                </summary>
                <ul className="mt-2 space-y-0.5">
                  {result.ignored.map((l, i) => <li key={i} className="text-[11px] admin-faint font-mono">{l}</li>)}
                </ul>
              </details>
            )}
            {result.warnings.length > 0 && (
              <ul className="mt-3 space-y-1">
                {result.warnings.map((w, i) => <li key={i} className="text-[11px] text-amber-400">{w}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Small read-only summary used on the Overview tab. */
export function SeriesSummary({ series, points }: { series: PdBoardSeries[]; points: PdBoardPoint[] }) {
  const metrics = BOARD_METRICS.filter((m) => points.some((p) => p.metric === m.key));
  if (!metrics.length) return <p className="text-sm admin-faint">Nothing measured yet.</p>;
  return (
    <ul className="space-y-1.5">
      {metrics.map((m) => {
        const s = series.find((x) => x.metric === m.key) ?? null;
        const own = points.filter((p) => p.metric === m.key);
        const read = own.filter((p) => p.value != null);
        const unit = metricUnit(m.key, s);
        const vals = read.map((p) => effectiveValue(p, s) as number);
        return (
          <li key={m.key} className="text-xs admin-muted">
            <span className="font-semibold" style={{ color: m.color }}>{m.label}</span>
            {" — "}
            {read.length} reading{read.length === 1 ? "" : "s"}
            {vals.length ? ` · ${round(Math.min(...vals), 2)} to ${round(Math.max(...vals), 2)} ${unit}` : ""}
            {own.length > read.length ? ` · ${own.length - read.length} still to measure` : ""}
            {s?.convention ? <span className="admin-faint"> · “{s.convention}”</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
