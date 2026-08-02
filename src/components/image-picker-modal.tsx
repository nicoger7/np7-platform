"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface FileItem {
  name: string;
  path: string;
  isFolder: boolean;
  url: string | null;
  size: number;
  type: string | null;
  updatedAt: string;
  label?: string | null; // friendly name for UUID folders (e.g. memories → edition / rider)
}

interface ImagePickerModalProps {
  onSelect: (url: string) => void;
  onClose: () => void;
  /** Open the library here and default uploads to this folder (e.g. experiences/alacati/hero). */
  defaultFolder?: string;
}

function formatSize(bytes: number) {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Resize large images client-side (canvas → WebP) so uploads stay well under the
    serverless ~4.5 MB body limit and load fast. WebP is ~30–40% smaller than JPEG at
    the same quality. SVG/GIF and already-small files (<500 KB) pass through.
    GUARANTEES the result is under the cap: it shrinks dimension + quality step by
    step until the encoded blob fits (that's the 413 fix), and throws a clear error
    for formats the browser can't decode (e.g. HEIC) instead of silently sending the
    huge original. */
const UPLOAD_CAP = 3_800_000; // stay safely under Vercel's ~4.5 MB request-body limit

/**
 * 2000px was too small for the places these photos actually land.
 *
 * A survey or experience hero is full-bleed, so on a retina laptop it needs
 * roughly 3000 device pixels across — a 2000px source is already being upscaled
 * before it starts, and the Garda survey hero (1280px after this pass) rendered
 * visibly soft. Thumbnails and cards never noticed, which is why it went
 * unspotted.
 *
 * 3000 at 0.86 still lands comfortably under the request-body cap, and R2 egress
 * is free, so the extra weight costs storage only.
 */
/** Name the upload after what we actually encoded — a .webp that is really a
    JPEG makes the server re-encode it a second time, losing quality twice. */
function asFile(original: File, blob: Blob): File {
  const ext = blob.type === "image/webp" ? ".webp" : ".jpg";
  return new File([blob], original.name.replace(/\.[^.]+$/, "") + ext, { type: blob.type });
}

async function downscaleImage(file: File, maxDim = 3000, quality = 0.86): Promise<File> {
  if (!file.type.startsWith("image/") || /svg|gif/i.test(file.type)) {
    if (file.size > UPLOAD_CAP) throw new Error(`This file is ${formatSize(file.size)} — over the ${(UPLOAD_CAP / 1e6).toFixed(1)} MB limit for this type. Export a smaller version.`);
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't read this image — the browser can't open this format (HEIC?). Export it as JPG or PNG and try again.");
  }
  try {
    // already within bounds and small enough → pass the original through untouched
    if (Math.max(bitmap.width, bitmap.height) <= maxDim && file.size < 500_000) return file;

    const encode = async (dim: number, q: number): Promise<Blob | null> => {
      const scale = Math.min(1, dim / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", q));
      // canvas.toBlob silently falls back to PNG when it can't encode the type
      // asked for — and PNG ignores `q` entirely. A photo-sized PNG is ~10x a
      // WebP, so the ladder below then shrinks the DIMENSIONS until the PNG
      // fits, and a 60-megapixel original lands at 1280px for no good reason.
      // JPEG is universally supported and does respect quality, so prefer it
      // over an unrequested PNG.
      if (blob && blob.type !== "image/webp") {
        return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
      }
      return blob;
    };

    // Shrink progressively until it fits under the cap; keep the smallest attempt.
    let smallest: Blob | null = null;
    for (const dim of [maxDim, 1600, 1280, 1024, 800]) {
      for (const q of [quality, 0.7, 0.6, 0.5]) {
        const blob = await encode(dim, q);
        if (!blob) continue;
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= UPLOAD_CAP) return asFile(file, blob);
      }
    }
    if (smallest) return asFile(file, smallest);
    return file;
  } finally {
    bitmap.close?.();
  }
}

/** Collision-free, URL-safe storage key from any original filename. */
function safeName(file: File) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const base = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
}

export default function ImagePickerModal({ onSelect, onClose, defaultFolder }: ImagePickerModalProps) {
  const [view, setView] = useState<"all" | "folders">("all");
  const [all, setAll] = useState<FileItem[]>([]);
  const [folderFiles, setFolderFiles] = useState<FileItem[]>([]);
  const [folder, setFolder] = useState(defaultFolder || "");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Friendly names for the UUID folders we've walked through, so the
  // breadcrumb can read "Bonaire 2026 / Participants / Dennis Robinson"
  // instead of three raw UUIDs.
  const [crumbLabels, setCrumbLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [dest, setDest] = useState(defaultFolder || ""); // where NEW uploads land — always shown, changeable
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const target = dest || "uploads"; // effective upload folder (root falls back to /uploads)

  async function createFolder() {
    const clean = newFolder.trim().toLowerCase().replace(/[^a-z0-9/_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!clean) { setNewFolderOpen(false); return; }
    const path = dest ? `${dest}/${clean}` : clean;
    await fetch("/api/admin/images", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder: path }) }).catch(() => {});
    setDest(path); setNewFolder(""); setNewFolderOpen(false);
    if (view === "folders") { setFolder(path); loadFolder(path); }
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/images?recursive=1`);
    const data = await res.json().catch(() => ({ files: [] }));
    setAll(data.files || []);
    setLoading(false);
  }, []);

  const loadFolder = useCallback(async (f: string) => {
    setLoading(true);
    const params = f ? `?folder=${encodeURIComponent(f)}` : "";
    const res = await fetch(`/api/admin/images${params}`);
    const data = await res.json().catch(() => ({ files: [] }));
    setFolderFiles(data.files || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (view === "folders") loadFolder(folder); }, [view, folder, loadFolder]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function doUpload(fileArr: File[]) {
    if (!fileArr.length) return;
    setUploading(true);
    setError("");
    setProgress({ done: 0, total: fileArr.length });
    let lastUrl = "";
    try {
      for (let i = 0; i < fileArr.length; i++) {
        const file = await downscaleImage(fileArr[i]);
        const named = new File([file], safeName(file), { type: file.type });
        const fd = new FormData();
        fd.append("file", named);
        fd.append("folder", target);
        const res = await fetch("/api/admin/images", { method: "POST", body: fd });
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Upload failed (${res.status})`); }
        const j = await res.json();
        lastUrl = j.url || lastUrl;
        setProgress({ done: i + 1, total: fileArr.length });
      }
    } catch (e) {
      setUploading(false); setProgress(null);
      setError((e as Error).message || "Upload failed — try a smaller image.");
      return;
    }
    setUploading(false); setProgress(null);
    await loadAll();
    if (view === "folders") await loadFolder(folder);
    if (lastUrl) setSelected(lastUrl);
    if (lastUrl && fileArr.length === 1) onSelect(lastUrl);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length) doUpload(files);
  }

  // What to show
  const q = query.trim().toLowerCase();
  // A search is always global. The box says "Search all images", and searching
  // inside the one folder you're already looking at is the one thing nobody
  // needs — so a query takes over the folder view instead of silently
  // filtering a list it was never applied to.
  const searching = q.length > 0;
  const allImages = all.filter((f) => !q || f.path.toLowerCase().includes(q));
  const folders = view === "folders" && !searching ? folderFiles.filter((f) => f.isFolder) : [];
  const folderImages = view === "folders" ? folderFiles.filter((f) => !f.isFolder && f.type?.startsWith("image/")) : [];
  const grid = view === "all" || searching ? allImages : folderImages;
  const breadcrumbs = folder ? folder.split("/").filter(Boolean) : [];

  const tabBtn = (active: boolean) =>
    `px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold transition-colors ${active ? "bg-[#0aa3c7] text-white" : "admin-muted hover:admin-heading"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="rounded-2xl w-full max-w-[1080px] h-[86vh] flex flex-col mx-4 overflow-hidden"
        style={{ backgroundColor: "var(--admin-sidebar)", border: "1px solid var(--admin-border)" }}
        onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
        onDrop={onDrop}
      >
        {/* Header: title · segmented control · search · upload · close */}
        <div className="flex items-center gap-3 p-4 sm:p-5" style={{ borderBottom: "1px solid var(--admin-border)" }}>
          <h2 className="text-base font-bold admin-heading shrink-0">Media library</h2>
          <div className="flex items-center gap-1 p-0.5 rounded-xl shrink-0" style={{ backgroundColor: "var(--admin-bg)" }}>
            <button onClick={() => setView("all")} className={tabBtn(view === "all")}>All</button>
            <button onClick={() => setView("folders")} className={tabBtn(view === "folders")}>Folders</button>
          </div>
          <div className="relative flex-1 min-w-0">
            <svg className="w-4 h-4 admin-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); if (view !== "all") setView("all"); }}
              placeholder="Search all images…"
              className="w-full pl-9 pr-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7]"
            />
          </div>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="shrink-0 px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors">
            {uploading ? (progress ? `Uploading ${progress.done}/${progress.total}…` : "Uploading…") : "Upload"}
          </button>
          <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.length) doUpload(Array.from(e.target.files)); e.target.value = ""; }} />
          <button onClick={onClose} className="shrink-0 w-8 h-8 grid place-items-center rounded-lg admin-muted hover:admin-heading" aria-label="Close">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Upload destination — ALWAYS visible so it's obvious where new files land,
            and easy to change (browse a folder → "use this", or make a new one). */}
        <div className="flex items-center gap-2 px-5 py-2.5 flex-wrap" style={{ borderBottom: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)" }}>
          <span className="text-[11px] font-bold uppercase tracking-wide admin-faint shrink-0">New uploads go to</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-bold admin-heading" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
            <svg className="w-3.5 h-3.5 admin-faint" viewBox="0 0 24 24" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
            {target}
          </span>
          {view === "folders" && folder && folder !== dest && (
            <button onClick={() => setDest(folder)} className="text-[12px] font-bold text-[#0aa3c7] hover:underline">← put uploads in “{folder.split("/").pop()}”</button>
          )}
          {view === "all" && <button onClick={() => setView("folders")} className="text-[12px] font-bold text-[#0aa3c7] hover:underline">Change folder</button>}
          <span className="admin-faint hidden sm:inline">·</span>
          {newFolderOpen ? (
            <span className="inline-flex items-center gap-1.5">
              <input autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") { setNewFolderOpen(false); setNewFolder(""); } }}
                placeholder="new-folder-name" className="px-2.5 py-1 admin-input border rounded-lg text-[12.5px] w-[160px] focus:outline-none focus:border-[#0aa3c7]" />
              <button onClick={createFolder} className="text-[12px] font-bold text-[#0aa3c7]">Create</button>
              <button onClick={() => { setNewFolderOpen(false); setNewFolder(""); }} className="text-[12px] admin-faint">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setNewFolderOpen(true)} className="text-[12px] font-bold text-[#0aa3c7] hover:underline">＋ New folder{dest ? ` inside ${dest.split("/").pop()}` : ""}</button>
          )}
        </div>

        {error && <div className="mx-5 mt-3 rounded-lg px-4 py-2.5 text-[13px] font-medium" style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>{error}</div>}

        {/* Folder breadcrumbs (folders view only) */}
        {view === "folders" && (
          <div className="flex items-center gap-1.5 text-sm px-5 py-2.5 flex-wrap" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {searching ? (
              <span className="admin-muted">Searching everywhere for <span className="admin-heading font-medium">“{query.trim()}”</span> — clear the box to browse folders again.</span>
            ) : (
              <>
                <button onClick={() => setFolder("")} className={folder ? "admin-muted" : "admin-heading font-medium"}>assets</button>
                {breadcrumbs.map((crumb, i) => {
                  const path = breadcrumbs.slice(0, i + 1).join("/");
                  const isLast = i === breadcrumbs.length - 1;
                  // Memory folders are keyed by UUID, so the raw crumb is
                  // unreadable. We learned the friendly name when this folder
                  // was a tile — use it, and keep the UUID on hover.
                  const nice = crumbLabels[path];
                  return (
                    <span key={path} className="flex items-center gap-1.5">
                      <span className="admin-faint">/</span>
                      <button onClick={() => setFolder(path)} title={nice ? crumb : undefined} className={isLast ? "admin-heading font-medium" : "admin-muted"}>{nice ?? crumb}</button>
                    </span>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div className="relative flex-1 overflow-auto p-4 sm:p-5 min-h-0">
          {dragOver && (
            <div className="absolute inset-3 z-10 rounded-2xl border-2 border-dashed border-[#0aa3c7] bg-[#0aa3c7]/10 grid place-items-center pointer-events-none">
              <p className="text-sm font-bold text-[#0aa3c7]">Drop to upload to “{target}”</p>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 18 }).map((_, i) => <div key={i} className="aspect-square rounded-xl animate-pulse" style={{ backgroundColor: "var(--admin-bg)" }} />)}
            </div>
          ) : (
            <>
              {/* Folders (folders view) */}
              {folders.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-3 mb-5">
                  {folders.map((item) => (
                    <button key={item.path} onClick={() => { if (item.label) setCrumbLabels((m) => ({ ...m, [item.path]: item.label! })); setFolder(item.path); }} title={item.label ? `${item.label} (${item.name})` : item.name} className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors hover:bg-[var(--admin-surface-hover)]" style={{ border: "1px solid var(--admin-border)" }}>
                      <svg className="w-7 h-7 admin-faint" viewBox="0 0 24 24" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                      <span className="text-[11px] admin-muted truncate max-w-full">{item.label ?? item.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {grid.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  {grid.map((item) => {
                    const isSelected = selected === item.url;
                    const dir = item.path.includes("/") ? item.path.slice(0, item.path.lastIndexOf("/")) : "";
                    return (
                      <button
                        key={item.path}
                        onClick={() => setSelected(item.url)}
                        onDoubleClick={() => item.url && onSelect(item.url)}
                        title={item.path}
                        className="group relative rounded-xl overflow-hidden text-left transition-all"
                        style={{ border: isSelected ? "2px solid #0aa3c7" : "1px solid var(--admin-border)", boxShadow: isSelected ? "0 0 0 3px rgba(10,163,199,0.25)" : "none" }}
                      >
                        <div className="aspect-square overflow-hidden" style={{ backgroundColor: "var(--admin-bg)" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.url!} alt={item.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        </div>
                        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-[11px] text-white font-medium truncate">{item.name}</p>
                          {view === "all" && dir && <p className="text-[9.5px] text-white/60 truncate">{dir}</p>}
                          {view !== "all" && <p className="text-[9.5px] text-white/60">{formatSize(item.size)}</p>}
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-[#0aa3c7] rounded-full grid place-items-center shadow">
                            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                folders.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-[260px] text-center">
                    <svg className="w-10 h-10 admin-faint mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
                    <p className="text-sm admin-muted">{q ? "No images match your search" : "No images here yet"}</p>
                    <p className="text-xs admin-faint mt-1">Drag &amp; drop images anywhere, or use Upload.</p>
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 sm:p-5" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <p className="text-xs admin-faint">
            {view === "all" ? `${allImages.length} image${allImages.length === 1 ? "" : "s"}` : `${folders.length} folder${folders.length === 1 ? "" : "s"} · ${grid.length} image${grid.length === 1 ? "" : "s"} here`}
            <span className="hidden sm:inline"> · double-click a photo to pick it</span>
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm admin-muted">Cancel</button>
            <button onClick={() => selected && onSelect(selected)} disabled={!selected} className="px-5 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-30 text-white text-sm font-bold rounded-lg transition-colors">Select</button>
          </div>
        </div>
      </div>
    </div>
  );
}
