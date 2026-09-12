"use client";

import { useEffect, useRef, useState } from "react";
import { keyUrl } from "@/lib/img";
import { ImportDialog } from "@/components/admin/board-measure-grid";
import {
  BOARD_METRIC_BY_KEY, fmtReading,
  type FiledNote, type ParsedSeries, type PdBoard, type PdBoardNote,
} from "@/lib/board-measurements";

/**
 * The note inbox — "voice-record or write random notes and it puts it into
 * order into the board you're working in".
 *
 * A note has three states and the middle one is the point:
 *
 *   RAW      what was typed or spoken. Never rewritten. A voice note is the
 *            audio file plus whatever transcript you give it; the assistant
 *            does not transcribe (the Claude API takes no audio), so the
 *            transcript is typed or pasted in from the phone's own dictation.
 *   SORTED   the assistant (or the parser, for the station format) has read it
 *            and PROPOSED what it says — measurements, and the bullets that
 *            aren't measurements. Nothing has touched the board yet.
 *   APPLIED  a person pressed Import on the proposal, and the readings are in
 *            the Measurements tab. The note keeps its proposal as the record of
 *            where those readings came from.
 *
 * The API key for the assistant is optional and can be connected later; the
 * station format sorts itself without one, and the note says so when it can't.
 */

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] transition-colors";
const MAX_SEC = 600;

/**
 * The composer: a box you can type a measuring session into, or anything else.
 *
 * Lives on the board's FIRST page as well as here — "it will be the easiest way
 * to enter stuff" — so it is its own component. Two ways out of it:
 *   File into the board  → the importer, review table first, then the readings
 *   Save as note         → the inbox, raw, to sort later
 */
export function NoteComposer({ board, onSaved, onFile }: {
  board: PdBoard;
  onSaved: () => void;
  /** When given, the primary button hands the text to the importer. */
  onFile?: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function addText() {
    if (!text.trim()) return;
    setBusy(true); setError("");
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/notes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "text", body: text }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the note."); return; }
    setText(""); onSaved();
  }

  async function addVoice(blob: Blob, seconds: number) {
    setBusy(true); setError("");
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    const fd = new FormData();
    fd.append("file", new File([blob], `note-${Date.now()}.${ext}`, { type: blob.type || "audio/webm" }));
    fd.append("folder", `product-dev/boards/${board.id}/voice`);
    const up = await fetch("/api/admin/product-dev/media", { method: "POST", body: fd });
    if (!up.ok) { setBusy(false); setError((await up.json().catch(() => ({}))).error ?? "The recording didn't upload."); return; }
    const { path } = await up.json();
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/notes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "voice", audio_key: path, duration_s: seconds }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the note."); return; }
    onSaved();
  }

  const primary = "px-4 py-2 text-xs font-bold rounded-lg disabled:opacity-40";
  const primaryStyle = { backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" };
  const secondary = "px-3 py-2 text-xs font-semibold admin-muted rounded-lg disabled:opacity-40";
  const secondaryStyle = { border: "1px solid var(--admin-border)" };

  return (
    <div>
      <textarea className={`${inputClass} min-h-[150px] font-mono text-xs`} value={text}
        placeholder={"Paste a measuring session — metric heading, one station per line — and file it. Anything else becomes a note.\n\nRocker\n0 - 6mm\n5 - 2mm\n10 - 0\n80 - start\n110 - 4.5mm"}
        onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {onFile && (
          <button onClick={() => onFile(text)} disabled={!text.trim() || busy} className={primary} style={primaryStyle}>
            File into the board
          </button>
        )}
        <button onClick={addText} disabled={!text.trim() || busy}
          className={onFile ? secondary : primary} style={onFile ? secondaryStyle : primaryStyle}>
          Save as note
        </button>
        <Recorder onDone={addVoice} disabled={busy} />
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <p className="mt-3 text-[11px] admin-faint leading-relaxed">
        Filing shows you what it read before anything is written. Voice notes are kept as audio; type the
        transcript in afterwards (your phone&apos;s dictation is the quickest way) and file it like any other.
      </p>
    </div>
  );
}

/**
 * How to write a session so it files first time. Sits beside the composer on
 * the first page, folded under it on the Notes tab. Everything here is a
 * behaviour of parseMeasurementText, so if the parser changes, change this.
 */
