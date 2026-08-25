"use client";

import { useEffect, useState } from "react";
import ImagePickerModal from "@/components/image-picker-modal";

/**
 * The public front doors, admin-editable — two tabs:
 *
 *   Front door  — np-seven.com root, the Experience/Hardware split
 *                 (site_settings `home_page`)
 *   /experience — the Experience landing hero: copy, video, fallback photos
 *                 (site_settings `experience_landing_hero`)
 *
 * Every input is PREFILLED with the copy that is actually live — the stored
 * override when one exists, the shipped default otherwise — so the form shows
 * the truth instead of a wall of empty boxes ("put in what we actually have
 * hardcoded now" — Nico, 2026-08-25). Saving stores whatever stands in the
 * fields; the shipped copy remains the fallback floor for anything cleared.
 */

/* ------------------------------ shipped copy ------------------------------ */
/* Mirrors src/app/page.tsx and src/app/experience/page.tsx — the floor the
   public pages fall back to. Update BOTH sides when the shipped copy moves. */

const FRONT_DEFAULTS = {
  expEyebrow: "TRAVEL · COACHING · COMMUNITY",
  expTagline: "Premium windsurf trips around the planet.",
  expCta: "Enter Experience",
  expPhoto: "https://media.np-seven.com/experiences/np7-alacati/people/alacati-group-photo.jpg",
  hwEyebrow: "BOARDS · FINS · CUSTOM",
  hwTagline: "Custom boards & fins — shaped on the bench, finished by hand.",
  hwCta: "Enter Hardware",
} as const;

const LANDING_DEFAULTS = {
  tagline: "The No. 1 windsurf holiday.",
  subline: "Chase the ride, find your crew — world-class coaching, community and everything arranged for you.",
  cta1: "Explore experiences",
  cta2: "See destinations",
  upcomingEyebrow: "NEXT ON THE WATER",
  upcomingTitle: "Upcoming experiences",
  upcomingSub: "Pick a date, pack your harness — we'll handle the rest.",
  video: "/cdn/assets/hero/windsurf-hero.mp4",
  poster: "/cdn/assets/hero/windsurf-hero-poster.jpg",
} as const;

const LANDING_IMAGE_DEFAULTS = [
  "/cdn/assets/hero/windsurf-hero-poster.jpg",
  "/cdn/assets/experiences/np7-alacati/action/alacati-experience-group-on-water.jpg",
  "/cdn/assets/experiences/np7-lake-garda-2026/action/rider-crossing-mountain-backdrop.jpg",
  "/cdn/assets/experiences/np7-alacati/action/alacati-experience-action-nico.jpg",
];

/* -------------------------------- pieces --------------------------------- */

type SaveState = "loading" | "idle" | "busy" | "saved" | "error";

const inputCls = "w-full admin-input border rounded-lg px-3 py-2 text-sm";

