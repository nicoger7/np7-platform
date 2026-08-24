"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { DEFAULT_DAILY_PROGRAM, DEFAULT_FAQ, DEFAULT_METHOD_INTRO, DEFAULT_METHOD_STEPS, DEFAULT_OUTCOMES, DEFAULT_WEEK_INFO } from "@/lib/experience-defaults";
import ImagePickerModal from "@/components/image-picker-modal";
import { EditionGuidesEditor } from "@/components/edition-guides-editor";
import { ReviewPlacementsEditor } from "@/components/edition-reviews-editor";
import { placeFromLocation, flagFromLocation, type TilePlacement } from "@/lib/experience-tile";
import { TilePlacementEditor, HeroFocusPicker } from "@/components/admin/placement-editors";
import { EventDatesEditor } from "@/components/admin/event-dates-editor";
import { EditionProgramEditor } from "@/components/admin/edition-program-editor";
import { editionOptionLabel } from "@/lib/edition-label";

type ProgramItem = { title: string; description: string };
type FaqItem = { q: string; a: string };
type Review = { name: string; country: string; quote: string; rating: number; image: string };

type PickerTarget =
  | { kind: "tile" }
  | { kind: "hero" }
  | { kind: "gallery" }
  | { kind: "review"; index: number }
  | { kind: "weekCard"; index: number };

/** What the live page renders while a section is left empty — shown, not
 *  described. "Leave empty to keep the standard copy" is only reassuring when
 *  the standard copy is right there to read. */
function DefaultBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2.5 rounded-lg px-3.5 py-2.5" style={{ border: "1px dashed var(--admin-border)" }}>
      <p className="text-[11px] font-bold admin-faint uppercase tracking-[0.1em] mb-1.5">Standard NP7 default — live while this is empty</p>
      <div className="text-[12.5px] admin-muted leading-relaxed space-y-1.5">{children}</div>
    </div>
  );
}

