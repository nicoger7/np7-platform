"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cdnImage, keyUrl } from "@/lib/img";
import { BoardPlan, BoardReadout } from "@/components/admin/board-plan";
import { BoardMeasureGrid, ImportDialog, SeriesSummary } from "@/components/admin/board-measure-grid";
import { BoardNotes, NoteComposer } from "@/components/admin/board-notes";
import { BoardCutouts } from "@/components/admin/board-cutouts";
import {
  BOARD_DISCIPLINES, BOARD_ORIGINS, disciplineLabel,
  type BoardCategory, type BoardOrigin, type BoardPhoto,
  type PdBoard, type PdBoardCutout, type PdBoardNote, type PdBoardPoint, type PdBoardSeries,
} from "@/lib/board-measurements";

type Bundle = PdBoard & {
  series: PdBoardSeries[];
  points: PdBoardPoint[];
  cutouts: PdBoardCutout[];
  note_rows: PdBoardNote[];
  project: { id: string; name: string; kind: string } | null;
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "measurements", label: "Measurements" },
  { key: "plan", label: "2D plan" },
  { key: "cutouts", label: "Cut-outs" },
  { key: "photos", label: "Photos" },
  { key: "notes", label: "Notes" },
] as const;

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
const labelClass = "block text-xs font-medium admin-muted mb-1";

