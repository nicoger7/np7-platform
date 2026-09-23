"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cdnImage, keyUrl } from "@/lib/img";
import { BoardPlan, BoardReadout } from "@/components/admin/board-plan";
import { BoardMeasureGrid, ImportDialog } from "@/components/admin/board-measure-grid";
import { BoardNotes, NoteComposer } from "@/components/admin/board-notes";
import { BoardCutouts } from "@/components/admin/board-cutouts";
import { BoardPictureFinder } from "@/components/admin/board-picture-finder";
import { BoardResearchTab } from "@/components/admin/board-research";
import {
  BOARD_DISCIPLINES, BOARD_METRICS, BOARD_ORIGINS, boardTitle, disciplineLabel, effectiveValue, metricUnit, round, toMm, topPhoto,
  type BoardCategory, type BoardOrigin, type BoardPhoto,
  type PdBoard, type PdBoardCutout, type PdBoardNote, type PdBoardPoint, type PdBoardSeries,
} from "@/lib/board-measurements";
import {
  BoardName, Card, Chip, Empty, Fact, Icon, ORIGIN_META, OriginChip, PageHeader, SaveNote, Tabs, Tag,
  btnPrimary, btnPrimaryStyle, btnSecondary, btnSecondaryStyle, btnSmall, inputCls, labelCls, toneVars,
  type TabDef,
} from "@/components/admin/pd-ui";
import { BoardOutlineThumb, BoardPhotoThumb, type WidthPair } from "@/components/admin/pd-thumbs";

type Bundle = PdBoard & {
  series: PdBoardSeries[];
  points: PdBoardPoint[];
  cutouts: PdBoardCutout[];
  note_rows: PdBoardNote[];
  project: { id: string; name: string; kind: string } | null;
};

type TabKey = "overview" | "measurements" | "plan" | "cutouts" | "photos" | "notes" | "research";

const inputClass = inputCls;
const labelClass = labelCls;

/** Width readings as [station, full width cm], scale and unit applied. */
function widthPairs(d: Bundle, metric: "width" | "width_top"): WidthPair[] {
  const s = d.series.find((x) => x.metric === metric) ?? null;
  const unit = metricUnit(metric, s);
  return d.points.filter((p) => p.metric === metric && p.value != null)
    .map((p) => [p.station, toMm(effectiveValue(p, s) as number, unit) / 10] as WidthPair);
}

