"use client";

import { useMemo, useState } from "react";
import { DEFAULT_TUNING, normalizeTuning, recommendFin, typicalSailFor, type FinTuning } from "@/lib/hardware/fin-selector";

/**
 * The fin-selector "builder" — per-product tuning for the /hardware/fins tool.
 * Empty = the default rule (Nico's high-end race-carbon sizing). Every knob
 * saves to hw_products.selector_tuning (migration 121) and the public tool
 * picks it up on the next revalidate. Self-contained: own save/reset.
 */
export function FinTuningEditor({ productId, initial }: { productId: string; initial: unknown }) {
  const [t, setT] = useState<FinTuning>(() => normalizeTuning(initial));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof FinTuning, v: number) => { setSaved(false); setT((s) => ({ ...s, [k]: v })); };
  const setBand = (band: "windAdj" | "levelAdj", k: string, v: number) => {
    setSaved(false);
    setT((s) => ({ ...s, [band]: { ...s[band], [k]: v } }));
  };

  // live sanity preview — Nico's reference case
  const preview = useMemo(() => {
    const r = recommendFin({ weightKg: 80, level: "advanced", wind: "medium", boardWidthCm: 72, sailSqm: typicalSailFor(72, t) }, t);
    return r;
  }, [t]);

  async function save(reset = false) {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selector_tuning: reset ? null : t }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || "Could not save."); return; }
      if (reset) setT(normalizeTuning(null));
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch { setErr("Network error."); } finally { setSaving(false); }
  }

  const num = (label: string, k: keyof FinTuning, step = 0.5, hint?: string) => (
    <label className="block">
      <span className="block text-[11px] font-medium admin-muted mb-1">{label}{hint && <span className="admin-faint"> — {hint}</span>}</span>
      <input type="number" step={step} value={t[k] as number}
        onChange={(e) => set(k, Number(e.target.value))}
        className="w-full px-2.5 py-1.5 admin-input border rounded-lg text-sm" />
    </label>
  );

  const bandNum = (label: string, band: "windAdj" | "levelAdj", k: string) => (
    <label className="block">
      <span className="block text-[11px] font-medium admin-muted mb-1 capitalize">{label}</span>
      <input type="number" step={0.5} value={(t[band] as Record<string, number>)[k]}
        onChange={(e) => setBand(band, k, Number(e.target.value))}
        className="w-full px-2.5 py-1.5 admin-input border rounded-lg text-sm" />
    </label>
  );

  return (
    <details className="rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold admin-heading">
        Fin selector tuning
        <span className="text-[11px] font-normal admin-faint ml-2">how /hardware/fins sizes THIS fin — empty = the race-carbon default</span>
      </summary>
      <div className="px-4 pb-4 space-y-4">
        <div className="rounded-lg px-3 py-2 text-[12px] admin-muted" style={{ background: "var(--admin-surface-hover)" }}>
          Live check (72 cm board, typical rig, 80 kg, advanced, medium wind):{" "}
          <strong className="admin-heading">{preview.idealCm} cm</strong> · middle {preview.middleCm} · band {preview.hardMinCm}–{preview.hardMaxCm}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {num("Middle offset", "centerOffset", 0.5, "width/2 + this")}
          {num("Fine-tune range ±", "adjRange")}
          {num("Hard min (width/2 +)", "hardMinOffset")}
          {num("Hard max (width/2 +)", "hardMaxOffset")}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {num("Sail cm per m²", "sailDeltaSlope")}
          {num("Sail cap ± cm", "sailDeltaCapCm")}
          {num("Weight cm per kg", "weightPerKg", 0.005)}
          {num("Weight cap ± cm", "weightCapCm")}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {bandNum("Light wind", "windAdj", "light")}
          {bandNum("Strong wind", "windAdj", "strong")}
          {bandNum("Intermediate", "levelAdj", "intermediate")}
          {bandNum("Pro", "levelAdj", "pro")}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {num("Typical sail slope", "typicalSailSlope", 0.005, "m² per cm width")}
          {num("Typical sail offset", "typicalSailOffset", 0.05)}
          {num("Combo OK above +", "comboSlackUp", 0.5, "m² over typical")}
          {num("Combo OK below −", "comboSlackDown", 0.5, "m² under typical")}
        </div>

        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => save(false)} disabled={saving}
            className="px-3.5 py-2 bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg disabled:opacity-50">
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save tuning"}
          </button>
          <button type="button" onClick={() => save(true)} disabled={saving}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg admin-muted" style={{ border: "1px solid var(--admin-border)" }}>
            Reset to default
          </button>
          <span className="text-[11px] admin-faint">Defaults: middle +{DEFAULT_TUNING.centerOffset} · ±{DEFAULT_TUNING.adjRange} fine-tune · band {DEFAULT_TUNING.hardMinOffset}/+{DEFAULT_TUNING.hardMaxOffset}</span>
        </div>
      </div>
    </details>
  );
}
