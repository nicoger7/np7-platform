"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BOARD_DISCIPLINES, BOARD_METRICS, BOARD_ORIGINS, DEFAULT_STATIONS, boardTitle, compareBoards, disciplineLabel,
  type BoardCategory, type BoardOrigin,
} from "@/lib/board-measurements";
import {
  BoardName, Card, Empty, FilterPills, Icon, InfoTip, ORIGIN_META, OriginChip, PageHeader, SearchBox, Tag,
  btnPrimary, btnPrimaryStyle, btnSecondary, btnSecondaryStyle, inputCls, labelCls, toneVars,
} from "@/components/admin/pd-ui";
import { BoardOutlineThumb, type WidthPair } from "@/components/admin/pd-thumbs";

type BoardRow = {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  size?: string | null;
  year: number | null;
  category: BoardCategory;
  origin: BoardOrigin;
  volume_l: number | null;
  length_cm: number | null;
  max_width_cm: number | null;
  station_origin: "tail" | "nose";
  measured_at: string | null;
  readings: number;
  metrics: number;
  measured?: string[];
  outline?: { w: WidthPair[]; wt: WidthPair[] };
  last_station?: number;
};

export default function BoardsPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    year: String(new Date().getFullYear()), brand: "", model: "", size: "", name: "",
    category: "slalom" as BoardCategory, origin: "competitor" as BoardOrigin,
    volume_l: "", station_origin: "tail" as "tail" | "nose",
  });

  // One request, filtered here: the search matches the title (year, brand,
  // model, size) as well as the typed name, which the server-side name search
  // could not.
  const fetchData = useCallback(() => {
    fetch("/api/admin/product-dev/boards")
      .then((r) => r.json())
      .then((d) => { setBoards(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const newTitle = boardTitle({
    name: "", year: form.year ? Number(form.year) : null, brand: form.brand || null, model: form.model || null, size: form.size || null,
  }).text;

  async function handleCreate() {
    const name = form.name.trim() || newTitle.trim();
    if (!name) return;
    setCreating(true); setError("");
    const res = await fetch("/api/admin/product-dev/boards", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        brand: form.brand || null,
        model: form.model || null,
        size: form.size || null,
        year: form.year ? Number(form.year) : null,
        category: form.category,
        origin: form.origin,
        volume_l: form.volume_l ? Number(form.volume_l.replace(",", ".")) : null,
        station_origin: form.station_origin,
        // A new board starts with a station grid rather than an empty table:
        // the first thing you do is fill in numbers, not build a form.
        stations: DEFAULT_STATIONS,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/admin/product-dev/boards/${data.id}`);
    } else {
      setError((await res.json().catch(() => ({}))).error || "Couldn't create that board.");
      setCreating(false);
    }
  }

  async function handleArchive(b: BoardRow) {
    if (!confirm(`Archive "${boardTitle(b).text}"?\n\nEvery reading, cut-out and note stays in the database.`)) return;
    const res = await fetch(`/api/admin/product-dev/boards/${b.id}`, { method: "DELETE" });
    if (res.ok) fetchData();
    else setError((await res.json().catch(() => ({}))).error || "Couldn't archive that board.");
  }

  const q = search.trim().toLowerCase();
  const shown = useMemo(() => boards
    .filter((b) => !discipline || b.category === discipline)
    .filter((b) => !q || `${boardTitle(b).text} ${b.name} ${b.brand ?? ""}`.toLowerCase().includes(q))
    .sort(compareBoards), [boards, discipline, q]);

  // Year is the first thing a board is known by, so the list is grouped by it.
  const byYear = useMemo(() => {
    const groups: { year: number | null; rows: BoardRow[] }[] = [];
    for (const b of shown) {
      const last = groups[groups.length - 1];
      if (last && last.year === b.year) last.rows.push(b);
      else groups.push({ year: b.year, rows: [b] });
    }
    return groups;
  }, [shown]);

  // One scale for every thumbnail on the page, so a longer board looks longer.
  const scale = useMemo(() => {
    let len = 0, wid = 0;
    for (const b of boards) {
      const pairs = [...(b.outline?.w ?? []), ...(b.outline?.wt ?? [])];
      len = Math.max(len, b.length_cm ?? 0, b.last_station ?? 0, ...pairs.map(([s]) => s));
      wid = Math.max(wid, ...pairs.map(([, w]) => w));
    }
    return { len: len || 240, wid: wid || 90 };
  }, [boards]);

  return (
    <div>
      <PageHeader
        title="Boards"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            Measured boards: ours, prototypes and the competition.
            <InfoTip>
              Each card draws the outline from the width readings, all at the same scale, so a longer board looks longer.
              The coloured dots are the {BOARD_METRICS.length} measurements ({BOARD_METRICS.map((m) => m.label.toLowerCase()).join(", ")}); a filled dot has at least one reading.
            </InfoTip>
          </span>
        }
        actions={
          <button onClick={() => setShowNew(!showNew)} className={btnPrimary} style={btnPrimaryStyle}>
            <Icon name="plus" className="w-4 h-4" strokeWidth={2.2} />New board
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <SearchBox value={search} onChange={setSearch} placeholder="Year, brand, model, size" />
        {boards.length > 0 && (
          <FilterPills value={discipline} onChange={setDiscipline} options={[
            { key: "", label: "All", count: boards.length },
            ...BOARD_DISCIPLINES.filter((d) => boards.some((b) => b.category === d.key))
              .map((d) => ({ key: d.key as string, label: d.label, count: boards.filter((b) => b.category === d.key).length, tone: "sky" as const })),
          ]} />
        )}
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-500" style={{ border: "1px solid var(--admin-border)" }}>{error}</div>}

      {showNew && (
        <Card title="New board" icon="board" tone="sky" className="mb-6"
          subtitle={newTitle ? `Will be called: ${newTitle}` : "Called by year, brand, model and size"}>
          <div className="grid grid-cols-2 sm:grid-cols-[90px_1fr_1fr_110px] gap-3 mb-4">
            <div><label className={labelCls}>Year</label>
              <input className={inputCls} inputMode="numeric" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
            <div><label className={labelCls}>Brand</label>
              <input className={inputCls} value={form.brand} autoFocus placeholder="FMX" onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
            <div><label className={labelCls}>Model</label>
              <input className={inputCls} value={form.model} placeholder="Slalom" onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
            <div><label className={labelCls}>Size</label>
              <input className={inputCls} value={form.size} placeholder="85" onChange={(e) => setForm({ ...form, size: e.target.value })} /></div>
          </div>

          <div className="mb-4">
            <label className={labelCls}>Whose board</label>
            <div className="flex flex-wrap gap-1.5">
              {BOARD_ORIGINS.map((o) => {
                const on = form.origin === o.key;
                const m = ORIGIN_META[o.key];
                return (
                  <button key={o.key} onClick={() => setForm({ ...form, origin: o.key })} aria-pressed={on}
                    className="pd-tone inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                    style={{
                      ...toneVars(m.tone),
                      ...(on ? { backgroundColor: "var(--tone-bg)", color: "var(--tone)", border: "1px solid var(--tone-line)" }
                        : { border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }),
                    }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--tone)" }} />{o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div><label className={labelCls}>Discipline</label>
              <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as BoardCategory })}>
                {BOARD_DISCIPLINES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select></div>
            <div><label className={labelCls}>Volume (l)</label>
              <input className={inputCls} inputMode="decimal" value={form.volume_l} onChange={(e) => setForm({ ...form, volume_l: e.target.value })} /></div>
            <div><label className={labelCls} title="Which end the tape hooks on.">Measure from</label>
              <select className={inputCls} value={form.station_origin}
                onChange={(e) => setForm({ ...form, station_origin: e.target.value as "tail" | "nose" })}>
                <option value="tail">the tail</option>
                <option value="nose">the nose</option>
              </select></div>
            <div><label className={labelCls}>Own name (optional)</label>
              <input className={inputCls} value={form.name} placeholder={newTitle || "only if you want one"}
                onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!(form.name.trim() || newTitle.trim()) || creating} className={btnPrimary} style={btnPrimaryStyle}>
              {creating ? "Creating…" : "Create board"}
            </button>
            <button onClick={() => setShowNew(false)} className={btnSecondary} style={btnSecondaryStyle}>Cancel</button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : shown.length === 0 ? (
        <Empty icon="board" tone="sky" title={search || discipline ? "No board matches that" : "No boards yet"}>
          {search || discipline ? "Try another word or filter." : "Start with a board you can put a straightedge on, yours or somebody else's."}
        </Empty>
      ) : (
        <div className="space-y-8">
          {byYear.map((g) => (
            <section key={g.year ?? "none"}>
              <div className="flex items-baseline gap-2 mb-3">
                <h2 className="text-lg font-bold admin-heading tabular-nums">{g.year ?? "No year"}</h2>
                <span className="text-xs admin-faint">{g.rows.length} board{g.rows.length === 1 ? "" : "s"}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {g.rows.map((b) => <BoardCard key={b.id} b={b} scale={scale} onArchive={() => handleArchive(b)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function BoardCard({ b, scale, onArchive }: { b: BoardRow; scale: { len: number; wid: number }; onArchive: () => void }) {
  const measured = new Set(b.measured ?? []);
  const hasOutline = (b.outline?.w.length ?? 0) >= 2 || (b.outline?.wt.length ?? 0) >= 2;
  const widest = Math.max(0, ...(b.outline?.wt.length ? b.outline.wt : b.outline?.w ?? []).map(([, w]) => w));
  const facts = [
    b.length_cm ? `${b.length_cm} cm long` : null,
    widest ? `${widest} cm wide` : b.max_width_cm ? `${b.max_width_cm} cm wide` : null,
    b.volume_l ? `${b.volume_l} l` : null,
  ].filter(Boolean);
  return (
    <div className="group relative rounded-2xl overflow-hidden transition-shadow hover:shadow-lg"
      style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <Link href={`/admin/product-dev/boards/${b.id}`} className="block">
        <div className="h-32 px-4 flex items-center justify-center" style={{ backgroundColor: "var(--admin-bg)" }}>
          {hasOutline ? (
            <BoardOutlineThumb width={b.outline!.w} widthTop={b.outline!.wt} lengthCm={b.length_cm ?? b.last_station} origin={b.station_origin}
              scaleCm={scale.len} maxWidthCm={scale.wid} tone={ORIGIN_META[b.origin]?.tone ?? "sky"} className="w-full h-full" />
          ) : (
            <span className="text-xs admin-faint">No widths yet, so no outline</span>
          )}
        </div>
        <div className="p-4">
          <p className="text-[15px] font-bold admin-heading leading-snug group-hover:text-[var(--admin-accent)] transition-colors">
            <BoardName board={b} />
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <OriginChip origin={b.origin} />
            <Tag>{disciplineLabel(b.category)}</Tag>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="flex items-center gap-[3px]" aria-hidden>
              {BOARD_METRICS.map((m) => (
                <span key={m.key} title={`${m.label}${measured.has(m.key) ? "" : ": not measured"}`}
                  className="w-2 h-2 rounded-full"
                  style={measured.has(m.key) ? { backgroundColor: m.color } : { border: "1px solid var(--admin-border-strong)" }} />
              ))}
            </span>
            <span className="text-xs admin-muted tabular-nums">{b.readings} reading{b.readings === 1 ? "" : "s"}</span>
          </div>
          {facts.length > 0 && <p className="text-xs admin-faint mt-1.5">{facts.join(" · ")}</p>}
        </div>
      </Link>
      <button onClick={onArchive} title="Archive"
        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg inline-flex items-center justify-center admin-faint hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        <Icon name="archive" className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
