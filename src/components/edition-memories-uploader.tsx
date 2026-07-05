"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Photographer/admin uploader for a week's participant photos.
 *
 * Scope picker decides who sees what:
 *  - "Everyone"      → assets/memories/{editionId}/        (shared with all participants)
 *  - a participant   → assets/memories/{editionId}/p/{bookingId}/  (only that client sees them)
 *
 * getMemoryPhotosForBooking() returns a participant's own folder + the shared folder,
 * so each client only ever sees their own pics plus the whole-group shots.
 * Also edits the highlight video URL (exp_editions.memories_video_url).
 */
type Booking = { id: string; name: string | null; contact: { name: string | null } | null };

export function EditionMemoriesUploader({ editionId, initialVideoUrl }: { editionId: string; initialVideoUrl: string | null }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [scope, setScope] = useState<string>(""); // "" = everyone, else bookingId
  const [photos, setPhotos] = useState<{ name: string; path: string; url: string; thumbUrl?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({}); // scope key -> photo count
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl ?? "");
  const [videoSaved, setVideoSaved] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // photo paths picked for "assign"
  const [assigning, setAssigning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Selection is per-scope; drop it whenever you switch who you're viewing.
  useEffect(() => { setSelected(new Set()); }, [scope]);
  const toggleSelect = (path: string) =>
    setSelected((s) => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; });

  const folderFor = useCallback(
    (s: string) => (s ? `memories/${editionId}/p/${s}` : `memories/${editionId}`),
    [editionId]
  );

  // participant list for this week — names-only endpoint so photographers (who
  // don't have the bookings section) can still see who to upload photos for.
  useEffect(() => {
    fetch(`/api/admin/editions/${editionId}/participants`)
      .then((r) => r.json())
      .then((d) => setBookings(Array.isArray(d?.participants) ? d.participants : []));
  }, [editionId]);

  const listFolder = useCallback(async (folder: string) => {
    const res = await fetch(`/api/admin/images?folder=${encodeURIComponent(folder)}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : data.files ?? [])
      .filter((f: { url: string | null; name: string }) => f.url && f.name !== ".emptyFolderPlaceholder");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setPhotos(await listFolder(folderFor(scope)));
    setLoading(false);
  }, [folderFor, scope, listFolder]);

  useEffect(() => { load(); }, [load]);

  // refresh per-scope counts (everyone + each participant)
  const refreshCounts = useCallback(async () => {
    const keys = ["", ...bookings.map((b) => b.id)];
    const entries = await Promise.all(keys.map(async (k) => [k, (await listFolder(folderFor(k))).length] as const));
    setCounts(Object.fromEntries(entries));
  }, [bookings, folderFor, listFolder]);
  useEffect(() => { if (bookings.length) refreshCounts(); }, [bookings, refreshCounts]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    const folder = folderFor(scope);
    for (let i = 0; i < files.length; i++) {
      const fd = new FormData();
      fd.append("file", files[i]);
      fd.append("folder", folder);
      await fetch("/api/admin/images", { method: "POST", body: fd });
      setProgress({ done: i + 1, total: files.length });
    }
    setUploading(false);
    setProgress(null);
    if (fileInput.current) fileInput.current.value = "";
    load(); refreshCounts();
  }

  // Move the selected "Everyone" photos into one participant's private folder.
  async function assignTo(bookingId: string) {
    if (!bookingId || selected.size === 0) return;
    setAssigning(true);
    const dest = folderFor(bookingId);
    // One bulk request — the server moves them all concurrently (was one slow
    // round-trip per photo, ~49× the latency).
    const moves = [...selected].map((from) => ({ from, to: `${dest}/${from.split("/").pop()}` }));
    await fetch("/api/admin/images", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moves }),
    }).catch(() => {});
    setSelected(new Set());
    setAssigning(false);
    load(); refreshCounts();
  }

  async function remove(path: string) {
    if (!confirm("Remove this photo from the gallery?")) return;
    await fetch("/api/admin/images", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: [path] }) });
    load(); refreshCounts();
  }

  async function saveVideo() {
    await fetch(`/api/admin/editions/${editionId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memories_video_url: videoUrl.trim() || null }),
    });
    setVideoSaved(true);
    setTimeout(() => setVideoSaved(false), 2000);
  }

  const scopeLabel = scope ? (bookings.find((b) => b.id === scope)?.contact?.name || bookings.find((b) => b.id === scope)?.name || "this participant") : "Everyone";
  const chip = (key: string, label: string) => (
    <button
      key={key || "all"}
      onClick={() => setScope(key)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${scope === key ? "border-[#0aa3c7] bg-[#0aa3c7]/10 admin-heading" : "admin-surface admin-muted"}`}
      style={{ borderColor: scope === key ? undefined : "var(--admin-border)" }}
    >
      {label}{counts[key] != null ? <span className="admin-faint"> · {counts[key]}</span> : ""}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <h3 className="text-sm font-bold admin-heading">Participant photos</h3>
        <p className="text-xs admin-faint mt-0.5 mb-3">
          <span className="admin-muted">Everyone</span> = shared with all participants this week; a name =
          <span className="admin-muted"> only that client sees them</span> in their member area. Easiest flow:
          <span className="admin-muted"> dump everything into Everyone, then select shots and assign them to individual riders.</span>
          (Private trip photos — separate from the public marketing gallery in Event Content.)
        </p>

        {/* scope picker */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {chip("", "👥 Everyone")}
          {bookings.map((b) => chip(b.id, b.contact?.name || b.name || "Participant"))}
          {bookings.length === 0 && <span className="text-xs admin-faint">No participants booked yet.</span>}
        </div>

        <div className="flex items-center gap-3 mb-4">
          <input ref={fileInput} type="file" accept="image/*" multiple onChange={(e) => upload(e.target.files)} className="hidden" id="memories-file" />
          <label htmlFor="memories-file" className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""} bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white`}>
            {uploading ? `Uploading ${progress?.done}/${progress?.total}…` : `Upload photos for ${scopeLabel}`}
          </label>
        </div>

        {loading ? (
          <p className="text-xs admin-faint">Loading…</p>
        ) : photos.length === 0 ? (
          <p className="text-xs admin-faint">No photos for {scopeLabel} yet.</p>
        ) : (
          <>
            {/* Assign bar — only in the Everyone pool: pick shots, send to a rider. */}
            {scope === "" && (
              <div className="flex flex-wrap items-center gap-2 mb-3 text-xs min-h-[28px]">
                {selected.size === 0 ? (
                  <span className="admin-faint">Tip: click photos to select, then assign them to a rider&apos;s private gallery.</span>
                ) : (
                  <>
                    <span className="font-bold admin-heading">{selected.size} selected</span>
                    <span className="admin-faint">→ assign to</span>
                    <select defaultValue="" disabled={assigning}
                      onChange={(e) => { const v = e.target.value; e.target.value = ""; assignTo(v); }}
                      className="admin-input border rounded-lg px-2 py-1 text-xs">
                      <option value="" disabled>{assigning ? "Assigning…" : "Choose a rider…"}</option>
                      {bookings.map((b) => <option key={b.id} value={b.id}>{b.contact?.name || b.name || "Participant"}</option>)}
                    </select>
                    <button type="button" onClick={() => setSelected(new Set())} className="admin-faint hover:admin-muted underline">Clear</button>
                  </>
                )}
              </div>
            )}
            <div className="columns-2 sm:columns-4 gap-2">
              {photos.map((p) => {
                const sel = selected.has(p.path);
                const selectable = scope === "";
                return (
                  <div key={p.path} onClick={selectable ? () => toggleSelect(p.path) : undefined}
                    className={`relative group mb-2 break-inside-avoid rounded-lg overflow-hidden ${selectable ? "cursor-pointer" : ""} ${sel ? "ring-2 ring-[#0aa3c7] ring-offset-1" : ""}`}
                    style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-input-bg)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumbUrl || p.url} alt="" loading="lazy" decoding="async" className={`block w-full h-auto ${sel ? "opacity-80" : ""}`} />
                    {selectable && sel && (
                      <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[#0aa3c7] text-white grid place-items-center">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      </span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); remove(p.path); }} className="absolute top-1 right-1 w-6 h-6 rounded bg-black/60 text-white text-sm grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">×</button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <h3 className="text-sm font-bold admin-heading">Highlight video</h3>
        <p className="text-xs admin-faint mt-0.5 mb-3">Optional — a YouTube/Vimeo link shown to all participants in their memories card.</p>
        <div className="flex items-center gap-2">
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtu.be/…" className="admin-input flex-1 px-3 py-2 rounded-lg border text-sm outline-none focus:border-[#0aa3c7]" />
          <button onClick={saveVideo} className="px-3 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-xs font-bold rounded-lg transition-colors">Save</button>
          {videoSaved && <span className="text-xs text-green-400">Saved ✓</span>}
        </div>
      </div>
    </div>
  );
}
