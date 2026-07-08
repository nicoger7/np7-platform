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
  // Peek galleries: show a couple of rows that fade into the card, with a
  // "Show all N" expander — same idea as the member gallery, so a big set never
  // pushes the video/highlight cards miles down the page.
  const [photosExpanded, setPhotosExpanded] = useState(false);
  const [videosExpanded, setVideosExpanded] = useState(false);
  const PHOTO_PEEK = 10; // ~2 rows before the fade/expander kicks in
  const VIDEO_PEEK = 6;

  // "Keepers": starred photos/videos that survive the 3-month purge. Per scope
  // (Everyone / each rider). Target = 3 photos + 3 videos each. (migration 075)
  const KEEPERS_TARGET = 3;
  const [starPhotos, setStarPhotos] = useState<Set<string>>(new Set()); // photo paths
  const [starVideos, setStarVideos] = useState<Set<string>>(new Set()); // video stems

  // -- Trip videos: compressed IN THE BROWSER (WebCodecs), then uploaded -------
  // The giant original never leaves this machine — same idea as the photo
  // resize-on-upload. Browsers without WebCodecs fall back to a raw upload.
  type Vid = { stem: string; status: "ready" | "processing"; url: string | null; poster: string | null; size: number };
  const [videos, setVideos] = useState<Vid[]>([]);
  const [vidR2, setVidR2] = useState(true);
  const [vidLoading, setVidLoading] = useState(true);
  const [vidUp, setVidUp] = useState<{ name: string; pct: number; done: number; total: number; phase: "compress" | "upload" } | null>(null);
  const vidInput = useRef<HTMLInputElement>(null);

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

  // -- Keepers (stars) for the current scope ---------------------------------
  const loadStars = useCallback(async () => {
    const qs = new URLSearchParams({ editionId, ...(scope ? { bookingId: scope } : {}) });
    try {
      const d = await fetch(`/api/admin/memories/stars?${qs}`).then((r) => r.json());
      setStarPhotos(new Set(Array.isArray(d.photos) ? d.photos : []));
      setStarVideos(new Set(Array.isArray(d.videos) ? d.videos : []));
    } catch { setStarPhotos(new Set()); setStarVideos(new Set()); }
  }, [editionId, scope]);
  useEffect(() => { loadStars(); }, [loadStars]);

  async function toggleStar(kind: "photo" | "video", ref: string) {
    const set = kind === "photo" ? starPhotos : starVideos;
    const setter = kind === "photo" ? setStarPhotos : setStarVideos;
    const starred = !set.has(ref);
    setter((s) => { const n = new Set(s); starred ? n.add(ref) : n.delete(ref); return n; }); // optimistic
    await fetch("/api/admin/memories/stars", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editionId, bookingId: scope || undefined, kind, ref, starred }),
    }).catch(() => loadStars()); // revert to server truth on failure
  }

  // -- Videos: list for the current scope ------------------------------------
  const loadVideos = useCallback(async () => {
    setVidLoading(true);
    const qs = new URLSearchParams({ editionId, ...(scope ? { bookingId: scope } : {}) });
    try {
      const d = await fetch(`/api/admin/videos?${qs}`).then((r) => r.json());
      setVidR2(d.r2 !== false);
      setVideos(Array.isArray(d.videos) ? d.videos : []);
    } catch { setVideos([]); }
    setVidLoading(false);
  }, [editionId, scope]);
  useEffect(() => { loadVideos(); }, [loadVideos]);

  // PUT one blob straight to R2 via a presigned URL, reporting % as it goes.
  function putToR2(url: string, body: Blob, contentType: string, onPct?: (p: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onPct) onPct(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(body);
    });
  }

  async function presign(body: Record<string, string | undefined>) {
    const res = await fetch("/api/admin/videos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editionId, bookingId: scope || undefined, ...body }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Could not start upload."); }
    return res.json();
  }

  async function uploadVideos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    // In-browser compressor (WebCodecs) — loaded on demand so the admin bundle
    // stays lean. On unsupported browsers we fall back to a raw upload.
    const compressor = await import("@/lib/video-compress").catch(() => null);
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const prog = (phase: "compress" | "upload") => (pct: number) => setVidUp({ name: file.name, pct, done: i, total: list.length, phase });
      try {
        if (compressor?.canCompressInBrowser()) {
          // Primary: compress HERE, upload only the small MP4 + poster.
          setVidUp({ name: file.name, pct: 0, done: i, total: list.length, phase: "compress" });
          const { mp4, poster } = await compressor.compressVideo(file, prog("compress"));
          const pre = await presign({ filename: file.name, contentType: "video/mp4", target: "video" });
          setVidUp({ name: file.name, pct: 0, done: i, total: list.length, phase: "upload" });
          await putToR2(pre.uploadUrl, mp4, "video/mp4", prog("upload"));
          if (poster && pre.posterUploadUrl) await putToR2(pre.posterUploadUrl, poster, "image/jpeg").catch(() => {});
        } else {
          // Fallback: raw original → _vidraw/ (compressed later by the fallback script).
          setVidUp({ name: file.name, pct: 0, done: i, total: list.length, phase: "upload" });
          const pre = await presign({ filename: file.name, contentType: file.type });
          await putToR2(pre.uploadUrl, file, file.type, prog("upload"));
        }
      } catch (e) { alert(e instanceof Error ? e.message : "Upload failed"); break; }
    }
    setVidUp(null);
    if (vidInput.current) vidInput.current.value = "";
    loadVideos();
  }

  async function removeVideo(s: string) {
    if (!confirm("Remove this video? This deletes it for everyone.")) return;
    await fetch("/api/admin/videos", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stem: s, editionId, bookingId: scope || undefined }),
    });
    loadVideos();
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

        {/* Keepers requirement + 3-month retention disclaimer */}
        {(() => {
          const okP = starPhotos.size >= KEEPERS_TARGET, okV = starVideos.size >= KEEPERS_TARGET;
          return (
            <div className="rounded-lg px-3 py-2.5 mb-4 text-xs" style={{ border: "1px solid var(--admin-border)", backgroundColor: okP && okV ? "rgba(34,197,94,0.07)" : "rgba(245,158,11,0.07)" }}>
              <p className="font-bold admin-heading flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>⭐ Keepers for {scopeLabel}:</span>
                <span className={okP ? "text-green-500" : "text-amber-500"}>{starPhotos.size}/{KEEPERS_TARGET} photos</span>
                <span className="admin-faint">·</span>
                <span className={okV ? "text-green-500" : "text-amber-500"}>{starVideos.size}/{KEEPERS_TARGET} videos</span>
                {okP && okV && <span className="text-green-500">✓ done</span>}
              </p>
              <p className="admin-faint mt-1">
                Star (☆ → ⭐) at least {KEEPERS_TARGET} photos and {KEEPERS_TARGET} videos for each person — these are <span className="admin-muted">kept forever</span>.
                The rest of the gallery is deleted <span className="admin-muted">3 months after the trip</span>, so please curate before then.
              </p>
            </div>
          );
        })()}

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
            <div className="relative">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {(photosExpanded ? photos : photos.slice(0, PHOTO_PEEK)).map((p) => {
                const sel = selected.has(p.path);
                const selectable = scope === "";
                return (
                  <div key={p.path} onClick={selectable ? () => toggleSelect(p.path) : undefined}
                    className={`relative group aspect-square rounded-lg overflow-hidden ${selectable ? "cursor-pointer" : ""} ${sel ? "ring-2 ring-[#0aa3c7] ring-offset-1" : ""}`}
                    style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-input-bg)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumbUrl || p.url} alt="" loading="lazy" decoding="async" className={`w-full h-full object-cover ${sel ? "opacity-80" : ""}`} />
                    {selectable && sel && (
                      <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[#0aa3c7] text-white grid place-items-center">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      </span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); remove(p.path); }} className="absolute top-1 right-1 w-6 h-6 rounded bg-black/60 text-white text-sm grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">×</button>
                    <button onClick={(e) => { e.stopPropagation(); toggleStar("photo", p.path); }}
                      className={`absolute bottom-1 left-1 w-6 h-6 rounded grid place-items-center transition-all ${starPhotos.has(p.path) ? "bg-amber-400 text-white" : "bg-black/45 text-white/85 opacity-0 group-hover:opacity-100"}`}
                      title={starPhotos.has(p.path) ? "Keeper — kept forever" : "Mark as keeper (survives the 3-month purge)"}>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={starPhotos.has(p.path) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
            {!photosExpanded && photos.length > PHOTO_PEEK && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20" style={{ background: "linear-gradient(to top, var(--admin-surface), transparent)" }} />
            )}
            </div>
            {photos.length > PHOTO_PEEK && (
              <button type="button" onClick={() => setPhotosExpanded((prev) => !prev)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#0aa3c7] hover:opacity-80">
                {photosExpanded ? "Show less" : `Show all ${photos.length} photos`}
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={photosExpanded ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} /></svg>
              </button>
            )}
          </>
        )}
      </div>

      {/* -- Trip videos: upload the big raw files; they compress automatically -- */}
      <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <h3 className="text-sm font-bold admin-heading">Trip videos</h3>
        <p className="text-xs admin-faint mt-0.5 mb-3">
          Drop in the <span className="admin-muted">full-size clips straight off the camera</span> — they&apos;re
          <span className="admin-muted"> compressed right here in your browser</span> before upload, so only the small
          web version is ever stored (the giant original never leaves this machine).
          Same scope as photos: uploading to <span className="admin-muted">{scopeLabel}</span>.
        </p>

        {!vidR2 ? (
          <p className="text-xs admin-faint">Video storage isn&apos;t switched on yet (R2 keys not set).</p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <input ref={vidInput} type="file" accept="video/*" multiple onChange={(e) => uploadVideos(e.target.files)} className="hidden" id="memories-video" disabled={!!vidUp} />
              <label htmlFor="memories-video" className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${vidUp ? "opacity-50 pointer-events-none" : ""} bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white`}>
                {vidUp ? `${vidUp.phase === "compress" ? "Compressing" : "Uploading"} ${vidUp.done + 1}/${vidUp.total}…` : `Upload videos for ${scopeLabel}`}
              </label>
              {vidUp && <span className="text-xs admin-muted truncate max-w-[180px]">{vidUp.name}</span>}
            </div>

            {vidUp && (
              <div className="mb-4">
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-input-bg)" }}>
                  <div className="h-full bg-[#0aa3c7] transition-[width] duration-150" style={{ width: `${vidUp.pct}%` }} />
                </div>
                <p className="text-[11px] admin-faint mt-1">
                  {vidUp.phase === "compress" ? `Compressing in your browser — ${vidUp.pct}%` : `Uploading — ${vidUp.pct}%`} · keep this tab open.
                </p>
              </div>
            )}

            {vidLoading ? (
              <p className="text-xs admin-faint">Loading…</p>
            ) : videos.length === 0 ? (
              <p className="text-xs admin-faint">No videos for {scopeLabel} yet.</p>
            ) : (
              <>
              <div className="relative">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {(videosExpanded ? videos : videos.slice(0, VIDEO_PEEK)).map((v) => (
                  <div key={v.stem} className="relative group aspect-video rounded-lg overflow-hidden"
                    style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-input-bg)" }}>
                    {v.status === "ready" ? (
                      <a href={v.url ?? "#"} target="_blank" rel="noreferrer" className="block w-full h-full">
                        {v.poster ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.poster} alt="" loading="lazy" className="w-full h-full object-cover" />
                        ) : <div className="w-full h-full grid place-items-center admin-faint text-xs">Video</div>}
                        <span className="absolute inset-0 grid place-items-center">
                          <span className="w-9 h-9 rounded-full bg-black/55 backdrop-blur grid place-items-center">
                            <svg className="w-4 h-4 text-white translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          </span>
                        </span>
                      </a>
                    ) : (
                      <div className="w-full h-full grid place-items-center text-center px-2">
                        <div>
                          <svg className="w-5 h-5 mx-auto animate-spin text-[#0aa3c7]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.6" strokeLinecap="round" /></svg>
                          <p className="text-[11px] admin-faint mt-1">Compressing…</p>
                        </div>
                      </div>
                    )}
                    <button onClick={() => removeVideo(v.stem)} className="absolute top-1 right-1 w-6 h-6 rounded bg-black/60 text-white text-sm grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">×</button>
                    {v.status === "ready" && (
                      <button onClick={(e) => { e.stopPropagation(); toggleStar("video", v.stem); }}
                        className={`absolute bottom-1 left-1 w-6 h-6 rounded grid place-items-center transition-all ${starVideos.has(v.stem) ? "bg-amber-400 text-white" : "bg-black/45 text-white/85 opacity-0 group-hover:opacity-100"}`}
                        title={starVideos.has(v.stem) ? "Keeper — kept forever" : "Mark as keeper (survives the 3-month purge)"}>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={starVideos.has(v.stem) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!videosExpanded && videos.length > VIDEO_PEEK && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16" style={{ background: "linear-gradient(to top, var(--admin-surface), transparent)" }} />
              )}
              </div>
              {videos.length > VIDEO_PEEK && (
                <button type="button" onClick={() => setVideosExpanded((prev) => !prev)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#0aa3c7] hover:opacity-80">
                  {videosExpanded ? "Show less" : `Show all ${videos.length} videos`}
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={videosExpanded ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} /></svg>
                </button>
              )}
              </>
            )}
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
