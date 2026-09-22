"use client";

import { useEffect, useRef, useState } from "react";
import {
  Empty, Icon, InfoTip, PageHeader, btnPrimary, btnPrimaryStyle, btnSecondary, btnSecondaryStyle, toneVars, type Tone,
} from "@/components/admin/pd-ui";

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

/** File types by colour, so a drawing, a CAD file and a spreadsheet are
 *  told apart before the name is read. */
function fileTone(name: string): Tone {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (["pdf"].includes(ext)) return "red";
  if (["s3dx", "s3d", "brd", "stp", "step", "igs", "iges", "dxf", "dwg", "stl", "3dm"].includes(ext)) return "violet";
  if (["xlsx", "xls", "csv", "numbers"].includes(ext)) return "green";
  if (["mp4", "mov", "m4a", "webm", "ogg", "mp3"].includes(ext)) return "pink";
  return "slate";
}

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
    if (!confirm(`Delete ${item.name}?\n\nThis removes it from storage. Anything referencing it will show a broken image.`)) return;
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
      <PageHeader
        title="Media"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            Photos, drawings and CAD files for R&amp;D. Drop files anywhere on the page.
            <InfoTip>
              Locked to Product Dev: nothing here appears in the Experience or Hardware pickers. The storage bucket
              itself is public, though, so anyone holding a direct URL can still open a file. Treat it as
              &ldquo;not discoverable&rdquo;, not &ldquo;secret&rdquo;.
            </InfoTip>
          </span>
        }
        actions={
          <>
            <button onClick={newFolder} className={btnSecondary} style={btnSecondaryStyle}>
              <Icon name="folder" className="w-4 h-4" />New folder
            </button>
            <button onClick={() => inputRef.current?.click()} disabled={uploading} className={btnPrimary} style={btnPrimaryStyle}>
              <Icon name="upload" className="w-4 h-4" />{uploading ? "Uploading…" : "Upload"}
            </button>
            <input ref={inputRef} type="file" multiple hidden
              onChange={(e) => { if (e.target.files) upload(Array.from(e.target.files)); e.target.value = ""; }} />
          </>
        }
      />

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

      {error && <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-500" style={{ border: "1px solid var(--admin-border)" }}>{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : files.length === 0 ? (
        <div style={dragOver ? { outline: "2px dashed var(--admin-accent)", borderRadius: 16 } : undefined}>
          <Empty icon="image" tone="pink" title="Nothing here yet">Drop files anywhere on this page, or use Upload.</Empty>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
          style={dragOver ? { outline: "2px dashed var(--admin-accent)", outlineOffset: 6, borderRadius: 16 } : undefined}>
          {files.map((f) => (
            <div key={f.path} className="rounded-2xl overflow-hidden group relative" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              {f.isFolder ? (
                <button onClick={() => setFolder(f.path)} className="pd-tone w-full h-full min-h-[140px] flex flex-col items-center justify-center gap-2 transition-colors hover:brightness-95"
                  style={{ ...toneVars("amber"), backgroundColor: "var(--tone-bg)" }}>
                  <Icon name="folder" className="w-10 h-10" style={{ color: "var(--tone)" }} strokeWidth={1.5} />
                  <span className="text-xs font-semibold admin-heading px-2 truncate max-w-full">{f.name}</span>
                </button>
              ) : (
                <>
                  <div className="aspect-square flex items-center justify-center overflow-hidden" style={{ backgroundColor: "var(--admin-bg)" }}>
                    {isImage(f.type) && f.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.thumbUrl} alt={f.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="pd-tone px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide"
                        style={{ ...toneVars(fileTone(f.name)), color: "var(--tone)", backgroundColor: "var(--tone-bg)" }}>
                        {(f.name.split(".").pop() || "file").slice(0, 5)}
                      </span>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-[11px] admin-muted truncate" title={f.name}>{f.name}</p>
                    <p className="text-[10px] admin-faint">{fmtSize(f.size)}</p>
                  </div>
                  <button onClick={() => remove(f)} title="Delete"
                    className="absolute top-2 right-2 w-7 h-7 rounded-lg inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity admin-faint hover:text-red-500"
                    style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}><Icon name="x" className="w-3.5 h-3.5" /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
