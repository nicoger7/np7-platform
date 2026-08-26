"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ReserveModal, type ReserveContext } from "./reserve-modal";
import { track } from "@/lib/analytics-client";
import { cdnImage } from "@/lib/img";

export type RealPackage = {
  id: string;
  level: string;
  accommodation: string;
  price: number;
  hotelName?: string | null;
  hotelImage?: string | null;
  hotelImages?: string[] | null;
  hotelDescription?: string | null;
  /** Curated "what's included" list shown on the website (exp_packages.includes). */
  includes?: string[] | null;
  /**
   * Spots left on THIS package for THIS week — the smallest of the week's cap,
   * the beds behind its room type, and its own cap. null = nothing limits it.
   * 0 greys the option out; it never closes the week, because a full room type
   * has no bearing on the packages that don't use it.
   */
  spotsLeft?: number | null;
};

/** A package whose own pool ran out. Shown, not hidden — a guest who can't get
 *  a single room will often take a double, and a vanished option just reads as
 *  fewer choices with no explanation. */
export const isSoldOut = (p: { spotsLeft?: number | null }) => p.spotsLeft === 0;

export type ReserveTarget = {
  experienceId: string;
  experienceTitle: string;
  editionId: string | null;
  editionLabel: string | null;
  editionDates: string | null;
  spotsLeft?: number | null;
  going?: number | null;
};

export type BookingExtra = { id: string; name: string; description: string | null; price: number };

type Props = {
  packages: RealPackage[];
  /** Optional booking-time extras (rental, storage …) — checkbox rows. */
  extras?: BookingExtra[];
  currency?: string;
  deposit?: number | null;
  reserve?: ReserveTarget;
  /** Experience hero — the summary banner falls back to it for hotel-less ("Experience Only") packages. */
  heroImage?: string | null;
};

/** Short "who's this for / what you'll learn" note per coaching level. */
function levelGuide(level: string): { title: string; blurb: string } | null {
  const l = (level || "").toLowerCase();
  if (/beginner|starter|first/.test(l))
    return {
      title: "Beginner",
      blurb: "Never windsurfed, or just a few lessons in — you'll nail the basics: getting going, steering and using the harness, with your own dedicated beginner coach (not the head coach).",
    };
  if (/advanced|pro|inter/.test(l))
    return {
      title: "Advanced",
      blurb: "You've got the basics down. Now level up: planing, footstraps, the power jibe, controlled and light-wind planing and more — plus deep-dive theory and gear & technique workshops with head coach Nico.",
    };
  return null;
}

// Fallback list shown when a package has no curated `includes` set in the back-end.
const DEFAULT_INCLUDES = [
  "6 days of pro coaching",
  "Daily video analysis",
  "Pro windsurf gear rental",
  "Breakfast every morning",
  "Healthy lunch on the beach daily",
  "Photos & video of your week",
];

/**
 * Live two-axis package picker driven by real exp_packages data.
 * Choose a coaching level, then an accommodation — the price updates instantly.
 * The page's primary conversion module.
 */
/** The real milestone schedule from /api/register/quote — the same engine that
    writes the invoices, so the sidebar can never disagree with what's billed. */
type Quote = {
  price: number; deposit: number; downpaymentPercent: number; refundDays: number;
  milestones: { kind: string; label: string; amount: number; dueLabel: string; dueDate: string | null }[];
  gear?: { baseline: "rental" | "storage" | "none"; rentalName: string; deltas: { rental: number | null; storage: number | null; none: number } } | null;
};