export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = (sp.get("tab") ?? "overview") as TabKey;

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

  function setTab(next: TabKey, extra?: Record<string, string>) {
    if (dirtyRef.current && !confirm("You have unsaved changes. Leave and lose them?")) return;
    const q = new URLSearchParams(Array.from(sp.entries()));
    q.set("tab", next);
    q.delete("find");
    for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }
  // Straight to the picture search, already searching (the 2D plan's and the
  // header's "Find a top view").
  const findPicture = () => setTab("photos", { find: "1" });

  if (loading) return <div className="py-12 text-center text-sm admin-faint">Loading…</div>;
  if (error || !d) return <div className="py-12 text-center text-sm text-red-500">{error || "Not found."}</div>;

  const readings = d.points.filter((p) => p.value != null).length;
  const w = widthPairs(d, "width"), wt = widthPairs(d, "width_top");
  const lastStation = Math.max(0, ...d.points.filter((p) => p.value != null).map((p) => p.station));
  const tone = ORIGIN_META[d.origin]?.tone ?? "sky";

  const tabs: TabDef<TabKey>[] = [
    { key: "overview", label: "Overview", icon: "overview", tone: "slate" },
    { key: "measurements", label: "Measurements", icon: "ruler", tone: "sky", count: readings },
    { key: "plan", label: "2D plan", icon: "plan", tone: "indigo" },
    { key: "cutouts", label: "Cut-outs", icon: "cut", tone: "orange", count: d.cutouts.length },
    { key: "photos", label: "Photos", icon: "camera", tone: "pink", count: d.photos?.length ?? 0 },
    { key: "notes", label: "Notes", icon: "note", tone: "amber", count: d.note_rows.length },
    { key: "research", label: "Research", icon: "search", tone: "teal" },
  ];
  const top = topPhoto(d.photos);

  return (
    <div>
      <PageHeader
        back={{ href: "/admin/product-dev/boards", label: "Boards" }}
        thumb={
          // The picture is also the way to the picture finder: a board without
          // a top view says so right where the picture would be.
          <button onClick={() => (top ? setTab("photos") : findPicture())} title={top ? "Photos" : "Find a top-view picture: searches straight away"}
            className="group relative w-[176px] h-[72px] rounded-2xl px-2 flex items-center justify-center transition-shadow hover:shadow-md"
            style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
            {top
              ? <BoardPhotoThumb photo={top} width={400} />
              : w.length >= 2 || wt.length >= 2
                ? <BoardOutlineThumb width={w} widthTop={wt} lengthCm={d.length_cm ?? lastStation} origin={d.station_origin} tone={tone} className="w-full h-full" />
                : <Icon name="board" className="w-8 h-8 admin-faint" strokeWidth={1.4} />}
            {!top && (
              <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <Chip tone="pink" icon="search">Find a top view</Chip>
              </span>
            )}
          </button>
        }
        title={<BoardName board={d} />}
        chips={
          <>
            <OriginChip origin={d.origin} />
            <Tag>{disciplineLabel(d.category)}</Tag>
            <Tag>measured from the {d.station_origin}</Tag>
            {d.project && (
              <Link href={`/admin/product-dev/projects/${d.project.id}`} className="hover:opacity-80">
                <Chip tone="violet" icon="layers">{d.project.name}</Chip>
              </Link>
            )}
          </>
        }
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "overview" && <OverviewTab board={d} onSaved={load} goMeasure={() => setTab("measurements")} />}
      {tab === "measurements" && (
        <>
          <BoardReadout board={d} series={d.series} points={d.points} />
          <BoardMeasureGrid board={d} series={d.series} points={d.points} onSaved={load} />
        </>
      )}
      {tab === "plan" && (
        <>
          <BoardReadout board={d} series={d.series} points={d.points} />
          <BoardPlan board={d} series={d.series} points={d.points} cutouts={d.cutouts} onFindPicture={findPicture} onChanged={load} />
        </>
      )}
      {tab === "cutouts" && <BoardCutouts board={d} cutouts={d.cutouts} onSaved={load} dirtyRef={dirtyRef} />}
      {tab === "photos" && <PhotosTab board={d} onSaved={load} autoFind={sp.get("find") === "1"} />}
      {tab === "notes" && <BoardNotes board={d} notes={d.note_rows} onChanged={load} />}
      {tab === "research" && <BoardResearchTab board={d} onChanged={load} />}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({ board, onSaved, goMeasure }: { board: Bundle; onSaved: () => void; goMeasure: () => void }) {
  // The composer sits at the top of the FIRST page: "it will be the easiest
  // way to enter stuff." The board's details come after it.
  const [fileText, setFileText] = useState<string | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const t = boardTitle(board);
  // Filled by the web search (only while the value is still the one it found).
  const web = (field: string): string | undefined => {
    const r = board.research;
    if (!r?.filled?.includes(field)) return undefined;
    const spec = { length_cm: "length_cm", max_width_cm: "width_cm", volume_l: "volume_l", weight_kg: "weight_kg", tail_width_cm: "tail_width_cm", fin_box: "fin_box", construction: "construction" }[field] as keyof typeof r.specs | undefined;
    const found = spec ? r.specs[spec] : null;
    const cur = (board as unknown as Record<string, unknown>)[field];
    if (found == null || String(found) !== String(cur)) return undefined;
    let host = "";
    try { host = r.specs.source_url ? new URL(r.specs.source_url).hostname.replace(/^www\./, "") : ""; } catch { /* no url */ }
    return host ? `from the web, ${host}` : "from the web";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5">
      <div className="space-y-5 min-w-0">
        <Card title="Quick entry" icon="paste" tone="violet" subtitle="Paste a measuring session, write a note or record one">
          <NoteComposer key={composerKey} board={board} onSaved={onSaved} onFile={setFileText} />
        </Card>
        {fileText != null && (
          <ImportDialog board={board} initialText={fileText} onClose={() => setFileText(null)}
            onDone={() => { setFileText(null); setComposerKey((k) => k + 1); onSaved(); }} />
        )}

        {editing
          ? <DetailsForm board={board} onDone={(saved) => { setEditing(false); if (saved) onSaved(); }} />
          : (
            <Card title="Details" icon="board" tone="sky"
              actions={<button onClick={() => setEditing(true)} className={btnSmall}><Icon name="edit" className="w-3.5 h-3.5" />Edit details</button>}>
              {(t.guessed.model || t.guessed.size) && (
                <div className="mb-4 px-3 py-2 rounded-xl text-xs flex flex-wrap items-center gap-2" style={{ backgroundColor: "var(--admin-bg)" }}>
                  <Icon name="info" className="w-4 h-4 admin-faint" />
                  <span className="admin-muted flex-1 min-w-[200px]">
                    {[t.guessed.model && `Model "${t.model}"`, t.guessed.size && `size "${t.size}"`].filter(Boolean).join(" and ")} {t.guessed.model && t.guessed.size ? "are" : "is"} read from the typed name, not saved yet.
                  </span>
                  <button onClick={() => setEditing(true)} className={btnSmall}>Check and save</button>
                </div>
              )}
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                <Fact label="Year" value={board.year} />
                <Fact label="Brand" value={board.brand} />
                <Fact label="Model" value={t.model} hint={t.guessed.model ? "from the name" : undefined} />
                <Fact label="Size" value={t.size} hint={t.guessed.size ? "from the name" : undefined} />
                <Fact label="Volume" value={board.volume_l ? `${board.volume_l} l` : null} hint={web("volume_l")} />
                <Fact label="Length" value={board.length_cm ? `${board.length_cm} cm` : null} hint={web("length_cm")} />
                <Fact label="Max width" value={board.max_width_cm ? `${board.max_width_cm} cm` : null} hint={web("max_width_cm") ?? "overall, rail to rail"} />
                <Fact label="Tail width" value={board.tail_width_cm ? `${board.tail_width_cm} cm` : null} hint={web("tail_width_cm")} />
                <Fact label="Weight" value={board.weight_kg ? `${board.weight_kg} kg` : null} hint={web("weight_kg")} />
                <Fact label="Construction" value={board.construction} hint={web("construction")} />
                <Fact label="Fin box" value={board.fin_box} hint={web("fin_box")} />
                <Fact label="Measured" value={board.measured_at ? new Date(board.measured_at).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" }) : null}
                  hint={board.measured_by ? `by ${board.measured_by}` : undefined} />
              </dl>
              {board.summary && <p className="mt-4 text-sm admin-heading leading-relaxed whitespace-pre-wrap">{board.summary}</p>}
              {board.notes && (
                <div className="mt-3 p-3 rounded-xl text-xs admin-muted leading-relaxed whitespace-pre-wrap" style={{ backgroundColor: "var(--admin-bg)" }}>
                  <span className="block text-[11px] font-semibold admin-faint mb-1">Internal notes</span>
                  {board.notes}
                </div>
              )}
            </Card>
          )}
      </div>

      <div className="min-w-0">
        <Card title="Measured so far" icon="ruler" tone="sky"
          actions={<button onClick={goMeasure} className={btnSmall}>Open<Icon name="chevron" className="w-3.5 h-3.5" /></button>}>
          <MetricCoverage board={board} />
        </Card>
      </div>
    </div>
  );
}

/**
 * One row per measurement in the catalog, in its own colour: how many readings,
 * the range, and a bar showing where along the board they were taken. The ones
 * never measured stay in the list, faint, because "not measured" is an answer.
 */
function MetricCoverage({ board }: { board: Bundle }) {
  const span = Math.max(board.length_cm ?? 0, ...board.points.map((p) => p.station), 1);
  return (
    <ul className="space-y-2.5">
      {BOARD_METRICS.map((m) => {
        const s = board.series.find((x) => x.metric === m.key) ?? null;
        const read = board.points.filter((p) => p.metric === m.key && p.value != null);
        const unit = metricUnit(m.key, s);
        const vals = read.map((p) => effectiveValue(p, s) as number);
        const stations = read.map((p) => p.station);
        return (
          <li key={m.key} className={read.length ? "" : "opacity-45"}>
            <div className="flex items-baseline gap-2">
              <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ backgroundColor: m.color }} />
              <span className="text-xs font-semibold admin-heading">{m.label}</span>
              <span className="ml-auto text-[11px] admin-faint tabular-nums">
                {read.length ? `${read.length} · ${round(Math.min(...vals), 1)} to ${round(Math.max(...vals), 1)} ${unit}` : "not measured"}
              </span>
            </div>
            <div className="relative h-1.5 mt-1 ml-4 rounded-full" style={{ backgroundColor: "var(--admin-border)" }}>
              {stations.map((st) => (
                <span key={st} className="absolute top-0 h-1.5 w-1 rounded-full" title={`${st} cm`}
                  style={{ left: `calc(${(st / span) * 100}% - 2px)`, backgroundColor: m.color }} />
              ))}
            </div>
          </li>
        );
      })}
      <li className="text-[10px] admin-faint pt-1">Bars run from the {board.station_origin} (left) along the board.</li>
    </ul>
  );
}

