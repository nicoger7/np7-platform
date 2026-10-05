"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { keyUrl } from "@/lib/img";
import { ImportDialog } from "@/components/admin/board-measure-grid";
import {
  Card, Chip, Empty, Icon, InfoTip, btnPrimary, btnPrimaryStyle, btnSecondary, btnSecondaryStyle, btnSmall,
  type Tone,
} from "@/components/admin/pd-ui";
import {
  BOARD_METRIC_BY_KEY, defaultScale, fmtReading,
  type FiledNote, type ParsedSeries, type PdBoard, type PdBoardNote,
} from "@/lib/board-measurements";
import { backupChunk, dropBackup, listBackups, readBackup, type VoiceBackup } from "@/lib/voice-backup";

/**
 * The note inbox — "voice-record or write random notes and it puts it into
 * order into the board you're working in".
 *
 * A note has three states and the middle one is the point:
 *
 *   RAW      what was typed or spoken. Never rewritten. A voice note is the
 *            audio file plus its transcript: written down by ChatGPT's
 *            speech-to-text when an OpenAI key is set (the Claude API takes
 *            no audio), otherwise typed in by hand.
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

/** One recording on its way to becoming a note. `key` is set once it is in storage. */
type Take = { blob: Blob; seconds: number; session: string; key?: string };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const sessionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// Notes being written down right now. Shared by the composer and the note
// cards, so a second tap can't start a second (paid) run on the same audio.
const writing = new Set<string>();
const writingListeners = new Set<() => void>();
function setWriting(id: string, on: boolean) {
  if (on) writing.add(id); else writing.delete(id);
  writingListeners.forEach((f) => f());
}
function subscribeWriting(f: () => void) {
  writingListeners.add(f);
  return () => { writingListeners.delete(f); };
}
function useWriting(id: string): boolean {
  return useSyncExternalStore(
    subscribeWriting,
    () => writing.has(id),
    () => false,
  );
}
// Recordings this page is making or saving: never offered as "left over".
const ownSessions = new Set<string>();

/** The recording, straight into storage (or through the media route where that isn't set up). */
async function uploadAudio(boardId: string, blob: Blob, onProgress?: (f: number) => void): Promise<string> {
  const type = (blob.type || "audio/webm").split(";")[0].trim();
  const pre = await fetch(`/api/admin/product-dev/boards/${boardId}/notes/upload`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: type }),
  });
  if (pre.ok) {
    const { uploadUrl, key } = await pre.json();
    try {
      await new Promise<void>((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open("PUT", uploadUrl);
        x.setRequestHeader("Content-Type", type);
        x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
        x.onload = () => (x.status < 300 ? resolve() : reject(new Error(`The upload failed (${x.status}).`)));
        x.onerror = () => reject(new Error("The upload failed (no connection)."));
        x.onabort = x.ontimeout = () => reject(new Error("The upload was interrupted."));
        x.send(blob);
      });
      return key;
    } catch (e) {
      // the media route takes up to about 4 MB, so a short note still gets in
      if (blob.size > 4 * 1024 * 1024) throw e;
    }
  } else {
    const j = await pre.json().catch(() => ({}));
    if (!j.fallback) throw new Error(j.error ?? "The recording didn't upload.");
  }
  const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("mpeg") ? "mp3" : type.includes("wav") ? "wav" : type.includes("flac") ? "flac" : "webm";
  const fd = new FormData();
  fd.append("file", new File([blob], `note-${Date.now()}.${ext}`, { type }));
  fd.append("folder", `product-dev/boards/${boardId}/voice`);
  const up = await fetch("/api/admin/product-dev/media", { method: "POST", body: fd });
  if (!up.ok) throw new Error((await up.json().catch(() => ({}))).error ?? "The recording didn't upload.");
  return (await up.json()).path;
}

