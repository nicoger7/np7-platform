"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSpotguide } from "./spotguide-provider";
import { CONDITIONS, INFRASTRUCTURE_TAGS } from "@/lib/spotguide";
import { PinPicker } from "./pin-picker";
import { LevelPicker } from "./level-picker";
import { WindroseInput } from "./windrose-input";
import { startView, nearbySpot, type LatLng, type PinPoint } from "@/lib/pin-view";
import { shrinkPhoto, PhotoError } from "@/lib/photo-shrink";
import { addedNotice, spotHref, type AddedSpot } from "@/lib/spot-add";

/** A destination the index form can attach a spot to. lat/lng move the map there. */
export type AddSpotDestination = { id: string; name: string; lat?: number | null; lng?: number | null };
/** The destination page's own spots and centre, so the map opens on them. */
export type AddSpotArea = { centre?: LatLng | null; points: PinPoint[] };

const EMPTY = { name: "", summary: "", description: "", levels: [] as string[], conditions: [] as string[], infrastructure: [] as string[] };

/** Member "add a spot" form. Submits within our structure → lands pending,
    goes public once 3 members confirm (or NP7 verifies). On a destination page
    it's fixed to that destination; on the index it shows a destination picker
    (existing area, or name a NEW area → creates a pending destination).

    6 Oct 2026 (Nico's new-rider walkthrough): the map opens where the rider is
    (lib/pin-view.ts), the form asks for the best wind directions (the spot
    rows print "Best: NE" from them, and the form never asked), and it takes
    one optional photo, uploaded through the normal spot photo route right
    after the spot is saved, so it waits for riders exactly like the spot. */
