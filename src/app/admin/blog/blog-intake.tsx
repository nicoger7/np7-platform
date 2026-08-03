"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * AI Magazine intake — paste a YouTube link or a pile of notes, get a DRAFT
 * post proposal you can edit here and turn into a real draft post with one
 * click. Nothing publishes itself: the button creates a draft, nothing more.
 *
 * Tab labels are duplicated from lib/blog-intake rather than imported — that
 * module talks to the Anthropic SDK, which has no business in a client bundle.
 */

const TABS = [
  { id: "spotguide", label: "Spotguide" },
  { id: "gear", label: "Gear" },
  { id: "technique", label: "Technique" },
] as const;
type Tab = (typeof TABS)[number]["id"];

type Draft = { title: string; slug: string; excerpt: string; content: string; tab: Tab; notes: string[] };
type Item = {
  id: string;
  text: string;
  status: string;
  post_id: string | null;
  created_at: string;
  notes: { draft?: Draft | null; error?: string; source?: { kind: string; url: string; title?: string; channel?: string | null } } | null;
};

const YT = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/;

const inputClass = "w-full rounded-lg px-3 py-2 text-[13.5px] admin-input admin-border border outline-none";
const inputStyle = { backgroundColor: "var(--admin-input-bg)" };

export function BlogIntake() {
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [created, setCreated] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/blog/intake")
      .then((r) => r.json())
      .then((j) => { setItems(Array.isArray(j.items) ? j.items : []); if (j.error) setError(j.error); })
      .catch(() => setItems([]));
  }, []);

  const isLink = YT.test(source.trim()) && !/\s/.test(source.trim());

  async function draft() {
    if (busy || source.trim().length < 12) return;
    setBusy(true); setError(""); setCreated(null);
    try {
      const res = await fetch("/api/admin/blog/intake", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isLink ? { url: source.trim() } : { text: source }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "Something went wrong."); return; }
      setItems((prev) => [j.item as Item, ...prev]);
      setSource("");
    } finally { setBusy(false); }
  }

  function patch(id: string, draftPatch: Draft) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, notes: { ...(it.notes ?? {}), draft: draftPatch } } : it)));
  }

  async function discard(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    await fetch(`/api/admin/blog/intake/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "discarded" }),
    });
  }

  async function createPost(item: Item) {
    const d = item.notes?.draft;
    if (!d) return;
    setError("");
    const res = await fetch(`/api/admin/blog/intake/${item.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: d }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error || "Couldn't create the post."); return; }
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    setCreated({ id: j.post.id, title: j.post.title });
  }

  return (
    <div className="mb-8 rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-bold admin-heading">AI Magazine intake</span>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#0aa3c7]/15 text-[#0aa3c7]">draft only</span>
      </div>
      <p className="text-[12.5px] admin-muted mb-3">
        Paste a YouTube link or your notes — a trip debrief, a gear thought, a voice memo you typed out. You get a
        proposed post to edit here, then one click turns it into a <b>draft</b>. Nothing goes live by itself.
      </p>

      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        rows={4}
        placeholder={"Paste a YouTube link — youtu.be/… — or your own notes: \"Alacati in June: side-onshore all afternoon, flat inside, chest-deep for 200m, best for first jibes…\""}
        className={inputClass}
        style={inputStyle}
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={draft}
          disabled={busy || source.trim().length < 12}
          className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] transition-colors"
        >
          {busy ? (isLink ? "Reading the video…" : "Drafting…") : isLink ? "Read the video & draft" : "Draft a post"}
        </button>
        {error && <span className="text-[12.5px] font-semibold text-red-400">{error}</span>}
      </div>

      {created && (
        <div className="mt-3 rounded-lg border border-[#2e7d5b]/40 bg-[#0f6e56]/10 px-3.5 py-3 text-[13px]">
          <p className="font-bold admin-heading">Draft created: {created.title}</p>
          <Link href={`/admin/blog/${created.id}`} className="inline-block mt-1 text-[12.5px] font-bold text-[#0aa3c7] hover:underline">
            Open it in the editor →
          </Link>
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] admin-faint mb-2">
            Waiting for you · {items.length}
          </p>
          <div className="grid gap-3">
            {items.map((item) => (
              <IntakeCard
                key={item.id}
                item={item}
                onChange={(d) => patch(item.id, d)}
                onCreate={() => createPost(item)}
                onDiscard={() => discard(item.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IntakeCard({ item, onChange, onCreate, onDiscard }: {
  item: Item;
  onChange: (d: Draft) => void;
  onCreate: () => void;
  onDiscard: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const draft = item.notes?.draft ?? null;
  const src = item.notes?.source;

  async function create() {
    setSaving(true);
    try { await onCreate(); } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl p-3.5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)" }}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11.5px] admin-faint">
          {src ? (
            <>From <a href={src.url} target="_blank" rel="noreferrer" className="font-semibold text-[#0aa3c7] hover:underline">{src.title || "a YouTube video"}</a>{src.channel ? ` · ${src.channel}` : ""}</>
          ) : (
            "From your notes"
          )}
          {" · "}
          {new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </span>
        <button onClick={onDiscard} className="shrink-0 text-[11.5px] font-bold admin-faint hover:text-red-400 transition-colors">
          Discard
        </button>
      </div>

      {draft ? (
        <div className="mt-2.5 grid gap-2">
          <input
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            placeholder="Title"
            className={`${inputClass} font-bold`}
            style={inputStyle}
          />
          <div className="flex items-center gap-2">
            <select
              value={draft.tab}
              onChange={(e) => onChange({ ...draft, tab: e.target.value as Tab })}
              className="rounded-lg px-2.5 py-2 text-[13px] admin-input admin-border border outline-none"
              style={inputStyle}
            >
              {TABS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input
              value={draft.slug}
              onChange={(e) => onChange({ ...draft, slug: e.target.value })}
              placeholder="slug"
              className={`${inputClass} flex-1 min-w-0 text-[12.5px]`}
              style={inputStyle}
            />
          </div>
          <textarea
            value={draft.excerpt}
            onChange={(e) => onChange({ ...draft, excerpt: e.target.value })}
            rows={2}
            placeholder="Excerpt"
            className={`${inputClass} text-[12.5px]`}
            style={inputStyle}
          />
          <button onClick={() => setOpen((o) => !o)} className="self-start text-[12px] font-bold text-[#0aa3c7] hover:underline">
            {open ? "Hide the body" : `Read the body (${draft.content.split(/\s+/).length} words)`}
          </button>
          {open && (
            <textarea
              value={draft.content}
              onChange={(e) => onChange({ ...draft, content: e.target.value })}
              rows={14}
              className={`${inputClass} text-[12.5px] font-mono leading-relaxed`}
              style={inputStyle}
            />
          )}
          {draft.notes.length > 0 && (
            <ul className="text-[12px] text-amber-500 list-disc pl-4">
              {draft.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          <div className="flex items-center gap-3 mt-0.5">
            <button
              onClick={create}
              disabled={saving || !draft.title.trim() || !draft.content.trim()}
              className="px-4 py-2 rounded-lg text-[13px] font-bold bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] transition-colors"
            >
              {saving ? "Creating…" : "Create as draft post"}
            </button>
            <span className="text-[11.5px] admin-faint">Lands unpublished in the list below.</span>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-[12.5px] text-amber-500">{item.notes?.error || "No draft came back — the text is parked here for you."}</p>
          <button onClick={() => setOpen((o) => !o)} className="mt-1 text-[12px] font-bold text-[#0aa3c7] hover:underline">
            {open ? "Hide the text" : "Show the text"}
          </button>
          {open && (
            <pre className="mt-1.5 whitespace-pre-wrap text-[12px] admin-muted max-h-64 overflow-auto">{item.text}</pre>
          )}
        </div>
      )}
    </div>
  );
}
