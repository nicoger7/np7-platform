"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

type ProgramItem = { title: string; description: string };
type FaqItem = { q: string; a: string };

export default function ContentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  const [locationAbout, setLocationAbout] = useState("");
  const [weekInfo, setWeekInfo] = useState("");
  const [program, setProgram] = useState<ProgramItem[]>([]);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [faq, setFaq] = useState<FaqItem[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/experiences/${id}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/admin/content/${id}`).then((r) => r.json()).catch(() => null),
    ]).then(([exp, content]) => {
      if (exp) {
        setTitle(exp.title ?? "");
        setSlug(exp.slug ?? "");
      }
      if (content) {
        setLocationAbout(content.location_about ?? "");
        setWeekInfo(content.week_info ?? "");
        setProgram(Array.isArray(content.daily_program) ? content.daily_program : []);
        setHighlights(Array.isArray(content.highlights) ? content.highlights : []);
        setFaq(Array.isArray(content.faq) ? content.faq : []);
      }
      setLoading(false);
    });
  }, [id]);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    const res = await fetch(`/api/admin/content/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location_about: locationAbout,
        week_info: weekInfo,
        daily_program: program,
        highlights,
        faq,
      }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to save");
    }
    setSaving(false);
  }

  // --- list helpers ---
  const move = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  if (loading) {
    return <div className="p-8 text-sm admin-faint">Loading…</div>;
  }

  return (
    <div className="p-6 sm:p-8 max-w-[820px] mx-auto pb-28">
      {/* header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Link href="/admin/content" className="text-xs admin-faint hover:admin-heading">← Website Content</Link>
          <h1 className="text-2xl font-bold admin-heading mt-1">{title || "Experience"}</h1>
          <p className="text-sm admin-muted mt-0.5">Public-page content · shown on the experience page</p>
        </div>
        {slug && (
          <Link href={`/experience/${slug}`} target="_blank" className="shrink-0 text-[12px] font-semibold text-[#0aa3c7] hover:underline">
            View live ↗
          </Link>
        )}
      </div>

      <div className="space-y-7">
        {/* location */}
        <Section title="About the location" hint="The windsurf spot / destination. Plain text — line breaks are kept.">
          <textarea value={locationAbout} onChange={(e) => setLocationAbout(e.target.value)} rows={5}
            placeholder="Bonaire is a flat-water paradise in the Dutch Caribbean…"
            className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y" />
        </Section>

        {/* week */}
        <Section title="About the week" hint="Extra context about how this specific week runs.">
          <textarea value={weekInfo} onChange={(e) => setWeekInfo(e.target.value)} rows={4}
            placeholder="A relaxed week built around the best wind windows…"
            className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y" />
        </Section>

        {/* daily program */}
        <Section title="Daily program" hint="Day-by-day plan. Leave empty to use the default itinerary.">
          <div className="space-y-3">
            {program.map((p, i) => (
              <div key={i} className="admin-surface admin-border border rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-bold admin-faint w-12">Day {i + 1}</span>
                  <input value={p.title} onChange={(e) => setProgram(program.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                    placeholder="Title (e.g. Arrival & warm-up)"
                    className="admin-input flex-1 px-3 py-2 rounded-md border text-sm outline-none" />
                  <RowButtons
                    onUp={() => setProgram(move(program, i, -1))}
                    onDown={() => setProgram(move(program, i, 1))}
                    onRemove={() => setProgram(program.filter((_, j) => j !== i))}
                  />
                </div>
                <textarea value={p.description} onChange={(e) => setProgram(program.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                  rows={2} placeholder="What happens on this day…"
                  className="admin-input w-full px-3 py-2 rounded-md border text-sm outline-none resize-y" />
              </div>
            ))}
            <AddButton label="Add day" onClick={() => setProgram([...program, { title: "", description: "" }])} />
          </div>
        </Section>

        {/* highlights */}
        <Section title="Highlights" hint="Short 'why this trip' bullets.">
          <div className="space-y-2">
            {highlights.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={h} onChange={(e) => setHighlights(highlights.map((x, j) => j === i ? e.target.value : x))}
                  placeholder="e.g. World-class flat-water freestyle"
                  className="admin-input flex-1 px-3 py-2 rounded-md border text-sm outline-none" />
                <RowButtons
                  onUp={() => setHighlights(move(highlights, i, -1))}
                  onDown={() => setHighlights(move(highlights, i, 1))}
                  onRemove={() => setHighlights(highlights.filter((_, j) => j !== i))}
                />
              </div>
            ))}
            <AddButton label="Add highlight" onClick={() => setHighlights([...highlights, ""])} />
          </div>
        </Section>

        {/* faq */}
        <Section title="FAQ" hint="Trip-specific questions. Leave empty to use the default FAQ.">
          <div className="space-y-3">
            {faq.map((f, i) => (
              <div key={i} className="admin-surface admin-border border rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <input value={f.q} onChange={(e) => setFaq(faq.map((x, j) => j === i ? { ...x, q: e.target.value } : x))}
                    placeholder="Question"
                    className="admin-input flex-1 px-3 py-2 rounded-md border text-sm outline-none font-medium" />
                  <RowButtons
                    onUp={() => setFaq(move(faq, i, -1))}
                    onDown={() => setFaq(move(faq, i, 1))}
                    onRemove={() => setFaq(faq.filter((_, j) => j !== i))}
                  />
                </div>
                <textarea value={f.a} onChange={(e) => setFaq(faq.map((x, j) => j === i ? { ...x, a: e.target.value } : x))}
                  rows={2} placeholder="Answer…"
                  className="admin-input w-full px-3 py-2 rounded-md border text-sm outline-none resize-y" />
              </div>
            ))}
            <AddButton label="Add question" onClick={() => setFaq([...faq, { q: "", a: "" }])} />
          </div>
        </Section>
      </div>

      {/* sticky save bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 admin-surface border-t admin-border">
        <div className="max-w-[820px] mx-auto px-6 sm:px-8 py-3 flex items-center justify-end gap-4">
          {error && <span className="text-[13px] text-red-400 mr-auto">{error}</span>}
          {saved && <span className="text-[13px] text-green-400 mr-auto">Saved ✓</span>}
          <button onClick={save} disabled={saving}
            className="px-6 py-2.5 rounded-lg text-[13px] font-bold bg-[#0aa3c7] text-white hover:bg-[#0aa3c7]/90 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save content"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[15px] font-bold admin-heading">{title}</h2>
      {hint && <p className="text-xs admin-faint mb-3 mt-0.5">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

function RowButtons({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <IconBtn onClick={onUp} label="Move up"><path d="M18 15l-6-6-6 6" /></IconBtn>
      <IconBtn onClick={onDown} label="Move down"><path d="M6 9l6 6 6-6" /></IconBtn>
      <IconBtn onClick={onRemove} label="Remove" danger><path d="M18 6L6 18M6 6l12 12" /></IconBtn>
    </div>
  );
}

function IconBtn({ onClick, label, children, danger }: { onClick: () => void; label: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={`w-7 h-7 grid place-items-center rounded-md admin-border border admin-muted hover:admin-heading transition-colors ${danger ? "hover:text-red-400 hover:border-red-400/40" : ""}`}>
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0aa3c7] hover:gap-2.5 transition-all">
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
      {label}
    </button>
  );
}
