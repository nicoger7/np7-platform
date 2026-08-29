"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ImageCropModal from "@/components/image-crop-modal";
import FolderPickerModal from "@/components/folder-picker-modal";
import { useAdminEnv } from "@/app/admin/env-context";

/** The two media worlds. Files stay where they are — these are real folders you
 *  browse into, and the world you're working in decides where you land (and
 *  therefore where an upload goes) without locking you out of the other. */
const WORLDS = [
  // The folder names are the REAL ones in the bucket. "experience" (singular)
  // was a folder that has never existed — the bucket has "experiences" — so
  // File Storage opened on an empty page every time, with 637 MB of photos one
  // level away. "products" is where hardware imagery actually lives.
  { id: "experience", label: "NP7 Experience", folder: "experiences" },
  { id: "hardware", label: "NP7 Hardware", folder: "products" },
] as const;

interface FileItem {
  name: string;
  path: string;
  isFolder: boolean;
  url: string | null;
  thumbUrl?: string | null;
  size: number;
  type: string | null;
  updatedAt: string;
  /** Friendly name for a UUID folder — the API resolves memories/{editionId}
   *  and …/p/{bookingId} to the trip and the rider. It was being computed on
   *  every request and then thrown away here, which is why the memories tree
   *  read as rows of random hex. */
  label?: string | null;
}

/** Library-scale sizes. formatSize() below stops at MB, which is right for one
 *  file and wrong for a whole folder — 668 MB is fine, 1193.4 MB is not. */
