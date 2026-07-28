"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  recommendFin, normalizeTuning,
  type FinInputs, type RiderLevel, type WindBand, type RaceBoardType,
} from "@/lib/hardware/fin-selector";

const LIME = "#c6ff3a";
const PINK = "#ff2e88";

/** Board families the tool asks about — fins exist for the race side only. */
const BOARD_TYPES = ["wave", "freestyle", "freewave", "freeride", "freerace", "slalom"] as const;
type BoardType = (typeof BOARD_TYPES)[number];
const HAS_FINS: Record<BoardType, boolean> = {
  wave: false, freestyle: false, freewave: false,
  freeride: true, freerace: true, slalom: true,
};

export type SelectorFin = {
  name: string;
  slug: string | null;
  price: number | null;
  /** available size variants in cm (empty until variants exist in the shop) */
  sizes: number[];
  /** per-product tuning blob (hw_products.selector_tuning) — merged over the default rule */
  tuning?: unknown;
};

/**
 * The fin selector — who you are (board type, weight, level, wind), then the
 * bench: every Regler live-recomputes through recommendFin() with the fin's
 * own tuning. Logged-in members get their NP7 level pre-filled.
 */
export function FinSelector({ fins }: { fins: SelectorFin[] }) {
  const [phase, setPhase] = useState<"questions" | "bench">("questions");
  const [boardType, setBoardType] = useState<BoardType>("slalom");
  const [inputs, setInputs] = useState<FinInputs>({
    weightKg: 80,
    level: "advanced",
    wind: "medium",
    boardWidthCm: 63,
    sailSqm: 7.0,
  });
  const [profileLevel, setProfileLevel] = useState<{ level: RiderLevel; rank: string } | null>(null);

  // Logged-in member? Pull their NP7 rank and pre-fill the level question.
  useEffect(() => {
    let alive = true;
    fetch("/api/portal/fin-profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.level) return;
        setProfileLevel({ level: d.level, rank: d.rank });
        setInputs((s) => ({ ...s, level: d.level }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const set = <K extends keyof FinInputs>(k: K, v: FinInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));

  const fin = fins[0] ?? null;
  const tuning = useMemo(() => normalizeTuning(fin?.tuning), [fin]);
  const raceType: RaceBoardType = HAS_FINS[boardType] ? (boardType as RaceBoardType) : "slalom";
  const result = useMemo(() => recommendFin({ ...inputs, boardType: raceType }, tuning), [inputs, raceType, tuning]);
  const nearest = useMemo(() => {
    if (!fin || fin.sizes.length === 0) return null;
    return fin.sizes.reduce((best, s) => (Math.abs(s - result.idealCm) < Math.abs(best - result.idealCm) ? s : best), fin.sizes[0]);
  }, [fin, result.idealCm]);

  const noFinsYet = !HAS_FINS[boardType];

  const seg = (active: boolean) =>
    `px-4 py-2 rounded-full text-[13px] font-semibold capitalize transition-colors ${
      active ? "bg-white text-black" : "text-white/55 hover:text-white border border-white/15"
    }`;

  const label = "text-[11px] font-semibold tracking-[0.06em] uppercase text-white/45";
  /** The Regler itself — visible track (filled white to the thumb). */
  const Range = ({ min, max, step = 1, value, onChange, ariaLabel }: {
    min: number; max: number; step?: number; value: number; onChange: (v: number) => void; ariaLabel: string;
  }) => {
    const pct = ((value - min) / (max - min)) * 100;
    return (
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={ariaLabel}
        className="np7-range mt-2.5"
        style={{ backgroundImage: `linear-gradient(to right, #fff ${pct}%, rgba(255,255,255,0.2) ${pct}%)` }} />
    );
  };
  const readout = "text-[15px] font-bold text-white tabular-nums";

  // 3×2 grid instead of free wrap — six chips always land as two tidy rows
  // (wave/freestyle/freewave on top, the race side below), never 5+1
  const boardTypePicker = (compact = false) => (
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${compact ? "gap-1.5 mt-2.5 max-w-[400px]" : "gap-2 mt-3 max-w-[460px]"}`}>
      {BOARD_TYPES.map((b) => (
        <button key={b} type="button" onClick={() => setBoardType(b)} className={`${seg(boardType === b)} w-full text-center`}>{b}</button>
      ))}
    </div>
  );

  const levelPicker = (short = false) => (
    <div className="flex flex-wrap gap-2 mt-2.5">
      {(["intermediate", "advanced", "pro"] as RiderLevel[]).map((l) => (
        <button key={l} type="button" onClick={() => set("level", l)} className={seg(inputs.level === l)}>{short ? l.slice(0, 3) : l}</button>
      ))}
    </div>
  );

  const profileBadge = profileLevel && inputs.level === profileLevel.level && (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-white/50 mt-2">
      <span className="w-1.5 h-1.5 rounded-full bg-white/60" /> From your NP7 profile — {profileLevel.rank}
    </span>
  );

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0a0a0c] p-6 sm:p-10 relative overflow-hidden">
      {/* bench dust */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 85% 10%, rgba(228,228,224,0.07), transparent 55%)` }} />

      {phase === "questions" ? (
        <div className="relative max-w-[560px]">
          <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-2" style={{ color: PINK }}>// FIN SELECTOR</p>
          <h3 className="text-3xl sm:text-4xl font-black tracking-[-0.02em] text-white">Four questions.<br />Then we dial it in.</h3>

          <div className="mt-8 space-y-7">
            <div>
              <p className={label}>01 · Your board</p>
              {boardTypePicker()}
              {noFinsYet && (
                <p className="mt-3 text-[13px] leading-snug text-white/60 rounded-xl border border-white/12 px-3.5 py-2.5 max-w-[460px]">
                  <span className="font-bold text-white/85">No {boardType} fins yet</span> — they&apos;re in the shaping
                  queue. Riding freeride, freerace or slalom too? Carry on.
                </p>
              )}
            </div>
            <div>
              <p className={label}>02 · Your weight — <span className="normal-case">{inputs.weightKg} kg</span></p>
              <Range min={50} max={115} value={inputs.weightKg} onChange={(v) => set("weightKg", v)} ariaLabel="Your weight in kilograms" />
            </div>
            <div>
              <p className={label}>03 · Your level</p>
              {levelPicker()}
              {profileBadge}
            </div>
            <div>
              <p className={label}>04 · The wind you usually ride</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {(["light", "medium", "strong"] as WindBand[]).map((w) => (
                  <button key={w} type="button" onClick={() => set("wind", w)} className={seg(inputs.wind === w)}>{w}</button>
                ))}
              </div>
            </div>
          </div>

          <button type="button" onClick={() => !noFinsYet && setPhase("bench")} disabled={noFinsYet}
            className="mt-9 px-8 py-4 rounded-full text-[14.5px] font-bold bg-white text-black hover:-translate-y-0.5 disabled:opacity-35 disabled:hover:translate-y-0 transition-all">
            Show my fin →
          </button>
        </div>
      ) : (
        <div className="relative grid lg:grid-cols-[1fr_380px] gap-10">
          {/* Regler bench */}
          <div>
            <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-2" style={{ color: PINK }}>// DIAL IT IN</p>
            <h3 className="text-2xl sm:text-3xl font-black tracking-[-0.02em] text-white">Move the Regler — the fin follows.</h3>

            <div className="mt-8 space-y-7 max-w-[560px]">
              <div>
                <p className={label}>Board type</p>
                {boardTypePicker(true)}
                {noFinsYet && (
                  <p className="mt-2.5 text-[12.5px] leading-snug text-white/55">
                    <span className="font-semibold text-white/75">No {boardType} fins yet</span> — the numbers below
                    apply to the race side of the range.
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <p className={label}>Board width</p>
                  <p className={readout}>{inputs.boardWidthCm} cm</p>
                </div>
                <Range min={55} max={95} value={inputs.boardWidthCm} onChange={(v) => set("boardWidthCm", v)} ariaLabel="Board width in centimetres" />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <p className={label}>Sail size</p>
                  <p className={readout}>{inputs.sailSqm.toFixed(1)} m²</p>
                </div>
                <Range min={4.5} max={10} step={0.1} value={inputs.sailSqm} onChange={(v) => set("sailSqm", v)} ariaLabel="Sail size in square metres" />
                <p className="text-[11.5px] text-white/35 mt-1">usual range for this setup: {result.sailOkLo.toFixed(1)}–{result.sailOkHi.toFixed(1)} m²</p>
              </div>
              <div>
                <p className={label}>Wind</p>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {(["light", "medium", "strong"] as WindBand[]).map((w) => (
                    <button key={w} type="button" onClick={() => set("wind", w)} className={seg(inputs.wind === w)}>{w}</button>
                  ))}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className={label}>Weight</p>
                    <p className={readout}>{inputs.weightKg} kg</p>
                  </div>
                  <Range min={50} max={115} value={inputs.weightKg} onChange={(v) => set("weightKg", v)} ariaLabel="Your weight in kilograms" />
                </div>
                <div>
                  <p className={label}>Level</p>
                  {levelPicker(true)}
                  {profileBadge}
                </div>
              </div>
            </div>
          </div>

          {/* live result */}
          <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-6 sm:p-7 h-fit lg:sticky lg:top-24">
            <p className={label}>Your fin</p>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-[64px] leading-none font-black tabular-nums" style={{ color: LIME }}>{result.idealCm}</span>
              <span className="text-[20px] font-black text-white/70">cm</span>
            </div>
            <p className="text-[12.5px] text-white/45 mt-1.5">perfect middle ~{result.middleCm} cm · never below {result.hardMinCm} or above {result.hardMaxCm} on this board</p>

            {result.comboWarning && (
              <p className="mt-4 text-[12.5px] leading-snug rounded-lg border px-3 py-2" style={{ borderColor: `${PINK}66`, color: PINK }}>{result.comboWarning}</p>
            )}

            <ul className="mt-5 space-y-1.5">
              {result.notes.map((n) => (
                <li key={n} className="text-[12.5px] text-white/55 leading-snug flex gap-2"><span aria-hidden className="text-white/30">—</span>{n}</li>
              ))}
            </ul>

            {fin && (
              <div className="mt-6 pt-5 border-t border-white/10">
                <p className="text-[14.5px] font-bold text-white">{fin.name}</p>
                {fin.sizes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {fin.sizes.map((s) => (
                      <span key={s} className="px-2.5 py-1 rounded-full text-[12px] font-bold tabular-nums" style={s === nearest ? { background: "#fff", color: "#000" } : { border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }}>
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-white/45 mt-1.5">Size options land in the shop soon — this is the size to ask for.</p>
                )}
                {fin.slug && (
                  <Link href={`/hardware/${fin.slug}`} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13.5px] font-bold text-black hover:-translate-y-0.5 transition-all" style={{ background: LIME }}>
                    {fin.price != null ? `View — €${fin.price.toLocaleString("en-US")}` : "View the fin"} →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
