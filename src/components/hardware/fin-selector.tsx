"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { recommendFin, typicalSailFor, type FinInputs, type RiderLevel, type WindBand } from "@/lib/hardware/fin-selector";

const LIME = "#c6ff3a";
const PINK = "#ff2e88";

export type SelectorFin = {
  name: string;
  slug: string | null;
  price: number | null;
  /** available size variants in cm (empty until variants exist in the shop) */
  sizes: number[];
};

/**
 * The fin selector — three quick questions about the rider, then the bench:
 * every Regler live-recomputes the recommendation through recommendFin().
 */
export function FinSelector({ fins }: { fins: SelectorFin[] }) {
  const [phase, setPhase] = useState<"questions" | "bench">("questions");
  const [inputs, setInputs] = useState<FinInputs>({
    weightKg: 80,
    level: "advanced",
    wind: "medium",
    boardWidthCm: 63,
    sailSqm: 7.0,
  });

  const set = <K extends keyof FinInputs>(k: K, v: FinInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));

  const result = useMemo(() => recommendFin(inputs), [inputs]);

  // the slalom fin we sell (v1: first fin in the range) + its nearest size
  const fin = fins[0] ?? null;
  const nearest = useMemo(() => {
    if (!fin || fin.sizes.length === 0) return null;
    return fin.sizes.reduce((best, s) => (Math.abs(s - result.idealCm) < Math.abs(best - result.idealCm) ? s : best), fin.sizes[0]);
  }, [fin, result.idealCm]);

  const seg = (active: boolean) =>
    `px-3.5 py-2 rounded-full text-[12px] font-bold font-mono uppercase tracking-[0.08em] transition-colors ${
      active ? "text-black" : "text-white/55 hover:text-white border border-white/15"
    }`;

  const label = "font-mono text-[10.5px] font-bold tracking-[0.2em] uppercase text-white/45";

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0a0a0c] p-6 sm:p-10 relative overflow-hidden">
      {/* bench dust */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 85% 10%, rgba(228,228,224,0.07), transparent 55%)` }} />

      {phase === "questions" ? (
        <div className="relative max-w-[560px]">
          <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-2" style={{ color: PINK }}>// FIN SELECTOR</p>
          <h3 className="text-3xl sm:text-4xl font-black tracking-[-0.02em] text-white">Three questions.<br />Then we dial it in.</h3>

          <div className="mt-8 space-y-7">
            <div>
              <p className={label}>01 · Your weight — {inputs.weightKg} kg</p>
              <input type="range" min={50} max={115} step={1} value={inputs.weightKg} onChange={(e) => set("weightKg", Number(e.target.value))}
                className="w-full mt-3 accent-white" aria-label="Your weight in kilograms" />
              <div className="flex justify-between font-mono text-[10px] text-white/30 mt-1"><span>50</span><span>115 kg</span></div>
            </div>
            <div>
              <p className={label}>02 · Your level</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {(["intermediate", "advanced", "pro"] as RiderLevel[]).map((l) => (
                  <button key={l} type="button" onClick={() => set("level", l)} className={seg(inputs.level === l)} style={inputs.level === l ? { background: "#fff" } : undefined}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <p className={label}>03 · The wind you usually ride</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {(["light", "medium", "strong"] as WindBand[]).map((w) => (
                  <button key={w} type="button" onClick={() => set("wind", w)} className={seg(inputs.wind === w)} style={inputs.wind === w ? { background: "#fff" } : undefined}>{w}</button>
                ))}
              </div>
            </div>
          </div>

          <button type="button" onClick={() => setPhase("bench")}
            className="mt-9 px-8 py-4 rounded-full text-[14px] font-bold text-black hover:-translate-y-0.5 transition-all" style={{ background: LIME }}>
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
                <div className="flex items-baseline justify-between">
                  <p className={label}>Board width</p>
                  <p className="font-mono text-[15px] font-bold text-white tabular-nums">{inputs.boardWidthCm} cm</p>
                </div>
                <input type="range" min={45} max={90} step={1} value={inputs.boardWidthCm} onChange={(e) => set("boardWidthCm", Number(e.target.value))}
                  className="w-full mt-2 accent-white" aria-label="Board width in centimetres" />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <p className={label}>Sail size</p>
                  <p className="font-mono text-[15px] font-bold text-white tabular-nums">{inputs.sailSqm.toFixed(1)} m²</p>
                </div>
                <input type="range" min={4.5} max={10} step={0.1} value={inputs.sailSqm} onChange={(e) => set("sailSqm", Number(e.target.value))}
                  className="w-full mt-2 accent-white" aria-label="Sail size in square metres" />
                <p className="font-mono text-[10px] text-white/30 mt-1">typical for this board: ~{typicalSailFor(inputs.boardWidthCm).toFixed(1)} m²</p>
              </div>
              <div>
                <p className={label}>Wind</p>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {(["light", "medium", "strong"] as WindBand[]).map((w) => (
                    <button key={w} type="button" onClick={() => set("wind", w)} className={seg(inputs.wind === w)} style={inputs.wind === w ? { background: "#fff" } : undefined}>{w}</button>
                  ))}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className={label}>Weight</p>
                    <p className="font-mono text-[15px] font-bold text-white tabular-nums">{inputs.weightKg} kg</p>
                  </div>
                  <input type="range" min={50} max={115} step={1} value={inputs.weightKg} onChange={(e) => set("weightKg", Number(e.target.value))}
                    className="w-full mt-2 accent-white" aria-label="Your weight in kilograms" />
                </div>
                <div>
                  <p className={label}>Level</p>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {(["intermediate", "advanced", "pro"] as RiderLevel[]).map((l) => (
                      <button key={l} type="button" onClick={() => set("level", l)} className={seg(inputs.level === l)} style={inputs.level === l ? { background: "#fff" } : undefined}>{l.slice(0, 3)}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* live result */}
          <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-6 sm:p-7 h-fit lg:sticky lg:top-24">
            <p className="font-mono text-[10.5px] font-bold tracking-[0.2em] uppercase text-white/45">Your slalom fin</p>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-[64px] leading-none font-black tabular-nums" style={{ color: LIME }}>{result.idealCm}</span>
              <span className="text-[20px] font-black text-white/70">cm</span>
            </div>
            <p className="font-mono text-[11px] text-white/40 mt-1">works {result.minCm}–{result.maxCm} cm</p>

            {result.comboWarning && (
              <p className="mt-4 text-[12px] leading-snug rounded-lg border px-3 py-2" style={{ borderColor: `${PINK}66`, color: PINK }}>{result.comboWarning}</p>
            )}

            <ul className="mt-5 space-y-1.5">
              {result.notes.map((n) => (
                <li key={n} className="text-[12px] text-white/55 leading-snug flex gap-2"><span aria-hidden className="text-white/30">—</span>{n}</li>
              ))}
            </ul>

            {fin && (
              <div className="mt-6 pt-5 border-t border-white/10">
                <p className="text-[14px] font-bold text-white">{fin.name}</p>
                {fin.sizes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {fin.sizes.map((s) => (
                      <span key={s} className="px-2.5 py-1 rounded-full font-mono text-[11.5px] font-bold" style={s === nearest ? { background: "#fff", color: "#000" } : { border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }}>
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-white/45 mt-1.5">Size options land in the shop soon — this is the size to ask for.</p>
                )}
                {fin.slug && (
                  <Link href={`/hardware/${fin.slug}`} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-bold text-black hover:-translate-y-0.5 transition-all" style={{ background: LIME }}>
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
