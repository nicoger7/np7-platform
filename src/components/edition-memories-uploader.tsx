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

/** Library-scale sizes: a week of drone clips is gigabytes, and "18644.2 MB"
 *  is not a number anyone reads. */
function bigBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

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
  const [viewer, setViewer] = useState<number | null>(null); // lightbox index into `photos` (click selects; the loupe enlarges)
  // The one dropzone: mixed photos+videos land on the current scope; FOLDERS
  // named exactly like a participant route their contents automatically.
  const [dropBusy, setDropBusy] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const [dropReport, setDropReport] = useState<string[] | null>(null);
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
  /* What this week's memories actually occupy — photos from the catalogue,
     videos from R2, counted together. Read once; it is two aggregates, not a
     bucket walk. */
  const [usage, setUsage] = useState<{ photos: { files: number; bytes: number }; video: { files: number; bytes: number }; combined: { files: number; bytes: number } } | null>(null);
  const [vidUp, setVidUp] = useState<{ name: string; pct: number; done: number; total: number; phase: "compress" | "upload" } | null>(null);
  // Per-batch video quality, chosen in the upload popup. "asis" = the files
  // were already compressed outside (Creator Suite etc.) — upload them EXACTLY
  // as-is; compressing twice visibly hurts quality. Remembered per browser;
  // migrates the old on/off compress toggle ("off" → as-is).
  type VidQuality = "standard" | "high" | "asis";
  const [vidQuality, setVidQuality] = useState<VidQuality>(() => {
    if (typeof window === "undefined") return "high";
    const saved = localStorage.getItem("np7-video-quality");
    // "standard" is dropped as a remembered choice on purpose: everyone who
    // picked it got the old, too-low bitrate. Let them land on the good one.
    if (saved === "high" || saved === "asis") return saved;
    return localStorage.getItem("np7-video-compress") === "off" ? "asis" : "high";
  });
  useEffect(() => {
    try { localStorage.setItem("np7-video-quality", vidQuality); } catch {}
  }, [vidQuality]);
  // A staged batch that contains videos parks in the popup for a quality choice
  // before anything uploads; photo-only batches skip the popup entirely.
  type Staged = { buckets: [string, File[]][]; skipped: string[]; nPhotos: number; nVideos: number };
  const [pending, setPending] = useState<Staged | null>(null);
  const [batchPhase, setBatchPhase] = useState<"choose" | "running" | "done">("choose");
  const [batchClean, setBatchClean] = useState(true); // false → the popup says so instead of "Done ✓"
  const dropInput = useRef<HTMLInputElement>(null); // click-to-browse twin of the dropzone

  // Warn before closing/reloading the tab mid-upload. A browser can't keep a
  // client upload running once the tab is CLOSED, so the best we can do is guard
  // against losing the run by accident.
  useEffect(() => {
    if (!vidUp && !dropBusy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [vidUp, dropBusy]);

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
  useEffect(() => { setSelected(new Set()); setViewer(null); }, [scope]);

  // lightbox keyboard: Esc closes, arrows walk the gallery — as on the front end
  useEffect(() => {
    if (viewer == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewer(null);
      if (e.key === "ArrowRight") setViewer((v) => (v == null ? v : Math.min(v + 1, photos.length - 1)));
      if (e.key === "ArrowLeft") setViewer((v) => (v == null ? v : Math.max(v - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer, photos.length]);
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

  // Core photo upload with an EXPLICIT target scope — the folder-drop router
  // uploads for many riders in one batch, so the state scope can't be the truth.
  /** Returns the names that did NOT land. A network blip must never take the
   *  whole batch down: each file retries, failures are collected, and the
   *  `finally` guarantees `uploading` is cleared — a stuck flag would freeze
   *  the dropzone, which is now the only way in. */
  async function uploadPhotoFiles(list: File[], scopeId: string): Promise<string[]> {
    if (!list.length) return [];
    setUploading(true);
    setProgress({ done: 0, total: list.length });
    const folder = folderFor(scopeId);
    const failed: string[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt));
          try {
            const fd = new FormData();
            fd.append("file", list[i]);
            fd.append("folder", folder);
            const res = await fetch("/api/admin/images", { method: "POST", body: fd });
            ok = res.ok;
          } catch { /* offline / aborted — retry */ }
        }
        if (!ok) failed.push(list[i].name);
        setProgress({ done: i + 1, total: list.length });
      }
    } finally {
      setUploading(false);
      setProgress(null);
      load(); refreshCounts();
    }
    return failed;
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
  useEffect(() => {
    fetch(`/api/admin/storage-usage?editionId=${editionId}`).then((r) => r.json()).then(setUsage).catch(() => {});
  }, [editionId]);

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

  async function presign(body: Record<string, string | undefined>, scopeId?: string) {
    const sc = scopeId !== undefined ? scopeId : scope;
    const res = await fetch("/api/admin/videos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editionId, bookingId: sc || undefined, ...body }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Could not start upload."); }
    return res.json();
  }

  /** Returns the names that did NOT land, same contract as uploadPhotoFiles —
   *  the caller folds them into the batch report. */
  async function uploadVideoFiles(list: File[], scopeId: string, mode: VidQuality): Promise<string[]> {
    if (!list.length) return [];
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
        if (mode !== "asis" && compressor?.canCompressInBrowser()) {
          setVidUp({ name: file.name, pct: 0, done: i, total: list.length, phase: "compress" });
          try {
            compressed = await compressor.compressVideo(file, prog("compress"), mode);
          } catch (err) {
            console.warn(`In-browser compression failed for ${file.name} — uploading raw instead.`, err);
          }
        } else if (mode === "asis") {
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
              const pre = await presign({ filename: file.name, contentType: "video/mp4", target: "video" }, scopeId);
              setVidUp({ name: file.name, pct: 0, done: i, total: list.length, phase: "upload" });
              await putToR2(pre.uploadUrl, compressed.mp4, "video/mp4", prog("upload"));
              if (compressed.poster && pre.posterUploadUrl) await putToR2(pre.posterUploadUrl, compressed.poster, "image/jpeg").catch(() => {});
            } else {
              // Fallback: raw original → _vidraw/ (compressed later by the fallback script).
              setVidUp({ name: file.name, pct: 0, done: i, total: list.length, phase: "upload" });
              const pre = await presign({ filename: file.name, contentType: file.type }, scopeId);
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
      loadVideos();
    }
    return failed;
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

  // "Julia Prien" ≙ "julia-prien" ≙ "Julia  Prien " — folder names come from
  // filesystems, participant names from humans; both get flattened before match.
  const normName = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

  /** Every file in the drop, tagged with its TOP-LEVEL folder (null = loose). */
  async function filesFromDrop(dt: DataTransfer): Promise<{ folder: string | null; file: File }[]> {
    const out: { folder: string | null; file: File }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = (entry: any, folder: string | null): Promise<void> => new Promise((resolve) => {
      if (!entry) return resolve();
      if (entry.isFile) {
        entry.file((f: File) => { if (!f.name.startsWith(".")) out.push({ folder, file: f }); resolve(); }, () => resolve());
      } else if (entry.isDirectory) {
        const owner = folder ?? entry.name; // nested subfolders keep the top-level owner
        const reader = entry.createReader();
        const readBatch = () => reader.readEntries(async (ents: unknown[]) => {
          if (!ents.length) return resolve();
          for (const e of ents) await walk(e, owner);
          readBatch(); // readEntries hands out ≤100 per call — loop until empty
        }, () => resolve());
        readBatch();
      } else resolve();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = Array.from(dt.items).map((it) => (it as any).webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) { for (const e of entries) await walk(e, null); return out; }
    // no entry API (older browser): loose files only
    return Array.from(dt.files).filter((f) => !f.name.startsWith(".")).map((file) => ({ folder: null, file }));
  }

  /** Bucket a batch by target scope. Batches WITH videos park in the quality
   *  popup first; photo-only batches upload straight away. */
  function stageIncoming(items: { folder: string | null; file: File }[]) {
    if (dropBusy || uploading || !!vidUp || pending) return;
    // participant lookup by normalized name (contact name AND booking name's first segment)
    const byName = new Map<string, string | "AMBIGUOUS">();
    for (const b of bookings) {
      for (const cand of [b.contact?.name, (b.name ?? "").split(" — ")[0].split(" - ")[0]]) {
        if (!cand) continue;
        const k = normName(cand);
        if (!k) continue;
        const prev = byName.get(k);
        if (prev && prev !== b.id) byName.set(k, "AMBIGUOUS");
        else byName.set(k, b.id);
      }
    }
    // bucket: scope key ("" | bookingId) → files; unmatched folders are skipped loudly
    const buckets = new Map<string, File[]>();
    const skipped = new Set<string>();
    let nPhotos = 0;
    let nVideos = 0;
    for (const { folder, file } of items) {
      let target: string | null = null;
      if (folder == null) target = scope;
      else {
        const hit = byName.get(normName(folder));
        if (hit && hit !== "AMBIGUOUS") target = hit;
        else { skipped.add(folder + (hit === "AMBIGUOUS" ? " (two participants share this name)" : "")); continue; }
      }
      if (file.type.startsWith("image/")) nPhotos += 1;
      if (file.type.startsWith("video/")) nVideos += 1;
      buckets.set(target, [...(buckets.get(target) ?? []), file]);
    }
    const staged: Staged = { buckets: [...buckets.entries()], skipped: [...skipped], nPhotos, nVideos };
    if (nVideos > 0) {
      setBatchPhase("choose");
      setPending(staged);
    } else {
      // Photo-only: no popup. Never leave this as an unhandled rejection —
      // that used to strand `uploading` and freeze the dropzone for good.
      void runBatch(staged, null).catch((e) => console.warn("Photo batch failed", e));
    }
  }

  /** Runs a staged batch and returns whether everything landed. Nothing in here
   *  may throw past the caller: a half-failed batch must still report honestly
   *  rather than leave the popup claiming success. */
  async function runBatch(staged: Staged, mode: VidQuality | null): Promise<boolean> {
    setDropBusy(true);
    setDropReport(null);
    const report: string[] = [];
    let clean = true;
    try {
      for (const [target, files] of staged.buckets) {
        const imgs = files.filter((f) => f.type.startsWith("image/"));
        const vids = files.filter((f) => f.type.startsWith("video/"));
        const other = files.length - imgs.length - vids.length;
        const who = target === "" ? "Everyone" : (bookings.find((b) => b.id === target)?.contact?.name || bookings.find((b) => b.id === target)?.name || "participant");
        let bad: string[] = [];
        try {
          if (imgs.length) bad = bad.concat(await uploadPhotoFiles(imgs, target));
          if (vids.length && mode) bad = bad.concat(await uploadVideoFiles(vids, target, mode));
        } catch (e) {
          console.warn("Upload batch error", e);
          bad = bad.concat(["(the run stopped early)"]);
        }
        // Count only what actually landed — a report that says "✓" for files
        // that never uploaded is worse than no report at all.
        const okImgs = imgs.length - bad.filter((n) => imgs.some((f) => f.name === n)).length;
        const okVids = vids.length - bad.filter((n) => vids.some((f) => f.name === n)).length;
        if (bad.length) clean = false;
        report.push(
          `${who}: ${okImgs} photo${okImgs === 1 ? "" : "s"}, ${okVids} video${okVids === 1 ? "" : "s"}${bad.length ? "" : " ✓"}${other ? ` · ${other} other file${other === 1 ? "" : "s"} skipped` : ""}`
        );
        if (bad.length) {
          report.push(`⚠ ${bad.length} didn't upload — re-drop ${bad.slice(0, 4).join(", ")}${bad.length > 4 ? " …" : ""}`);
        }
      }
      for (const f of staged.skipped) { clean = false; report.push(`Folder "${f}" matches no participant — skipped.`); }
      if (!staged.buckets.length && !staged.skipped.length) report.push("Nothing uploadable in that drop.");
    } finally {
      setDropBusy(false);
      setDropReport(report);
      loadVideos(); load(); refreshCounts();
    }
    return clean;
  }

  async function handleDrop(dt: DataTransfer) {
    if (dropBusy || uploading || !!vidUp || pending) return;
    const dropped = await filesFromDrop(dt);
    if (dropped.length) stageIncoming(dropped);
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

        {/* scope picker — min-w-0/max-w-full so long names can never force the
            panel (and with it the whole admin page) into sideways scrolling */}
        <div className="flex flex-wrap gap-1.5 mb-4 min-w-0 max-w-full">
          {chip("", "👥 Everyone")}
          {bookings.map((b) => chip(b.id, b.contact?.name || b.name || "Participant"))}
          {bookings.length === 0 && <span className="text-xs admin-faint">No participants booked yet.</span>}
        </div>

        {/* THE dropzone — the ONE entry point for photos AND videos: drop or
            click to browse. Video batches get the quality popup first. */}
        <input ref={dropInput} type="file" accept="image/*,video/*" multiple className="hidden"
          onChange={(e) => {
            const fs = e.target.files;
            if (fs?.length) stageIncoming(Array.from(fs).map((file) => ({ folder: null, file })));
            e.target.value = "";
          }} />
        <div
          onClick={() => { if (!dropBusy && !uploading && !vidUp && !pending) dropInput.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDropOver(true); }}
          onDragLeave={() => setDropOver(false)}
          onDrop={(e) => { e.preventDefault(); setDropOver(false); handleDrop(e.dataTransfer); }}
          className={`rounded-xl border-2 border-dashed px-4 py-5 mb-4 text-center transition-colors cursor-pointer ${dropOver ? "border-[#0aa3c7] bg-[#0aa3c7]/5" : ""}`}
          style={{ borderColor: dropOver ? undefined : "var(--admin-border)" }}
        >
          <p className="text-sm font-bold admin-heading">
            {dropBusy
              ? (uploading && progress ? `Uploading photos ${progress.done}/${progress.total}…` : vidUp ? "Uploading videos…" : "Uploading the drop…")
              : `Drop photos & videos here → ${scopeLabel}`}
          </p>
          <p className="text-xs admin-faint mt-1">
            …or <span className="admin-muted">click to choose files</span>. Whole folders named like participants
            („Julia Prien/…") route automatically — each folder&apos;s photos and videos land with that rider.
            Unmatched folders are skipped, never guessed.
          </p>
          {dropReport && (
            <div className="mt-2.5 text-left inline-block text-xs admin-muted space-y-0.5">
              {dropReport.map((r, i) => <p key={i}>{r}</p>)}
            </div>
          )}
        </div>

        {/* What this week is costing in storage. Memories is the folder that
            grows by itself — every trip adds to it and nothing leaves until the
            purge — so the number belongs where the uploading happens, not only
            in File Storage. Absent rather than zero if the read fails. */}
        {usage?.combined ? (
          <p className="text-xs admin-faint mb-3">
            This week&apos;s memories: <span className="admin-muted font-semibold">{bigBytes(usage.combined.bytes)}</span>
            {" "}across {usage.combined.files.toLocaleString("en-GB")} files
            <span className="admin-faint">
              {" "}· {usage.photos.files.toLocaleString("en-GB")} photos {bigBytes(usage.photos.bytes)}
              {usage.video.files > 0 ? ` · ${usage.video.files.toLocaleString("en-GB")} videos ${bigBytes(usage.video.bytes)}` : ""}
            </span>
          </p>
        ) : null}

        {/* Keepers requirement + 3-month retention disclaimer */}
        {(() => {
          const okP = starPhotos.size >= KEEPERS_TARGET, okV = starVideos.size >= KEEPERS_TARGET;
          return (
            <div className="rounded-lg px-3 py-2.5 mb-4 text-xs" style={{ border: "1px solid var(--admin-border)", backgroundColor: okP && okV ? "rgba(34,197,94,0.07)" : "rgba(245,158,11,0.07)" }}>
              <p className="font-bold admin-heading flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>⭐ Keepers for {scopeLabel}:</span>
                {/* Target, not a cap — starring more is fine and welcome. Once
                    the target is met the "/3" goes away, so a curated set never
                    renders as "5/3", which reads like a breached limit. */}
                <span className={okP ? "text-green-500" : "text-amber-500"}>{starPhotos.size}{okP ? "" : `/${KEEPERS_TARGET}`} photos</span>
                <span className="admin-faint">·</span>
                <span className={okV ? "text-green-500" : "text-amber-500"}>{starVideos.size}{okV ? "" : `/${KEEPERS_TARGET}`} videos</span>
                {okP && okV && <span className="text-green-500">✓ done</span>}
              </p>
              <p className="admin-faint mt-1">
                Star (☆ → ⭐) at least {KEEPERS_TARGET} photos and {KEEPERS_TARGET} videos for each person — more is welcome, there&apos;s no limit. Keepers are <span className="admin-muted">kept forever</span>.
                The rest is deleted <span className="admin-muted">a year after the trip (videos after 3 months)</span>, so please curate before then.
              </p>
            </div>
          );
        })()}

        {/* "new photos are up" reminder — one press emails every participant their
            gallery link (deduped per day, so a double click can't double-send) */}
        {remind && remind.recipients > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 mb-4">
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
              {(photosExpanded ? photos : photos.slice(0, PHOTO_PEEK)).map((p, gridIdx) => {
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
                    <button onClick={(e) => { e.stopPropagation(); setViewer(gridIdx); }}
                      className="absolute bottom-1 right-1 w-6 h-6 rounded bg-black/45 text-white/85 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity" title="View large">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35M11 8v6M8 11h6" /></svg>
                    </button>
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
          Uploads go through the <span className="admin-muted">dropzone in the photos card above</span> — drop clips or whole
          participant folders there and pick a quality in the popup. This is the video library for <span className="admin-muted">{scopeLabel}</span>.
        </p>

        {!vidR2 ? (
          <p className="text-xs admin-faint">Video storage isn&apos;t switched on yet (R2 keys not set).</p>
        ) : (
          <>
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

      {/* Upload popup: video batches wait here for a quality choice, then the
          whole run (photos included) shows its progress in one place. */}
      {pending && (
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4"
          onClick={() => { if (batchPhase !== "running") setPending(null); }}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
            onClick={(e) => e.stopPropagation()}>
            {batchPhase === "choose" && (
              <>
                <h3 className="text-sm font-bold admin-heading">Video quality</h3>
                <p className="text-xs admin-faint mt-0.5 mb-3">
                  {pending.nVideos} video{pending.nVideos === 1 ? "" : "s"}{pending.nPhotos ? ` + ${pending.nPhotos} photo${pending.nPhotos === 1 ? "" : "s"}` : ""} ready.
                  Compression runs in your browser — the giant originals never upload.
                </p>
                <div className="space-y-2 mb-4">
                  {([
                    { id: "high", name: "Best · 1080p", desc: "20 Mbit/s + sharpening — for water, spray and fast action, which is most of what we shoot", tag: "recommended" },
                    { id: "standard", name: "Smaller · 1080p", desc: "12 Mbit/s + sharpening — fine for calm shots and talking heads, roughly half the file size", tag: null },
                    { id: "asis", name: "Already compressed", desc: "Upload files exactly as they are — best quality if they came out of the Creator Suite (compressing twice always hurts)", tag: "best quality" },
                  ] as { id: VidQuality; name: string; desc: string; tag: string | null }[]).map((o) => (
                    <button key={o.id} type="button" onClick={() => setVidQuality(o.id)}
                      className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition-colors ${vidQuality === o.id ? "border-[#0aa3c7] bg-[#0aa3c7]/10" : ""}`}
                      style={{ borderColor: vidQuality === o.id ? undefined : "var(--admin-border)" }}>
                      <span className="text-xs font-bold admin-heading">{o.name}
                        {o.tag && <span className="ml-2 text-[10px] font-bold text-[#0aa3c7] uppercase tracking-wide">{o.tag}</span>}
                      </span>
                      <span className="block text-[11px] admin-faint mt-0.5">{o.desc}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setPending(null)}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold admin-muted" style={{ border: "1px solid var(--admin-border)" }}>Cancel</button>
                  <button type="button"
                    onClick={async () => {
                      setBatchPhase("running");
                      let clean = false;
                      try { clean = await runBatch(pending, vidQuality); }
                      catch (e) { console.warn("Batch failed", e); }
                      finally { setBatchClean(clean); setBatchPhase("done"); }
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white">
                    Start upload
                  </button>
                </div>
              </>
            )}
            {batchPhase === "running" && (
              <>
                <h3 className="text-sm font-bold admin-heading">Uploading…</h3>
                <p className="text-xs admin-faint mt-0.5 mb-3">Keep this tab open — you can switch away (it survives sleep &amp; network blips), just don&apos;t close it.</p>
                {vidUp ? (
                  <>
                    <p className="text-xs admin-muted mb-1.5 truncate">
                      {vidUp.phase === "compress" ? "Compressing" : "Uploading"} video {vidUp.done + 1}/{vidUp.total} — {vidUp.pct}% · {vidUp.name}
                    </p>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-input-bg)" }}>
                      <div className="h-full bg-[#0aa3c7] transition-[width] duration-150" style={{ width: `${vidUp.pct}%` }} />
                    </div>
                  </>
                ) : uploading && progress ? (
                  <p className="text-xs admin-muted">Uploading photos {progress.done}/{progress.total}…</p>
                ) : (
                  <p className="text-xs admin-muted">Starting…</p>
                )}
              </>
            )}
            {batchPhase === "done" && (
              <>
                <h3 className="text-sm font-bold admin-heading">{batchClean ? "Done ✓" : "Finished — with problems"}</h3>
                <div className="mt-2 mb-4 text-xs admin-muted space-y-0.5">
                  {(dropReport ?? []).map((r, i) => <p key={i}>{r}</p>)}
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={() => setPending(null)}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white">Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Lightbox — the front end's viewer, admin edition: chrome carries the
          counter, arrows walk, Esc closes. */}
      {viewer != null && photos[viewer] && (
        <div className="fixed inset-0 z-[70] bg-black/92 flex flex-col" onClick={() => setViewer(null)}>
          <div className="flex items-center justify-between px-4 py-3 text-white/85 text-sm">
            <span className="font-semibold tabular-nums">{viewer + 1} / {photos.length}</span>
            <button onClick={(e) => { e.stopPropagation(); setViewer(null); }} className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10 text-xl" aria-label="Close">×</button>
          </div>
          <div className="flex-1 flex items-center justify-center px-12 pb-6 min-h-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[viewer].url} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          </div>
          {viewer > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setViewer(viewer - 1); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl" aria-label="Previous">‹</button>
          )}
          {viewer < photos.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); setViewer(viewer + 1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl" aria-label="Next">›</button>
          )}
        </div>
      )}
    </div>
  );
}
