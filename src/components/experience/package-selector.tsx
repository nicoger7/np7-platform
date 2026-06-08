"use client";

import { useMemo, useState } from "react";

export type CoachingTier = {
  id: string;
  name: string;
  level: string;
  blurb: string;
  basePrice: number;
  includes: string[];
  popular?: boolean;
};

export type HotelOption = {
  id: string;
  name: string;
  rating: string;
  blurb: string;
  image: string;
  priceDelta: number;
};

type Props = {
  tiers: CoachingTier[];
  hotels: HotelOption[];
  currency?: string;
  deposit?: number;
};

/**
 * Two-axis package picker: choose a coaching group, then a hotel.
 * The price updates live so the visitor always sees their exact total —
 * this is the page's primary conversion module.
 */
export function PackageSelector({ tiers, hotels, currency = "€", deposit }: Props) {
  const [tierId, setTierId] = useState(
    tiers.find((t) => t.popular)?.id ?? tiers[0]?.id
  );
  const [hotelId, setHotelId] = useState(hotels[0]?.id);

  const tier = useMemo(() => tiers.find((t) => t.id === tierId)!, [tiers, tierId]);
  const hotel = useMemo(() => hotels.find((h) => h.id === hotelId)!, [hotels, hotelId]);

  const total = tier.basePrice + (hotel?.priceDelta ?? 0);
  const fmt = (n: number) => `${currency}${n.toLocaleString("en-US")}`;

  return (
    <div className="grid lg:grid-cols-[1fr_minmax(340px,400px)] gap-6 lg:gap-8 items-start">
      {/* Left: choices */}
      <div className="space-y-8">
        {/* Step 1 — coaching tier (tabs) */}
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#999] mb-3">
            1 · Choose your group
          </p>
          <div
            role="tablist"
            aria-label="Coaching group"
            className="grid sm:grid-cols-2 gap-3"
          >
            {tiers.map((t) => {
              const active = t.id === tierId;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTierId(t.id)}
                  className={`relative text-left rounded-2xl border p-5 transition-all ${
                    active
                      ? "border-[#0aa3c7] bg-[#0aa3c7]/[0.04] shadow-[0_8px_28px_rgba(10,163,199,0.12)]"
                      : "border-[#ebebeb] hover:border-[#ccc] bg-white"
                  }`}
                >
                  {t.popular && (
                    <span className="absolute -top-2.5 right-4 text-[9px] font-extrabold tracking-[0.15em] uppercase px-2.5 py-1 rounded-full bg-[#0aa3c7] text-white">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`w-4 h-4 rounded-full border-2 grid place-items-center ${
                        active ? "border-[#0aa3c7]" : "border-[#ccc]"
                      }`}
                    >
                      {active && <span className="w-2 h-2 rounded-full bg-[#0aa3c7]" />}
                    </span>
                    <h4 className="text-[15px] font-extrabold tracking-[-0.01em]">{t.name}</h4>
                  </div>
                  <p className="text-[11px] font-semibold tracking-wide uppercase text-[#0aa3c7] mb-1.5 pl-6">
                    {t.level}
                  </p>
                  <p className="text-[13px] text-[#777] leading-relaxed pl-6">{t.blurb}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2 — hotel (segmented cards) */}
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#999] mb-3">
            2 · Choose your hotel
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {hotels.map((h) => {
              const active = h.id === hotelId;
              return (
                <button
                  key={h.id}
                  onClick={() => setHotelId(h.id)}
                  aria-pressed={active}
                  className={`group text-left rounded-2xl overflow-hidden border transition-all ${
                    active
                      ? "border-[#0aa3c7] shadow-[0_8px_28px_rgba(10,163,199,0.12)]"
                      : "border-[#ebebeb] hover:border-[#ccc]"
                  }`}
                >
                  <div className="relative h-28 bg-[#f0f0f0]">
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                      style={{ backgroundImage: `url('${h.image}')` }}
                    />
                    {active && (
                      <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#0aa3c7] text-white grid place-items-center">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="text-[14px] font-bold tracking-[-0.01em]">{h.name}</h4>
                      <span className="text-[11px] font-bold text-[#0aa3c7]">★ {h.rating}</span>
                    </div>
                    <p className="text-[12px] text-[#777] leading-relaxed mb-1.5">{h.blurb}</p>
                    <p className="text-[11px] font-semibold text-[#999]">
                      {h.priceDelta === 0 ? "Included" : `+ ${fmt(h.priceDelta)}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: sticky summary */}
      <aside className="lg:sticky lg:top-24 rounded-3xl bg-[#111] text-white p-7 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/40 mb-1">
          Your package
        </p>
        <h3 className="text-xl font-extrabold tracking-[-0.02em] mb-0.5">{tier.name}</h3>
        <p className="text-[13px] text-white/50 mb-5">at {hotel?.name}</p>

        <ul className="space-y-2 mb-6">
          {tier.includes.map((inc, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-white/80">
              <svg className="w-4 h-4 mt-0.5 shrink-0 text-[#0aa3c7]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              {inc}
            </li>
          ))}
        </ul>

        <div className="flex items-end justify-between border-t border-white/10 pt-5 mb-5">
          <span className="text-[13px] text-white/50">Total p.p.</span>
          <span className="text-3xl font-black tracking-[-0.02em] tabular-nums">{fmt(total)}</span>
        </div>

        <button className="w-full px-7 py-4 rounded-full text-[14px] font-bold bg-[#0aa3c7] text-white shadow-[0_4px_20px_rgba(10,163,199,0.35)] hover:bg-[#0bb6dd] hover:-translate-y-0.5 transition-all">
          Reserve my spot
        </button>
        {deposit ? (
          <p className="text-[12px] text-white/40 text-center mt-3">
            Secure with a {fmt(deposit)} deposit · free cancellation window
          </p>
        ) : (
          <p className="text-[12px] text-white/40 text-center mt-3">
            We reply within 24 hours · no payment to enquire
          </p>
        )}
      </aside>
    </div>
  );
}