export default function ContentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [location, setLocation] = useState("");
  // Head coach for the live tile preview — same fallback the public card uses.
  const [headCoach, setHeadCoach] = useState<{ name: string; cutout: string | null } | null>(null);
  // Preview crew for the multi-coach tile: head first, then others WITH
  // cutouts (the real card uses the week's own coaches — this is the editor's
  // stand-in, same approximation the single-coach preview always made).
  const [previewCoaches, setPreviewCoaches] = useState<{ name: string; cutout: string | null }[]>([]);
  const [destination, setDestination] = useState<{ name: string; slug: string | null; text: string } | null>(null);

  // images
  const [tileImage, setTileImage] = useState("");
  const [tileAuto, setTileAuto] = useState(false);
  const [cardPlacement, setCardPlacement] = useState<TilePlacement>({});
  const [heroImage, setHeroImage] = useState("");
  const [heroFocus, setHeroFocus] = useState<string | null>(null);
  const [heroVideo, setHeroVideo] = useState("");
  const [heroVideoStart, setHeroVideoStart] = useState("");
  const [heroVideoEnd, setHeroVideoEnd] = useState("");
  const [explainerVideo, setExplainerVideo] = useState("");
  // event settings (page_template flips the whole public layout to the slim event page)
  const [pageTemplate, setPageTemplate] = useState<"full" | "event">("full");
  /** A clinic, not a travelled week — drives which sections are even offered. */
  const isEvent = pageTemplate === "event";
  const [eventMode, setEventMode] = useState<"fixed" | "standby">("fixed");
  const [eventDepositPct, setEventDepositPct] = useState(20);
  const [eventRefundPct, setEventRefundPct] = useState(15);
  const [expPrice, setExpPrice] = useState<number | null>(null);
  const [expCurrency, setExpCurrency] = useState("EUR");
  const [gallery, setGallery] = useState<string[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  // text
  const [locationAbout, setLocationAbout] = useState("");
  const [weekInfo, setWeekInfo] = useState("");
  const [program, setProgram] = useState<ProgramItem[]>([]);
  const [weekTitle, setWeekTitle] = useState("");
  const [weekOutcomes, setWeekOutcomes] = useState<{ icon: string; t: string; d: string }[]>([]);
  // Per-level versions of the same section. Empty for a level = that level
  // shows the shared copy above, which is what every experience does today.
  type LevelBlock = { title: string; cards: { icon: string; t: string; d: string }[] };
  const [byLevel, setByLevel] = useState<Record<string, LevelBlock>>({});
  const [lvlTab, setLvlTab] = useState("beginner");
  const lvlBlock = byLevel[lvlTab] ?? { title: "", cards: [] };
  const setLvl = (patch: Partial<LevelBlock>) =>
    setByLevel({ ...byLevel, [lvlTab]: { ...lvlBlock, ...patch } });
  const [methodIntro, setMethodIntro] = useState("");
  // Shared templates (153): when a section FOLLOWS a template, the editors show
  // the template's words and saving updates the template (all followers).
  // "Customise" detaches this one experience; empty fields = following.
  type TplInfo = { id: string; name: string; usedBy: number; body: Record<string, unknown> };
  const [methodTpl, setMethodTpl] = useState<TplInfo | null>(null);
  const [outcomesTpl, setOutcomesTpl] = useState<TplInfo | null>(null);
  const [methodMode, setMethodMode] = useState<"following" | "custom">("custom");
  const [outcomesMode, setOutcomesMode] = useState<"following" | "custom">("custom");
  const [weekImages, setWeekImages] = useState<(string | null)[]>([]);
  const [methodSteps, setMethodSteps] = useState<{ t: string; d: string; gameChanger: boolean }[]>([]);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [faq, setFaq] = useState<FaqItem[]>([]);
  const [packingList, setPackingList] = useState("");
  const [preTripNote, setPreTripNote] = useState("");

  // certainty
  const [windProbability, setWindProbability] = useState("");
  const [windRange, setWindRange] = useState("");
  const [noWindProgram, setNoWindProgram] = useState("");

  // Per-edition modules (guides/reviews differ per week)
  const [editions, setEditions] = useState<{ id: string; year: number | null; label: string | null }[]>([]);
  const [editionId, setEditionId] = useState("");
  const CONTENT_TABS = ["media", "story", "program", "pretrip", "event", "modules", "reviews", "faq"] as const;
  const [tab, setTab] = useState("media");
  // Story held five long sections in one scroll — the spot, the week, the wind,
  // six outcome cards and the whole method. You had to scroll past four of them
  // to reach the one you came for. Same sections, grouped by what they describe.
  const [story, setStory] = useState<"spot" | "week" | "method">("spot");

  // Restore the tab from the URL and reflect changes back into it, so the
  // readiness checklist can link straight at the field it is complaining about
  // instead of dropping you on Media to go hunting.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && (CONTENT_TABS as readonly string[]).includes(t)) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function selectTab(t: string) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
  }

  useEffect(() => {
    fetch(`/api/admin/content/${id}`)
      .then((r) => r.json())
      .then((c) => {
        if (!c) return;
        setTitle(c._title ?? "");
        setSlug(c._slug ?? "");
        setLocation(c._location ?? "");
        setTileImage(c.tile_image ?? "");
        setTileAuto(!!c.tile_auto);
        setCardPlacement(c.card_placement && typeof c.card_placement === "object" ? c.card_placement : {});
        setHeroImage(c.hero_image ?? "");
        setHeroFocus(c.hero_focus ?? null);
        setHeroVideo(c.hero_video_url ?? "");
        setHeroVideoStart(c.hero_video_start != null ? String(c.hero_video_start) : "");
        setHeroVideoEnd(c.hero_video_end != null ? String(c.hero_video_end) : "");
        setExplainerVideo(c.explainer_video_url ?? "");
        setPageTemplate(c.page_template === "event" ? "event" : "full");
        setEventMode(c.event_mode === "standby" ? "standby" : "fixed");
        setEventDepositPct(typeof c.event_deposit_pct === "number" ? c.event_deposit_pct : 20);
        setEventRefundPct(typeof c.event_refund_pct === "number" ? c.event_refund_pct : 15);
        setExpPrice(typeof c._price === "number" ? c._price : null);
        setExpCurrency(c._currency ?? "EUR");
        setGallery(Array.isArray(c.gallery) ? c.gallery : []);
        setReviews(Array.isArray(c.reviews) ? c.reviews : []);
        setLocationAbout(c.location_about ?? "");
        setDestination(c._destination ?? null);
        setWeekInfo(c.week_info ?? "");
        setProgram(Array.isArray(c.daily_program) ? c.daily_program : []);
        setWeekTitle(c.week_title ?? "");
        setWeekOutcomes(Array.isArray(c.week_outcomes) ? c.week_outcomes : []);
        setByLevel(c.week_outcomes_by_level && typeof c.week_outcomes_by_level === "object" ? c.week_outcomes_by_level : {});
        setMethodIntro(c.method_intro ?? "");
        setMethodSteps(Array.isArray(c.method_steps) ? c.method_steps : []);
        setWeekImages(Array.isArray(c.week_images) ? c.week_images : []);
        // Templates: fetch once, prefill any section that has no override.
        if (c.method_template_id || c.outcomes_template_id) {
          fetch("/api/admin/content-templates").then((r) => r.json()).then((d) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const list = (d.templates ?? []) as any[];
            const mt = list.find((t) => t.id === c.method_template_id);
            const ot = list.find((t) => t.id === c.outcomes_template_id);
            if (mt) {
              setMethodTpl({ id: mt.id, name: mt.name, usedBy: mt.usedBy, body: mt.body ?? {} });
              const own = (c.method_intro ?? "").trim() || (Array.isArray(c.method_steps) && c.method_steps.length);
              if (!own) {
                setMethodMode("following");
                setMethodIntro(String(mt.body?.intro ?? ""));
                setMethodSteps(Array.isArray(mt.body?.steps) ? mt.body.steps : []);
              }
            }
            if (ot) {
              setOutcomesTpl({ id: ot.id, name: ot.name, usedBy: ot.usedBy, body: ot.body ?? {} });
              const own = (c.week_title ?? "").trim() || (Array.isArray(c.week_outcomes) && c.week_outcomes.length);
              if (!own) {
                setOutcomesMode("following");
                setWeekTitle(String(ot.body?.title ?? ""));
                setWeekOutcomes(Array.isArray(ot.body?.cards) ? ot.body.cards : []);
              }
            }
          }).catch(() => {});
        }
        setHighlights(Array.isArray(c.highlights) ? c.highlights : []);
        setFaq(Array.isArray(c.faq) ? c.faq : []);
        setWindProbability(c.wind_probability ?? "");
        setWindRange(c.wind_range ?? "");
        setNoWindProgram(c.no_wind_program ?? "");
        setPackingList(c.packing_list ?? "");
        setPreTripNote(c.pre_trip_note ?? "");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetch("/api/admin/coaches").then((r) => r.json()).then((list) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr = (Array.isArray(list) ? list : []) as any[];
      const head = arr.find((c) => /head/i.test(String(c.role ?? ""))) ?? arr[0];
      if (head) setHeadCoach({ name: head.name, cutout: head.cutout_url ?? null });
      if (head) {
        const extras = arr.filter((c) => c !== head && c.cutout_url).slice(0, 2)
          .map((c) => ({ name: c.name as string, cutout: (c.cutout_url ?? null) as string | null }));
        setPreviewCoaches([{ name: head.name, cutout: head.cutout_url ?? null }, ...extras]);
      }
    }).catch(() => {});
    fetch("/api/admin/editions").then((r) => r.json()).then((d) => {
      const eds = (Array.isArray(d) ? d : []).filter((e: { experience_id: string }) => e.experience_id === id);
      setEditions(eds.map((e: { id: string; year: number | null; label: string | null }) => ({ id: e.id, year: e.year, label: e.label })));
      if (eds[0]) setEditionId((prev) => prev || eds[0].id);
    });
  }, [id]);

  function applyPicked(url: string) {
    if (!picker) return;
    if (picker.kind === "tile") setTileImage(url);
    else if (picker.kind === "hero") setHeroImage(url);
    else if (picker.kind === "gallery") setGallery((g) => [...g, url]);
    else if (picker.kind === "review") setReviews((rs) => rs.map((r, i) => (i === picker.index ? { ...r, image: url } : r)));
    else if (picker.kind === "weekCard") setWeekImages((imgs) => {
      const next = [...imgs];
      while (next.length <= picker.index) next.push(null);
      next[picker.index] = url;
      return next;
    });
    setPicker(null);
  }

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    // Following a template = the edits belong to the template (and to every
    // experience following it). Only PATCH when the content actually changed.
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (methodMode === "following" && methodTpl) {
      const next = { intro: methodIntro, steps: methodSteps };
      if (!same(next, { intro: methodTpl.body?.intro ?? "", steps: methodTpl.body?.steps ?? [] })) {
        const ok = methodTpl.usedBy <= 1 || confirm(`"${methodTpl.name}" is used by ${methodTpl.usedBy} experiences — saving updates ALL of them.\n\nUpdate the template?`);
        if (ok) {
          await fetch(`/api/admin/content-templates/${methodTpl.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: next }) }).catch(() => {});
          setMethodTpl({ ...methodTpl, body: next });
        }
      }
    }
    if (outcomesMode === "following" && outcomesTpl) {
      const next = { title: weekTitle, cards: weekOutcomes };
      if (!same(next, { title: outcomesTpl.body?.title ?? "", cards: outcomesTpl.body?.cards ?? [] })) {
        const ok = outcomesTpl.usedBy <= 1 || confirm(`"${outcomesTpl.name}" is used by ${outcomesTpl.usedBy} experiences — saving updates ALL of them.\n\nUpdate the template?`);
        if (ok) {
          await fetch(`/api/admin/content-templates/${outcomesTpl.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: next }) }).catch(() => {});
          setOutcomesTpl({ ...outcomesTpl, body: next });
        }
      }
    }
    const res = await fetch(`/api/admin/content/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tile_image: tileImage,
        tile_auto: tileAuto,
        card_placement: cardPlacement,
        page_template: pageTemplate,
        event_mode: eventMode,
        event_deposit_pct: eventDepositPct,
        event_refund_pct: eventRefundPct,
        hero_image: heroImage,
        hero_focus: heroFocus,
        hero_video_url: heroVideo,
        hero_video_start: heroVideoStart === "" ? null : Number(heroVideoStart),
        hero_video_end: heroVideoEnd === "" ? null : Number(heroVideoEnd),
        explainer_video_url: explainerVideo.trim() || null,
        gallery,
        reviews,
        location_about: locationAbout,
        week_info: weekInfo,
        daily_program: program,
        week_title: outcomesMode === "following" ? "" : weekTitle,
        week_outcomes: outcomesMode === "following" ? [] : weekOutcomes,
        // A level with no title and no cards is dropped rather than stored as
        // an empty object, so "nothing written here" stays the same thing as
        // "fall back to the shared copy".
        week_outcomes_by_level: Object.fromEntries(
          Object.entries(byLevel).filter(([, v]) =>
            (v?.title ?? "").trim() || (v?.cards ?? []).some((c) => (c?.t ?? "").trim()))
        ),
        method_intro: methodMode === "following" ? "" : methodIntro,
        method_steps: methodMode === "following" ? [] : methodSteps,
        week_images: weekImages,
        highlights,
        faq,
        wind_probability: windProbability,
        wind_range: windRange,
        no_wind_program: noWindProgram,
        packing_list: packingList,
        pre_trip_note: preTripNote,
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
          <Link href={`/experience/${slug}`} target="_blank"
            className="shrink-0 inline-flex items-center gap-2 rounded-full border border-[var(--admin-accent)] text-[var(--admin-accent)] text-[13px] font-bold px-4 py-2 hover:bg-[var(--admin-accent)]/10 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
            Preview page ↗
          </Link>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap items-center gap-1 mb-5" style={{ borderBottom: "1px solid var(--admin-border)" }}>
        {/* An event is a clinic, not a travelled week: there is no packing list,
            no pre-trip note, no flights — so Pre-trip is hidden rather than
            offered and left empty. Program stays (a two-day clinic has days),
            but it stops calling itself a perfect WEEK. */}
        {([["media", "Media"], ["story", "Story"], ["program", isEvent ? "Day by day" : "Program"], ["pretrip", "Pre-trip"], ["event", "Event"], ["modules", "Per-edition"], ["reviews", "Reviews"], ["faq", "FAQ"]] as const)
          .filter(([k]) => !(isEvent && k === "pretrip"))
          .map(([k, l]) => (
          <button key={k} onClick={() => selectTab(k)} className={`px-3.5 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${tab === k ? "admin-heading border-[var(--admin-accent)]" : "admin-muted border-transparent"}`}>{l}</button>
        ))}
      </div>

      <div className="space-y-7">
        {/* IMAGES */}
        <Section show={tab === "media"} title="Main image (card + hero)" hint="The experience's one main image: the card/tile on the overview grid AND the default page hero. A single week can override just its hero on the edition's Branding tab.">
          <ImageField url={tileImage} onPick={() => setPicker({ kind: "tile" })} onClear={() => setTileImage("")} ratio="aspect-[4/3]" />

          {/* Auto-brand toggle: compose the tile's flag / place name / coach live
              over a RAW photo, instead of uploading a hand-made graphic. */}
          <label className="mt-4 flex items-start gap-3 max-w-[480px] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={tileAuto}
              onChange={(e) => setTileAuto(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--admin-accent)]"
            />
            <span>
              <span className="block text-[13px] font-bold admin-heading">Auto-brand this card</span>
              <span className="block text-xs admin-faint mt-0.5 leading-relaxed">
                When on, upload a <strong>plain photo</strong> above (no text) — the overview card
                composites the country flag, the place name and the coach automatically.
                Leave off to use a hand-made graphic as-is (the current behaviour).
              </span>
            </span>
          </label>

          {/* interactive placement editor — drag the photo / coach / flag and see
              it across every real tile shape (the public card is fluid-width) */}
          {tileAuto && tileImage && (
            <div className="mt-4 max-w-[620px]">
              <p className="text-xs admin-faint mb-2">Fine-tune the card — drag to place the photo, coach and flag:</p>
              <TilePlacementEditor
                content={{
                  photo: tileImage,
                  place: placeFromLocation(location).toUpperCase(),
                  flag: flagFromLocation(location),
                  coachName: headCoach?.name ?? null,
                  coachCutout: headCoach?.cutout ?? null,
                  coaches: previewCoaches.length ? previewCoaches : undefined,
                }}
                value={cardPlacement}
                onChange={setCardPlacement}
              />
            </div>
          )}
        </Section>

        <Section show={tab === "media"} title="Event hero" hint="The big image at the top of the page. Paste a YouTube link for a video background, or pick an image. Video wins if both are set — use Start/End to loop just a segment.">
          <input
            value={heroVideo}
            onChange={(e) => setHeroVideo(e.target.value)}
            placeholder="YouTube link (optional) — e.g. https://youtu.be/…"
            className="admin-input w-full px-4 py-2.5 rounded-lg border text-sm outline-none mb-3"
          />
          <div className={`admin-surface admin-border border rounded-xl p-3 mb-3 ${heroVideo.trim() ? "" : "opacity-50"}`}>
            <p className="text-[13px] admin-muted mb-3">
              {heroVideo.trim() ? "▶ Using YouTube video background. Clear the field above to use an image instead." : "Timestamps — paste a YouTube link above to activate the segment loop."}
            </p>
              <div className="flex flex-wrap items-end gap-4">
                <label className="block">
                  <span className="block text-xs admin-muted mb-1">Start <span className="admin-faint">(seconds)</span></span>
                  <input
                    type="number" min={0} value={heroVideoStart}
                    onChange={(e) => setHeroVideoStart(e.target.value)}
                    placeholder="0"
                    className="admin-input w-28 px-3 py-2 rounded-lg border text-sm outline-none"
                  />
                  <span className="block text-[11px] admin-faint mt-1 tabular-nums">{mmss(heroVideoStart)}</span>
                </label>
                <label className="block">
                  <span className="block text-xs admin-muted mb-1">End <span className="admin-faint">(seconds)</span></span>
                  <input
                    type="number" min={0} value={heroVideoEnd}
                    onChange={(e) => setHeroVideoEnd(e.target.value)}
                    placeholder="full clip"
                    className="admin-input w-28 px-3 py-2 rounded-lg border text-sm outline-none"
                  />
                  <span className="block text-[11px] admin-faint mt-1 tabular-nums">{mmss(heroVideoEnd)}</span>
                </label>
                <p className="text-[11px] admin-faint max-w-[260px] leading-relaxed">
                  Leave both empty to loop the whole clip. Set a window to loop just that segment.
                </p>
              </div>
          </div>
          {!heroVideo.trim() && (
            <>
              <ImageField url={heroImage} onPick={() => setPicker({ kind: "hero" })} onClear={() => setHeroImage("")} ratio="aspect-[21/9]" />
              {heroImage && (
                <div className="mt-4 max-w-[620px]">
                  <p className="text-xs admin-faint mb-2">Focal point — where the hero stays centred as the screen reshapes it (wide on desktop, tall on phone):</p>
                  <HeroFocusPicker image={heroImage} value={heroFocus} onChange={setHeroFocus} />
                </div>
              )}
            </>
          )}
        </Section>

        <Section show={tab === "media"} title="Explainer video" hint="A YouTube video where Nico walks through the whole trip. Shows a click-to-play section on the event page; leave empty to hide it entirely.">
          <input
            value={explainerVideo}
            onChange={(e) => setExplainerVideo(e.target.value)}
            placeholder="YouTube link (optional) — e.g. https://youtu.be/…"
            className="admin-input w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
          />
          {explainerVideo.trim() && <p className="text-[12px] admin-faint mt-2">▶ A &ldquo;Watch the trip&rdquo; section will show on the event page.</p>}
        </Section>

        <Section show={tab === "media"} title="Gallery" hint="ORDER MATTERS: the first 6 photos illustrate the 'Your epic week' sections in order — 1 confidence on the water · 2 control & speed · 3 better jibes · 4 knowledge/theory · 5 friends/group · 6 photo & video. Photos 7+ are extra flavour (slideshow + gallery strip).">
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
              className="aspect-square rounded-lg border-2 border-dashed admin-border grid place-items-center admin-muted hover:admin-heading hover:border-[var(--admin-accent)] transition-colors">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
        </Section>

        {/* TEXT */}
        {tab === "story" && (
          <div className="flex flex-wrap gap-1.5">
            {([
              { k: "spot", label: "The spot", hint: "Where they ride, and what the wind does" },
              { k: "week", label: "Your week", hint: "The week's promise and its six cards" },
              { k: "method", label: "Method", hint: "The NP7 training system band" },
            ] as const).map((t) => (
              <button key={t.k} type="button" onClick={() => setStory(t.k)} title={t.hint}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors"
                style={story === t.k
                  ? { backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }
                  : { border: "1px solid var(--admin-border)" }}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        <Section show={tab === "story" && story === "spot"} title="About the location" hint="The text of ‘The spot’ section on the experience page. Line breaks are kept.">
          <textarea value={locationAbout} onChange={(e) => setLocationAbout(e.target.value)} rows={5}
            placeholder={destination?.text ? `Leave empty to keep using ${destination.name}'s own intro — shown below` : "Bonaire is a flat-water paradise…"}
            className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y" />
          {/* An empty box here does NOT mean an empty page: the destination's own
              intro fills the section. Showing it is the difference between
              "nothing is set" and "this is what's live". */}
          {!locationAbout.trim() && (destination?.text ? (
            <div className="mt-2.5 rounded-lg px-3.5 py-2.5" style={{ border: "1px dashed var(--admin-border)" }}>
              <p className="text-[11px] font-bold admin-faint uppercase tracking-[0.1em] mb-1">
                Live on the page — from the destination {destination.name}
              </p>
              <p className="text-[12.5px] admin-muted whitespace-pre-wrap leading-relaxed">{destination.text}</p>
              <a href="/admin/destinations" className="inline-block mt-2 text-[12px] font-bold text-[#0aa3c7] hover:underline">Edit it in Destinations →</a>
            </div>
          ) : (
            <p className="text-[12.5px] text-amber-500 mt-2">
              Nothing here and no destination text to fall back on — ‘The spot’ section is hidden on the live page.
            </p>
          ))}
        </Section>

        <Section show={tab === "story" && story === "week"} title="About the week" hint="The small paragraph under the intro of the ‘Your week’ scroll section.">
          <textarea value={weekInfo} onChange={(e) => setWeekInfo(e.target.value)} rows={4}
            placeholder="A relaxed week built around the best wind windows…" className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y" />
          {!weekInfo.trim() && (
            <DefaultBox><p>{DEFAULT_WEEK_INFO}</p></DefaultBox>
          )}
        </Section>

        <Section show={tab === "story" && story === "spot"} title="Wind certainty & no-wind program" hint="Wind range + probability show in three places: the quick-facts bar, the ‘You can count on it’ band and the wind chip next to the spot section. The no-wind program gets its own card further down. NO DEFAULT here: left empty, these simply don’t appear on the page.">
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="px-4 py-3 rounded-lg text-[12.5px] admin-muted leading-snug" style={{ border: "1px dashed var(--admin-border)" }}>
              <strong className="admin-heading">Wind probability is measured now.</strong> The page shows a small
              3-month graph from Open-Meteo&apos;s ERA5 archive (accelerated model) for the destination&apos;s
              coordinates, with the source printed under it — nothing to type, nothing to defend.
            </div>
            <input value={windRange} onChange={(e) => setWindRange(e.target.value)}
              placeholder="Wind range — e.g. 12–25 knots" className="admin-input px-4 py-2.5 rounded-lg border text-sm outline-none" />
          </div>
          <textarea value={noWindProgram} onChange={(e) => setNoWindProgram(e.target.value)} rows={3}
            placeholder="No-wind program — what happens on a rare light-wind day…" className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y" />
        </Section>

        <Section show={tab === "story" && story === "week"} title="Your week — outcome cards" hint="The six cards in the ‘Your epic week’ section. Leave everything empty to keep the standard NP7 cards; add your own to replace them. The title replaces ‘The best week of your windsurf year’. The cards’ PHOTOS are the first six gallery photos on the Media tab, in the same order — card 1 gets photo 1, and so on.">
          {outcomesTpl && (
            <div className="rounded-lg px-3.5 py-2.5 mb-3 text-[12.5px]" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-surface)" }}>
              {outcomesMode === "following" ? (
                <span className="admin-muted">Following <strong className="admin-heading">{outcomesTpl.name}</strong> · used by {outcomesTpl.usedBy} experiences — <strong className="admin-heading">saving updates all of them</strong>.{" "}
                  <button type="button" className="text-[#0aa3c7] font-semibold hover:underline" onClick={() => setOutcomesMode("custom")}>Customise this experience only</button>
                </span>
              ) : (
                <span className="admin-muted">Customised — no longer following <strong className="admin-heading">{outcomesTpl.name}</strong>.{" "}
                  <button type="button" className="text-[#0aa3c7] font-semibold hover:underline" onClick={() => {
                    setOutcomesMode("following");
                    setWeekTitle(String(outcomesTpl.body?.title ?? ""));
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setWeekOutcomes(Array.isArray(outcomesTpl.body?.cards) ? (outcomesTpl.body.cards as any[]) : []);
                  }}>Follow the template again</button>
                </span>
              )}
            </div>
          )}
          <input value={weekTitle} onChange={(e) => setWeekTitle(e.target.value)}
            placeholder="Section title — default: The best week of your windsurf year"
            className="admin-input w-full px-4 py-2.5 rounded-lg border text-sm outline-none mb-3" />
          {/* Edited as the cards they ARE. A stack of full-width text rows told
              you nothing about the thing being built — the photo is most of
              each card on the page, so it leads here too. */}
          <div className="grid sm:grid-cols-2 gap-3">
            {weekOutcomes.map((o, i) => (
              <div key={i} className="rounded-xl overflow-hidden flex flex-col"
                style={{ border: "1px solid var(--admin-border)", background: "var(--admin-surface)" }}>
                <button type="button" onClick={() => setPicker({ kind: "weekCard", index: i })}
                  className="relative w-full aspect-[16/10] group/img block">
                  {(weekImages[i] || gallery[i]) ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={(weekImages[i] || gallery[i]) as string} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,18,26,0.72) 0%, rgba(0,18,26,0.05) 55%)" }} />
                    </>
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-[11px] font-bold admin-faint">+ Photo</span>
                  )}
                  <span className="absolute top-2 left-2 grid place-items-center w-6 h-6 rounded-full bg-black/45 text-white text-[10px] font-black">{i + 1}</span>
                  <span className="absolute inset-0 grid place-items-center bg-black/45 text-white text-[11px] font-bold opacity-0 group-hover/img:opacity-100 transition-opacity">
                    {(weekImages[i] || gallery[i]) ? "Change photo" : "Choose or upload"}
                  </span>
                  {(weekImages[i] || gallery[i]) && (
                    <span className="absolute bottom-2 left-2 right-2 text-left text-[13px] font-extrabold text-white leading-tight line-clamp-2">
                      {o.t || "Card title"}
                    </span>
                  )}
                </button>

                <div className="p-3 flex flex-col gap-2 flex-1">
                  <div className="flex items-center gap-2">
                    <select value={o.icon} onChange={(e) => setWeekOutcomes(weekOutcomes.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)))}
                      className="admin-input px-2 py-1.5 rounded-md border text-xs outline-none shrink-0">
                      {["bolt", "gauge", "rotate", "idea", "globe", "camera"].map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                    </select>
                    <input value={o.t} onChange={(e) => setWeekOutcomes(weekOutcomes.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))}
                      placeholder="Card title" className="admin-input flex-1 min-w-0 px-2.5 py-1.5 rounded-md border text-sm outline-none" />
                  </div>
                  <textarea value={o.d} onChange={(e) => setWeekOutcomes(weekOutcomes.map((x, j) => (j === i ? { ...x, d: e.target.value } : x)))}
                    rows={3} placeholder="One or two sentences…" className="admin-input w-full px-2.5 py-2 rounded-md border text-[13px] outline-none resize-y flex-1" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] admin-faint truncate">
                      {weekImages[i] ? "Own photo" : gallery[i] ? `Gallery photo ${i + 1}` : "No photo yet"}
                      {weekImages[i] && (
                        <button type="button" onClick={() => setWeekImages((imgs) => imgs.map((x, j) => (j === i ? null : x)))}
                          className="ml-2 admin-faint hover:admin-heading underline">reset</button>
                      )}
                    </span>
                    <RowButtons onUp={() => setWeekOutcomes(move(weekOutcomes, i, -1))} onDown={() => setWeekOutcomes(move(weekOutcomes, i, 1))} onRemove={() => setWeekOutcomes(weekOutcomes.filter((_, j) => j !== i))} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <AddButton label="Add card" onClick={() => setWeekOutcomes([...weekOutcomes, { icon: "bolt", t: "", d: "" }])} />
          </div>
          {weekOutcomes.length === 0 && (
            <DefaultBox>
              {DEFAULT_OUTCOMES.map((o, i) => (
                <p key={i}><strong className="admin-heading">{o.t}</strong> — {o.d}</p>
              ))}
            </DefaultBox>
          )}

          {/* Per-level copy. Optional by design: the website only shows the
              switcher on experiences that actually sell more than one coaching
              level, and a level left blank here simply shows the copy above. */}
          <div className="mt-8 pt-6" style={{ borderTop: "1px solid var(--admin-border)" }}>
            <h4 className="text-sm font-bold admin-heading mb-1">Different copy per coaching level</h4>
            <p className="text-[12.5px] admin-faint mb-3 leading-relaxed">
              Optional. Beginners and advanced riders get promised different things — write each one here and the
              website shows a small switcher above this section. Leave a level empty and it shows the cards above.
              The switcher only appears where the trip sells both levels.
            </p>
            <div className="flex gap-1.5 mb-3">
              {["beginner", "advanced"].map((k) => {
                const on = k === lvlTab;
                const filled = (byLevel[k]?.title ?? "").trim() || (byLevel[k]?.cards ?? []).some((c) => (c?.t ?? "").trim());
                return (
                  <button key={k} type="button" onClick={() => setLvlTab(k)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                    style={{ background: on ? "var(--admin-accent)" : "var(--admin-surface)",
                             color: on ? "var(--admin-accent-contrast)" : "inherit",
                             border: "1px solid var(--admin-border)" }}>
                    {k[0].toUpperCase() + k.slice(1)}{filled ? " ·" : ""}
                  </button>
                );
              })}
            </div>
            <label className="block text-[11px] font-bold uppercase tracking-wide admin-faint mb-1">Headline for this level</label>
            <input className="admin-input w-full px-2.5 py-1.5 rounded-md border text-sm outline-none" value={lvlBlock.title}
              onChange={(e) => setLvl({ title: e.target.value })}
              placeholder={weekTitle || "Leave empty to use the headline above"} />
            <div className="mt-3 space-y-2">
              {lvlBlock.cards.map((o, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-surface)" }}>
                  <div className="flex gap-2 mb-2">
                    <select value={o.icon} className="admin-input px-2 py-1.5 rounded-md border text-xs outline-none shrink-0"
                      onChange={(e) => setLvl({ cards: lvlBlock.cards.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) })}>
                      {["bolt", "gauge", "rotate", "idea", "globe", "camera"].map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                    </select>
                    <input className="admin-input flex-1 min-w-0 px-2.5 py-1.5 rounded-md border text-sm outline-none" value={o.t} placeholder="Card title"
                      onChange={(e) => setLvl({ cards: lvlBlock.cards.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)) })} />
                  </div>
                  <textarea className="admin-input w-full px-2.5 py-2 rounded-md border text-[13px] outline-none resize-y" rows={2} value={o.d} placeholder="One or two sentences…"
                    onChange={(e) => setLvl({ cards: lvlBlock.cards.map((x, j) => (j === i ? { ...x, d: e.target.value } : x)) })} />
                  <div className="mt-2">
                    <RowButtons
                      onUp={() => setLvl({ cards: move(lvlBlock.cards, i, -1) })}
                      onDown={() => setLvl({ cards: move(lvlBlock.cards, i, 1) })}
                      onRemove={() => setLvl({ cards: lvlBlock.cards.filter((_, j) => j !== i) })} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <AddButton label={`Add ${lvlTab} card`} onClick={() => setLvl({ cards: [...lvlBlock.cards, { icon: "bolt", t: "", d: "" }] })} />
            </div>
          </div>
        </Section>

        <Section show={tab === "story" && story === "method"} title="Coaching method" hint="The ‘NP7 training system’ band: intro + numbered steps. Leave empty to keep the standard method copy.">
          {methodTpl && (
            <div className="rounded-lg px-3.5 py-2.5 mb-3 text-[12.5px]" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-surface)" }}>
              {methodMode === "following" ? (
                <span className="admin-muted">Following <strong className="admin-heading">{methodTpl.name}</strong> · used by {methodTpl.usedBy} experiences — <strong className="admin-heading">saving updates all of them</strong>.{" "}
                  <button type="button" className="text-[#0aa3c7] font-semibold hover:underline" onClick={() => setMethodMode("custom")}>Customise this experience only</button>
                </span>
              ) : (
                <span className="admin-muted">Customised — no longer following <strong className="admin-heading">{methodTpl.name}</strong>.{" "}
                  <button type="button" className="text-[#0aa3c7] font-semibold hover:underline" onClick={() => {
                    setMethodMode("following");
                    setMethodIntro(String(methodTpl.body?.intro ?? ""));
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setMethodSteps(Array.isArray(methodTpl.body?.steps) ? (methodTpl.body.steps as any[]) : []);
                  }}>Follow the template again</button>
                </span>
              )}
            </div>
          )}
          <textarea value={methodIntro} onChange={(e) => setMethodIntro(e.target.value)} rows={3}
            placeholder="Method intro — default: Nico’s proven coaching approach…"
            className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y mb-3" />
          <div className="space-y-3">
            {methodSteps.map((m, i) => (
              <div key={i} className="admin-surface admin-border border rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-bold admin-faint w-8">{String(i + 1).padStart(2, "0")}</span>
                  <input value={m.t} onChange={(e) => setMethodSteps(methodSteps.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))}
                    placeholder="Step title (e.g. Video analysis)" className="admin-input flex-1 px-3 py-2 rounded-md border text-sm outline-none" />
                  <label className="flex items-center gap-1.5 text-[11px] admin-muted whitespace-nowrap">
                    <input type="checkbox" checked={m.gameChanger} onChange={(e) => setMethodSteps(methodSteps.map((x, j) => (j === i ? { ...x, gameChanger: e.target.checked } : x)))} />
                    game changer
                  </label>
                  <RowButtons onUp={() => setMethodSteps(move(methodSteps, i, -1))} onDown={() => setMethodSteps(move(methodSteps, i, 1))} onRemove={() => setMethodSteps(methodSteps.filter((_, j) => j !== i))} />
                </div>
                <textarea value={m.d} onChange={(e) => setMethodSteps(methodSteps.map((x, j) => (j === i ? { ...x, d: e.target.value } : x)))}
                  rows={2} placeholder="What this step means for the guest…" className="admin-input w-full px-3 py-2 rounded-md border text-sm outline-none resize-y" />
              </div>
            ))}
            <AddButton label="Add step" onClick={() => setMethodSteps([...methodSteps, { t: "", d: "", gameChanger: false }])} />
          </div>
                  {!methodIntro.trim() && methodSteps.length === 0 && (
            <DefaultBox>
              <p>{DEFAULT_METHOD_INTRO}</p>
              {DEFAULT_METHOD_STEPS.map((m, i) => (
                <p key={i}><strong className="admin-heading">{i + 1}. {m.t}</strong> — {m.d}{m.gameChanger ? " ★" : ""}</p>
              ))}
            </DefaultBox>
          )}
        </Section>

        <Section
          show={tab === "program"}
          title={isEvent ? "Day by day" : "Perfect week — daily program"}
          hint={isEvent ? "What happens on each day of the clinic. Leave empty and the page simply doesn't show a schedule." : "What a perfect week looks like. Note on the page tells guests the real schedule depends on the wind."}
        >
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
          {/* The six-day default is a WEEK. Showing it on a two-day clinic
              tells you a fiction is live when nothing is. */}
          {program.length === 0 && !isEvent && (
            <DefaultBox>
              {DEFAULT_DAILY_PROGRAM.map((d, i) => (
                <p key={i}><strong className="admin-heading">Day {i + 1}: {d.title}</strong> — {d.description}</p>
              ))}
            </DefaultBox>
          )}
        </Section>

        <Section show={tab === "program"} title="Highlights" hint="Short 'why this trip' bullets.">
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

        <Section show={tab === "pretrip"} title="Packing list" hint="What to bring — one item per line. The pre-trip email turns this into a checklist. Specific to this experience (you write it once, every edition's emails use it).">
          <textarea value={packingList} onChange={(e) => setPackingList(e.target.value)} rows={8}
            placeholder={"Board & sail (or use ours — included)\nWetsuit / boardshorts\nReef booties\nSunscreen (reef-safe) & after-sun\nReusable water bottle\nTravel insurance documents"}
            className="admin-input w-full px-3 py-2 rounded-md border text-sm outline-none resize-y" />
        </Section>

        <Section show={tab === "pretrip"} title="Personal pre-trip note" hint="A warm message / what-to-expect from you — appears in the pre-trip email. A specific week can override this on the edition (Notes).">
          <textarea value={preTripNote} onChange={(e) => setPreTripNote(e.target.value)} rows={5}
            placeholder="Stoked to have you! Here's what the week looks like, what the wind's been doing, and a couple of insider tips…"
            className="admin-input w-full px-3 py-2 rounded-md border text-sm outline-none resize-y" />
        </Section>

        {/* EVENT — slim ticket-first layout for short clinics (1–2 days, often locals) */}
        <Section show={tab === "event"} title="Event mode" hint="Turn this experience into a slim EVENT page: a short clinic sold by the ticket, no accommodation or trip sales sections. The public page switches to the compact ticket layout.">
          <label className="flex items-start gap-3 max-w-[520px] cursor-pointer select-none">
            <input type="checkbox" checked={pageTemplate === "event"} onChange={(e) => setPageTemplate(e.target.checked ? "event" : "full")} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--admin-accent)]" />
            <span>
              <span className="block text-[13px] font-bold admin-heading">This is an event (use the slim ticket page)</span>
              <span className="block text-xs admin-faint mt-0.5 leading-relaxed">Off = the full trip page. On = the compact event page (hero · short about · ticket box).</span>
            </span>
          </label>

          {pageTemplate === "event" && (
            <div className="mt-5 space-y-5">
              {/* fixed vs standby */}
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] admin-faint mb-2">Booking model</p>
                <div className="flex flex-wrap gap-2">
                  {([["fixed", "Fixed date — pay 100% now"], ["standby", "Stand-by — deposit now, dates decided later"]] as [typeof eventMode, string][]).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setEventMode(k)} className={`text-[13px] font-semibold px-3.5 py-2 rounded-lg border transition-colors ${eventMode === k ? "border-[var(--admin-accent)] bg-[var(--admin-accent)]/10 admin-heading" : "admin-border admin-muted"}`}>{l}</button>
                  ))}
                </div>
              </div>

              <p className="text-[12.5px] admin-muted">Ticket price: <strong className="admin-heading">{expPrice != null ? `${expCurrency === "EUR" ? "€" : expCurrency + " "}${expPrice.toLocaleString("en-US")}` : "— set it on the experience's Details page"}</strong></p>

              {eventMode === "standby" && (
                <div className="flex flex-wrap items-end gap-4">
                  <label className="block"><span className="block text-xs admin-muted mb-1">Deposit %</span>
                    <input type="number" min={0} max={100} value={eventDepositPct} onChange={(e) => setEventDepositPct(Number(e.target.value) || 0)} className="admin-input w-24 px-3 py-2 rounded-lg border text-sm outline-none" /></label>
                  <label className="block"><span className="block text-xs admin-muted mb-1">Refund % <span className="admin-faint">(if their date doesn&apos;t run)</span></span>
                    <input type="number" min={0} max={100} value={eventRefundPct} onChange={(e) => setEventRefundPct(Number(e.target.value) || 0)} className="admin-input w-24 px-3 py-2 rounded-lg border text-sm outline-none" /></label>
                  <p className="text-[11.5px] admin-faint max-w-[240px] leading-relaxed">Deposit is non-refundable if any chosen date runs. We keep {Math.max(0, eventDepositPct - eventRefundPct)}% for fees on a no-run.</p>
                </div>
              )}

              {/* A fixed event's date is the EDITION's date. This panel used to
                  ask for it again in a separate table, so the same week was
                  typed twice — and a clinic with dates on its edition still
                  advertised "Dates coming soon" when the duplicate was missing.
                  Candidate dates remain here for stand-by, which is the one
                  case an edition cannot express: several weekends competing
                  for a single confirmation. */}
              <div className="pt-2 border-t admin-border">
                {eventMode === "standby" ? (
                  <>
                    <p className="text-[12px] font-bold uppercase tracking-[0.12em] admin-faint mb-2">Candidate dates</p>
                    <p className="text-xs admin-faint mb-3">Add every possible date. When you know which one runs, hit “Confirm this date” — riders who picked it are asked to pay the balance, the rest are refunded.</p>
                    <EventDatesEditor experienceId={id} mode={eventMode} />
                  </>
                ) : (
                  <>
                    <p className="text-[12px] font-bold uppercase tracking-[0.12em] admin-faint mb-2">Event date</p>
                    <p className="text-xs admin-faint">
                      Set on the <strong className="admin-heading">edition</strong>, with its price, capacity and team — one clinic, one row.
                      Add another date by duplicating the edition; the public page then offers both under “Other dates”.
                    </p>
                  </>
                )}
              </div>

              <p className="text-[12px] admin-faint">Save this tab to apply the event settings.</p>
            </div>
          )}
        </Section>

        <Section show={tab === "modules"} title="Per-edition team" hint="Your team (head coach, coaches, co-coaches, trip assistant) can differ per week — pick an edition to manage it. (Reviews are managed once for the whole experience, in the Reviews tab.)">
          {editions.length === 0 ? (
            <p className="text-xs admin-faint">No editions yet — create one on the experience page.</p>
          ) : (
            <div className="space-y-4">
              <select className="admin-input w-full max-w-[280px] px-3 py-2 rounded-lg border text-sm" value={editionId} onChange={(e) => setEditionId(e.target.value)}>
                {editions.map((ed) => <option key={ed.id} value={ed.id}>{editionOptionLabel(ed)}</option>)}
              </select>
              {editionId && <EditionGuidesEditor editionId={editionId} slug={slug} />}
            </div>
          )}
        </Section>

        <Section show={tab === "modules"} title="Per-edition day-by-day" hint="Optional. Most weeks run the same program (set it in the Program tab) — switch this on only for a week that genuinely differs. The public page shows it when that week is selected.">
          {editions.length === 0 ? (
            <p className="text-xs admin-faint">No editions yet — create one on the experience page.</p>
          ) : editionId ? (
            <EditionProgramEditor editionId={editionId} fallback={program} />
          ) : null}
        </Section>

        <Section show={tab === "reviews"} title="Guest reviews" hint="Curate the approved participant reviews shown on the public experience page. Verified reviews are tied to a real booking.">
          <ReviewPlacementsEditor experienceId={id} />
        </Section>

        <Section show={tab === "reviews"} title="Manual reviews (legacy)" hint="Hand-entered testimonials. The curated guest reviews above take priority on the public page.">
          <div className="space-y-3">
            {reviews.map((r, i) => (
              <div key={i} className="admin-surface admin-border border rounded-xl p-3.5 flex gap-3">
                <button type="button" onClick={() => setPicker({ kind: "review", index: i })}
                  className="shrink-0 w-16 h-16 rounded-lg overflow-hidden admin-border border grid place-items-center admin-faint hover:border-[var(--admin-accent)] transition-colors">
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

        <Section show={tab === "faq"} title="FAQ" hint="Trip-specific questions. Leave empty to use the default FAQ.">
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
                  {faq.length === 0 && (
            <DefaultBox>
              {DEFAULT_FAQ.map((f, i) => (
                <p key={i}><strong className="admin-heading">{f.q}</strong> — {f.a}</p>
              ))}
            </DefaultBox>
          )}
        </Section>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 admin-surface border-t admin-border">
        <div className="max-w-[860px] mx-auto px-6 sm:px-8 py-3 flex items-center justify-end gap-4">
          {error && <span className="text-[13px] text-red-400 mr-auto">{error}</span>}
          {saved && <span className="text-[13px] text-green-400 mr-auto">Saved ✓</span>}
          <button onClick={save} disabled={saving} className="px-6 py-2.5 rounded-lg text-[13px] font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save content"}
          </button>
        </div>
      </div>

      {picker && (
        <ImagePickerModal
          defaultFolder={slug ? `experiences/${slug}` : undefined}
          onSelect={applyPicked}
          onSelectMany={picker.kind === "gallery" ? (urls) => { setGallery((g) => [...g, ...urls]); setPicker(null); } : undefined}
          onClose={() => setPicker(null)}
        />
      )}
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
    <button type="button" onClick={onPick} className={`${ratio} max-w-[480px] w-full rounded-xl border-2 border-dashed admin-border grid place-items-center admin-muted hover:admin-heading hover:border-[var(--admin-accent)] transition-colors`}>
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

// Format a seconds string as "m:ss" for the timestamp hint (empty string when blank/invalid).
function mmss(secs: string) {
  if (secs === "") return "";
  const n = Math.floor(Number(secs));
  if (!Number.isFinite(n) || n < 0) return "";
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

function Section({ title, hint, children, show = true }: { title: string; hint?: string; children: React.ReactNode; id?: string; show?: boolean }) {
  if (!show) return null;
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
