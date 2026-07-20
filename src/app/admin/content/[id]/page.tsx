"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
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
  | { kind: "review"; index: number };

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
  const [tab, setTab] = useState("media");

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
        setWeekInfo(c.week_info ?? "");
        setProgram(Array.isArray(c.daily_program) ? c.daily_program : []);
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
        {[["media", "Media"], ["story", "Story"], ["program", "Program"], ["pretrip", "Pre-trip"], ["event", "Event"], ["modules", "Per-edition"], ["reviews", "Reviews"], ["faq", "FAQ"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3.5 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${tab === k ? "admin-heading border-[var(--admin-accent)]" : "admin-muted border-transparent"}`}>{l}</button>
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
                }}
                value={cardPlacement}
                onChange={setCardPlacement}
              />
            </div>
          )}
        </Section>

        <Section show={tab === "media"} title="Event hero" hint="The big image at the top of the event page. Paste a YouTube link for a video background, or pick an image. Video wins if both are set.">
          <input
            value={heroVideo}
            onChange={(e) => setHeroVideo(e.target.value)}
            placeholder="YouTube link (optional) — e.g. https://youtu.be/…"
            className="admin-input w-full px-4 py-2.5 rounded-lg border text-sm outline-none mb-3"
          />
          {heroVideo.trim() ? (
            <div className="admin-surface admin-border border rounded-xl p-3">
              <p className="text-[13px] admin-muted mb-3">
                ▶ Using YouTube video background. Clear the field above to use an image instead.
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
          ) : (
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
        <Section show={tab === "story"} title="About the location" hint="Shows as the text of \u2018The spot\u2019 section on the experience page. Leave empty and the linked destination\u2019s intro/tagline is used instead. Line breaks are kept.">
          <textarea value={locationAbout} onChange={(e) => setLocationAbout(e.target.value)} rows={5}
            placeholder="Bonaire is a flat-water paradise…" className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y" />
        </Section>

        <Section show={tab === "story"} title="About the week" hint="Shows as the small paragraph under the intro of the \u2018Your week\u2019 scroll section \u2014 only when filled.">
          <textarea value={weekInfo} onChange={(e) => setWeekInfo(e.target.value)} rows={4}
            placeholder="A relaxed week built around the best wind windows…" className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y" />
        </Section>

        <Section show={tab === "story"} title="Wind certainty & no-wind program" hint="Wind range + probability show in three places: the quick-facts bar, the \u2018You can count on it\u2019 band and the wind chip next to the spot section. The no-wind program gets its own card further down \u2014 only when filled.">
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <input value={windProbability} onChange={(e) => setWindProbability(e.target.value)}
              placeholder="Wind probability — e.g. 85–95%" className="admin-input px-4 py-2.5 rounded-lg border text-sm outline-none" />
            <input value={windRange} onChange={(e) => setWindRange(e.target.value)}
              placeholder="Wind range — e.g. 12–25 knots" className="admin-input px-4 py-2.5 rounded-lg border text-sm outline-none" />
          </div>
          <textarea value={noWindProgram} onChange={(e) => setNoWindProgram(e.target.value)} rows={3}
            placeholder="No-wind program — what happens on a rare light-wind day…" className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y" />
        </Section>

        <Section show={tab === "program"} title="Perfect week — daily program" hint="What a perfect week looks like. Note on the page tells guests the real schedule depends on the wind.">
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

              <div className="pt-2 border-t admin-border">
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] admin-faint mb-2">{eventMode === "standby" ? "Candidate dates" : "Event date"}</p>
                <p className="text-xs admin-faint mb-3">{eventMode === "standby" ? "Add every possible date. When you know which one runs, hit “Confirm this date” — riders who picked it are asked to pay the balance, the rest are refunded." : "Add the confirmed date for this event."}</p>
                <EventDatesEditor experienceId={id} mode={eventMode} />
              </div>

              <p className="text-[12px] admin-faint">Save this tab to apply the event settings, then use the dates panel above (it saves on its own).</p>
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