export function SessionBrief({ folded = false }: { folded?: boolean }) {
  const body = (
    <div className="text-[12px] admin-muted leading-relaxed space-y-3">
      <div>
        <p className="font-semibold admin-heading mb-1">1 · One metric per block</p>
        <p>
          Start a block with the metric name on its own line. Recognised:{" "}
          <b>Thickness</b>, <b>Width</b> (bottom), <b>Rocker</b>, <b>V</b>, <b>Concave</b> (write <i>double</i> or <i>single</i> in front),{" "}
          <b>Rail thickness</b>, <b>Rail shape</b>. German works too (Dicke, Breite).
        </p>
      </div>
      <div>
        <p className="font-semibold admin-heading mb-1">2 · One station per line</p>
        <p>
          <code>station - value unit</code>, e.g. <code>110 - 4.5mm</code>. The dash is optional, commas as decimals are fine (<code>81,2cm</code>).
          Stations are <b>cm from the tail</b>. A station on its own (<code>20</code>) is kept as &ldquo;still to measure&rdquo;.
        </p>
      </div>
      <div>
        <p className="font-semibold admin-heading mb-1">3 · The tail edge</p>
        <p>
          The tail kick sits in the last few cm. Read the rocker at <b>0</b> and <b>5</b> off the same straightedge, then 10, 20 and so on.
          Where the rocker begins to rise, write the word: <code>80 - start</code>.
        </p>
      </div>
      <div>
        <p className="font-semibold admin-heading mb-1">4 · V and inverted V</p>
        <p>
          Put <i>inverted</i> in the heading (<code>V - inverted</code>) and every reading after it is inverted. Where it changes,
          write a line <code>Normal V from here</code> and the rest is V. Zero is zero either way.
        </p>
      </div>
      <div>
        <p className="font-semibold admin-heading mb-1">5 · Caveats stay caveats</p>
        <p>
          Anything in brackets after a value is kept as a note on that reading: <code>40 2mm (minus the inverted V)</code>.
          A caveat in the heading, like <code>(alles halbieren)</code>, is offered as a tick-box when you file, never applied on its own.
        </p>
      </div>
      <div>
        <p className="font-semibold admin-heading mb-1">6 · Rail shape is a word</p>
        <p>hard, tucked, boxy, soft, 50/50, bevel or chined, with a radius in mm after it if you measured one.</p>
      </div>
      <div>
        <p className="font-semibold admin-heading mb-1">A complete block</p>
        <pre className="text-[11px] font-mono leading-snug p-3 rounded-lg overflow-x-auto" style={{ backgroundColor: "var(--admin-bg)", border: "1px solid var(--admin-border)" }}>{`Rocker
0 - 6mm
5 - 2mm
10 - 0
50 - 0
80 - start
110 - 4.5mm
160 - 35mm

V - inverted (alles halbieren)
10 0.2mm
80 - 0
Normal V from here
90 - 2.9mm
140 - 25mm

Double concave
40 2mm (minus the inverted V)
90 - 1.5mm`}</pre>
      </div>
      <p className="admin-faint">
        Filing always shows the review table first: which metrics it found, every station it read, and what it left alone.
        Nothing is written until you press Import.
      </p>
    </div>
  );

  if (folded) {
    return (
      <details className="mt-4">
        <summary className="text-xs font-semibold admin-muted cursor-pointer">How to write a session</summary>
        <div className="mt-3">{body}</div>
      </details>
    );
  }
  return (
    <div className="p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)" }}>
      <h4 className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-3">How to write a session</h4>
      {body}
    </div>
  );
}

export function BoardNotes({ board, notes, onChanged }: { board: PdBoard; notes: PdBoardNote[]; onChanged: () => void }) {
  const [fileText, setFileText] = useState<string | null>(null);
  const [composerKey, setComposerKey] = useState(0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8">
      <div>
        <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-2">New note</h3>
        <NoteComposer key={composerKey} board={board} onSaved={onChanged} onFile={setFileText} />
        <SessionBrief folded />
      </div>

      <div>
        <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-2">
          {notes.length} note{notes.length === 1 ? "" : "s"}
        </h3>
        {!notes.length ? (
          <div className="py-12 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
            <p className="text-sm admin-faint">Nothing yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => <NoteCard key={n.id} board={board} note={n} onChanged={onChanged} />)}
          </div>
        )}
      </div>

      {fileText != null && (
        <ImportDialog board={board} initialText={fileText} onClose={() => setFileText(null)}
          onDone={() => { setFileText(null); setComposerKey((k) => k + 1); onChanged(); }} />
      )}
    </div>
  );
}