function bigSize(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatSize(bytes: number) {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImagesPage() {
  const adminEnv = useAdminEnv();
  // Hardware admins land in the hardware folder, Experience admins in theirs;
  // both can still step out to the other world or the shared root.
  const homeFolder = adminEnv === "hardware" ? "products" : "experiences";
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folder, setFolder] = useState(homeFolder);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [folderDragOver, setFolderDragOver] = useState<string | null>(null);
  const [cropping, setCropping] = useState<FileItem | null>(null);
  const [moving, setMoving] = useState<FileItem | null>(null);
  const [uploadPicker, setUploadPicker] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [movingSelected, setMovingSelected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // What is actually in storage. Read once — it is a single aggregate, not a
  // bucket walk — and shown above the browser so the number is there before you
  // go looking for it.
  const [usage, setUsage] = useState<{ folders: { folder: string; files: number; bytes: number }[]; total: { files: number; bytes: number } | null } | null>(null);
  useEffect(() => {
    fetch("/api/admin/storage-usage").then((r) => r.json()).then(setUsage).catch(() => {});
  }, []);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    const params = folder ? `?folder=${encodeURIComponent(folder)}` : "";
    const res = await fetch(`/api/admin/images${params}`);
    const data = await res.json();
    setFiles(data.files || []);
    setLoading(false);
  }, [folder]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  useEffect(() => {
    setSelected(new Set());
  }, [folder]);

  // Switching the admin world moves you to that world's media folder.
  useEffect(() => { setFolder(homeFolder); }, [homeFolder]);

  async function uploadFiles(fileArr: File[], targetFolder: string) {
    setUploading(true);
    for (const file of fileArr) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", targetFolder);
      await fetch("/api/admin/images", { method: "POST", body: formData });
    }
    setUploading(false);
    fetchFiles();
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleFilesSelected(fileList: FileList) {
    setPendingFiles(Array.from(fileList));
    setUploadPicker(true);
  }

  async function handleDelete(path: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    await fetch("/api/admin/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [path] }),
    });
    fetchFiles();
  }

  async function handleDeleteSelected() {
    const paths = Array.from(selected);
    if (!confirm(`Delete ${paths.length} file${paths.length > 1 ? "s" : ""}?`)) return;
    await fetch("/api/admin/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    setSelected(new Set());
    fetchFiles();
  }

  async function handleMove(item: FileItem, targetFolder: string) {
    const newPath = targetFolder
      ? `${targetFolder}/${item.name}`
      : item.name;
    if (newPath === item.path) return;
    await fetch("/api/admin/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: item.path, to: newPath }),
    });
    setMoving(null);
    fetchFiles();
  }

  async function handleMoveSelected(targetFolder: string) {
    const paths = Array.from(selected);
    for (const path of paths) {
      const name = path.split("/").pop()!;
      const newPath = targetFolder ? `${targetFolder}/${name}` : name;
      if (newPath === path) continue;
      await fetch("/api/admin/images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: path, to: newPath }),
      });
    }
    setMovingSelected(false);
    setSelected(new Set());
    fetchFiles();
  }

  async function handleDropOnFolder(targetFolderPath: string, paths: string[]) {
    for (const path of paths) {
      const name = path.split("/").pop()!;
      const newPath = `${targetFolderPath}/${name}`;
      if (newPath === path) continue;
      await fetch("/api/admin/images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: path, to: newPath }),
      });
    }
    setSelected(new Set());
    fetchFiles();
  }

  async function handleRename(item: FileItem) {
    const ext = item.name.includes(".") ? item.name.slice(item.name.lastIndexOf(".")) : "";
    const baseName = item.name.includes(".") ? item.name.slice(0, item.name.lastIndexOf(".")) : item.name;
    const newName = prompt("Rename file:", baseName);
    if (!newName || !newName.trim() || newName.trim() === baseName) return;
    const cleanName = newName.trim() + ext;
    const parts = item.path.split("/");
    parts[parts.length - 1] = cleanName;
    const newPath = parts.join("/");
    await fetch("/api/admin/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: item.path, to: newPath }),
    });
    fetchFiles();
  }

  function navigateToFolder(folderPath: string) {
    setFolder(folderPath);
  }

  function navigateUp() {
    const parts = folder.split("/").filter(Boolean);
    parts.pop();
    setFolder(parts.join("/"));
  }

  async function handleCreateFolder() {
    const name = prompt("Folder name:");
    if (!name || !name.trim()) return;
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    const path = folder ? `${folder}/${cleanName}` : cleanName;
    await fetch("/api/admin/images", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: path }),
    });
    fetchFiles();
  }

  function toggleSelect(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function selectAll() {
    const imagePaths = images.map((f) => f.path);
    setSelected(new Set(imagePaths));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function handleImageDragStart(e: React.DragEvent, item: FileItem) {
    // If dragging a selected item, drag all selected. Otherwise drag just this one.
    const paths = selected.has(item.path) && selected.size > 1
      ? Array.from(selected)
      : [item.path];
    e.dataTransfer.setData("application/x-image-paths", JSON.stringify(paths));
    e.dataTransfer.effectAllowed = "move";
  }

  const breadcrumbs = folder ? folder.split("/").filter(Boolean) : [];
  const folders = files.filter((f) => f.isFolder);
  const images = files.filter((f) => !f.isFolder);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Images</h1>
          {/* What is in here, before you go hunting for it. Memories is called
              out on its own because it is the folder that grows by itself —
              every trip adds to it and nothing removes it until the purge. */}
          {usage?.total ? (
            <p className="text-sm admin-muted">
              {bigSize(usage.total.bytes)} across {usage.total.files.toLocaleString("en-GB")} files
              {(() => {
                const m = usage.folders.find((f) => f.folder === "memories");
                return m ? (
                  <span className="admin-faint"> · memories {bigSize(m.bytes)} ({m.files.toLocaleString("en-GB")})</span>
                ) : null;
              })()}
            </p>
          ) : (
            <p className="text-sm admin-muted">Manage your media files</p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleCreateFolder}
            className="px-4 py-2 admin-surface admin-muted text-sm font-medium rounded-lg transition-colors"
            style={{ border: "1px solid var(--admin-border)" }}
          >
            New folder
          </button>
          <button
            onClick={handleUploadClick}
            disabled={uploading}
            className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFilesSelected(e.target.files);
            }
          }}
        />
      </div>

      {/* World switch — a real folder split, not a filter */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {WORLDS.map((w) => {
          const active = folder === w.folder || folder.startsWith(`${w.folder}/`);
          return (
            <button key={w.id} type="button" onClick={() => setFolder(w.folder)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${active ? "text-[var(--admin-accent-contrast)] bg-[var(--admin-accent)]" : "admin-muted"}`}
              style={active ? undefined : { border: "1px solid var(--admin-border)" }}>
              {w.label}
            </button>
          );
        })}
        <button type="button" onClick={() => setFolder("")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${folder === "" ? "admin-heading" : "admin-faint hover:admin-muted"}`}
          style={{ border: "1px solid var(--admin-border)" }}>
          Shared / everything
        </button>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-sm mb-5">
        <button
          onClick={() => setFolder("")}
          className={`transition-colors ${folder ? "admin-muted" : "admin-heading font-medium"}`}
        >
          assets
        </button>
        {breadcrumbs.map((crumb, i) => {
          const path = breadcrumbs.slice(0, i + 1).join("/");
          const isLast = i === breadcrumbs.length - 1;
          return (
            <span key={path} className="flex items-center gap-1.5">
              <span className="admin-faint">/</span>
              <button
                onClick={() => navigateToFolder(path)}
                className={`transition-colors ${isLast ? "admin-heading font-medium" : "admin-muted"}`}
              >
                {crumb}
              </button>
            </span>
          );
        })}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          // Only show upload drop zone for external files (not internal image moves)
          if (e.dataTransfer.types.includes("Files") && !e.dataTransfer.types.includes("application/x-image-paths")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0 && !e.dataTransfer.types.includes("application/x-image-paths")) {
            uploadFiles(Array.from(e.dataTransfer.files), folder);
          }
        }}
        className={`min-h-[400px] rounded-xl border-2 border-dashed transition-colors ${
          dragOver ? "border-[var(--admin-accent)] bg-[var(--admin-accent)]/5" : ""
        }`}
        style={!dragOver ? { borderColor: "var(--admin-border)" } : undefined}
      >
        {loading ? (
          <div className="flex items-center justify-center h-[400px]">
            <p className="text-sm admin-faint">Loading...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px]">
            <svg
              className="w-10 h-10 mb-3 admin-faint"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <p className="text-sm admin-faint">No files here</p>
            <p className="text-xs admin-faint mt-1">
              Drop files or click Upload
            </p>
          </div>
        ) : (
          <div className="p-4">
            {/* Back button */}
            {folder && (
              <button
                onClick={navigateUp}
                className="flex items-center gap-2 text-sm admin-muted mb-4 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            )}

            {/* Folders */}
            {folders.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
                {folders.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => navigateToFolder(item.path)}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes("application/x-image-paths")) {
                        e.preventDefault();
                        e.stopPropagation();
                        setFolderDragOver(item.path);
                      }
                    }}
                    onDragLeave={(e) => {
                      e.stopPropagation();
                      setFolderDragOver(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setFolderDragOver(null);
                      const data = e.dataTransfer.getData("application/x-image-paths");
                      if (data) {
                        const paths = JSON.parse(data) as string[];
                        handleDropOnFolder(item.path, paths);
                      }
                    }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all group ${
                      folderDragOver === item.path ? "ring-2 ring-[var(--admin-accent)] bg-[var(--admin-accent)]/10" : ""
                    }`}
                    style={{ border: folderDragOver === item.path ? "1px solid #0aa3c7" : "1px solid var(--admin-border)" }}
                    onMouseEnter={(e) => {
                      if (folderDragOver !== item.path)
                        e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (folderDragOver !== item.path)
                        e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <svg
                      className={`w-8 h-8 transition-colors ${
                        folderDragOver === item.path ? "text-[#0aa3c7]" : "admin-faint group-hover:text-[#0aa3c7]"
                      }`}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span
                      className="text-xs admin-muted group-hover:admin-heading truncate max-w-full transition-colors"
                      title={item.label ? `${item.label} · ${item.name}` : item.name}
                    >
                      {item.label || item.name}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Images grid */}
            {images.length > 0 && (
              <>
                {/* Select all / clear bar */}
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={selected.size === images.length ? clearSelection : selectAll}
                    className="text-xs admin-muted hover:admin-heading transition-colors"
                  >
                    {selected.size === images.length ? "Deselect all" : "Select all"}
                  </button>
                  {selected.size > 0 && (
                    <span className="text-xs admin-faint">
                      {selected.size} selected
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {images.map((item) => {
                    const isSelected = selected.has(item.path);
                    return (
                      <div
                        key={item.path}
                        draggable
                        onDragStart={(e) => handleImageDragStart(e, item)}
                        className="group relative rounded-xl overflow-hidden transition-all admin-surface cursor-grab active:cursor-grabbing"
                        style={{
                          border: isSelected
                            ? "2px solid #0aa3c7"
                            : "1px solid var(--admin-border)",
                          boxShadow: isSelected ? "0 0 0 1px #0aa3c7" : "none",
                        }}
                      >
                        {/* Selection checkbox */}
                        <button
                          onClick={() => toggleSelect(item.path)}
                          className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? "bg-[var(--admin-accent)] border-[var(--admin-accent)]"
                              : "border-white/50 bg-black/30 opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          {isSelected && (
                            <svg
                              className="w-3 h-3 text-white"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>

                        {/* Image preview */}
                        <div
                          className="aspect-square flex items-center justify-center overflow-hidden"
                          style={{ backgroundColor: "var(--admin-bg)" }}
                        >
                          {item.type?.startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              // Grid tile — the ~50 KB thumbnail, not the original.
                              src={item.thumbUrl || item.url!}
                              alt={item.name}
                              loading="lazy"
                              decoding="async"
                              onError={(e) => { const img = e.currentTarget; if (item.url && img.src !== item.url) img.src = item.url; }}
                              className="w-full h-full object-contain pointer-events-none"
                            />
                          ) : (
                            <svg
                              className="w-8 h-8 admin-faint"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-3">
                          <p className="text-xs admin-muted truncate">
                            {item.name}
                          </p>
                          <p className="text-[10px] admin-faint mt-0.5">
                            {formatSize(item.size)}
                          </p>
                        </div>

                        {/* Hover actions */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                          <div className="flex items-center gap-2">
                            {item.type?.startsWith("image/") && (
                              <button
                                onClick={() => setCropping(item)}
                                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white font-medium transition-colors"
                              >
                                Crop
                              </button>
                            )}
                            <button
                              onClick={() => handleRename(item)}
                              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white font-medium transition-colors"
                            >
                              Rename
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setMoving(item)}
                              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white font-medium transition-colors"
                            >
                              Move
                            </button>
                            <button
                              onClick={() => handleDelete(item.path, item.name)}
                              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-xs text-red-400 font-medium transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-3 rounded-xl shadow-2xl"
          style={{
            backgroundColor: "var(--admin-sidebar)",
            border: "1px solid var(--admin-border)",
          }}
        >
          <span className="text-sm admin-heading font-medium">
            {selected.size} selected
          </span>
          <div className="w-px h-5" style={{ backgroundColor: "var(--admin-border)" }} />
          <button
            onClick={() => setMovingSelected(true)}
            className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors"
          >
            Move
          </button>
          <button
            onClick={handleDeleteSelected}
            className="px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-bold rounded-lg transition-colors"
          >
            Delete
          </button>
          <button
            onClick={clearSelection}
            className="px-2 py-1.5 text-xs admin-muted hover:admin-heading transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Crop modal */}
      {cropping && cropping.url && (
        <ImageCropModal
          src={cropping.url}
          fileName={cropping.name}
          filePath={cropping.path}
          onClose={() => setCropping(null)}
          onSaved={() => {
            setCropping(null);
            fetchFiles();
          }}
        />
      )}

      {/* Upload folder picker */}
      {uploadPicker && pendingFiles && (
        <FolderPickerModal
          title={`Upload ${pendingFiles.length} file${pendingFiles.length > 1 ? "s" : ""} to...`}
          action="Upload here"
          onSelect={(targetFolder) => {
            setUploadPicker(false);
            uploadFiles(pendingFiles, targetFolder);
            setPendingFiles(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          onClose={() => {
            setUploadPicker(false);
            setPendingFiles(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
      )}

      {/* Move file picker */}
      {moving && (
        <FolderPickerModal
          title={`Move "${moving.name}" to...`}
          action="Move here"
          currentFolder={folder}
          onSelect={(targetFolder) => handleMove(moving, targetFolder)}
          onClose={() => setMoving(null)}
        />
      )}

      {/* Move selected picker */}
      {movingSelected && (
        <FolderPickerModal
          title={`Move ${selected.size} file${selected.size > 1 ? "s" : ""} to...`}
          action="Move here"
          currentFolder={folder}
          onSelect={handleMoveSelected}
          onClose={() => setMovingSelected(false)}
        />
      )}
    </div>
  );
}