/** Ask for the transcript. `error` is a message to show; `body` is what was written down. */
async function transcribeNote(boardId: string, noteId: string): Promise<{ body?: string; error?: string }> {
  if (writing.has(noteId)) return {};
  setWriting(noteId, true);
  try {
    const res = await fetch(`/api/admin/product-dev/boards/${boardId}/notes/${noteId}/transcribe`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    if (j.needsKey) return { error: j.message };
    if (!res.ok) return { error: j.error ?? "The recording couldn't be written down." };
    return { body: j.body ?? "" };
  } catch {
    return { error: "Couldn't reach the server. The recording is saved; press Write it down to try again." };
  } finally {
    setWriting(noteId, false);
  }
}

/** Hand a recording to the phone as a file, to upload later with "Upload recording". */
function saveFile(t: Take) {
  const ext = t.blob.type.includes("mp4") ? "m4a" : t.blob.type.includes("ogg") ? "ogg" : "webm";
  const url = URL.createObjectURL(t.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `board-note-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// What a picked file is, when the phone doesn't say (some Android pickers give "").
const FILE_TYPE: Record<string, string> = {
  m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", mp3: "audio/mpeg", wav: "audio/wav",
  webm: "audio/webm", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac",
};

/**
 * The composer: a box you can type a measuring session into, or anything else.
 *
 * Lives on the board's FIRST page as well as here — "it will be the easiest way
 * to enter stuff" — so it is its own component. Two ways out of it:
 *   File into the board  → the importer, review table first, then the readings
 *   Save as note         → the inbox, raw, to sort later
 *
 * Recordings save one after the other in the background, so the next one can
 * start while the last is still uploading. One that fails stays here with
 * "Try again" and "Save the file"; one the page lost (reload, a call) comes
 * back from the phone's own copy.
 */
export function NoteComposer({ board, onSaved, onFile, onOpenNotes }: {
  board: PdBoard;
  onSaved: () => void;
  /** When given, the primary button hands the text to the importer. */
  onFile?: (text: string) => void;
  /** When given, a saved recording offers a way to its note. */
  onOpenNotes?: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guide, setGuide] = useState(false);
  const [stage, setStage] = useState("");
  const [saving, setSaving] = useState(0);
  const [writingDown, setWritingDown] = useState(0);
  const [failed, setFailed] = useState<Take[]>([]);
  const [leftover, setLeftover] = useState<VoiceBackup[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Recordings this phone still holds from a page that died before saving them.
  useEffect(() => {
    let on = true;
    listBackups(board.id).then((all) => {
      if (!on) return;
      const old = all.filter((m) => !ownSessions.has(m.session));
      old.filter((m) => m.bytes < 4096).forEach((m) => dropBackup(m.session));
      setLeftover(old.filter((m) => m.bytes >= 4096));
    });
    return () => { on = false; };
  }, [board.id]);

  // Closing or reloading the page mid-upload would lose the recording.
  useEffect(() => {
    if (!saving) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);

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

  /** Queue a recording. Synchronous on purpose: `saving` must count it before the recorder lets go of the screen. */
  function takeVoice(t: Take) {
    ownSessions.add(t.session);
    setSaving((n) => n + 1); setError(""); setSaved(null);
    queue.current = queue.current.then(() => saveTake(t)).catch(() => {});
  }

  async function saveTake(t: Take) {
    let key = t.key;
    let noteId = "";
    try {
      if (!key) {
        setStage("Uploading the recording…");
        key = await uploadAudio(board.id, t.blob, (f) => setStage(`Uploading the recording… ${Math.round(f * 100)}%`));
      }
      setStage("Saving the note…");
      const res = await fetch(`/api/admin/product-dev/boards/${board.id}/notes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "voice", audio_key: key, duration_s: Math.round(t.seconds) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save the note.");
      noteId = (await res.json()).id;
    } catch (e) {
      // stays here with Try again, and on the phone in case the page goes
      ownSessions.delete(t.session);
      setFailed((f) => [...f, { ...t, key }]);
      setError(e instanceof Error ? e.message : "The recording didn't upload.");
      return;
    } finally {
      setSaving((n) => n - 1); setStage("");
    }
    dropBackup(t.session).finally(() => ownSessions.delete(t.session));
    onSaved();
    void writeDown(noteId);
  }

  async function writeDown(noteId: string) {
    setWritingDown((n) => n + 1);
    const r = await transcribeNote(board.id, noteId);
    setWritingDown((n) => n - 1);
    if (r.error) setError(r.error);
    else if (r.body) setSaved(r.body.split("\n").find((l) => l.trim()) ?? "");
    onSaved();
  }

  /** A recording made with the phone's own voice recorder (it keeps going with the screen off). */
  function pickFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const type = file.type && file.type !== "application/octet-stream" ? file.type : FILE_TYPE[ext] ?? "";
    const blob = type === file.type ? file : new Blob([file], { type });
    const a = document.createElement("audio");
    const url = URL.createObjectURL(file);
    let done = false;
    const go = (secs: number) => {
      if (done) return;
      done = true; URL.revokeObjectURL(url); setStage("");
      takeVoice({ blob, seconds: secs, session: sessionId() });
    };
    setStage("Reading the file…");
    a.preload = "metadata";
    a.onloadedmetadata = () => go(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => go(0);
    setTimeout(() => go(0), 4000);
    a.src = url;
  }

  async function recover(m: VoiceBackup) {
    const blob = await readBackup(m);
    setLeftover((l) => l.filter((x) => x.session !== m.session));
    if (!blob) { setError("That recording couldn't be read back from this phone."); dropBackup(m.session); return; }
    takeVoice({ blob, seconds: m.seconds, session: m.session });
  }

  function discard(m: VoiceBackup) {
    if (!confirm("Discard this recording? It can't be brought back.")) return;
    setLeftover((l) => l.filter((x) => x.session !== m.session));
    dropBackup(m.session);
  }

  const primary = btnPrimary;
  const primaryStyle = btnPrimaryStyle;
  const secondary = btnSecondary;
  const secondaryStyle = btnSecondaryStyle;
  const line = stage || (writingDown ? "Writing down what you said…" : "");

  return (
    <div>
      <textarea className={`${inputClass} min-h-[110px] font-mono text-xs`} value={text}
        placeholder={"Paste a measuring session (metric heading, one station per line) and file it. Anything else becomes a note.\n\nRocker\n0 - 6mm\n10 - 0\n80 - start"}
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
        <Recorder boardId={board.id} onDone={takeVoice} hold={saving > 0 || writingDown > 0} />
        <label className={`${secondary} cursor-pointer`} style={secondaryStyle}
          title="A recording from your phone's voice recorder app (it keeps recording with the screen off)">
          <Icon name="upload" className="w-4 h-4" />Upload recording
          <input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.aac,.flac" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickFile(f); }} />
        </label>
        <span className="ml-auto inline-flex items-center gap-1">
          <InfoTip align="right">
            Filing shows what it read before anything is written. Voice notes are written down for you; check the text, then sort it into the board.
          </InfoTip>
          <button onClick={() => setGuide(!guide)} aria-expanded={guide} className={btnSmall}>
            {guide ? "Hide format guide" : "Format guide"}
          </button>
        </span>
      </div>
      {line && <p className="mt-2 text-xs admin-muted">{line}</p>}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {saved != null && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="admin-muted min-w-0">Saved and written down{saved ? <>: <span className="admin-heading">“{saved.length > 80 ? `${saved.slice(0, 80)}…` : saved}”</span></> : "."}</span>
          {onOpenNotes && <button onClick={onOpenNotes} className={btnSmall}>Open in Notes</button>}
        </div>
      )}
      {failed.map((t) => (
        <div key={t.session} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-red-500">A recording ({mmss(t.seconds)}) isn&apos;t saved yet.</span>
          <button className={btnSmall} onClick={() => { setFailed((f) => f.filter((x) => x !== t)); takeVoice(t); }}>Try again</button>
          <button className={btnSmall} onClick={() => saveFile(t)}>Save the file</button>
        </div>
      ))}
      {leftover.map((m) => (
        <div key={m.session} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-amber-600">
            A recording from {new Date(m.startedAt).toLocaleString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} ({mmss(m.seconds)}) was never saved. This phone still has it.
          </span>
          <button className={btnSmall} onClick={() => recover(m)}>Save it</button>
          <button className={btnSmall} onClick={() => discard(m)}>Discard</button>
        </div>
      ))}
      {guide && <SessionBrief />}
    </div>
  );
}