function Field({ label, hint, value, onChange, rows }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold admin-muted mb-1">
        {label}{hint && <span className="admin-faint font-normal"> — {hint}</span>}
      </label>
      {rows ? (
        <textarea className={inputCls} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

/** Photo field, admin-convention style: preview + "Change" opens the File
 *  storage picker — nobody pastes URLs by hand ("we always do it with a
 *  selector from the media folder" — Nico, 2026-08-25). */
function PhotoPick({ label, hint, url, wide, onPick }: {
  label: string; hint?: string; url: string; wide?: boolean; onPick: () => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold admin-muted mb-1">
        {label}{hint && <span className="admin-faint font-normal"> — {hint}</span>}
      </label>
      <div className="flex items-end gap-3">
        {url.trim() ? (
          <div
            className={`rounded-lg bg-cover bg-center ${wide ? "h-20 w-36" : "h-16 w-28"}`}
            style={{ backgroundImage: `url('${url.trim()}')`, border: "1px solid var(--admin-border)" }}
          />
        ) : (
          <button onClick={onPick}
            className={`rounded-lg border-2 border-dashed grid place-items-center admin-faint hover:admin-heading ${wide ? "h-20 w-36" : "h-16 w-28"}`}
            style={{ borderColor: "var(--admin-border)" }}>
            Pick…
          </button>
        )}
        <button onClick={onPick} className="text-xs text-[#0aa3c7] hover:underline pb-1">Change</button>
      </div>
    </div>
  );
}

function Card({ title, dot, hint, children }: {
  title: string; dot?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <div className="flex items-center gap-2 mb-4">
        {dot && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />}
        <h2 className="text-sm font-bold admin-heading">{title}</h2>
        {hint && <span className="text-[11px] admin-faint ml-auto">{hint}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SaveRow({ state, label, onSave }: { state: SaveState; label: string; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onSave} disabled={state === "busy"}
        className="px-4 py-2 bg-[var(--admin-accent)] hover:opacity-90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-opacity">
        {state === "busy" ? "Saving…" : label}
      </button>
      {state === "saved" && <span className="text-xs font-semibold text-green-500">Saved ✓ — live within the hour (page cache)</span>}
      {state === "error" && <span className="text-xs font-semibold text-red-400">Could not save — try again.</span>}
    </div>
  );
}

async function loadSetting(key: string): Promise<Record<string, unknown>> {
  const r = await fetch(`/api/admin/site-settings?key=${key}`).then((x) => x.json()).catch(() => null);
  return (r?.value ?? {}) as Record<string, unknown>;
}

async function saveSetting(key: string, value: Record<string, unknown>): Promise<boolean> {
  const r = await fetch("/api/admin/site-settings", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  }).catch(() => null);
  return Boolean(r?.ok);
}

/* --------------------------------- page ---------------------------------- */

export default function HomeContentPage() {
  const [tab, setTab] = useState<"front" | "landing">("front");
  const [picker, setPicker] = useState<
    | { target: "expPhoto" }
    | { target: "poster" }
    | { target: "photo"; index: number }
    | null
  >(null);

  // Front door
  const [front, setFront] = useState<Record<string, string>>({});
  const [frontState, setFrontState] = useState<SaveState>("loading");

  // /experience landing
  const [landing, setLanding] = useState<Record<string, string>>({});
  const [images, setImages] = useState<string[]>(["", "", "", ""]);
  const [landingState, setLandingState] = useState<SaveState>("loading");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "landing") setTab("landing");
    loadSetting("home_page").then((v) => {
      const pick = (k: keyof typeof FRONT_DEFAULTS) => (typeof v[k] === "string" && (v[k] as string).trim()) || FRONT_DEFAULTS[k];
      setFront(Object.fromEntries((Object.keys(FRONT_DEFAULTS) as (keyof typeof FRONT_DEFAULTS)[]).map((k) => [k, pick(k)])));
      setFrontState("idle");
    });
    loadSetting("experience_landing_hero").then((v) => {
      const pick = (k: keyof typeof LANDING_DEFAULTS) => (typeof v[k] === "string" && (v[k] as string).trim()) || LANDING_DEFAULTS[k];
      setLanding(Object.fromEntries((Object.keys(LANDING_DEFAULTS) as (keyof typeof LANDING_DEFAULTS)[]).map((k) => [k, pick(k)])));
      const imgs = Array.isArray(v.images) ? (v.images as string[]) : [];
      setImages([0, 1, 2, 3].map((i) => imgs[i]?.trim() || LANDING_IMAGE_DEFAULTS[i] || ""));
      setLandingState("idle");
    });
  }, []);

  function switchTab(t: "front" | "landing") {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "landing") url.searchParams.set("tab", "landing"); else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());
  }

  async function saveFront() {
    setFrontState("busy");
    const value = Object.fromEntries(Object.entries(front).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    const ok = await saveSetting("home_page", value);
    setFrontState(ok ? "saved" : "error");
    if (ok) setTimeout(() => setFrontState("idle"), 2200);
  }

  async function saveLanding() {
    setLandingState("busy");
    const value: Record<string, unknown> = Object.fromEntries(Object.entries(landing).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    const imgs = images.map((x) => x.trim()).filter(Boolean);
    if (imgs.length) value.images = imgs;
    const ok = await saveSetting("experience_landing_hero", value);
    setLandingState(ok ? "saved" : "error");
    if (ok) setTimeout(() => setLandingState("idle"), 2200);
  }

  const setF = (k: string) => (v: string) => setFront((m) => ({ ...m, [k]: v }));
  const setL = (k: string) => (v: string) => setLanding((m) => ({ ...m, [k]: v }));

  const tabBtn = (t: "front" | "landing", label: string) => (
    <button onClick={() => switchTab(t)}
      className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${tab === t
        ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]"
        : "admin-muted hover:opacity-80"}`}>
      {label}
    </button>
  );

  return (
    <div className="p-4 sm:p-6 max-w-[880px]">
      <h1 className="text-xl font-bold admin-heading mb-1">Homepage</h1>
      <p className="text-[13px] admin-faint mb-4">
        What the public front doors say — prefilled with the copy that is live right now. Edit, save, done;
        anything you clear falls back to the built-in copy.
      </p>

      <div className="inline-flex rounded-full p-1 mb-6" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        {tabBtn("front", "Front door")}
        {tabBtn("landing", "Experience landing")}
      </div>

      {tab === "front" && (
        frontState === "loading" ? <p className="text-xs admin-faint">Loading…</p> : (
          <div className="space-y-4">
            <p className="text-xs admin-faint">
              The np-seven.com root — the Experience/Hardware split.{" "}
              <a href="https://www.np-seven.com" target="_blank" rel="noreferrer" className="underline">View live ↗</a>
            </p>
            <div className="grid md:grid-cols-2 gap-4 items-start">
              <Card title="Experience side" dot="#0aa3c7">
                <Field label="Eyebrow" hint="small caps line" value={front.expEyebrow ?? ""} onChange={setF("expEyebrow")} />
                <Field label="Tagline" value={front.expTagline ?? ""} onChange={setF("expTagline")} />
                <Field label="Button label" value={front.expCta ?? ""} onChange={setF("expCta")} />
                <PhotoPick label="Background photo" wide url={front.expPhoto ?? ""} onPick={() => setPicker({ target: "expPhoto" })} />
              </Card>
              <Card title="Hardware side" dot="#a3c70a">
                <Field label="Eyebrow" value={front.hwEyebrow ?? ""} onChange={setF("hwEyebrow")} />
                <Field label="Tagline" value={front.hwTagline ?? ""} onChange={setF("hwTagline")} />
                <Field label="Button label" value={front.hwCta ?? ""} onChange={setF("hwCta")} />
              </Card>
            </div>
            <SaveRow state={frontState} label="Save front door" onSave={saveFront} />
          </div>
        )
      )}

      {tab === "landing" && (
        landingState === "loading" ? <p className="text-xs admin-faint">Loading…</p> : (
          <div className="space-y-4">
            <p className="text-xs admin-faint">
              The /experience landing — hero copy, scroll video and the slow-connection photos.{" "}
              <a href="https://www.np-seven.com/experience" target="_blank" rel="noreferrer" className="underline">View live ↗</a>
            </p>
            <Card title="Hero copy" dot="#0aa3c7">
              <Field label="Big tagline (H1)" value={landing.tagline ?? ""} onChange={setL("tagline")} />
              <Field label="Subline" value={landing.subline ?? ""} onChange={setL("subline")} rows={2} />
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Button 1" value={landing.cta1 ?? ""} onChange={setL("cta1")} />
                <Field label="Button 2" value={landing.cta2 ?? ""} onChange={setL("cta2")} />
              </div>
            </Card>
            <Card title="Upcoming strip" hint="the experience list further down the page">
              <Field label="Eyebrow" value={landing.upcomingEyebrow ?? ""} onChange={setL("upcomingEyebrow")} />
              <Field label="Heading" value={landing.upcomingTitle ?? ""} onChange={setL("upcomingTitle")} />
              <Field label="Subline" value={landing.upcomingSub ?? ""} onChange={setL("upcomingSub")} />
            </Card>
            <Card title="Hero video">
              <Field label="Video URL (mp4)" value={landing.video ?? ""} onChange={setL("video")} />
              <PhotoPick label="Poster image" hint="the frame shown before the video runs" wide
                url={landing.poster ?? ""} onPick={() => setPicker({ target: "poster" })} />
            </Card>
            <Card title="Slow-connection photos" hint="only shown when the video can't run">
              <p className="text-xs admin-faint -mt-1">
                These crossfade when the video fails to load, no data arrives within 6s, or the visitor has
                &ldquo;reduce motion&rdquo; on — pick shots that survive a vertical phone crop.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {images.map((img, i) => (
                  <PhotoPick key={i} label={`Photo ${i + 1}`} url={img}
                    onPick={() => setPicker({ target: "photo", index: i })} />
                ))}
              </div>
            </Card>
            <SaveRow state={landingState} label="Save landing" onSave={saveLanding} />
          </div>
        )
      )}
      {picker && (
        <ImagePickerModal
          defaultFolder="experiences"
          onClose={() => setPicker(null)}
          onSelect={(url) => {
            if (picker.target === "expPhoto") setFront((m) => ({ ...m, expPhoto: url }));
            else if (picker.target === "poster") setLanding((m) => ({ ...m, poster: url }));
            else setImages((arr) => arr.map((x, j) => (j === picker.index ? url : x)));
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}
