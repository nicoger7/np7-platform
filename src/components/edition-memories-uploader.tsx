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
  const [assignTarget, setAssignTarget] = useState(""); // picked rider — assignment fires on the button, not on pick
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
  // Off = the files were already compressed outside (Handbrake etc.) — upload
  // them EXACTLY as-is. Compressing twice visibly hurts quality. Remembered per
  // browser so the choice sticks between sessions.
  const [compressUploads, setCompressUploads] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("np7-video-compress") !== "off";
  });
  useEffect(() => {
    try { localStorage.setItem("np7-video-compress", compressUploads ? "on" : "off"); } catch {}
  }, [compressUploads]);

  // Warn before closing/reloading the tab mid-upload. A browser can't keep a
  // client upload running once the tab is CLOSED, so the best we can do is guard
  // against losing the run by accident.
  useEffect(() => {
    if (!vidUp) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [vidUp]);

  // Screen wake lock — a long batch (dozens of clips) would otherwise pause when
  // the Mac dims / the display sleeps. Held for the whole run and re-acquired
  // whenever the tab returns to the foreground (the lock auto-drops on tab-hide).
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  async function acquireWakeLock() {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible") {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch { /* non-fatal — the upload runs regardless, just without a sleep guard */ }
  }
  function releaseWakeLock() {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }

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

  // "new photos are up" reminder — emails every participant their gallery link.
  const [remind, setRemind] = useState<{ recipients: number; lastSent: string | null } | null>(null);
  const [remindBusy, setRemindBusy] = useState(false);
  const [remindMsg, setRemindMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/admin/editions/${editionId}/photo-reminder`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.recipients === "number") setRemind(d); })
      .catch(() => {});
  }, [editionId]);
  async function sendPhotoReminder() {
    if (!remind || remindBusy) return;
    const when = remind.lastSent ? `\n\nLast reminder went out ${new Date(remind.lastSent).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : "";
    if (!confirm(`Email all ${remind.recipients} participants that new photos or videos are in their gallery?${when}`)) return;
    setRemindBusy(true);
    setRemindMsg(null);
    try {
      const res = await fetch(`/api/admin/editions/${editionId}/photo-reminder`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not send");
      setRemindMsg(j.sent > 0
        ? `Sent to ${j.sent} rider${j.sent === 1 ? "" : "s"} ✓${j.skipped ? ` · ${j.skipped} already reminded today` : ""}`
        : j.skipped ? `Everyone was already reminded today` : `Nothing sent`);
      setRemind((r) => (r ? { ...r, lastSent: new Date().toISOString() } : r));
    } catch (e) {
      setRemindMsg(e instanceof Error ? e.message : "Could not send");
    } finally { setRemindBusy(false); }
  }

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
    setAssignTarget("");
    setAssigning(false);
    load(); refreshCounts();
  }

  // The reverse move: a rider's photos back into the Everyone pool.
  async function unassignSelected() {
    if (selected.size === 0) return;
    setAssigning(true);
    const dest = folderFor("");
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
    // Keep the machine awake for the whole batch and re-grab the lock whenever
    // the tab comes back to the foreground.
    await acquireWakeLock();
    const onVis = () => { if (document.visibilityState === "visible") acquireWakeLock(); };
    document.addEventListener("visibilitychange", onVis);
    const failed: string[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const prog = (phase: "compress" | "upload") => (pct: number) => setVidUp({ name: file.name, pct, done: i, total: list.length, phase });
        // Primary: compress HERE, upload only the small MP4 + poster. ANY compression
        // problem (missing encoder, exotic codec, stall) downgrades this one file to a
        // raw upload — the clip always lands, never an aborted batch.
        let compressed: { mp4: Blob; poster: Blob | null } | null = null;
        if (compressUploads && compressor?.canCompressInBrowser()) {
          setVidUp({ name: file.name, pct: 0, done: i, total: list.length, phase: "compress" });
          try {
            compressed = await compressor.compressVideo(file, prog("compress"));
          } catch (err) {
            console.warn(`In-browser compression failed for ${file.name} — uploading raw instead.`, err);
          }
        } else if (!compressUploads) {
          // Toggle off: the file was compressed outside already — ship it AS-IS as
          // the final web video (double compression visibly hurts quality). Only a
          // poster frame is generated here, no re-encode.
          const poster = compressor ? await compressor.extractPosterFrame(file).catch(() => null) : null;
          compressed = { mp4: file, poster };
        }
        // Retry the network step a few times — a single blip on an overnight batch
        // shouldn't kill the run. Compression/poster already happened, so retries
        // only re-attempt the upload PUT, never re-encode.
        let ok = false; let lastErr: unknown = null;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
          try {
            if (compressed) {
              const pre = await presign({ filename: file.name, contentType: "video/mp4", target: "video" });
              setVidUp({ name: file.name, pct: 0, done: i, total: list.length, phase: "upload" });
              await putToR2(pre.uploadUrl, compressed.mp4, "video/mp4", prog("upload"));
              if (compressed.poster && pre.posterUploadUrl) await putToR2(pre.posterUploadUrl, compressed.poster, "image/jpeg").catch(() => {});
            } else {
              // Fallback: raw original → _vidraw/ (compressed later by the fallback script).
              setVidUp({ name: file.name, pct: 0, done: i, total: list.length, phase: "upload" });
              const pre = await presign({ filename: file.name, contentType: file.type });
              await putToR2(pre.uploadUrl, file, file.type, prog("upload"));
            }
            ok = true;
          } catch (e) { lastErr = e; }
        }
        if (!ok) { failed.push(file.name); console.warn(`Upload failed after retries: ${file.name}`, lastErr); }
      }
    } finally {
      document.removeEventListener("visibilitychange", onVis);
      releaseWakeLock();
      setVidUp(null);
      if (vidInput.current) vidInput.current.value = "";
      loadVideos();
    }
    if (failed.length) {
      alert(`${failed.length} file${failed.length === 1 ? "" : "s"} didn't upload after retries:\n${failed.slice(0, 8).join("\n")}${failed.length > 8 ? "\n…" : ""}\n\nJust re-drop those files to finish — the ones that landed are already saved.`);
    }
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
                The rest is deleted <span className="admin-muted">a year after the trip (videos after 3 months)</span>, so please curate before then.
              </p>
            </div>
          );
        })()}

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input ref={fileInput} type="file" accept="image/*" multiple onChange={(e) => upload(e.target.files)} className="hidden" id="memories-file" />
          <label htmlFor="memories-file" className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""} bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white`}>
            {uploading ? `Uploading ${progress?.done}/${progress?.total}…` : `Upload photos for ${scopeLabel}`}
          </label>

          {/* "new photos are up" reminder — one press emails every participant their
              gallery link (deduped per day, so a double click can't double-send) */}
          {remind && remind.recipients > 0 && (
            <div className="flex items-center gap-2.5 ml-auto">
              {remindMsg
                ? <span className="text-[11px] admin-faint">{remindMsg}</span>
                : remind.lastSent && <span className="text-[11px] admin-faint">Last reminder {new Date(remind.lastSent).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
              <button type="button" onClick={sendPhotoReminder} disabled={remindBusy}
                title={`Emails all ${remind.recipients} participants of this week that new photos or videos are in their gallery.`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 admin-heading"
                style={{ border: "1px solid var(--admin-border)" }}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2.5" /><path d="m2 7 10 6 10-6" /></svg>
                {remindBusy ? "Sending…" : `Notify riders — new media (${remind.recipients})`}
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-xs admin-faint">Loading…</p>
        ) : photos.length === 0 ? (
          <p className="text-xs admin-faint">No photos for {scopeLabel} yet.</p>
        ) : (
          <>
            {/* Assign bar. In Everyone: pick shots → choose rider → explicit Assign
                (choosing alone must never move anything). In a rider's gallery:
                the reverse — send picks back to Everyone. */}
            <div className="flex flex-wrap items-center gap-2 mb-3 text-xs min-h-[28px]">
              {selected.size === 0 ? (
                <span className="admin-faint">
                  {scope === ""
                    ? <>Tip: click photos to select, then assign them to a rider&apos;s private gallery.</>
                    : <>Tip: click photos to select, then send them back to Everyone.</>}
                </span>
              ) : scope === "" ? (
                <>
                  <span className="font-bold admin-heading">{selected.size} selected</span>
                  <span className="admin-faint">→ assign to</span>
                  <select value={assignTarget} disabled={assigning}
                    onChange={(e) => setAssignTarget(e.target.value)}
                    className="admin-input border rounded-lg px-2 py-1 text-xs">
                    <option value="">Choose a rider…</option>
                    {bookings.map((b) => <option key={b.id} value={b.id}>{b.contact?.name || b.name || "Participant"}</option>)}
                  </select>
                  <button type="button" onClick={() => assignTo(assignTarget)} disabled={!assignTarget || assigning}
                    className="px-3 py-1 rounded-lg bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] font-bold disabled:opacity-40">
                    {assigning ? "Assigning…" : "Assign"}
                  </button>
                  <button type="button" onClick={() => { setSelected(new Set()); setAssignTarget(""); }} className="admin-faint hover:admin-muted underline">Clear</button>
                </>
              ) : (
                <>
                  <span className="font-bold admin-heading">{selected.size} selected</span>
                  <button type="button" onClick={unassignSelected} disabled={assigning}
                    className="px-3 py-1 rounded-lg bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] font-bold disabled:opacity-40">
                    {assigning ? "Moving…" : "Unassign — back to Everyone"}
                  </button>
                  <button type="button" onClick={() => setSelected(new Set())} className="admin-faint hover:admin-muted underline">Clear</button>
                </>
              )}
            </div>
            <div className="relative">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {(photosExpanded ? photos : photos.slice(0, PHOTO_PEEK)).map((p) => {
                const sel = selected.has(p.path);
                const selectable = true; // Everyone: select-to-assign · rider gallery: select-to-unassign
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
                      title={starPhotos.has(p.path) ? "Keeper — kept forever" : "Mark as keeper (kept forever)"}>
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
          {compressUploads ? (
            <>Drop in the <span className="admin-muted">full-size clips straight off the camera</span> — they&apos;re
            <span className="admin-muted"> compressed right here in your browser</span> before upload, so only the small
            web version is ever stored (the giant original never leaves this machine).</>
          ) : (
            <>Files upload <span className="admin-muted">exactly as-is</span> — use this only for clips you&apos;ve
            <span className="admin-muted"> already compressed yourself</span> (compressing twice hurts quality).</>
          )}{" "}
          Same scope as photos: uploading to <span className="admin-muted">{scopeLabel}</span>.
        </p>
        <label className="flex items-center gap-2 mb-3 text-xs admin-muted cursor-pointer select-none">
          <input type="checkbox" checked={compressUploads} onChange={(e) => setCompressUploads(e.target.checked)} disabled={!!vidUp} />
          Compress in browser before upload
          <span className="admin-faint">— switch off for pre-compressed files</span>
        </label>

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
                  {vidUp.phase === "compress" ? `Compressing in your browser — ${vidUp.pct}%` : `Uploading ${vidUp.done + 1}/${vidUp.total} — ${vidUp.pct}%`}. Keep this tab open (you can switch away — it keeps going and survives sleep &amp; blips), just don&apos;t close it.
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
                      <div className="w-full h-full grid place-items-center text-center px-2" title="The original was uploaded uncompressed. Re-upload the same file to compress it in your browser — this tile then becomes playable.">
                        {/* raw upload without a compressed twin — nothing is actively
                            running (the old label said "Compressing…", which read as a
                            stuck job). Re-uploading the same file compresses it in the
                            browser and this tile flips to ready. */}
                        <div>
                          <svg className="w-5 h-5 mx-auto admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                          <p className="text-[11px] admin-faint mt-1">Uploaded — not compressed yet</p>
                          <p className="text-[10px] admin-faint opacity-70">re-upload the same file to fix</p>
                        </div>
                      </div>
                    )}
                    <button onClick={() => removeVideo(v.stem)} className="absolute top-1 right-1 w-6 h-6 rounded bg-black/60 text-white text-sm grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">×</button>
                    {v.status === "ready" && (
                      <button onClick={(e) => { e.stopPropagation(); toggleStar("video", v.stem); }}
                        className={`absolute bottom-1 left-1 w-6 h-6 rounded grid place-items-center transition-all ${starVideos.has(v.stem) ? "bg-amber-400 text-white" : "bg-black/45 text-white/85 opacity-0 group-hover:opacity-100"}`}
                        title={starVideos.has(v.stem) ? "Keeper — kept forever" : "Mark as keeper (kept forever)"}>
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