export function PackagePicker({ packages, extras = [], currency = "EUR", reserve, heroImage, launch }: Props & { launch?: { pct: number; until?: string | null; label?: string } | null }) {
  // Launch price: display only — the reserve API recomputes it server-side, so
  // a stale page can never charge a discount whose window has closed.
  const lp = (n: number) => (launch ? Math.round(n * (1 - launch.pct / 100)) : n);
  const launchUntil = launch?.until ? new Date(launch.until + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : null;

  // The summary panel must never scroll INSIDE itself (a box-in-box scroller
  // read as broken). Instead the sticky anchor shifts: a panel that fits pins
  // at the top as always; a taller one pins so its END (total + CTA) rides the
  // viewport bottom while scrolling down — scrolling up rolls the head back in.
  // Ticked booking-time extras — ids the reserve POST sends verbatim.
  const [pickedExtras, setPickedExtras] = useState<Set<string>>(new Set());
  // rental | storage | none — defaults to the PACKAGE's declared baseline
  // (what its price already contains) once the quote tells us.
  const [gear, setGear] = useState<"rental" | "storage" | "none">("rental");
  const gearTouched = useRef(false);
  const lastQuotePkgRef = useRef<string | null>(null);
  // Belt and braces against the toggle blinking out: the section renders from
  // this sticky snapshot, which only ever changes package→package — a quote
  // refetch (or a momentary null) can never unmount the pill mid-press.
  const [stickyGear, setStickyGear] = useState<Quote["gear"]>(null);
  const extrasSum = extras.filter((x) => pickedExtras.has(x.id)).reduce((n2, x) => n2 + x.price, 0);
  const summaryRef = useRef<HTMLElement | null>(null);
  const [summaryTop, setSummaryTop] = useState(124);
  useEffect(() => {
    const el = summaryRef.current;
    if (!el) return;
    const compute = () => {
      const vh = window.innerHeight;
      const h = el.offsetHeight;
      setSummaryTop(h + 148 <= vh ? 124 : Math.min(124, vh - h - 24));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener("resize", compute);
    return () => { ro.disconnect(); window.removeEventListener("resize", compute); };
  }, []);

  const [showReserve, setShowReserve] = useState(false);
  // Active photo per hotel group (the expanded card shows a swappable banner —
  // photos stay at card size on purpose: sources aren't always hi-res, so no lightbox).
  const [photoIdx, setPhotoIdx] = useState<Record<string, number>>({});
  // Payment plan for the selected package (cached per package to avoid flicker).
  const [quote, setQuote] = useState<Quote | null>(null);
  const quoteCache = useRef<Map<string, Quote>>(new Map());
  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  const fmt = (n: number) => `${symbol}${Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // distinct levels, beginner pushed last
  const levels = useMemo(() => {
    const uniq = Array.from(new Set(packages.map((p) => p.level)));
    return uniq.sort((a, b) => {
      const ab = /beginner|starter/i.test(a) ? 1 : 0;
      const bb = /beginner|starter/i.test(b) ? 1 : 0;
      return ab - bb;
    });
  }, [packages]);

  const [level, setLevel] = useState(levels[0]);

  const accommodations = useMemo(
    () =>
      packages
        .filter((p) => p.level === level)
        .sort((a, b) => a.price - b.price),
    [packages, level]
  );

  // Never open on an option nobody can buy.
  const firstAvailable = accommodations.find((a) => !isSoldOut(a)) ?? accommodations[0];
  const [accId, setAccId] = useState(firstAvailable?.id);

  // keep accommodation valid when level changes
  const picked = accommodations.find((a) => a.id === accId);
  const selected = picked && !isSoldOut(picked) ? picked : firstAvailable;

  // Group the room options by hotel so the list reads "pick a place, then a
  // room" instead of one long flat radio list. "No hotel" and rooms without a
  // resolved hotel stay as slim single rows.
  type HotelGroup = {
    key: string;
    hotelName: string | null;
    image: string | null;
    images: string[] | null;
    description: string | null;
    rooms: RealPackage[]; // price-ascending (accommodations is pre-sorted)
  };
  const isNoHotel = (a: RealPackage) => /^no\s*hotel$/i.test(a.accommodation.trim());
  const groups = useMemo<HotelGroup[]>(() => {
    const map = new Map<string, HotelGroup>();
    for (const a of accommodations) {
      const key = isNoHotel(a) ? "__none" : a.hotelName ? `h:${a.hotelName}` : `solo:${a.id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          hotelName: a.hotelName ?? null,
          image: a.hotelImage ?? null,
          images: a.hotelImages ?? null,
          description: a.hotelDescription ?? null,
          rooms: [],
        });
      }
      map.get(key)!.rooms.push(a);
    }
    return [...map.values()].sort((g1, g2) => g1.rooms[0].price - g2.rooms[0].price);
  }, [accommodations]);

  // "WANAPA Double Deluxe Patio" -> "Double Deluxe Patio" (the card already names the hotel)
  const roomLabel = (a: RealPackage, hotelName: string | null) => {
    if (!hotelName) return a.accommodation;
    const esc = hotelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return a.accommodation.replace(new RegExp(`^${esc}\\s*`, "i"), "").trim() || a.accommodation;
  };

  // Fetch the payment plan whenever the selection changes.
  const selectedId = accommodations.find((a) => a.id === accId)?.id ?? accommodations[0]?.id;
  useEffect(() => {
    if (!selectedId) { setQuote(null); return; }
    const extrasKey = [...pickedExtras].sort().join(",");
    const key = `${selectedId}:${reserve?.editionId ?? ""}:${extrasKey}:${gear}`;
    const cached = quoteCache.current.get(key);
    if (cached) { setQuote(cached); if (cached.gear) setStickyGear(cached.gear); return; }
    // Only blank the quote when the PACKAGE changed — a gear/extras change
    // keeps the old quote on screen until the fresh one lands, so the toggle
    // never blinks out from under the finger that just pressed it.
    if (lastQuotePkgRef.current !== selectedId) { setQuote(null); setStickyGear(null); }
    lastQuotePkgRef.current = selectedId;
    let dead = false;
    const qs = new URLSearchParams({ packageId: selectedId });
    if (reserve?.editionId) qs.set("editionId", reserve.editionId);
    if (extrasKey) qs.set("extras", extrasKey);
    if (gearTouched.current) qs.set("gear", gear);
    fetch(`/api/register/quote?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (dead || !d?.milestones) return;
        quoteCache.current.set(key, d);
        setQuote(d);
        if (d.gear) setStickyGear(d.gear);
        if (!gearTouched.current && d.gear?.baseline) setGear(d.gear.baseline);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [selectedId, reserve?.editionId, pickedExtras, gear]);

  const onLevel = (lv: string) => {
    setLevel(lv);
    track("package_select", { level: lv });
    const first = packages
      .filter((p) => p.level === lv)
      .sort((a, b) => a.price - b.price)[0];
    setAccId(first?.id);
  };

  // min-w-0 on the left column: without it the photo-thumb strip's intrinsic
  // width propagates into the grid track and pushes the whole page wider on phones.
  return (
    <div className="grid lg:grid-cols-[1fr_minmax(330px,380px)] gap-6 lg:gap-8 items-start">
      <div className="space-y-8 min-w-0">
        {/* level */}
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#9aa6ac] mb-3">1 · Coaching level</p>
          <div role="tablist" className="flex flex-wrap gap-3">
            {levels.map((lv) => {
              const active = lv === level;
              return (
                <button
                  key={lv}
                  role="tab"
                  aria-selected={active}
                  onClick={() => onLevel(lv)}
                  className={`px-5 py-3 rounded-xl border text-[14px] font-bold transition-all ${
                    active
                      ? "border-[#00afdb] bg-[#00afdb]/[0.06] text-[#00374a] shadow-[0_6px_20px_rgba(0,175,219,0.12)]"
                      : "border-[#e3e9ec] text-[#5a6b72] hover:border-[#bcd] bg-white"
                  }`}
                >
                  {lv}
                </button>
              );
            })}
          </div>
          {(() => {
            const info = levelGuide(level);
            return info ? (
              <div className="mt-3 rounded-xl bg-[#f7fbfc] border border-[#e6eef0] px-4 py-3">
                <p className="text-[13px] text-[#4a5b62] leading-relaxed"><span className="font-bold text-[#00374a]">{info.title}</span> — {info.blurb}</p>
              </div>
            ) : null;
          })()}
        </div>

        {/* the gear choice — a quiet three-way toggle, no prices shown: the
            TOTAL adjusts, the deltas stay backstage (Nico, 2026-08-27). The
            default mirrors what the selected package actually contains. */}
        {(quote?.gear ?? stickyGear) && (() => { const g = (quote?.gear ?? stickyGear)!; return (
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#9aa6ac] mb-3">2 · Gear</p>
            <div className="inline-flex rounded-full bg-white border border-[#e6eef0] p-1 shadow-sm">
              {([
                ...(g.deltas.rental != null ? [{ key: "rental" as const, label: "Rental gear" }] : []),
                ...(g.deltas.storage != null ? [{ key: "storage" as const, label: "Own gear + storage" }] : []),
                { key: "none" as const, label: "Own gear" },
              ]).map((opt) => (
                <button key={opt.key} type="button"
                  onClick={() => { gearTouched.current = true; setGear(opt.key); }}
                  className={`px-4 sm:px-5 py-2 rounded-full text-[13px] font-bold transition-colors ${
                    gear === opt.key
                      ? opt.key === "rental"
                        ? "text-[#00374a] font-extrabold shadow-sm"           /* premium: the sun gradient */
                        : "bg-[#eef7fa] text-[#00374a] border border-[#cde9f2]" /* the quiet, light versions */
                      : "text-[#8a97a0] hover:text-[#00374a]"
                  }`}
                  style={gear === opt.key && opt.key === "rental" ? { background: "linear-gradient(90deg,#ffc42e,#f0774a)" } : undefined}>
                  {opt.key === "rental" ? "★ " : ""}{opt.label}
                </button>
              ))}
            </div>
            <p className="text-[12.5px] text-[#5a6b72] mt-2">
              {gear === "rental" ? "Latest boards & sails for the whole week — all sorted for you."
                : gear === "storage" ? "You bring your own kit — it stays rigged and stored at the centre."
                : "You bring and handle your own gear."}
            </p>
          </div>
        ); })()}

        {/* accommodation — hotels as photo cards; rooms unfold inside the chosen hotel */}
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#9aa6ac] mb-3">3 · Accommodation</p>
          <div className="space-y-2.5">
            {groups.map((g) => {
              const groupActive = g.rooms.some((r) => r.id === selected?.id);

              // Slim rows: "No hotel" + rooms without a resolved hotel.
              if (!g.hotelName || g.key === "__none") {
                return g.rooms.map((a) => {
                  const active = a.id === selected?.id;
                  const sold = isSoldOut(a);
                  return (
                    <button
                      key={a.id}
                      onClick={() => !sold && setAccId(a.id)}
                      disabled={sold}
                      aria-pressed={active}
                      className={`w-full flex items-center justify-between gap-4 text-left px-4 py-3.5 rounded-xl border transition-all ${
                        sold
                          ? "border-[#e3e9ec] bg-[#f6f8f9] opacity-60 cursor-not-allowed"
                          : active
                          ? "border-[#00afdb] bg-[#00afdb]/[0.05] shadow-[0_6px_20px_rgba(0,175,219,0.1)]"
                          : "border-[#e3e9ec] hover:border-[#bcd] bg-white"
                      }`}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <Radio on={active} />
                        <span className="min-w-0">
                          <span className="block text-[14px] font-semibold text-[#1f3138] truncate">
                            {g.key === "__none" ? "No hotel" : a.accommodation}
                            {sold && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[#9aa6ac]">Sold out</span>}
                          </span>
                          {g.key === "__none" && (
                            <span className="block text-[12px] text-[#7a8a90]">Coaching &amp; program only — you sort your own stay</span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {launch && <span className="block text-[11px] text-[#9aa6ac] line-through">{fmt(a.price)}</span>}
                        <span className="text-[14px] font-bold text-[#1f3138]">{fmt(lp(a.price))}</span>
                      </span>
                    </button>
                  );
                });
              }

              // Hotel card: photo + name + blurb; the chosen hotel unfolds its rooms.
              const single = g.rooms.length === 1;
              const cheapest = g.rooms[0];
              const photos = [g.image, ...(g.images ?? [])].filter(Boolean) as string[];
              const idx = Math.min(photoIdx[g.key] ?? 0, Math.max(0, photos.length - 1));
              return (
                <div
                  key={g.key}
                  className={`rounded-2xl border overflow-hidden transition-all ${
                    groupActive
                      ? "border-[#00afdb] bg-[#00afdb]/[0.04] shadow-[0_8px_26px_rgba(0,175,219,0.12)]"
                      : "border-[#e3e9ec] bg-white hover:border-[#bcd]"
                  }`}
                >
                  {/* Expanded hotel = big edge-to-edge photo banner + swap thumbs.
                      Kept at card width (no lightbox) — sources aren't always hi-res. */}
                  {groupActive && photos.length > 0 && (
                    <>
                      <div
                        className="h-44 sm:h-56 bg-cover bg-center"
                        style={{ backgroundImage: `url('${cdnImage(photos[idx], { width: 1200 })}')` }}
                        aria-hidden
                      />
                      {photos.length > 1 && (
                        <div className="flex gap-1.5 px-3 pt-2 overflow-x-auto scrollbar-hide">
                          {photos.map((u, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setPhotoIdx((s) => ({ ...s, [g.key]: i }))}
                              aria-label={`${g.hotelName} photo ${i + 1}`}
                              aria-pressed={i === idx}
                              className={`w-20 h-14 rounded-lg bg-cover bg-center shrink-0 transition-all ${
                                i === idx ? "ring-2 ring-[#00afdb]" : "opacity-65 hover:opacity-100"
                              }`}
                              style={{ backgroundImage: `url('${cdnImage(u, { width: 200 })}')` }}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  <button
                    onClick={() => !groupActive && setAccId(cheapest.id)}
                    aria-pressed={groupActive}
                    className="w-full flex items-stretch gap-4 text-left p-3"
                  >
                    {!groupActive && g.image && (
                      <span
                        className="w-28 sm:w-36 self-stretch min-h-[84px] rounded-xl bg-cover bg-center shrink-0"
                        style={{ backgroundImage: `url('${cdnImage(g.image, { width: 400 })}')` }}
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1 py-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-[15px] font-extrabold text-[#00374a] truncate">{g.hotelName}</span>
                        <span className="text-[13.5px] font-bold text-[#1f3138] shrink-0">
                          {launch && <s className="text-[12px] font-semibold text-[#9aa6ac] mr-1.5">{fmt(cheapest.price)}</s>}
                          {single ? fmt(lp(cheapest.price)) : `from ${fmt(lp(cheapest.price))}`}
                        </span>
                      </span>
                      {/* Collapsed = 2-line teaser (line-clamp needs -webkit-box, so no
                          `block` here — it would override the clamp). Full text unfolds
                          only on the chosen hotel. */}
                      {g.description && (
                        <span className={`text-[12.5px] text-[#5a6b72] leading-snug mt-0.5 ${groupActive ? "block" : "line-clamp-2"}`}>{g.description}</span>
                      )}
                      <span className="flex items-center gap-2 mt-1.5">
                        <Radio on={groupActive} />
                        <span className="text-[12px] font-semibold text-[#7a8a90]">
                          {single ? roomLabel(cheapest, g.hotelName) : `${g.rooms.length} room types`}
                        </span>
                      </span>
                    </span>
                  </button>

                  {groupActive && !single && (
                    <div className="border-t border-[#00afdb]/20 px-3 py-2 space-y-1">
                      {g.rooms.map((a) => {
                        const active = a.id === selected?.id;
                        const sold = isSoldOut(a);
                        return (
                          <button
                            key={a.id}
                            onClick={() => !sold && setAccId(a.id)}
                            disabled={sold}
                            aria-pressed={active}
                            className={`w-full flex items-center justify-between gap-3 text-left px-3 py-2.5 rounded-lg transition-colors ${
                              sold ? "opacity-55 cursor-not-allowed" : active ? "bg-white shadow-[0_2px_10px_rgba(0,55,74,0.08)]" : "hover:bg-white/60"
                            }`}
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <Radio on={active} />
                              <span className={`text-[13.5px] truncate ${active ? "font-bold text-[#00374a]" : "font-medium text-[#4a5b62]"}`}>
                                {roomLabel(a, g.hotelName)}
                                {sold && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[#9aa6ac]">Sold out</span>}
                              </span>
                            </span>
                            <span className={`text-[13.5px] shrink-0 tabular-nums ${active ? "font-bold text-[#00374a]" : "font-semibold text-[#5a6b72]"}`}>
                              {launch ? <><s className="opacity-50 mr-1">{fmt(a.price)}</s>{fmt(lp(a.price))}</> : fmt(a.price)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>


        {/* booking-time extras — one checkbox each; ticking creates a real
            add-on on the booking, so every money surface already knows it */}
        {extras.length > 0 && (
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#9aa6ac] mb-3">4 · Extras — optional</p>
            <div className="space-y-2">
              {extras.map((x) => {
                const on = pickedExtras.has(x.id);
                return (
                  <button key={x.id} type="button"
                    onClick={() => setPickedExtras((prev) => { const nx = new Set(prev); if (nx.has(x.id)) nx.delete(x.id); else nx.add(x.id); return nx; })}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-colors ${on ? "border-[#00afdb] bg-[#00afdb]/[0.05]" : "border-[#e6eef0] bg-white hover:border-[#bfe8f3]"}`}>
                    <span className="flex items-start gap-3 min-w-0">
                      <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 grid place-items-center text-[12px] font-black transition-colors ${on ? "bg-[#00afdb] border-[#00afdb] text-white" : "border-[#cbd5d9] text-transparent"}`}>✓</span>
                      <span className="min-w-0">
                        <span className="block font-bold text-[#00374a]">{x.name}</span>
                        {x.description && <span className="block text-[12.5px] text-[#5a6b62] leading-snug">{x.description}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold text-[#00374a] tabular-nums">+{fmt(x.price)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* summary */}
      <aside ref={summaryRef} style={{ top: summaryTop }}
        className="lg:sticky rounded-3xl bg-[#00374a] text-white shadow-[0_20px_60px_rgba(0,55,74,0.25)] overflow-hidden">
        {/* hotel photo, or the experience hero as a fallback so "Experience Only" isn't a bare card */}
        {(selected?.hotelImage || heroImage) && (
          <div className="relative h-36 bg-cover bg-center" style={{ backgroundImage: `url('${selected?.hotelImage || heroImage}')` }}>
            <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-[#00374a]/30 to-transparent" />
            {selected?.hotelName && (
              <span className="absolute bottom-3 left-7 text-[13px] font-bold text-white drop-shadow">{selected.hotelName}</span>
            )}
          </div>
        )}
        <div className="p-7">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/40 mb-1">Your package</p>
        <h3 className="text-xl font-extrabold tracking-[-0.02em]">{level}</h3>
        {/* name only — the full hotel description already lives on the chosen
            hotel's card, showing it here too read as a duplicate */}
        <p className="text-[13px] text-white/55 mb-4">{selected?.hotelName || selected?.accommodation}</p>

        <ul className="space-y-2 mb-6">
          {(() => {
            const base = selected?.includes && selected.includes.length ? selected.includes : DEFAULT_INCLUDES;
            // The list tells the truth about the toggle: gear/storage lines are
            // swapped to match the choice instead of contradicting it.
            if (!quote?.gear || gear === quote.gear.baseline) return base;
            const stripped = base.filter((x) => !/rental|windsurf gear|storage/i.test(x));
            if (gear === "rental") return [...stripped, "Latest windsurf gear for the whole week"];
            if (gear === "storage") return [...stripped, "Storage for your own gear right at the centre"];
            return stripped;
          })().map((inc) => (
            <li key={inc} className="flex items-start gap-2.5 text-[13.5px] text-white/80">
              <svg className="w-4 h-4 mt-0.5 shrink-0 text-[#00afdb]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              {inc}
            </li>
          ))}
        </ul>

        {extras.filter((x) => pickedExtras.has(x.id)).length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {extras.filter((x) => pickedExtras.has(x.id)).map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 text-[13px] text-white/80">
                <span className="min-w-0 truncate">+ {x.name}</span>
                <span className="shrink-0 font-bold tabular-nums">{fmt(x.price)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-white/10 pt-5 mb-5">
          <div className="flex items-end justify-between gap-4">
            <span className="text-[13px] text-white/50 pb-1">Total p.p.</span>
            <span className="text-right">
              {launch && selected && (
                <s className="block text-[14px] font-semibold text-white/35 leading-none mb-1">{fmt(selected.price)}</s>
              )}
              <span className="block text-3xl font-black tracking-[-0.02em] tabular-nums leading-none">
                {selected ? fmt((launch ? lp(selected.price) : selected.price) + extrasSum + (quote?.gear ? (quote.gear.deltas[gear] ?? 0) : 0)) : "—"}
              </span>
            </span>
          </div>
          {launch && (
            <div className="flex justify-end mt-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ffc42e] text-[#00374a] text-[11px] font-extrabold tracking-[0.04em] px-3 py-1">
                ★ {launch.label ?? "Launch price"} · {launch.pct}% off{launchUntil ? ` · until ${launchUntil}` : ""}
              </span>
            </div>
          )}
        </div>

        {/* How you pay — the REAL schedule from /api/register/quote (the invoice
            engine), so this can never disagree with what's actually billed. */}
        {quote && quote.milestones.length > 0 && (
          <div className="mb-5 rounded-xl bg-white/[0.06] p-3.5 space-y-2">
            <p className="text-[10.5px] font-bold tracking-[0.15em] uppercase text-white/40">How you pay</p>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-white/75">Reserve today</span>
              <span className="font-bold text-[#8fe6f2]">Free</span>
            </div>
            {quote.milestones.map((m) => (
              <div key={`${m.kind}-${m.dueDate ?? m.dueLabel}`} className="flex items-start justify-between gap-3 text-[12.5px]">
                <span className="min-w-0">
                  <span className="block text-white/75">
                    {m.kind === "deposit" ? "Deposit — secures your spot" : m.kind === "downpayment" ? `Downpayment · ${quote.downpaymentPercent}%` : "Final balance"}
                  </span>
                  <span className="block text-[11px] text-white/40">{m.dueLabel}</span>
                </span>
                <span className="shrink-0 font-bold tabular-nums">{fmt(m.amount)}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => reserve && selected && setShowReserve(true)}
          disabled={!reserve || !selected}
          className="w-full px-7 py-4 rounded-full text-[14px] font-bold bg-[#00afdb] text-white shadow-[0_4px_20px_rgba(0,175,219,0.35)] hover:bg-[#15c0ec] hover:-translate-y-0.5 transition-all disabled:opacity-60"
        >
          Reserve my spot — free
        </button>
        <p className="text-[12px] text-white/40 text-center mt-3">
          Register free today — your payment plan is shown before you confirm
        </p>
        </div>
      </aside>

      {/* radio-dot helper is defined below the component */}
      {showReserve && reserve && selected && (
        <ReserveModal
          ctx={
            {
              ...reserve,
              packageId: selected.id,
              level,
              accommodation: selected.accommodation,
              price: lp(selected.price) + extrasSum + (quote?.gear ? (quote.gear.deltas[gear] ?? 0) : 0),
              gear,
              extras: [...pickedExtras],
              extrasLabel: extras.filter((x) => pickedExtras.has(x.id)).map((x) => x.name).join(" · ") || null,
              currency,
            } satisfies ReserveContext
          }
          onClose={() => setShowReserve(false)}
        />
      )}
    </div>
  );
}

/** The little radio dot used across the accommodation rows. */
function Radio({ on }: { on: boolean }) {
  return (
    <span className={`w-4 h-4 rounded-full border-2 grid place-items-center shrink-0 ${on ? "border-[#00afdb]" : "border-[#cbd5d9]"}`}>
      {on && <span className="w-2 h-2 rounded-full bg-[#00afdb]" />}
    </span>
  );
}