/**
 * How to write a session so it files first time.
 *
 * Folded by default and compact when open: the first version sat beside the
 * composer as a tall column and doubled the length of the board's first page.
 * Everything here is a behaviour of parseMeasurementText, so if the parser
 * changes, change this.
 */
function Rule({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="text-[11px] admin-muted leading-snug">
      <span className="font-semibold admin-heading">{n} · {title}.</span> {children}
    </div>
  );
}

export function SessionBrief() {
  return (
    <div className="mt-3 pt-3 grid grid-cols-1 md:grid-cols-[1fr_230px] gap-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
      <div className="space-y-1.5">
        <Rule n={1} title="One metric per block">
          Metric name on its own line: <b>Thickness</b>, <b>Width</b> (bottom), <b>Width top</b>, <b>Rocker</b>, <b>Rocker 15cm off centre</b>, <b>V</b>, <b>Double/Single concave</b>, <b>Rail thickness</b>, <b>Rail shape</b>. German works (Dicke, Breite).
        </Rule>
        <Rule n={2} title="One station per line">
          <code>110 - 4.5mm</code>. Dash optional, <code>81,2cm</code> fine. Stations are <b>cm from the tail</b>. A bare <code>20</code> = still to measure.
        </Rule>
        <Rule n={3} title="Tail edge">
          Read the rocker at <b>0</b> and <b>5</b> too, that is where the tail kick is. Where it starts rising: <code>80 - start</code>.
        </Rule>
        <Rule n={4} title="V and inverted V">
          Type what the tape says. V (straightedge on one side, gap at the far rail) is 2 × V on the tape and the tool halves it; inverted V (edge on both rails, gap at the centre) is the real number.
          <code>V - inverted</code> in the heading starts inverted; <code>Normal V from here</code> flips the rest.
        </Rule>
        <Rule n={5} title="Caveats">
          Brackets after a value are kept as a note on it. A caveat in the heading (<code>alles halbieren</code>) is offered as a tick-box when filing, never applied by itself.
        </Rule>
        <Rule n={6} title="Rail shape">
          A word (hard, tucked, boxy, soft, 50/50, bevel, chined), radius in mm after it if measured.
        </Rule>
      </div>
      <pre className="text-[10.5px] font-mono leading-snug p-2.5 rounded-lg overflow-auto max-h-[190px]"
        style={{ backgroundColor: "var(--admin-bg)", border: "1px solid var(--admin-border)" }}>{`Rocker
0 - 6mm
5 - 2mm
10 - 0
80 - start
110 - 4.5mm

V - inverted (alles halbieren)
10 0.2mm
80 - 0
Normal V from here
90 - 2.9mm

Double concave
40 2mm (minus the inverted V)
90 - 1.5mm`}</pre>
    </div>
  );
}

