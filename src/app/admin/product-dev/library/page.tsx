"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The Product Development media root.
 *
 * A deliberately smaller thing than File Storage: there is no breadcrumb above
 * `product-dev/` and no "everything" view, because from in here the rest of the
 * bucket does not exist. Photos, CAD files and (later) test recordings all live
 * under one root, which is why this is Media and not a photo gallery.
 */

const ROOT = "product-dev";

interface Item {
  name: string;
  path: string;
  isFolder: boolean;
  url: string | null;
  thumbUrl: string | null;
  size: number;
  type: string | null;
  updatedAt: string | null;
}

function fmtSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const isImage = (t: string | null) => (t ?? "").startsWith("image/");

export default function ProductDevMediaPage() {
  const [folder, setFolder] = useState(ROOT);
  const [files, setFiles] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function load(f: string) {
    fetch(`/api/admin/product-dev/media?folder=${encodeURIComponent(f)}`)
      .then((r) => r.json())
      .then((d) => { setFiles(Array.isArray(d.files) ? d.files : []); setLoading(false); })
      .catch(() => { setError("Couldn't load this folder."); setLoading(false); });
  }

  useEffect(() => { load(folder); }, [folder]);

  async function upload(list: File[]) {
    if (!list.length) return;
    setUploading(true); setError("");
    for (const file of list) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);
      const res = await fetch("/api/admin/product-dev/media", { method: "POST", body: fd });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || `Upload failed for ${file.name}.`);
        break;
      }
    }
    setUploading(false);
    load(folder);
  }

  async function newFolder() {
    const name = prompt("Folder name");
    if (!name) return;
    const res = await fetch("/api/admin/product-dev/media", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: `${folder}/${name}` }),
    });
    if (res.ok) load(folder);
    else setError((await res.json().catch(() => ({}))).error || "Couldn't create that folder.");
  }

  async function remove(item: Item) {
    if (!confirm(`Delete ${item.name}?\n\nThis removes it from storage — anything referencing it will show a broken image.`)) return;
    const res = await fetch("/api/admin/product-dev/media", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [item.path] }),
    });
    if (res.ok) load(folder);
    else setError((await res.json().catch(() => ({}))).error || "Couldn't delete that.");
  }

  // Crumbs stop at the root — there is no "up" out of this section.
  const crumbs = folder.split("/").filter(Boolean);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(Array.from(e.dataTransfer.files)); }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Media</h1>
          <p className="text-sm admin-muted">
            Photos, drawings and CAD files for R&amp;D. Locked to this section — nothing here appears in the
            Experience or Hardware pickers.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={newFolder} className="px-3 py-2 text-sm rounded-lg admin-muted hover:text-[var(--admin-accent)]"
            style={{ border: "1px solid var(--admin-border)" }}>New folder</button>
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <input ref={inputRef} type="file" multiple hidden
            onChange={(e) => { if (e.target.files) upload(Array.from(e.target.files)); e.target.value = ""; }} />
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-4 text-xs">
        {crumbs.map((c, i) => {
          const path = crumbs.slice(0, i + 1).join("/");
          const isLast = i === crumbs.length - 1;
          return (
            <span key={path} className="flex items-center gap-1.5">
              {i > 0 && <span className="admin-faint">/</span>}
              <button onClick={() => setFolder(path)} disabled={isLast}
                className={isLast ? "admin-heading font-semibold" : "admin-muted hover:text-[var(--admin-accent)]"}>
                {i === 0 ? "Product Dev" : c}
              </button>
            </span>
          );
        })}
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-400" style={{ border: "1px solid var(--admin-border)" }}>{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : files.length === 0 ? (
        <div className="py-16 text-center rounded-xl" style={{ border: `1px dashed ${dragOver ? "var(--admin-accent)" : "var(--admin-border)"}` }}>
          <p className="text-sm admin-faint">Nothing here yet — drop files anywhere on this page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {files.map((f) => (
            <div key={f.path} className="rounded-xl overflow-hidden group relative" style={{ border: "1px solid var(--admin-border)" }}>
              {f.isFolder ? (
                <button onClick={() => setFolder(f.path)} className="w-full aspect-square flex flex-col items-center justify-center gap-2 admin-surface hover:bg-[var(--admin-surface-hover)] transition-colors">
                  <svg className="w-8 h-8 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                  <span className="text-xs admin-muted px-2 truncate max-w-full">{f.name}</span>
                </button>
              ) : (
                <>
                  <div className="aspect-square admin-surface flex items-center justify-center overflow-hidden">
                    {isImage(f.type) && f.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.thumbUrl} alt={f.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="text-[10px] font-bold tracking-wider admin-faint uppercase">
                        {(f.name.split(".").pop() || "file").slice(0, 5)}
                      </span>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-[11px] admin-muted truncate" title={f.name}>{f.name}</p>
                    <p className="text-[10px] admin-faint">{fmtSize(f.size)}</p>
                  </div>
                  <button onClick={() => remove(f)} title="Delete"
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md text-xs opacity-0 group-hover:opacity-100 transition-opacity admin-surface admin-faint hover:text-red-400"
                    style={{ border: "1px solid var(--admin-border)" }}>✕</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs admin-faint max-w-2xl leading-relaxed">
        Files here are hidden from the shared media library, but the storage bucket itself is public —
        anyone holding a direct URL can still open one. Treat that as &ldquo;not discoverable&rdquo;, not
        &ldquo;secret&rdquo;.
      </p>
    </div>
  );
}
