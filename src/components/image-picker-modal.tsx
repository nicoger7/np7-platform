"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import FolderPickerModal from "@/components/folder-picker-modal";

interface FileItem {
  name: string;
  path: string;
  isFolder: boolean;
  url: string | null;
  size: number;
  type: string | null;
  updatedAt: string;
}

interface ImagePickerModalProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

function formatSize(bytes: number) {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImagePickerModal({
  onSelect,
  onClose,
}: ImagePickerModalProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folder, setFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploadPicker, setUploadPicker] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function uploadToFolder(fileArr: File[], targetFolder: string) {
    setUploading(true);
    for (const file of fileArr) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", targetFolder);
      await fetch("/api/admin/images", { method: "POST", body: formData });
    }
    setUploading(false);
    setFolder(targetFolder);
    fetchFiles();
  }

  function handleFilesSelected(fileList: FileList) {
    setPendingFiles(Array.from(fileList));
    setUploadPicker(true);
  }

  const breadcrumbs = folder ? folder.split("/").filter(Boolean) : [];
  const folders = files.filter((f) => f.isFolder);
  const images = files.filter((f) => !f.isFolder && f.type?.startsWith("image/"));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-2xl w-full max-w-[960px] max-h-[85vh] flex flex-col mx-4"
        style={{
          backgroundColor: "var(--admin-sidebar)",
          border: "1px solid var(--admin-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-5"
          style={{ borderBottom: "1px solid var(--admin-border)" }}
        >
          <div>
            <h2 className="text-lg font-bold admin-heading">Select Image</h2>
            <p className="text-xs admin-muted mt-0.5">
              Choose from your library or upload a new image
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
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
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--admin-surface-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <svg
                className="w-5 h-5 admin-muted"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div
          className="flex items-center gap-1.5 text-sm px-5 py-3"
          style={{ borderBottom: "1px solid var(--admin-border)" }}
        >
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
                  onClick={() => setFolder(path)}
                  className={`transition-colors ${isLast ? "admin-heading font-medium" : "admin-muted"}`}
                >
                  {crumb}
                </button>
              </span>
            );
          })}
          {folder && (
            <button
              onClick={() => {
                const parts = folder.split("/").filter(Boolean);
                parts.pop();
                setFolder(parts.join("/"));
              }}
              className="ml-auto text-xs admin-muted transition-colors"
            >
              <svg
                className="w-4 h-4 inline mr-1"
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-[300px]">
              <p className="text-sm admin-faint">Loading...</p>
            </div>
          ) : (
            <>
              {/* Folders */}
              {folders.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-3 mb-5">
                  {folders.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => setFolder(item.path)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all group"
                      style={{ border: "1px solid var(--admin-border)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          "var(--admin-surface-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "transparent")
                      }
                    >
                      <svg
                        className="w-7 h-7 admin-faint group-hover:text-[#0aa3c7] transition-colors"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                      <span className="text-[11px] admin-muted truncate max-w-full">
                        {item.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Images */}
              {images.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                  {images.map((item) => {
                    const isSelected = selected === item.url;
                    return (
                      <button
                        key={item.path}
                        onClick={() => setSelected(item.url)}
                        onDoubleClick={() => {
                          if (item.url) onSelect(item.url);
                        }}
                        className="relative rounded-xl overflow-hidden transition-all text-left"
                        style={{
                          border: isSelected
                            ? "2px solid #0aa3c7"
                            : "1px solid var(--admin-border)",
                          boxShadow: isSelected
                            ? "0 0 0 1px #0aa3c7"
                            : "none",
                        }}
                      >
                        <div
                          className="aspect-square flex items-center justify-center overflow-hidden"
                          style={{ backgroundColor: "var(--admin-bg)" }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.url!}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-2">
                          <p className="text-[11px] admin-muted truncate">
                            {item.name}
                          </p>
                          <p className="text-[10px] admin-faint">
                            {formatSize(item.size)}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-[#0aa3c7] rounded-full flex items-center justify-center">
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
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                folders.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-[200px]">
                    <p className="text-sm admin-faint">No images here</p>
                    <p className="text-xs admin-faint mt-1">
                      Upload images or browse a folder
                    </p>
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between p-5"
          style={{ borderTop: "1px solid var(--admin-border)" }}
        >
          <p className="text-xs admin-faint">
            {selected ? "Double-click or press Select" : "Click to select, double-click to confirm"}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm admin-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (selected) onSelect(selected);
              }}
              disabled={!selected}
              className="px-5 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-30 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Select
            </button>
          </div>
        </div>
      </div>

      {/* Upload folder picker */}
      {uploadPicker && pendingFiles && (
        <FolderPickerModal
          title={`Upload ${pendingFiles.length} file${pendingFiles.length > 1 ? "s" : ""} to...`}
          action="Upload here"
          onSelect={(targetFolder) => {
            setUploadPicker(false);
            uploadToFolder(pendingFiles, targetFolder);
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
    </div>
  );
}