function DetailsForm({ board, onDone }: { board: Bundle; onDone: (saved: boolean) => void }) {
  const t = boardTitle(board);
  const [form, setForm] = useState({
    name: board.name, brand: board.brand ?? "", model: board.model ?? "", size: board.size ?? "",
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
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function save() {
    setSaving(true); setMsg("");
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        model: form.model.trim() || null, size: form.size.trim() || null,
        year: num(form.year), volume_l: num(form.volume_l), length_cm: num(form.length_cm),
        max_width_cm: num(form.max_width_cm), tail_width_cm: num(form.tail_width_cm), weight_kg: num(form.weight_kg),
        measured_at: form.measured_at || null,
      }),
    });
    setSaving(false);
    if (res.ok) onDone(true);
    else setMsg((await res.json().catch(() => ({}))).error || "Save failed. Your changes are NOT stored.");
  }

  const guessed = (t.guessed.model && !form.model) || (t.guessed.size && !form.size);

  return (
    <Card title="Edit details" icon="edit" tone="sky">
      <p className="text-[11px] font-semibold admin-faint mb-2">The name: year, brand, model, size</p>
      <div className="grid grid-cols-2 sm:grid-cols-[90px_1fr_1fr_110px] gap-3 mb-2">
        <div><label className={labelClass}>Year</label><input className={inputClass} inputMode="numeric" value={form.year} onChange={set("year")} /></div>
        <div><label className={labelClass}>Brand</label><input className={inputClass} value={form.brand} onChange={set("brand")} /></div>
        <div><label className={labelClass}>Model</label><input className={inputClass} value={form.model} placeholder={t.guessed.model ? t.model ?? "" : ""} onChange={set("model")} /></div>
        <div><label className={labelClass}>Size</label><input className={inputClass} value={form.size} placeholder={t.guessed.size ? t.size ?? "" : ""} onChange={set("size")} /></div>
      </div>
      {guessed && (
        <button className={`${btnSmall} mb-2`}
          onClick={() => setForm({ ...form, model: form.model || (t.guessed.model ? t.model ?? "" : ""), size: form.size || (t.guessed.size ? t.size ?? "" : "") })}>
          <Icon name="check" className="w-3.5 h-3.5" />Use what the typed name says ({[t.guessed.model && t.model, t.guessed.size && t.size].filter(Boolean).join(", ")})
        </button>
      )}
      <p className="text-[11px] admin-faint mb-5">Shown as: {boardTitle({ name: form.name, brand: form.brand || null, model: form.model || null, size: form.size || null, year: num(form.year) }).text}</p>

      <div className="mb-4">
        <label className={labelClass}>Whose board</label>
        <div className="flex flex-wrap gap-1.5">
          {BOARD_ORIGINS.map((o) => {
            const on = form.origin === o.key;
            const m = ORIGIN_META[o.key];
            return (
              <button key={o.key} onClick={() => setForm({ ...form, origin: o.key as BoardOrigin })} aria-pressed={on}
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div><label className={labelClass}>Discipline</label>
          <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as BoardCategory })}>
            {BOARD_DISCIPLINES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select></div>
        <div><label className={labelClass} title="Which end the tape hooks on. Every station on this board is read from it.">Stations measured from</label>
          <select className={inputClass} value={form.station_origin}
            onChange={(e) => setForm({ ...form, station_origin: e.target.value as "tail" | "nose" })}>
            <option value="tail">the tail</option>
            <option value="nose">the nose</option>
          </select></div>
        <div><label className={labelClass}>Own name (optional)</label>
          <input className={inputClass} value={form.name} onChange={set("name")} /></div>
      </div>

      <p className="text-[11px] font-semibold admin-faint mb-2">The headline numbers</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <div><label className={labelClass}>Volume (l)</label><input className={inputClass} value={form.volume_l} onChange={set("volume_l")} /></div>
        <div><label className={labelClass}>Length (cm)</label><input className={inputClass} value={form.length_cm} onChange={set("length_cm")} /></div>
        <div><label className={labelClass} title="Overall widest point, rail to rail. Not the bottom width, which is a series on the Measurements tab.">Max width (cm)</label>
          <input className={inputClass} value={form.max_width_cm} onChange={set("max_width_cm")} /></div>
        <div><label className={labelClass}>Tail width (cm)</label><input className={inputClass} value={form.tail_width_cm} onChange={set("tail_width_cm")} /></div>
        <div><label className={labelClass}>Weight (kg)</label><input className={inputClass} value={form.weight_kg} onChange={set("weight_kg")} /></div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="col-span-2"><label className={labelClass}>Construction</label>
          <input className={inputClass} value={form.construction} placeholder="e.g. full carbon sandwich" onChange={set("construction")} /></div>
        <div><label className={labelClass}>Fin box</label>
          <input className={inputClass} value={form.fin_box} placeholder="Deep Tuttle" onChange={set("fin_box")} /></div>
        <div><label className={labelClass}>Measured on</label>
          <input type="date" className={inputClass} value={form.measured_at} onChange={set("measured_at")} /></div>
        <div className="col-span-2 sm:col-span-4"><label className={labelClass}>Measured by</label>
          <input className={inputClass} value={form.measured_by} onChange={set("measured_by")} /></div>
      </div>

      <div className="mb-4"><label className={labelClass}>Summary</label>
        <textarea className={`${inputClass} min-h-[80px]`} value={form.summary}
          placeholder="What this board is and why it is worth having the numbers for." onChange={set("summary")} /></div>
      <div className="mb-4"><label className={labelClass}>Internal notes</label>
        <textarea className={`${inputClass} min-h-[70px]`} value={form.notes} onChange={set("notes")} /></div>

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className={btnPrimary} style={btnPrimaryStyle}>{saving ? "Saving…" : "Save"}</button>
        <button onClick={() => onDone(false)} className={btnSecondary} style={btnSecondaryStyle}>Cancel</button>
        <SaveNote msg={msg} />
      </div>
    </Card>
  );
}

// ─── Photos ──────────────────────────────────────────────────────────────────

function PhotosTab({ board, onSaved, autoFind }: { board: Bundle; onSaved: () => void; autoFind?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<BoardPhoto[]>(board.photos ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cutting, setCutting] = useState<string | null>(null);
  const [cutNote, setCutNote] = useState("");

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

  function makeTop(i: number) {
    persist(photos.map((p, j) => ({ ...p, kind: j === i ? (p.kind === "top" ? null : "top") : p.kind === "top" ? null : p.kind ?? null })));
  }

  // Deck → bottom → not said, set by a person (the AI's word can be wrong).
  function cycleView(i: number) {
    const next = (v: BoardPhoto["view"]) => (v === "deck" ? "bottom" : v === "bottom" ? null : "deck");
    persist(photos.map((p, j) => (j === i ? { ...p, view: next(p.view), viewBy: "person" } : p)));
  }

  // A photo showing several boards (an upload, or kept before this existed):
  // the same cut-apart the picture finder does on keeping.
  async function cutApart(p: BoardPhoto) {
    setCutting(p.key); setError(""); setCutNote("");
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/images`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: p.key }),
    });
    const j = await res.json().catch(() => ({}));
    setCutting(null);
    if (!res.ok) { setError(j.error ?? "Couldn't cut that picture apart."); return; }
    setPhotos(j.photos ?? photos);
    setCutNote(j.note ?? "");
    onSaved();
  }

  return (
    <div className="space-y-5">
      <BoardPictureFinder board={{ ...board, photos }} autoStart={autoFind} onSaved={(next) => { setPhotos(next); onSaved(); }} />

      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} disabled={busy} className={btnPrimary} style={btnPrimaryStyle}>
          <Icon name="upload" className="w-4 h-4" />{busy ? "Uploading…" : "Add photos"}
        </button>
        <span className="text-xs admin-faint">Kept in Product Dev only, never in the Experience or Hardware pickers.</span>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {cutNote && <p className="text-xs admin-muted">{cutNote}</p>}

      {!photos.length ? (
        <Empty icon="camera" tone="pink" title="No photos yet">
          The useful ones are the tail, the rails and anything the numbers can&apos;t say.
        </Empty>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((p, i) => (
            <figure key={p.key} className="group relative rounded-2xl overflow-hidden" style={{ border: p.kind === "top" ? "2px solid var(--admin-accent)" : "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <a href={keyUrl(p.key)} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cdnImage(keyUrl(p.key), { width: 500 })} alt={p.caption ?? ""} className="w-full aspect-[4/3] object-cover" />
              </a>
              <figcaption className="p-2">
                <input
                  className="w-full bg-transparent text-xs admin-muted focus:outline-none focus:text-[var(--admin-accent)]"
                  value={p.caption ?? ""} placeholder="Add a caption"
                  onChange={(e) => setPhotos(photos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
                  onBlur={() => persist(photos)} />
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => makeTop(i)} className={`text-[11px] font-semibold ${p.kind === "top" ? "text-[var(--admin-accent)]" : "admin-faint hover:text-[var(--admin-accent)]"}`}>
                    {p.kind === "top" ? "Shown in lists" : "Show in lists"}
                  </button>
                  <button onClick={() => cycleView(i)}
                    title={p.view ? `${p.view === "deck" ? "Deck" : "Bottom"}${p.viewBy === "ai" ? ", said by the AI" : p.viewBy === "guess" ? ", a guess from the order" : ""}. Click to change.` : "Which face it shows. Click to set."}
                    className={`text-[11px] font-semibold ${p.view ? (p.viewBy === "guess" ? "text-amber-600" : "admin-muted") : "admin-faint"} hover:text-[var(--admin-accent)]`}>
                    {p.view === "deck" ? "Deck" : p.view === "bottom" ? "Bottom" : "Face?"}{p.viewBy === "guess" ? "?" : ""}
                  </button>
                  {!p.cutFrom && !photos.some((x) => x.cutFrom === p.key) && (
                    <button onClick={() => cutApart(p)} disabled={!!cutting}
                      title="For a picture with several boards in it, e.g. the deck and the bottom side by side: one picture per board, and the deck becomes the top view."
                      className="text-[11px] font-semibold admin-faint hover:text-[var(--admin-accent)]">
                      {cutting === p.key ? "Cutting…" : "Cut apart"}
                    </button>
                  )}
                  {p.source && (
                    <a href={p.source} target="_blank" rel="noreferrer" className="ml-auto text-[11px] admin-faint hover:text-[var(--admin-accent)] truncate">source</a>
                  )}
                </div>
              </figcaption>
              <button onClick={() => { if (confirm("Remove this photo from the board?")) persist(photos.filter((_, j) => j !== i)); }}
                title="Remove"
                className="absolute top-2 right-2 w-7 h-7 rounded-lg inline-flex items-center justify-center admin-faint hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                <Icon name="x" className="w-3.5 h-3.5" />
              </button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
