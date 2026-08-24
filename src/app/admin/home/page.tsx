"use client";

import { useEffect, useState } from "react";

/**
 * The public homepage (np-seven.com root — the Experience/Hardware split),
 * admin-editable at last. Stored in site_settings key `home_page`; every field
 * optional, the shipped copy is the floor. "Home is hardcoded" — not anymore
 * (Nico, 2026-08-24).
 */
type HomeCopy = {
  expEyebrow?: string; expTagline?: string; expCta?: string; expPhoto?: string;
  hwEyebrow?: string; hwTagline?: string; hwCta?: string;
};

const DEFAULTS: Required<HomeCopy> = {
  expEyebrow: "TRAVEL · COACHING · COMMUNITY",
  expTagline: "Premium windsurf trips around the planet.",
  expCta: "Enter Experience",
  expPhoto: "https://media.np-seven.com/experiences/np7-alacati/people/alacati-group-photo.jpg",
  hwEyebrow: "BOARDS · FINS · CUSTOM",
  hwTagline: "Custom boards & fins — shaped on the bench, finished by hand.",
  hwCta: "Enter Hardware",
};

const FIELDS: { key: keyof HomeCopy; label: string; hint?: string }[] = [
  { key: "expEyebrow", label: "Experience — eyebrow (small caps line)" },
  { key: "expTagline", label: "Experience — tagline" },
  { key: "expCta", label: "Experience — button label" },
  { key: "expPhoto", label: "Experience — background photo URL", hint: "Copy from File storage" },
  { key: "hwEyebrow", label: "Hardware — eyebrow" },
  { key: "hwTagline", label: "Hardware — tagline" },
  { key: "hwCta", label: "Hardware — button label" },
];

export default function HomeContentPage() {
  const [copy, setCopy] = useState<HomeCopy>({});
  const [state, setState] = useState<"loading" | "idle" | "busy" | "saved" | "error">("loading");

  useEffect(() => {
    fetch("/api/admin/site-settings?key=home_page").then((r) => r.json()).then((d) => {
      setCopy((d?.value ?? {}) as HomeCopy);
      setState("idle");
    }).catch(() => setState("idle"));
  }, []);

  async function save() {
    setState("busy");
    const value = Object.fromEntries(Object.entries(copy).map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v));
    const r = await fetch("/api/admin/site-settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "home_page", value }),
    }).catch(() => null);
    setState(r?.ok ? "saved" : "error");
    if (r?.ok) setTimeout(() => setState("idle"), 1800);
  }

  const input = "w-full admin-input border rounded-lg px-3 py-2 text-sm";
  return (
    <div className="p-4 sm:p-6 max-w-[760px]">
      <h1 className="text-xl font-bold admin-heading mb-1">Homepage</h1>
      <p className="text-[13px] admin-faint mb-5">The np-seven.com front door — the Experience/Hardware split. Empty fields fall back to the built-in copy, so half-filled is never broken.</p>
      {state === "loading" ? <p className="text-xs admin-faint">Loading…</p> : (
        <div className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-semibold admin-muted mb-1">{f.label}{f.hint && <span className="admin-faint font-normal"> — {f.hint}</span>}</label>
              <input className={input} value={copy[f.key] ?? ""} placeholder={DEFAULTS[f.key]}
                onChange={(e) => setCopy((c) => ({ ...c, [f.key]: e.target.value }))} />
              {f.key === "expPhoto" && (copy.expPhoto ?? DEFAULTS.expPhoto).trim() && (
                <div className="mt-1.5 h-20 w-36 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url('${(copy.expPhoto ?? DEFAULTS.expPhoto).trim()}')`, border: "1px solid var(--admin-border)" }} />
              )}
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={save} disabled={state === "busy"}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:opacity-90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-opacity">
              {state === "busy" ? "Saving…" : "Save homepage"}
            </button>
            {state === "saved" && <span className="text-xs font-semibold text-green-500">Saved ✓ — live within the hour (page cache)</span>}
            {state === "error" && <span className="text-xs font-semibold text-red-400">Could not save — try again.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