export function AddSpot({ destId, destName, destinations, area, accent = "#00afdb" }: {
  destId?: string; destName?: string; destinations?: AddSpotDestination[]; area?: AddSpotArea; accent?: string;
}) {
  const sg = useSpotguide();
  const router = useRouter();
  const chooseDest = !destId && !!destinations;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "spot" | "photo">("");
  const [done, setDone] = useState<AddedSpot | null>(null);
  const [error, setError] = useState("");
  const [f, setF] = useState(EMPTY);
  const [wind, setWind] = useState<Record<string, string>>({});
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [customTag, setCustomTag] = useState("");
  const [destChoice, setDestChoice] = useState(""); // "" | destId | "__new__"
  const [newArea, setNewArea] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const [attest, setAttest] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /*
   * On the index there is no destination to open the map on until one is
   * picked, so ask where the visitor is browsing from: a "new area" is most
   * often near home. Only once the form is open (a click, not every page
   * view), only the two-letter code Vercel already knows, nothing stored.
   */
  useEffect(() => {
    if (!open || !chooseDest || country !== null) return;
    let live = true;
    fetch("/api/geo").then((r) => r.json()).then((j) => { if (live) setCountry(typeof j?.country === "string" ? j.country : ""); }).catch(() => { if (live) setCountry(""); });
    return () => { live = false; };
  }, [open, chooseDest, country]);

  const picked = chooseDest && destChoice && destChoice !== "__new__" ? destinations!.find((d) => d.id === destChoice) : undefined;
  const view = useMemo(() => startView({
    area: destId ? area ?? null : null,
    picked: picked && picked.lat != null && picked.lng != null ? { lat: picked.lat, lng: picked.lng } : null,
    country,
  }), [destId, area, picked, country]);
  const near = useMemo(() => nearbySpot(area?.points ?? [], pin), [area, pin]);

  // the preview's object URL is ours to free
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  function toggle(list: "conditions" | "infrastructure", v: string) {
    setF((p) => ({ ...p, [list]: p[list].includes(v) ? p[list].filter((x) => x !== v) : [...p[list], v] }));
  }
  function addCustomTag() {
    const t = customTag.trim().slice(0, 40);
    if (!t) return;
    setF((p) => ({ ...p, infrastructure: p.infrastructure.includes(t) ? p.infrastructure : [...p.infrastructure, t] }));
    setCustomTag("");
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true); setPhotoErr("");
    try {
      const small = await shrinkPhoto(file);
      setPhoto(small);
      setPhotoUrl(URL.createObjectURL(small));
    } catch (err) {
      setPhotoErr(err instanceof PhotoError ? err.message : "Could not read that photo. Try another one.");
    }
    setPhotoBusy(false);
  }
  function dropPhoto() { setPhoto(null); setPhotoUrl(""); setAttest(false); setPhotoErr(""); }

  /** The existing member photo route (the same one "+ Add a photo" on a spot uses). */
  async function uploadPhoto(spotId: string, file: File): Promise<boolean> {
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("spotId", spotId);
      fd.append("owner_attested", "1"); // ticked in this form before it could be sent
      const r = await fetch("/api/portal/spotguide/photo", { method: "POST", body: fd });
      return r.ok;
    } catch { return false; }
  }

  async function submit() {
    if (f.name.trim().length < 2) { setError("Give the spot a name."); return; }
    if (!pin) { setError("Drop a pin on the map so we know exactly where it is."); return; }
    if (photo && !attest) { setError("Tick the box under your photo, or remove the photo."); return; }
    let dest: Record<string, string> = { destination_id: destId ?? "" };
    if (chooseDest) {
      if (destChoice === "__new__") {
        if (newArea.trim().length < 2) { setError("Name the spot area (a bay, beach or town)."); return; }
        if (newCountry.trim().length < 2) { setError("Add the country."); return; }
        dest = { new_destination: newArea.trim(), new_country: newCountry.trim(), new_region: newRegion.trim() };
      } else if (destChoice) dest = { destination_id: destChoice };
      else { setError("Pick a destination or name a new area."); return; }
    }
    setBusy("spot"); setError("");
    const res = await fetch("/api/portal/spotguide/spots", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...dest, ...f, wind_window: wind, coords: `${pin.lat}, ${pin.lng}` }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setBusy("");
      // An expired or revoked session looks logged-in on the client, so a bare
      // error message here was a dead end ("please sign in" with nothing to click).
      // Offer the login modal instead — the typed spot survives, it's still in state.
      if (res?.status === 401) sg.needAuth("login");
      else { const j = await res?.json().catch(() => ({})); setError(j?.error ?? "Could not submit. Check your connection and try again."); }
      return;
    }
    const j = await res.json().catch(() => ({}));
    // The spot is saved from here on; a photo that fails must not undo that.
    let photoOutcome: AddedSpot["photo"] = "none";
    if (photo && j.id) {
      setBusy("photo");
      photoOutcome = (await uploadPhoto(j.id, photo)) ? "posted" : "failed";
    }
    setBusy("");
    setDone({ id: j.id, slug: j.slug, destSlug: j.destSlug, destDraft: !!j.destDraft, verification: j.verification, wordsHeld: !!j.wordsHeld, photo: photoOutcome });
    setOpen(false);
    router.refresh(); // a spot that went live shows on the cached page once it re-renders
  }

  /** Go to the new spot. On its own page a hash alone would not reload, and the
      cached page only learns about a pending spot on load, so reload there. */
  function openSpot(href: string) {
    const u = new URL(href, window.location.href);
    if (u.pathname === window.location.pathname) { window.location.hash = u.hash; window.location.reload(); }
    else window.location.assign(u.toString());
  }
  function addAnother() {
    setDone(null); setF(EMPTY); setWind({}); setPin(null); dropPhoto(); setError(""); setOpen(true);
  }

  if (done) {
    const { title, lines } = addedNotice(done);
    const href = spotHref(done);
    return (
      <div className="rounded-2xl border border-[#cdeede] bg-[#f0faf4] p-5">
        <p className="text-[15px] font-extrabold text-[#1f7a4d]">{title} 🤙</p>
        {lines.map((l) => <p key={l} className="text-[13.5px] text-[#2f6b4c] leading-relaxed mt-1">{l}</p>)}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
          {href && (
            <button type="button" onClick={() => openSpot(href)}
              className="px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: "#1f9e57" }}>
              Open my spot
            </button>
          )}
          <button type="button" onClick={addAnother} className="text-[13.5px] font-bold text-[#1f7a4d] hover:opacity-70">Add another spot</button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => (sg.loggedIn ? setOpen(true) : sg.needAuth())}
        className="w-full rounded-2xl border-2 border-dashed p-5 text-left transition-colors hover:bg-white"
        style={{ borderColor: "#e2d8c6" }}>
        <span className="text-[15px] font-extrabold text-[#00374a]">{destName ? `Know a spot in ${destName} we're missing?` : "Know a spot we're missing? Add it"}</span>
        <span className="block text-[13px] text-[#6a7a80] mt-0.5">{sg.loggedIn ? (chooseDest ? "Add it to any destination, or name a whole new area. Members verify it before it's public." : "Add it. Other members verify it before it goes public.") : "Sign up (seconds) to add a spot. Members verify it before it goes public."}</span>
      </button>
    );
  }

  // 16px on mobile stops iOS zooming the page when a field gets focus.
  const input = "w-full px-4 py-3 rounded-xl border border-[#e2d8c6] bg-white text-[16px] sm:text-[14px] text-[#00374a] placeholder:text-[#a9b4b9] outline-none focus:border-[#00afdb] focus:ring-2 focus:ring-[#00afdb]/15 transition";
  const chip = (on: boolean) => `px-3.5 py-2 rounded-full text-[13px] font-semibold transition-colors ${on ? "text-white" : "text-[#5a6b72] border border-[#e2d8c6] hover:border-[#c6b89d] bg-white"}`;
  const label = "text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5";
  const optional = <span className="normal-case tracking-normal text-[#c3b9a6]">(optional)</span>;

  return (
    <div className="rounded-2xl border border-[#ece3d3] bg-white p-4 sm:p-5 space-y-4">
      <p className="text-[16px] font-extrabold text-[#00374a]">{destName ? `Add a spot in ${destName}` : "Add a spot"}</p>
      {chooseDest && (
        <div>
          <p className={label}>Which destination?</p>
          <div className="relative">
            <select className={`${input} appearance-none pr-11 cursor-pointer`} value={destChoice} onChange={(e) => setDestChoice(e.target.value)}>
              <option value="">Pick a destination…</option>
              {destinations!.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              <option value="__new__">＋ A new destination (not listed)</option>
            </select>
            <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9aa6ac]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </div>
          {destChoice === "__new__" && (
            <div className="mt-2 space-y-2 rounded-xl border border-[#ece3d3] bg-[#fdfaf3] p-3">
              <p className="text-[12px] text-[#6a7a80] leading-snug">Name the <b className="text-[#00374a]">specific spot area</b> a rider would know: a bay, beach or town. <b>Not</b> the country or a whole coastline; the country has its own field.</p>
              <input className={input} placeholder="Spot area · bay / beach / town (e.g. Prasonisi) *" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={input} placeholder="Country (e.g. Greece) *" value={newCountry} onChange={(e) => setNewCountry(e.target.value)} />
                <input className={input} placeholder="Region / coast (optional)" value={newRegion} onChange={(e) => setNewRegion(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}
      <input className={input} placeholder="Spot name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />

      {/* The two things a spot cannot go without come first, so a rider on a
          phone reaches the map without scrolling past optional fields. */}
      <div>
        <p className={label}>Where is it? *</p>
        <PinPicker value={pin} onChange={setPin} view={view} context={area?.points} locate />
        {near && (
          <p className="mt-1.5 text-[12.5px] text-[#8a5a12] bg-[#fdf3e1] border border-[#f0dcb4] rounded-lg px-3 py-2 leading-snug">
            That&apos;s right by <b>{near.name ?? "a spot"}</b>, already in the guide.{" "}
            {near.key ? <a href={`#spot-${near.key}`} className="font-bold underline">Same spot? Add what you know there.</a> : "Same spot? Add what you know there instead."}
          </p>
        )}
      </div>

      <div>
        <p className={label}>Best wind directions {optional}</p>
        <WindroseInput value={wind} onChange={setWind} size={138} hint="Tap again to change" />
      </div>

      <div>
        <p className={label}>Levels it suits <span className="normal-case tracking-normal text-[#c3b9a6]">(pick any that fit)</span></p>
        <LevelPicker multiple values={f.levels} onValues={(v) => setF({ ...f, levels: v })} accent={accent} />
      </div>

      <div>
        <p className={label}>Conditions</p>
        <div className="flex flex-wrap gap-1.5">
          {CONDITIONS.map((c) => <button key={c.key} type="button" onClick={() => toggle("conditions", c.key)} className={chip(f.conditions.includes(c.key))} style={f.conditions.includes(c.key) ? { backgroundColor: accent } : undefined}>{c.label}</button>)}
        </div>
      </div>

      <div>
        <p className={label}>A photo of the spot {optional}</p>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
        {photo && photoUrl ? (
          <div className="rounded-xl border border-[#e2d8c6] bg-[#fdfaf3] p-3 space-y-2.5">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="Your photo of the spot" className="w-20 h-20 rounded-lg object-cover bg-[#e9eef0] shrink-0" />
              <div className="flex flex-col items-start gap-1">
                <button type="button" onClick={() => fileRef.current?.click()} className="text-[13px] font-bold" style={{ color: accent }}>Change photo</button>
                <button type="button" onClick={dropPhoto} className="text-[12.5px] font-semibold text-[#9aa6ac]">Remove</button>
              </div>
            </div>
            {/* Same promise the spot photo upload asks for, and never pre-ticked. */}
            <label className="flex items-start gap-2 text-[12.5px] text-[#5a6b72] cursor-pointer">
              <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5 shrink-0 accent-[#00afdb]" />
              <span>I took this photo or may share it (not grabbed from the web), and NP7 can use it in the spotguide.</span>
            </label>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy}
            className="w-full rounded-xl border-2 border-dashed border-[#e2d8c6] px-4 py-3.5 text-left text-[13.5px] font-bold transition-colors hover:bg-[#fdfaf3] disabled:opacity-50" style={{ color: accent }}>
            {photoBusy ? "Getting your photo ready…" : "+ Add a photo"}
            <span className="block text-[12px] font-normal text-[#9aa6ac] mt-0.5">It goes live together with the spot.</span>
          </button>
        )}
        {photoErr && <p className="text-[12px] font-semibold text-[#c4471a] mt-1">{photoErr}</p>}
      </div>

      <input className={input} placeholder="One-line summary" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
      <textarea className={`${input} min-h-[80px] resize-y`} placeholder="What's it like here: wind, water, launch, hazards…" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div>
        <p className={label}>On site &amp; local knowledge</p>
        <div className="flex flex-wrap gap-1.5">
          {INFRASTRUCTURE_TAGS.map((t) => <button key={t} type="button" onClick={() => toggle("infrastructure", t)} className={chip(f.infrastructure.includes(t))} style={f.infrastructure.includes(t) ? { backgroundColor: accent } : undefined}>{t}</button>)}
          {f.infrastructure.filter((t) => !INFRASTRUCTURE_TAGS.includes(t as typeof INFRASTRUCTURE_TAGS[number])).map((t) => (
            <button key={t} type="button" onClick={() => toggle("infrastructure", t)} className={chip(true)} style={{ backgroundColor: accent }}>{t} ✕</button>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input value={customTag} onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }}
            placeholder="Add your own, e.g. shallow reef, expert-only, no-kite zone…" className={`${input} text-[13px]`} />
          <button type="button" onClick={addCustomTag} className="shrink-0 px-3 py-2 rounded-lg text-[13px] font-bold" style={{ border: `1px solid ${accent}`, color: accent }}>Add</button>
        </div>
      </div>
      {error && <p className="text-[13px] font-semibold text-[#c4471a]">{error}</p>}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
        <button onClick={submit} disabled={!!busy} className="w-full sm:w-auto px-6 py-3 sm:py-2.5 rounded-full text-[14px] font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90" style={{ backgroundColor: accent }}>
          {busy === "spot" ? "Submitting…" : busy === "photo" ? "Uploading your photo…" : "Submit spot"}
        </button>
        <button onClick={() => setOpen(false)} className="text-[13.5px] font-semibold text-[#6a7a80] py-1">Cancel</button>
        <span className="sm:ml-auto text-[11.5px] text-[#9aa6ac]">Verified by members before it&apos;s public</span>
      </div>
    </div>
  );
}
