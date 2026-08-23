"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Knowledge Base (Phase 1) — the coaching brain, structured.
 *
 * Left: every active skill from the milestone catalog (the catalog IS the
 * list; an entry materialises on first open) grouped by rank, plus equipment.
 * Right: the entry's sections with their required questions — and the
 * braindump box: dump thoughts, the assistant sorts them in and asks exactly
 * what's still missing.
 */

type ShelfRow = {
  kind: "skill" | "equipment"; refKey: string | null; label: string;
  rank: string | null; discipline: string | null; sortOrder: number; bonus: boolean;
  entryId: string | null; status: string; websiteVisible: boolean;
  sections: { total: number; complete: number };
};
type Section = {
  key: string; label: string; hint: string; questions: string[];
  content: string; status: string; openQuestions: string[];
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entry = any;

const RANK_ORDER = ["Beginner", "Intermediate", "Advanced", "Expert", "Semi-Pro", "Pro"];
// The shelf IS the skill catalogue, so it has to be navigable at the catalogue's
// real size: 58 skills across four disciplines. Grouped by rank alone, every
// band mixed freeride with slalom and wave, and finding one skill meant reading
// all of them. Discipline first, rank inside it — the way the skills are taught.
const DISCIPLINE_ORDER = ["freeride", "freerace", "slalom", "side"];
const DISCIPLINE_LABEL: Record<string, string> = {
  freeride: "Freeride", freerace: "Freerace", slalom: "Slalom", side: "Wave & Freestyle",
};

export default function KnowledgePage() {
  const [skills, setSkills] = useState<ShelfRow[]>([]);
  const [equipment, setEquipment] = useState<ShelfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [dump, setDump] = useState("");
  const [assisting, setAssisting] = useState(false);
  const [questions, setQuestions] = useState<{ section: string; question: string }[]>([]);
  const [toast, setToast] = useState("");

  const loadShelf = useCallback(async () => {
    const d = await fetch("/api/admin/kb").then((r) => r.json()).catch(() => null);
    if (d?.skills) { setSkills(d.skills); setEquipment(d.equipment ?? []); }
    setLoading(false);
  }, []);
  useEffect(() => { loadShelf(); }, [loadShelf]);

  async function openEntry(row: ShelfRow) {
    setQuestions([]); setDump("");
    let id = row.entryId;
    if (!id) {
      const r = await fetch("/api/admin/kb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: row.kind, refKey: row.refKey, title: row.label }) }).then((x) => x.json());
      id = r.id ?? null;
      if (!id) { setToast(r.error || "Could not open entry."); return; }
      loadShelf();
    }
    setOpenId(id);
    const d = await fetch(`/api/admin/kb/${id}`).then((r) => r.json()).catch(() => null);
    if (d?.entry) { setEntry(d.entry); setSections(d.sections); }
  }

  async function newEquipment() {
    const title = prompt("Equipment entry title (e.g. “Slalom fin”)")?.trim();
    if (!title) return;
    const r = await fetch("/api/admin/kb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "equipment", title }) }).then((x) => x.json());
    if (r.id) { await loadShelf(); openEntry({ kind: "equipment", refKey: null, label: title, rank: null, discipline: null, sortOrder: 0, bonus: false, entryId: r.id, status: "draft", websiteVisible: false, sections: { total: 0, complete: 0 } }); }
    else setToast(r.error || "Could not create.");
  }

  async function saveSection(key: string, content: string) {
    if (!openId) return;
    setSections((ss) => ss.map((s) => (s.key === key ? { ...s, content, status: s.status === "missing" && content.trim() ? "draft" : s.status } : s)));
    await fetch(`/api/admin/kb/${openId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section: { key, content, status: content.trim() ? undefined : "missing" } }) }).catch(() => {});
  }

  async function toggleVisible() {
    if (!openId || !entry) return;
    const v = !entry.website_visible;
    setEntry({ ...entry, website_visible: v });
    await fetch(`/api/admin/kb/${openId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ website_visible: v }) }).catch(() => {});
    loadShelf();
  }

  async function assist() {
    if (!openId || !dump.trim()) return;
    setAssisting(true); setQuestions([]);
    const r = await fetch(`/api/admin/kb/${openId}/assist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ braindump: dump }) }).then((x) => x.json()).catch(() => null);
    setAssisting(false);
    if (!r?.ok) { setToast(r?.error || "Assistant failed — try again."); return; }
    setDump("");
    setQuestions(r.openQuestions ?? []);
    const d = await fetch(`/api/admin/kb/${openId}`).then((x) => x.json()).catch(() => null);
    if (d?.entry) { setEntry(d.entry); setSections(d.sections); }
    loadShelf();
    setToast(r.complete ? "All sections complete ✓" : `Sorted in — ${r.openQuestions?.length ?? 0} questions still open.`);
  }

  const dot = (s: string) => s === "complete" ? "#22c55e" : s === "draft" ? "#f59e0b" : "var(--admin-border)";
  // Discipline → rank → skills, with anything of an unknown discipline kept
  // rather than filtered away, so a new discipline can never vanish silently.
  const known = new Set(DISCIPLINE_ORDER);
  const disciplines = [...DISCIPLINE_ORDER, ...[...new Set(skills.map((s) => s.discipline ?? "")).values()].filter((d) => d && !known.has(d))];
  const shelfGroups = disciplines.map((d) => {
    const rows = skills.filter((s) => (s.discipline ?? "") === d);
    return {
      discipline: d,
      label: DISCIPLINE_LABEL[d] ?? (d ? d[0].toUpperCase() + d.slice(1) : "Other"),
      done: rows.filter((r) => r.sections.total > 0 && r.sections.complete === r.sections.total).length,
      total: rows.length,
      bands: RANK_ORDER.map((rank) => ({ rank, rows: rows.filter((r) => (r.rank ?? "") === rank) })).filter((b) => b.rows.length),
    };
  }).filter((g) => g.total);

  return (
    <div className="p-4 sm:p-6 max-w-[1400px]">
      <h1 className="text-xl font-bold admin-heading mb-1">Knowledge Base</h1>
      <p className="text-[13px] admin-faint mb-5">The coaching brain — how to teach every skill, drills, fixes, gear. Dump your thoughts; the assistant sorts them in and asks what&apos;s missing.</p>
      {toast && <div className="mb-4 px-4 py-2.5 rounded-lg text-sm" style={{ backgroundColor: "var(--admin-accent-weak)", color: "var(--admin-accent)" }} onClick={() => setToast("")}>{toast}</div>}

      <div className="grid lg:grid-cols-[340px_1fr] gap-5 items-start">
        {/* shelf */}
        <div className="rounded-xl p-3 space-y-4 max-h-[75vh] overflow-y-auto" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          {loading && <p className="text-xs admin-faint p-2">Loading…</p>}
          {shelfGroups.map((g) => (
            <div key={g.discipline}>
              <p className="flex items-center justify-between text-[11px] font-bold admin-heading px-2 mb-1.5 pt-1">
                <span>{g.label}</span>
                <span className="text-[10px] font-semibold admin-faint">{g.done}/{g.total}</span>
              </p>
              {g.bands.map((b) => (
                <div key={b.rank} className="mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider admin-faint px-2 mb-1">{b.rank}</p>
                  {b.rows.map((r) => (
                <button key={r.refKey} onClick={() => openEntry(r)}
                  className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg text-[13px] transition-colors ${entry && r.entryId === openId ? "font-bold" : ""}`}
                  style={entry && r.entryId === openId ? { backgroundColor: "var(--admin-accent-weak)" } : undefined}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot(r.status) }} />
                  <span className="truncate admin-heading">{r.label}</span>
                  <span className="ml-auto text-[10px] admin-faint shrink-0">
                    {r.sections.total ? `${r.sections.complete}/${r.sections.total}` : ""}{r.websiteVisible ? " · 👁" : ""}
                  </span>
                </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <p className="text-[10px] uppercase tracking-wider admin-faint">Equipment</p>
              <button onClick={newEquipment} className="text-[11px] font-bold" style={{ color: "var(--admin-accent)" }}>+ New</button>
            </div>
            {equipment.map((r) => (
              <button key={r.entryId} onClick={() => openEntry(r)}
                className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg text-[13px]"
                style={r.entryId === openId ? { backgroundColor: "var(--admin-accent-weak)" } : undefined}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot(r.status) }} />
                <span className="truncate admin-heading">{r.label}</span>
              </button>
            ))}
            {equipment.length === 0 && <p className="text-[11px] admin-faint px-2">No equipment entries yet.</p>}
          </div>
        </div>

        {/* editor */}
        {entry ? (
          <div className="space-y-4">
            <div className="rounded-xl p-4 sm:p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold admin-heading flex-1 min-w-0 truncate">{entry.title}</h2>
                <span className="text-[10px] font-bold uppercase px-2 py-1 rounded" style={{ backgroundColor: entry.status === "complete" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)", color: entry.status === "complete" ? "#22c55e" : "#f59e0b" }}>{entry.status}</span>
                <label className="flex items-center gap-2 text-xs admin-muted cursor-pointer">
                  <input type="checkbox" checked={!!entry.website_visible} onChange={toggleVisible} className="w-4 h-4 accent-[var(--admin-accent)]" />
                  Show to members
                </label>
              </div>
              {/* braindump */}
              <div className="mt-4">
                <textarea value={dump} onChange={(e) => setDump(e.target.value)} rows={4}
                  placeholder="Braindump — write your thoughts as they come. The assistant sorts them into the sections below and asks what's still missing."
                  className="w-full admin-input border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#0aa3c7]" style={{ borderColor: "var(--admin-border)" }} />
                <div className="flex items-center gap-3 mt-2">
                  <button onClick={assist} disabled={assisting || !dump.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40" style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
                    {assisting ? "Sorting in…" : "Sort it in"}
                  </button>
                  <span className="text-[11px] admin-faint">Nothing is overwritten — the assistant merges into what&apos;s there.</span>
                </div>
              </div>
              {questions.length > 0 && (
                <div className="mt-4 rounded-lg px-4 py-3" style={{ border: "1px solid rgba(245,158,11,0.4)", backgroundColor: "rgba(245,158,11,0.07)" }}>
                  <p className="text-[12px] font-bold mb-1.5" style={{ color: "#f59e0b" }}>Still open — answer these in your next braindump:</p>
                  {questions.map((q, i) => (
                    <p key={i} className="text-[12.5px] admin-muted leading-relaxed">• <span className="admin-faint">[{q.section}]</span> {q.question}</p>
                  ))}
                </div>
              )}
            </div>

            {sections.map((s) => (
              <div key={s.key} className="rounded-xl p-4 sm:p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot(s.status) }} />
                  <h3 className="text-sm font-bold admin-heading">{s.label}</h3>
                  <span className="text-[10px] uppercase admin-faint ml-auto">{s.status}</span>
                </div>
                <p className="text-[11.5px] admin-faint mb-2">{s.hint}</p>
                <textarea defaultValue={s.content} rows={Math.max(3, Math.min(14, s.content.split("\n").length + 1))}
                  onBlur={(e) => { if (e.target.value !== s.content) saveSection(s.key, e.target.value); }}
                  className="w-full admin-input border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#0aa3c7] font-mono leading-relaxed" style={{ borderColor: "var(--admin-border)" }} />
                {s.status !== "complete" && s.openQuestions.length > 0 && (
                  <div className="mt-2">
                    {s.openQuestions.map((q, i) => <p key={i} className="text-[11.5px]" style={{ color: "#b97608" }}>? {q}</p>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl p-10 text-center text-sm admin-faint" style={{ border: "1px dashed var(--admin-border)" }}>
            Pick a skill on the left — or create an equipment entry.
          </div>
        )}
      </div>
    </div>
  );
}