export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const sp = useSearchParams();
  const tab = (sp.get("tab") ?? "overview") as (typeof TABS)[number]["key"];

  const [d, setD] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const dirtyRef = useRef(false);

  function load() {
    fetch(`/api/admin/product-dev/boards/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((data) => { setD(data); setLoading(false); })
      .catch(() => { setError("Couldn't load that board."); setLoading(false); });
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function setTab(next: string) {
    if (dirtyRef.current && !confirm("You have unsaved changes. Leave and lose them?")) return;
    const q = new URLSearchParams(Array.from(sp.entries()));
    q.set("tab", next);
    router.replace(`/admin/product-dev/boards/${id}?${q.toString()}`, { scroll: false });
  }

  if (loading) return <div className="py-12 text-center text-sm admin-faint">Loading…</div>;
  if (error || !d) return <div className="py-12 text-center text-sm text-red-400">{error || "Not found."}</div>;

  const readings = d.points.filter((p) => p.value != null).length;

  return (
    <div>
      <div className="mb-5">
        <Link href="/admin/product-dev/boards" className="text-xs admin-faint hover:text-[var(--admin-accent)] transition-colors">
          ← Boards
        </Link>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold admin-heading">{d.name}</h1>
            <p className="text-sm admin-muted">
              {[d.brand, d.year, disciplineLabel(d.category)].filter(Boolean).join(" · ")}
              {" · "}{readings} reading{readings === 1 ? "" : "s"}
              {" · measured from the "}{d.station_origin}
              {d.project && (
                <>
                  {" · "}
                  <Link href={`/admin/product-dev/projects/${d.project.id}`} className="hover:text-[var(--admin-accent)]">
                    {d.project.name}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-6 overflow-x-auto" style={{ borderBottom: "1px solid var(--admin-border)" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${tab === t.key ? "admin-heading" : "admin-faint hover:admin-muted"}`}
            style={tab === t.key ? { borderBottom: "2px solid var(--admin-accent)", marginBottom: "-1px" } : undefined}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab board={d} onSaved={load} />}
      {tab === "measurements" && (
        <>
          <BoardReadout board={d} series={d.series} points={d.points} />
          <BoardMeasureGrid board={d} series={d.series} points={d.points} onSaved={load} />
        </>
      )}
      {tab === "plan" && (
        <>
          <BoardReadout board={d} series={d.series} points={d.points} />
          <BoardPlan board={d} series={d.series} points={d.points} cutouts={d.cutouts} />
        </>
      )}
      {tab === "cutouts" && <BoardCutouts board={d} cutouts={d.cutouts} onSaved={load} dirtyRef={dirtyRef} />}
      {tab === "photos" && <PhotosTab board={d} onSaved={load} />}
      {tab === "notes" && <BoardNotes board={d} notes={d.note_rows} onChanged={load} />}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({ board, onSaved }: { board: Bundle; onSaved: () => void }) {
  // The composer sits at the top of the FIRST page: "it will be the easiest
  // way to enter stuff." The board's details come after it.
  const [fileText, setFileText] = useState<string | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [form, setForm] = useState({
    name: board.name, brand: board.brand ?? "", model: board.model ?? "",
    year: board.year == null ? "" : String(board.year),
    category: board.category, origin: board.origin,
    volume_l: board.volume_l == null ? "" : String(board.volume_l),
    length_cm: board.length_cm == null ? "" : String(board.length_cm),
    max_width_cm: board.max_width_cm == null ? "" : String(board.max_width_cm),
    tail_width_cm: board.tail_width_cm == null ? "" : String(board.tail_width_cm),
    weight_kg: board.weight_kg == null ? "" : String(board.weight_kg),
    construction: board.construction ?? "", fin_box: board.fin_box ?? "",
    station_origin: board.station_origin, measured_at: board.measured_at ?? "",
    measured_by: board.measured_by ?? "", summary: board.summary ?? "", notes: board.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));

  async function save() {
    setSaving(true); setMsg("");
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        year: num(form.year), volume_l: num(form.volume_l), length_cm: num(form.length_cm),
        max_width_cm: num(form.max_width_cm), tail_width_cm: num(form.tail_width_cm), weight_kg: num(form.weight_kg),
        measured_at: form.measured_at || null,
      }),
    });
    setSaving(false);
    if (res.ok) { setMsg("Saved."); onSaved(); setTimeout(() => setMsg(""), 2000); }
    else setMsg((await res.json().catch(() => ({}))).error || "Save failed — your changes are NOT stored.");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
      <div className="max-w-3xl">
        <div className="mb-6 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-2">Enter measurements or a note</h3>
          <NoteComposer key={composerKey} board={board} onSaved={onSaved} onFile={setFileText} />
        </div>
        {fileText != null && (
          <ImportDialog board={board} initialText={fileText} onClose={() => setFileText(null)}
            onDone={() => { setFileText(null); setComposerKey((k) => k + 1); onSaved(); }} />
        )}

        <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-3">Board details</h3>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mb-4">
          <div className="col-span-2 sm:col-span-3"><label className={labelClass}>Name</label>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className={labelClass}>Brand</label>
            <input className={inputClass} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
          <div><label className={labelClass}>Year</label>
            <input className={inputClass} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>

          <div className="sm:col-span-2"><label className={labelClass}>Discipline</label>
            <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as BoardCategory })}>
              {BOARD_DISCIPLINES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select></div>
          <div className="sm:col-span-2"><label className={labelClass}>Whose board</label>
            <select className={inputClass} value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value as BoardOrigin })}>
              {BOARD_ORIGINS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select></div>
          <div className="sm:col-span-2"><label className={labelClass} title="Which end the tape hooks on. Every station on this board is read from it.">
            Stations measured from</label>
            <select className={inputClass} value={form.station_origin}
              onChange={(e) => setForm({ ...form, station_origin: e.target.value as "tail" | "nose" })}>
              <option value="tail">the tail</option>
              <option value="nose">the nose</option>
            </select></div>
        </div>

        <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-2 mt-6">The headline numbers</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
          <div><label className={labelClass}>Volume (l)</label>
            <input className={inputClass} value={form.volume_l} onChange={(e) => setForm({ ...form, volume_l: e.target.value })} /></div>
          <div><label className={labelClass}>Length (cm)</label>
            <input className={inputClass} value={form.length_cm} onChange={(e) => setForm({ ...form, length_cm: e.target.value })} /></div>
          <div><label className={labelClass} title="Overall widest point, rail to rail — not the bottom width, which is a series on the Measurements tab.">
            Max width (cm)</label>
            <input className={inputClass} value={form.max_width_cm} onChange={(e) => setForm({ ...form, max_width_cm: e.target.value })} /></div>
          <div><label className={labelClass}>Tail width (cm)</label>
            <input className={inputClass} value={form.tail_width_cm} onChange={(e) => setForm({ ...form, tail_width_cm: e.target.value })} /></div>
          <div><label className={labelClass}>Weight (kg)</label>
            <input className={inputClass} value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} /></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
          <div className="sm:col-span-2"><label className={labelClass}>Construction</label>
            <input className={inputClass} value={form.construction} placeholder="e.g. full carbon sandwich"
              onChange={(e) => setForm({ ...form, construction: e.target.value })} /></div>
          <div><label className={labelClass}>Fin box</label>
            <input className={inputClass} value={form.fin_box} placeholder="Deep Tuttle"
              onChange={(e) => setForm({ ...form, fin_box: e.target.value })} /></div>
          <div><label className={labelClass}>Measured on</label>
            <input type="date" className={inputClass} value={form.measured_at}
              onChange={(e) => setForm({ ...form, measured_at: e.target.value })} /></div>
        </div>

        <div className="mb-4"><label className={labelClass}>Measured by</label>
          <input className={inputClass} value={form.measured_by} onChange={(e) => setForm({ ...form, measured_by: e.target.value })} /></div>
        <div className="mb-4"><label className={labelClass}>Summary</label>
          <textarea className={`${inputClass} min-h-[80px]`} value={form.summary}
            placeholder="What this board is and why it is worth having the numbers for."
            onChange={(e) => setForm({ ...form, summary: e.target.value })} /></div>
        <div className="mb-4"><label className={labelClass}>Internal notes</label>
          <textarea className={`${inputClass} min-h-[70px]`} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
            {saving ? "Saving…" : "Save"}
          </button>
          {msg && <span className={`text-xs ${msg === "Saved." ? "text-green-400" : "text-red-400"}`}>{msg}</span>}
        </div>
      </div>

      <aside>
        <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-3">What has been measured</h3>
        <SeriesSummary series={board.series} points={board.points} />
        <p className="mt-4 text-[11px] admin-faint leading-relaxed">
          Bottom width is a reading per station on the Measurements tab. Max width above is the overall
          widest point including the rails — the two are different numbers and the plan shows both.
        </p>
      </aside>
    </div>
  );
}