// ─── One note ────────────────────────────────────────────────────────────────

function NoteCard({ board, note, onChanged }: { board: PdBoard; note: PdBoardNote; onChanged: () => void }) {
  const [body, setBody] = useState(note.body ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set((note.filed?.proposals ?? []).map((p) => p.metric)));

  const filed: FiledNote = note.filed ?? {};
  const proposals: ParsedSeries[] = filed.proposals ?? [];

  async function patch(update: Record<string, unknown>) {
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/notes/${note.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update),
    });
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).error ?? "Couldn't update the note."); return false; }
    return true;
  }

  async function saveBody() {
    setBusy(true);
    if (await patch({ body })) { setEditing(false); onChanged(); }
    setBusy(false);
  }

  async function sort() {
    setBusy(true); setMsg("");
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/intake`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noteId: note.id }),
    });
    const j = await res.json().catch(() => ({}));
    if (j.needsKey) { setMsg(j.message); setBusy(false); return; }
    if (!res.ok) { setMsg(j.error ?? "Couldn't sort that."); setBusy(false); return; }
    await patch({ filed: j.filed, status: "sorted" });
    setPicked(new Set((j.filed?.proposals ?? []).map((p: ParsedSeries) => p.metric)));
    setBusy(false); onChanged();
  }

  async function importProposals() {
    setBusy(true); setMsg("");
    const chosen = proposals.filter((p) => picked.has(p.metric));
    const stations = new Set<number>(board.stations ?? []);
    for (const s of chosen) {
      const res = await fetch(`/api/admin/product-dev/boards/${board.id}/measurements`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metric: s.metric,
          series: { metric: s.metric, unit: s.unit ?? BOARD_METRIC_BY_KEY[s.metric]?.unit, variant: s.variant, convention: s.convention, scale: 1, enabled: true },
          points: s.points.map((p) => ({ station: p.station, value: p.value, text_value: p.text, note: p.note })),
        }),
      });
      if (!res.ok) { setMsg(`${s.metric}: ${(await res.json().catch(() => ({}))).error ?? "import failed"}`); setBusy(false); return; }
      for (const p of s.points) stations.add(p.station);
    }
    await fetch(`/api/admin/product-dev/boards/${board.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stations: Array.from(stations).sort((a, b) => a - b) }),
    });
    await patch({ status: "applied" });
    setBusy(false); onChanged();
  }

  async function remove() {
    if (!confirm("Delete this note? This can't be undone.")) return;
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/notes/${note.id}`, { method: "DELETE" });
    if (res.ok) onChanged();
  }

  const STATUS: Record<PdBoardNote["status"], { label: string; cls: string }> = {
    raw: { label: "raw", cls: "admin-faint" },
    sorted: { label: "sorted — waiting for you", cls: "text-amber-400" },
    applied: { label: "in the board", cls: "text-green-400" },
    discarded: { label: "discarded", cls: "admin-faint" },
  };

  return (
    <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold tracking-[0.08em] uppercase admin-faint">
          {note.kind === "voice" ? "🎙 voice" : "text"} · {new Date(note.created_at).toLocaleString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className={`text-[10px] font-semibold ${STATUS[note.status].cls}`}>· {STATUS[note.status].label}</span>
        <div className="ml-auto flex items-center gap-2">
          {note.status !== "applied" && (
            <button onClick={sort} disabled={busy || !(note.body ?? "").trim()}
              title={(note.body ?? "").trim() ? "Read the note and propose what to file" : "Add a transcript first"}
              className="text-[11px] font-semibold px-2 py-1 rounded disabled:opacity-40"
              style={{ border: "1px solid var(--admin-border)" }}>
              {busy ? "…" : note.status === "sorted" ? "Sort again" : "Sort into the board"}
            </button>
          )}
          <button onClick={() => setEditing(!editing)} className="text-[11px] admin-faint hover:admin-muted px-1">
            {editing ? "cancel" : note.kind === "voice" && !note.body ? "add transcript" : "edit"}
          </button>
          <button onClick={remove} className="text-[11px] admin-faint hover:text-red-400 px-1">✕</button>
        </div>
      </div>

      {note.kind === "voice" && note.audio_key && (
        <audio controls preload="none" src={keyUrl(note.audio_key)} className="w-full h-9 mb-2" />
      )}

      {editing ? (
        <div>
          <textarea className={`${inputClass} min-h-[100px] font-mono text-xs`} value={body} autoFocus
            placeholder={note.kind === "voice" ? "The transcript, as spoken." : ""}
            onChange={(e) => setBody(e.target.value)} />
          <button onClick={saveBody} disabled={busy}
            className="mt-2 px-3 py-1.5 text-xs font-bold rounded-lg disabled:opacity-40"
            style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>Save</button>
        </div>
      ) : note.body ? (
        <pre className="text-xs admin-heading whitespace-pre-wrap font-mono leading-relaxed">{note.body}</pre>
      ) : (
        <p className="text-xs admin-faint italic">No transcript yet.</p>
      )}

      {msg && <p className="mt-2 text-[11px] text-amber-400 leading-relaxed">{msg}</p>}

      {(filed.summary || proposals.length > 0 || (filed.bullets?.length ?? 0) > 0) && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--admin-border)" }}>
          {filed.summary && <p className="text-xs admin-muted mb-2">{filed.summary} <span className="admin-faint">({filed.by})</span></p>}

          {(filed.bullets?.length ?? 0) > 0 && (
            <ul className="mb-2 space-y-0.5">
              {filed.bullets!.map((b, i) => <li key={i} className="text-[11px] admin-faint">· {b}</li>)}
            </ul>
          )}

          {proposals.length > 0 && (
            <div>
              {proposals.map((s) => {
                const m = BOARD_METRIC_BY_KEY[s.metric];
                return (
                  <label key={s.metric} className="flex items-start gap-2 mb-1.5 cursor-pointer">
                    {note.status !== "applied" && (
                      <input type="checkbox" className="mt-0.5" checked={picked.has(s.metric)}
                        onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.metric); else n.delete(s.metric); return n; })} />
                    )}
                    <span className="min-w-0">
                      <span className="text-[11px] font-bold" style={{ color: m?.color }}>{m?.label ?? s.metric}</span>
                      <span className="text-[11px] admin-faint">
                        {" "}{s.points.map((p) => `${p.station}: ${p.value != null ? fmtReading(s.metric, p.value, s.unit ?? m?.unit ?? "mm") : p.text ?? "—"}`).join(" · ")}
                      </span>
                    </span>
                  </label>
                );
              })}
              {note.status !== "applied" && (
                <button onClick={importProposals} disabled={busy || !picked.size}
                  className="mt-2 px-3 py-1.5 text-xs font-bold rounded-lg disabled:opacity-40"
                  style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
                  Import {picked.size} into the board
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Voice recorder ──────────────────────────────────────────────────────────

function Recorder({ onDone, disabled }: { onDone: (blob: Blob, seconds: number) => void; disabled: boolean }) {
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secsRef = useRef(0);

  const supported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== "undefined";

  function cleanup() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }
  useEffect(() => () => cleanup(), []);

  async function start() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        cleanup();
        setRecording(false);
        if (blob.size) onDone(blob, secsRef.current);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true); setSecs(0); secsRef.current = 0;
      timerRef.current = setInterval(() => {
        secsRef.current += 1;
        setSecs(secsRef.current);
        if (secsRef.current >= MAX_SEC) stop();
      }, 1000);
    } catch {
      setErr("Couldn't access the microphone.");
    }
  }
  function stop() { try { recRef.current?.stop(); } catch { /* ignore */ } }

  if (!supported) return null;
  return (
    <div className="flex items-center gap-2">
      {recording ? (
        <button onClick={stop} className="px-3 py-2 text-xs font-bold rounded-lg text-white" style={{ backgroundColor: "#ef4444" }}>
          ■ Stop · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
        </button>
      ) : (
        <button onClick={start} disabled={disabled}
          className="px-3 py-2 text-xs font-semibold admin-muted rounded-lg disabled:opacity-40"
          style={{ border: "1px solid var(--admin-border)" }}>
          🎙 Record
        </button>
      )}
      {err && <span className="text-[11px] text-red-400">{err}</span>}
    </div>
  );
}
