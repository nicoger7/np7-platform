"use client";

import { useState, useEffect, useCallback } from "react";

interface FolderItem {
  name: string;
  path: string;
}

interface FolderPickerModalProps {
  title: string;
  action: string;
  currentFolder?: string;
  onSelect: (folder: string) => void;
  onClose: () => void;
}

export default function FolderPickerModal({
  title,
  action,
  currentFolder,
  onSelect,
  onClose,
}: FolderPickerModalProps) {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [browsing, setBrowsing] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchFolders = useCallback(async () => {
    setLoading(true);
    const params = browsing ? `?folder=${encodeURIComponent(browsing)}` : "";
    const res = await fetch(`/api/admin/images${params}`);
    const data = await res.json();
    const folderItems = (data.files || [])
      .filter(
        (f: { isFolder: boolean; name: string }) =>
          f.isFolder && f.name !== ".emptyFolderPlaceholder"
      )
      .map((f: { name: string; path: string }) => ({
        name: f.name,
        path: f.path,
      }));
    setFolders(folderItems);
    setLoading(false);
  }, [browsing]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const breadcrumbs = browsing ? browsing.split("/").filter(Boolean) : [];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-xl w-full max-w-[440px] mx-4 flex flex-col"
        style={{
          backgroundColor: "var(--admin-sidebar)",
          border: "1px solid var(--admin-border)",
        }}
      >
        {/* Header */}
        <div
          className="p-4"
          style={{ borderBottom: "1px solid var(--admin-border)" }}
        >
          <h3 className="text-sm font-bold admin-heading">{title}</h3>
        </div>

        {/* Breadcrumbs */}
        <div
          className="flex items-center gap-1.5 text-xs px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--admin-border)" }}
        >
          <button
            onClick={() => setBrowsing("")}
            className={`transition-colors ${browsing ? "admin-muted" : "admin-heading font-medium"}`}
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
                  onClick={() => setBrowsing(path)}
                  className={`transition-colors ${isLast ? "admin-heading font-medium" : "admin-muted"}`}
                >
                  {crumb}
                </button>
              </span>
            );
          })}
        </div>

        {/* Folder list */}
        <div className="p-3 min-h-[160px] max-h-[280px] overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-[120px]">
              <span className="text-xs admin-faint">Loading...</span>
            </div>
          ) : folders.length === 0 ? (
            <div className="flex items-center justify-center h-[120px]">
              <span className="text-xs admin-faint">No subfolders</span>
            </div>
          ) : (
            <div className="space-y-1">
              {folders.map((f) => {
                return (
                  <button
                    key={f.path}
                    onClick={() => setBrowsing(f.path)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "var(--admin-surface-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <svg
                      className="w-4 h-4 admin-faint flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span className="admin-heading text-sm">{f.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between p-4"
          style={{ borderTop: "1px solid var(--admin-border)" }}
        >
          <div className="text-xs admin-muted">
            Target:{" "}
            <span className="admin-heading font-medium">
              {browsing || "assets (root)"}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm admin-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSelect(browsing)}
              disabled={browsing === currentFolder}
              className="px-4 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors"
            >
              {action}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