// ─── Photos ──────────────────────────────────────────────────────────────────

function PhotosTab({ board, onSaved }: { board: Bundle; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<BoardPhoto[]>(board.photos ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function persist(next: BoardPhoto[]) {
    setPhotos(next);
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photos: next }),
    });
    if (res.ok) onSaved();
    else setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the photo list.");
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError("");
    const added: BoardPhoto[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", `product-dev/boards/${board.id}`);
      const res = await fetch("/api/admin/product-dev/media", { method: "POST", body: fd });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? `Upload failed for ${file.name}.`); break; }
      const { path } = await res.json();
      added.push({ key: path, caption: null });
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (added.length) await persist([...photos, ...added]);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="px-4 py-2 text-sm font-bold rounded-lg disabled:opacity-40"
          style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
          {busy ? "Uploading…" : "Add photos"}
        </button>
        <p className="text-xs admin-faint">
          Stored under <code>product-dev/boards/</code>. They never appear in the Experience or Hardware pickers.
        </p>
      </div>

      {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

      {!photos.length ? (
        <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint">No photos yet. The useful ones are the tail, the rails and anything the numbers can’t say.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((p, i) => (
            <figure key={p.key} className="group relative rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <a href={keyUrl(p.key)} target="_blank" rel="noreferrer">
                <img src={cdnImage(keyUrl(p.key), { width: 500 })} alt={p.caption ?? ""} className="w-full aspect-[4/3] object-cover" />
              </a>
              <figcaption className="p-2">
                <input
                  className="w-full bg-transparent text-[11px] admin-muted focus:outline-none focus:text-[var(--admin-accent)]"
                  value={p.caption ?? ""} placeholder="caption…"
                  onChange={(e) => setPhotos(photos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
                  onBlur={() => persist(photos)} />
              </figcaption>
              <button onClick={() => { if (confirm("Remove this photo from the board?")) persist(photos.filter((_, j) => j !== i)); }}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: "var(--admin-bg)", border: "1px solid var(--admin-border)" }}>✕</button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
