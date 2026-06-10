"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import ImagePickerModal from "@/components/image-picker-modal";

type ProgramItem = { title: string; description: string };
type FaqItem = { q: string; a: string };
type Review = { name: string; country: string; quote: string; rating: number; image: string };

type PickerTarget =
  | { kind: "tile" }
  | { kind: "hero" }
  | { kind: "gallery" }
  | { kind: "review"; index: number };

export default function ContentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  // images
  const [tileImage, setTileImage] = useState("");
  const [heroImage, setHeroImage] = useState("");
  const [heroVideo, setHeroVideo] = useState("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  // text
  const [locationAbout, setLocationAbout] = useState("");
  const [weekInfo, setWeekInfo] = useState("");
  const [program, setProgram] = useState<ProgramItem[]>([]);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [faq, setFaq] = useState<FaqItem[]>([]);

  useEffect(() => {
    fetch(`/api/admin/content/${id}`)
      .then((r) => r.json())
      .then((c) => {
        if (!c) return;
        setTitle(c._title ?? "");
        setSlug(c._slug ?? "");
        setTileImage(c.tile_image ?? "");
        setHeroImage(c.hero_image ?? "");
        setHeroVideo(c.hero_video_url ?? "");
        setGallery(Array.isArray(c.gallery) ? c.gallery : []);
        setReviews(Array.isArray(c.reviews) ? c.reviews : []);
        setLocationAbout(c.location_about ?? "");
        setWeekInfo(c.week_info ?? "");
        setProgram(Array.isArray(c.daily_program) ? c.daily_program : []);
        setHighlights(Array.isArray(c.highlights) ? c.highlights : []);
        setFaq(Array.isArray(c.faq) ? c.faq : []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  function applyPicked(url: string) {
    if (!picker) return;
    if (picker.kind === "tile") setTileImage(url);
    else if (picker.kind === "hero") setHeroImage(url);
    else if (picker.kind === "gallery") setGallery((g) => [...g, url]);
    else if (picker.kind === "review") setReviews((rs) => rs.map((r, i) => (i === picker.index ? { ...r, image: url } : r)));
    setPicker(null);
  }

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    const res = await fetch(`/api/admin/content/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tile_image: tileImage,
        hero_image: heroImage,
        hero_video_url: heroVideo,
        gallery,
        reviews,
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

  const move = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  if (loading) return <div className="p-8 text-sm admin-faint">Loading…</div>;

  return (
    <div className="p-6 sm:p-8 max-w-[860px] mx-auto pb-28">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Link href="/admin/content" className="text-xs admin-faint hover:admin-heading">← Website Content</Link>
          <h1 className="text-2xl font-bold admin-heading mt-1">{title || "Experience"}</h1>
          <p className="text-sm admin-muted mt-0.5">Public-page content · shown on the experience page</p>
        </div>
        {slug && (
          <Link href={`/experience/${slug}`} target="_blank" className="shrink-0 text-[12px] font-semibold text-[#0aa3c7] hover:underline">View live ↗</Link>
        )}
      </div>

      <div className="space-y-7">
        {/* IMAGES */}
        <Section title="Tile image" hint="Shown on the experiences list (mirrors the experiences admin).">
          <ImageField url={tileImage} onPick={() => setPicker({ kind: "tile" })} onClear={() => setTileImage("")} ratio="aspect-[16/10]" />
        </Section>

        <Section title="Event hero" hint="The big image at the top of the event page. Paste a YouTube link for a video background, or pick an image. Video wins if both are set.">
          <input
            value={heroVideo}
            onChange={(e) => setHeroVideo(e.target.value)}
            placeholder="YouTube link (optional) — e.g. https://youtu.be/…"
            className="admin-input w-full px-4 py-2.5 rounded-lg border text-sm outline-none mb-3"
          />
          {heroVideo.trim() ? (
            <div className="admin-surface admin-border border rounded-xl p-3 text-[13px] admin-muted">
              ▶ Using YouTube video background. Clear the field above to use an image instead.
            </div>
          ) : (
            <ImageField url={heroImage} onPick={() => setPicker({ kind: "hero" })} onClear={() => setHeroImage("")} ratio="aspect-[21/9]" />
          )}
        </Section>

        <Section title="Gallery" hint="Photos shown in the gallery grid.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {gallery.map((url, i) => (
              <div key={i} className="relative group aspect-square rounded-lg overflow-hidden admin-border border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MiniBtn onClick={() => setGallery(move(gallery, i, -1))} label="←"><path d="M15 18l-6-6 6-6" /></MiniBtn>
                  <MiniBtn onClick={() => setGallery(move(gallery, i, 1))} label="→"><path d="M9 18l6-6-6-6" /></MiniBtn>
                  <MiniBtn onClick={() => setGallery(gallery.filter((_, j) => j !== i))} label="remove" danger><path d="M18 6L6 18M6 6l12 12" /></MiniBtn>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setPicker({ kind: "gallery" })}
              className="aspect-square rounded-lg border-2 border-dashed admin-border grid place-items-center admin-muted hover:admin-heading hover:border-[#0aa3c7] transition-colors">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
        </Section>

        {/* TEXT */}
        <Section title="About the location" hint="The windsurf spot / destination. Line breaks are kept.">
          <textarea value={locationAbout} onChange={(e) => setLocationAbout(e.target.value)} rows={5}
            placeholder="Bonaire is a flat-water paradise…" className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y" />
        </Section>

        <Section title="About the week" hint="Extra context about how this trip runs.">
          <textarea value={weekInfo} onChange={(e) => setWeekInfo(e.target.value)} rows={4}
            placeholder="A relaxed week built around the best wind windows…" className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y" />
        </Section>

        <Section title="Perfect week — daily program" hint="What a perfect week looks like. Note on the page tells guests the real schedule depends on the wind.">
          <div className="space-y-3">
            {program.map((p, i) => (
              <div key={i} className="admin-surface admin-border border rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-bold admin-faint w-12">Day {i + 1}</span>
                  <input value={p.title} onChange={(e) => setProgram(program.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    placeholder="Title (e.g. Arrival & warm-up)" className="admin-input flex-1 px-3 py-2 rounded-md border text-sm outline-none" />
                  <RowButtons onUp={() => setProgram(move(program, i, -1))} onDown={() => setProgram(move(program, i, 1))} onRemove={() => setProgram(program.filter((_, j) => j !== i))} />
                </div>
                <textarea value={p.description} onChange={(e) => setProgram(program.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                  rows={2} placeholder="What happens on this day…" className="admin-input w-full px-3 py-2 rounded-md border text-sm outline-none resize-y" />
              </div>
            ))}
            <AddButton label="Add day" onClick={() => setProgram([...program, { title: "", description: "" }])} />
          </div>
        </Section>

        <Section title="Highlights" hint="Short 'why this trip' bullets.">
          <div className="space-y-2">
            {highlights.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={h} onChange={(e) => setHighlights(highlights.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder="e.g. World-class flat-water freestyle" className="admin-input flex-1 px-3 py-2 rounded-md border text-sm outline-none" />
                <RowButtons onUp={() => setHighlights(move(highlights, i, -1))} onDown={() => setHighlights(move(highlights, i, 1))} onRemove={() => setHighlights(highlights.filter((_, j) => j !== i))} />
              </div>
            ))}
            <AddButton label="Add highlight" onClick={() => setHighlights([...highlights, ""])} />
          </div>
        </Section>

        <Section title="Reviews" hint="Guest testimonials shown on the page.">
          <div className="space-y-3">
            {reviews.map((r, i) => (
              <div key={i} className="admin-surface admin-border border rounded-xl p-3.5 flex gap-3">
                <button type="button" onClick={() => setPicker({ kind: "review", index: i })}
                  className="shrink-0 w-16 h-16 rounded-lg overflow-hidden admin-border border grid place-items-center admin-faint hover:border-[#0aa3c7] transition-colors">
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
                  )}
                </button>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex gap-2">
                    <input value={r.name} onChange={(e) => setReviews(reviews.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" className="admin-input flex-1 px-3 py-1.5 rounded-md border text-sm outline-none" />
                    <input value={r.country} onChange={(e) => setReviews(reviews.map((x, j) => (j === i ? { ...x, country: e.target.value } : x)))} placeholder="Country" className="admin-input w-32 px-3 py-1.5 rounded-md border text-sm outline-none" />
                    <Stars value={r.rating} onChange={(v) => setReviews(reviews.map((x, j) => (j === i ? { ...x, rating: v } : x)))} />
                  </div>
                  <textarea value={r.quote} onChange={(e) => setReviews(reviews.map((x, j) => (j === i ? { ...x, quote: e.target.value } : x)))} rows={2} placeholder="Quote…" className="admin-input w-full px-3 py-2 rounded-md border text-sm outline-none resize-y" />
                </div>
                <RowButtons onUp={() => setReviews(move(reviews, i, -1))} onDown={() => setReviews(move(reviews, i, 1))} onRemove={() => setReviews(reviews.filter((_, j) => j !== i))} />
              </div>
            ))}
            <AddButton label="Add review" onClick={() => setReviews([...reviews, { name: "", country: "", quote: "", rating: 5, image: "" }])} />
          </div>
        </Section>

        <Section title="FAQ" hint="Trip-specific questions. Leave empty to use the default FAQ.">
          <div className="space-y-3">
            {faq.map((f, i) => (
              <div key={i} className="admin-surface admin-border border rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <input value={f.q} onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} placeholder="Question" className="admin-input flex-1 px-3 py-2 rounded-md border text-sm outline-none font-medium" />
                  <RowButtons onUp={() => setFaq(move(faq, i, -1))} onDown={() => setFaq(move(faq, i, 1))} onRemove={() => setFaq(faq.filter((_, j) => j !== i))} />
                </div>
                <textarea value={f.a} onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} rows={2} placeholder="Answer…" className="admin-input w-full px-3 py-2 rounded-md border text-sm outline-none resize-y" />
              </div>
            ))}
            <AddButton label="Add question" onClick={() => setFaq([...faq, { q: "", a: "" }])} />
          </div>
        </Section>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 admin-surface border-t admin-border">
        <div className="max-w-[860px] mx-auto px-6 sm:px-8 py-3 flex items-center justify-end gap-4">
          {error && <span className="text-[13px] text-red-400 mr-auto">{error}</span>}
          {saved && <span className="text-[13px] text-green-400 mr-auto">Saved ✓</span>}
          <button onClick={save} disabled={saving} className="px-6 py-2.5 rounded-lg text-[13px] font-bold bg-[#0aa3c7] text-white hover:bg-[#0aa3c7]/90 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save content"}
          </button>
        </div>
      </div>

      {picker && <ImagePickerModal onSelect={applyPicked} onClose={() => setPicker(null)} />}
    </div>
  );
}

function ImageField({ url, onPick, onClear, ratio }: { url: string; onPick: () => void; onClear: () => void; ratio: string }) {
  if (url) {
    return (
      <div className={`relative ${ratio} rounded-xl overflow-hidden admin-border border max-w-[480px]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="w-full h-full object-cover" />
        <div className="absolute top-2 right-2 flex gap-1.5">
          <button onClick={onPick} className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-black/60 text-white hover:bg-black/80">Change</button>
          <button onClick={onClear} className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-black/60 text-white hover:bg-red-500">Remove</button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={onPick} className={`${ratio} max-w-[480px] w-full rounded-xl border-2 border-dashed admin-border grid place-items-center admin-muted hover:admin-heading hover:border-[#0aa3c7] transition-colors`}>
      <span className="flex flex-col items-center gap-1.5 text-[13px] font-semibold">
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
        Choose image
      </span>
    </button>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} stars`}
          className={`text-[16px] leading-none ${n <= value ? "text-[#ffc42e]" : "admin-faint"}`}>★</button>
      ))}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[15px] font-bold admin-heading">{title}</h2>
      {hint ? <p className="text-xs admin-faint mb-3 mt-0.5">{hint}</p> : <div className="mb-3" />}
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

function MiniBtn({ onClick, label, children, danger }: { onClick: () => void; label: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={`w-6 h-6 grid place-items-center rounded bg-black/60 text-white hover:bg-black/80 ${danger ? "hover:bg-red-500" : ""}`}>
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0aa3c7] hover:gap-2.5 transition-all">
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
      {label}
    </button>
  );
}