export function BoardNotes({ board, notes, onChanged }: { board: PdBoard; notes: PdBoardNote[]; onChanged: () => void }) {
  const [fileText, setFileText] = useState<string | null>(null);
  const [composerKey, setComposerKey] = useState(0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-5">
      <div>
        <Card title="New note" icon="note" tone="amber" subtitle="Type, paste or record">
          <NoteComposer key={composerKey} board={board} onSaved={onChanged} onFile={setFileText} />
        </Card>
      </div>

      <div className="min-w-0">
        <p className="text-sm font-bold admin-heading mb-3">
          {notes.length} note{notes.length === 1 ? "" : "s"}
        </p>
        {!notes.length ? (
          <Empty icon="note" tone="amber" title="No notes yet" />
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
  const writingNow = useWriting(note.id);
  const hasText = !!(note.body ?? "").trim();
  const [picked, setPicked] = useState<Set<string>>(new Set((note.filed?.proposals ?? []).map((p) => p.metric)));
  // A note already filed into the board is a record, not a to-do: show its
  // first lines and fold the rest.
  const lines = (note.body ?? "").split("\n");
  const foldable = note.status === "applied" && lines.length > 8;
  const [unfolded, setUnfolded] = useState(false);

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

  async function writeDown() {
    setMsg("");
    const r = await transcribeNote(board.id, note.id);
    setMsg(r.error ?? "");
    onChanged();
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
          series: { metric: s.metric, unit: s.unit ?? BOARD_METRIC_BY_KEY[s.metric]?.unit, variant: s.variant, convention: s.convention, scale: defaultScale(s.metric), enabled: true },
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

  const STATUS: Record<PdBoardNote["status"], { label: string; tone: Tone }> = {
    raw: { label: "Raw", tone: "slate" },
    sorted: { label: "Sorted, waiting for you", tone: "amber" },
    applied: { label: "In the board", tone: "green" },
    discarded: { label: "Discarded", tone: "slate" },
  };

  return (
    <div className="rounded-2xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Chip tone={note.kind === "voice" ? "pink" : "slate"} icon={note.kind === "voice" ? "mic" : "note"}>{note.kind === "voice" ? "Voice" : "Text"}</Chip>
        <Chip tone={STATUS[note.status].tone} dot>{STATUS[note.status].label}</Chip>
        <span className="text-[11px] admin-faint">
          {new Date(note.created_at).toLocaleString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {note.status !== "applied" && hasText && (
            <button onClick={sort} disabled={busy} title="Read the note and propose what to file"
              className={btnSecondary} style={btnSecondaryStyle}>
              {busy ? "…" : note.status === "sorted" ? "Sort again" : "Sort into the board"}
            </button>
          )}
          <button onClick={() => { if (!editing) setBody(note.body ?? ""); setEditing(!editing); }} className={btnSmall}>
            {editing ? "Cancel" : note.kind === "voice" && !note.body ? "Add transcript" : <><Icon name="edit" className="w-3.5 h-3.5" />Edit</>}
          </button>
          <button onClick={remove} className={btnSmall} title="Delete"><Icon name="x" className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {note.kind === "voice" && note.audio_key && (
        <audio controls preload="none" src={keyUrl(note.audio_key)} className="w-full h-9 mb-2" />
      )}
      {note.kind === "voice" && note.audio_key && !hasText && !editing && (
        writingNow ? (
          <p className="text-xs admin-muted mb-2">Writing down what was said…</p>
        ) : (
          <button onClick={writeDown} className={`${btnPrimary} w-full mb-2`} style={btnPrimaryStyle}
            title="Turn the recording into text">
            Write it down
          </button>
        )
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
        <>
          <pre className="text-xs admin-heading whitespace-pre-wrap font-mono leading-relaxed">
            {foldable && !unfolded ? lines.slice(0, 6).join("\n") : note.body}
          </pre>
          {foldable && (
            <button onClick={() => setUnfolded(!unfolded)} className={`${btnSmall} mt-1`}>
              {unfolded ? "Show less" : `Show all ${lines.length} lines`}
            </button>
          )}
        </>
      ) : (
        !(note.kind === "voice" && note.audio_key) && <p className="text-xs admin-faint italic">No transcript yet.</p>
      )}

      {msg && <p className="mt-2 text-[11px] text-amber-600 leading-relaxed">{msg}</p>}

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
//
// Built for measuring with both hands busy (Nico, 5 Oct: "put my phone to the
// side, take the measurements and speak"; the first try "didn't register my
// voice" and stopped when the screen went off):
//  - the iPhone's microphone gives silence for the first 2-3 s, with short
//    bursts in between, so the screen says "Starting the microphone" until it
//    hears sound for a third of a second, then "Listening, speak now";
//  - the screen is kept on (Screen Wake Lock) from the tap until the note is
//    saved and written down, and turns into a dark full-screen recorder with
//    one big Stop button, so the phone can lie on the bench;
//  - every 20 minutes (or 20 MB) the recording rolls into a new note without
//    a gap, which keeps each one under what speech-to-text takes in one go;
//  - each one-second piece is also kept on the phone (voice-backup), so a page
//    the phone reloads mid-session loses nothing;
//  - when the phone takes the microphone away (a call, Siri, the lock button)
//    it stops and says from which minute on the readings are missing.
//    For screen-off recording, the phone's own voice recorder + "Upload
//    recording" is the way.

const PART_SEC = 20 * 60;
const PART_BYTES = 20 * 1024 * 1024;
const MAX_SEC = 90 * 60;

type WakeSentinel = { release: () => Promise<void>; addEventListener?: (t: "release", f: () => void) => void };
type Part = { rec: MediaRecorder; session: string; startedAt: number; bytes: number; seq: number; chunks: Blob[]; mime: () => string };

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  for (const t of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

function Recorder({ boardId, onDone, hold }: {
  boardId: string;
  onDone: (t: Take) => void;
  /** Keep the screen on after Stop while this is true (the upload and the writing down). */
  hold: boolean;
}) {
  const [phase, setPhaseState] = useState<"idle" | "starting" | "recording">("idle");
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(-100);
  const [live, setLive] = useState(false);
  const [wasLive, setWasLive] = useState(false);
  const [meter, setMeter] = useState(true);
  const [paused, setPaused] = useState(false);
  const [parts, setParts] = useState(1);
  const [awake, setAwake] = useState<boolean | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const phaseRef = useRef<"idle" | "starting" | "recording">("idle");
  const holdRef = useRef(hold);
  const partRef = useRef<Part | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const wakeRef = useRef<WakeSentinel | null>(null);
  const startedRef = useRef(0);
  const stoppingRef = useRef(false);
  const mutedSinceRef = useRef<number | null>(null);
  const mutedAtRef = useRef(0);
  const visibleSinceRef = useRef(0);

  const supported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== "undefined";
  const setPhase = (p: "idle" | "starting" | "recording") => { phaseRef.current = p; setPhaseState(p); };
  const elapsed = () => (startedRef.current ? (Date.now() - startedRef.current) / 1000 : 0);

  async function lockScreen() {
    if (wakeRef.current) return;
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeSentinel> } }).wakeLock;
      if (!wl) { setAwake(false); return; }
      const s = await wl.request("screen");
      // the phone lets go of it whenever the page is hidden; taken again on return
      s.addEventListener?.("release", () => { if (wakeRef.current === s) wakeRef.current = null; });
      wakeRef.current = s;
      setAwake(true);
      if (phaseRef.current === "idle" && !holdRef.current) releaseWake();
    } catch { setAwake(false); }
  }
  function releaseWake() {
    const s = wakeRef.current;
    wakeRef.current = null;
    s?.release().catch(() => {});
  }

  /** Microphone, timer, meter. Not the wake lock: that stays until the note is saved. */
  function teardown() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }

  useEffect(() => {
    holdRef.current = hold;
    if (phase === "idle" && !hold) releaseWake();
  }, [phase, hold]);
  // leaving the page mid-recording still saves what there is
  useEffect(() => () => { finish(); teardown(); releaseWake(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Back on screen: keep it awake again, wake the meter, and if the recording
  // was cut off while it was away, save what there is.
  useEffect(() => {
    if (phase !== "recording") return;
    const onVis = () => {
      const p = partRef.current;
      if (document.visibilityState === "hidden") { try { p?.rec.requestData(); } catch { /* ignore */ } return; }
      visibleSinceRef.current = Date.now();
      ctxRef.current?.resume().catch(() => {});
      const track = streamRef.current?.getAudioTracks()[0];
      if (!p || p.rec.state === "inactive" || track?.readyState === "ended") {
        finish(`The recording stopped while the screen was off, at ${mmss(elapsed())}. The part before that is being saved; press Record to go on.`);
      } else {
        lockScreen();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function newPart(stream: MediaStream) {
    const mimeType = pickMime();
    const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
    const part: Part = {
      rec, session: sessionId(), startedAt: Date.now(), bytes: 0, seq: 0, chunks: [],
      mime: () => rec.mimeType || mimeType || "audio/webm",
    };
    rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      part.chunks.push(e.data);
      part.bytes += e.data.size;
      backupChunk({
        session: part.session, boardId, mime: part.mime(), startedAt: part.startedAt,
        seconds: (Date.now() - part.startedAt) / 1000, bytes: part.bytes,
      }, part.seq++, e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(part.chunks, { type: part.mime() });
      // a few frames from a tap that never got going are not a note
      if (blob.size >= 4096) onDone({ blob, seconds: (Date.now() - part.startedAt) / 1000, session: part.session });
      else { dropBackup(part.session); ownSessions.delete(part.session); }
      if (partRef.current === part) wrapUp();
    };
    ownSessions.add(part.session);
    rec.start(1000);
    partRef.current = part;
  }

  /** A new note from here on, on the same live microphone: no gap, no warm-up. */
  function roll() {
    const old = partRef.current;
    const stream = streamRef.current;
    if (!old || !stream) return;
    try { newPart(stream); } catch { return; }
    setParts((n) => n + 1);
    try { old.rec.stop(); } catch { /* ignore */ }
  }

  function finish(message = "") {
    if (message) setNote(message);
    if (phaseRef.current !== "recording" || stoppingRef.current) return;
    stoppingRef.current = true;
    const p = partRef.current;
    if (!p || p.rec.state === "inactive") { wrapUp(); return; }
    try { p.rec.stop(); } catch { wrapUp(); }
  }

  /** Stop while the microphone is still starting: nothing was recorded yet. */
  function cancel() {
    teardown(); setPhase("idle");
  }

  function wrapUp() {
    if (phaseRef.current === "idle") return;
    teardown();
    partRef.current = null;
    setPhase("idle"); setLive(false); setLevel(-100); setPaused(false);
  }

  function tick() {
    const s = elapsed();
    setSecs(s);
    if (s >= MAX_SEC) { finish(`${MAX_SEC / 60} minutes is the longest one recording goes. It is being saved; press Record to go on.`); return; }
    const p = partRef.current;
    if (p && (Date.now() - p.startedAt >= PART_SEC * 1000 || p.bytes >= PART_BYTES)) roll();
    // the phone took the microphone and didn't give it back
    const m = mutedSinceRef.current;
    if (m && document.visibilityState === "visible" && Date.now() - Math.max(m, visibleSinceRef.current) > 3000) {
      finish(`The phone switched the microphone off at ${mmss(mutedAtRef.current)}. The part before that is being saved; press Record and say the readings after that again.`);
    }
  }

  function start() {
    if (phaseRef.current !== "idle") return;
    setPhase("starting");
    setErr(""); setNote(""); setSecs(0); setParts(1); setLive(false); setWasLive(false); setPaused(false); setMeter(true);
    // both inside the tap: iPhones allow the wake lock and the audio context only there
    lockScreen();
    const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    let ctx: AudioContext | null = null;
    try { ctx = AC ? new AC() : null; } catch { ctx = null; }
    ctxRef.current = ctx;
    void begin(ctx);
  }

  async function begin(ctx: AudioContext | null) {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
    } catch {
      teardown(); setPhase("idle");
      setErr("Couldn't access the microphone. Allow it for this site, or record with the phone's voice recorder and upload the file.");
      return;
    }
    if (phaseRef.current !== "starting") { stream.getTracks().forEach((t) => t.stop()); return; }
    streamRef.current = stream;
    try {
      newPart(stream);
    } catch {
      teardown(); setPhase("idle");
      setErr("This browser can't record here. Record with the phone's voice recorder and upload the file.");
      return;
    }
    startedRef.current = Date.now();
    visibleSinceRef.current = Date.now();
    stoppingRef.current = false;
    mutedSinceRef.current = null;
    setPhase("recording");

    const track = stream.getAudioTracks()[0];
    track?.addEventListener("ended", () =>
      finish(`The microphone was switched off at ${mmss(elapsed())} (a call or another app). The part before that is being saved; press Record to go on.`));
    track?.addEventListener("mute", () => {
      mutedSinceRef.current = Date.now(); mutedAtRef.current = elapsed(); setPaused(true);
    });
    track?.addEventListener("unmute", () => { mutedSinceRef.current = null; setPaused(false); });
    timerRef.current = setInterval(tick, 1000);
    if (ctx) startMeter(ctx, stream); else setMeter(false);
  }

  /** The level bar, and "live" once the microphone really delivers sound. */
  function startMeter(ctx: AudioContext, stream: MediaStream) {
    try {
      ctx.resume().catch(() => {});
      ctx.addEventListener("statechange", () => {
        if (ctx.state !== "running" && ctx.state !== "closed" && document.visibilityState === "visible") ctx.resume().catch(() => {});
      });
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const t0 = performance.now();
      let painted = 0, above: number | null = null, below: number | null = null, isLive = false, ok = true;
      const frame = (t: number) => {
        if (ctx.state === "running") {
          if (!ok) { ok = true; setMeter(true); }
          an.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const db = 10 * Math.log10(sum / buf.length + 1e-12);
          // live after 0.3 s of sound (warm-up bursts are shorter); off again
          // after 1.5 s of digital silence, which no working microphone gives
          if (db > -85) {
            below = null;
            above ??= t;
            if (!isLive && t - above > 300) { isLive = true; setLive(true); setWasLive(true); }
          } else {
            above = null;
            if (db < -100) { below ??= t; if (isLive && t - below > 1500) { isLive = false; setLive(false); } } else below = null;
          }
          if (t - painted > 100) { setLevel(db); painted = t; }
        } else if (ok && t - t0 > 5000) {
          ok = false; setMeter(false);
        }
        rafRef.current = requestAnimationFrame(frame);
      };
      rafRef.current = requestAnimationFrame(frame);
    } catch {
      setMeter(false);
    }
  }

  if (!supported) return null;
  const bar = Math.max(0, Math.min(1, (level + 70) / 55));
  const green = phase === "recording" && !paused && (live || !meter);
  const status = phase === "starting" ? "Starting the microphone…"
    : paused ? "The phone paused the microphone"
    : !meter ? "Recording (no level meter on this phone)"
    : live ? "Listening, speak now"
    : wasLive ? "No sound from the microphone…"
    : "Starting the microphone…";
  return (
    <div className="flex items-center gap-2">
      <button onClick={start} disabled={phase !== "idle"} className={btnSecondary} style={btnSecondaryStyle}>
        <Icon name="mic" className="w-4 h-4" />Record
      </button>
      {err && <span className="text-[11px] text-red-400 max-w-[260px] leading-snug">{err}</span>}
      {!err && note && <span className="text-[11px] text-amber-600 max-w-[260px] leading-snug">{note}</span>}
      {phase !== "idle" && (
        <div role="dialog" aria-label="Recording" className="fixed inset-0 z-[100] overflow-y-auto"
          style={{ backgroundColor: "#05080a", color: "#e8eef0" }}>
          <div className="min-h-full flex flex-col items-center justify-center gap-5 px-6 py-8 text-center">
            <div className="flex items-center gap-2 text-sm font-semibold" aria-live="polite">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: green ? "#22c55e" : "#f59e0b" }} />
              {status}
            </div>
            <div className="text-6xl font-bold tabular-nums tracking-tight">{mmss(secs)}</div>
            {meter && (
              <div className="w-full max-w-xs h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#1c2529" }} aria-hidden="true">
                <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${Math.round(bar * 100)}%`, backgroundColor: green ? "#22c55e" : "#f59e0b" }} />
              </div>
            )}
            <p className="text-sm max-w-xs leading-relaxed" style={{ color: "#9fb0b6" }}>
              {awake === false
                ? "This phone won't keep the screen on by itself. Tap below, or set Auto-Lock to Never while measuring."
                : "The screen stays on. Put the phone down, measure, and say the station and the number."}
              {parts > 1 && ` Part ${parts}: the part before is already saving as its own note.`}
            </p>
            {awake === false && (
              <button onClick={() => lockScreen()} className="px-4 py-2 rounded-full text-sm font-semibold"
                style={{ backgroundColor: "#1c2529", color: "#e8eef0" }}>
                Keep the screen on
              </button>
            )}
            <button onClick={() => (phase === "starting" ? cancel() : finish())}
              className="w-40 h-40 sm:w-48 sm:h-48 shrink-0 rounded-full flex flex-col items-center justify-center gap-2 text-lg font-bold text-white"
              style={{ backgroundColor: "#dc2626" }}>
              <span className="w-8 h-8 rounded-md bg-white" />
              {phase === "starting" ? "Cancel" : "Stop and save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
